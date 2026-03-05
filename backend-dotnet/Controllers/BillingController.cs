using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Textzy.Api.Data;
using Textzy.Api.Models;
using Textzy.Api.Services;
using static Textzy.Api.Services.PermissionCatalog;

namespace Textzy.Api.Controllers;

[ApiController]
[Route("api/billing")]
public class BillingController(
    ControlDbContext db,
    AuthContext auth,
    TenancyContext tenancy,
    RbacService rbac,
    SecretCryptoService crypto,
    SensitiveDataRedactor redactor,
    AuditLogService audit,
    ILogger<BillingController> logger) : ControllerBase
{
    [HttpGet("plans")]
    public async Task<IActionResult> Plans(CancellationToken ct)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        if (!rbac.HasPermission(BillingRead)) return Forbid();
        var rows = await db.BillingPlans.Where(x => x.IsActive).OrderBy(x => x.SortOrder).ToListAsync(ct);
        return Ok(rows.Select(MapPlan));
    }

    [HttpGet("current-plan")]
    public async Task<IActionResult> CurrentPlan(CancellationToken ct)
    {
        if (!auth.IsAuthenticated || !tenancy.IsSet) return Unauthorized();
        if (!rbac.HasPermission(BillingRead)) return Forbid();
        var sub = await db.TenantSubscriptions.Where(x => x.TenantId == tenancy.TenantId).OrderByDescending(x => x.CreatedAtUtc).FirstOrDefaultAsync(ct);
        if (sub is null) return NotFound("Subscription not found.");
        var plan = await db.BillingPlans.FirstOrDefaultAsync(x => x.Id == sub.PlanId, ct);
        if (plan is null) return NotFound("Plan not found.");
        return Ok(new
        {
            subscription = new { sub.Id, sub.TenantId, sub.PlanId, sub.Status, sub.BillingCycle, sub.StartedAtUtc, sub.RenewAtUtc, sub.CancelledAtUtc },
            plan = MapPlan(plan)
        });
    }

    [HttpGet("usage")]
    public async Task<IActionResult> Usage(CancellationToken ct)
    {
        if (!auth.IsAuthenticated || !tenancy.IsSet) return Unauthorized();
        if (!rbac.HasPermission(BillingRead)) return Forbid();
        var monthKey = DateTime.UtcNow.ToString("yyyy-MM");
        var usage = await db.TenantUsages.FirstOrDefaultAsync(x => x.TenantId == tenancy.TenantId && x.MonthKey == monthKey, ct);
        if (usage is null) return Ok(new { monthKey, values = new Dictionary<string, int>() });
        return Ok(new
        {
            usage.MonthKey,
            values = new Dictionary<string, int>
            {
                ["whatsappMessages"] = usage.WhatsappMessagesUsed,
                ["smsCredits"] = usage.SmsCreditsUsed,
                ["contacts"] = usage.ContactsUsed,
                ["teamMembers"] = usage.TeamMembersUsed,
                ["chatbots"] = usage.ChatbotsUsed,
                ["flows"] = usage.FlowsUsed,
                ["apiCalls"] = usage.ApiCallsUsed
            }
        });
    }

    [HttpGet("invoices")]
    public async Task<IActionResult> Invoices(CancellationToken ct)
    {
        if (!auth.IsAuthenticated || !tenancy.IsSet) return Unauthorized();
        if (!rbac.HasPermission(BillingRead)) return Forbid();
        var rows = await db.BillingInvoices.Where(x => x.TenantId == tenancy.TenantId).OrderByDescending(x => x.CreatedAtUtc).Take(50).ToListAsync(ct);
        return Ok(rows.Select(x => new
        {
            x.Id,
            x.InvoiceNo,
            x.PeriodStartUtc,
            x.PeriodEndUtc,
            x.Subtotal,
            x.TaxAmount,
            x.Total,
            x.Status,
            x.PaidAtUtc,
            x.PdfUrl,
            x.CreatedAtUtc
        }));
    }

    [HttpPost("change-plan")]
    public async Task<IActionResult> ChangePlan([FromBody] ChangePlanRequest request, CancellationToken ct)
    {
        if (!auth.IsAuthenticated || !tenancy.IsSet) return Unauthorized();
        if (!rbac.HasPermission(BillingWrite)) return Forbid();
        if (string.IsNullOrWhiteSpace(request.PlanCode)) return BadRequest("planCode is required.");
        var plan = await db.BillingPlans.FirstOrDefaultAsync(x => x.Code == request.PlanCode && x.IsActive, ct);
        if (plan is null) return NotFound("Plan not found.");

        var sub = await db.TenantSubscriptions.Where(x => x.TenantId == tenancy.TenantId).OrderByDescending(x => x.CreatedAtUtc).FirstOrDefaultAsync(ct);
        if (sub is null)
        {
            sub = new Textzy.Api.Models.TenantSubscription { Id = Guid.NewGuid(), TenantId = tenancy.TenantId, PlanId = plan.Id };
            db.TenantSubscriptions.Add(sub);
        }
        sub.PlanId = plan.Id;
        sub.BillingCycle = string.IsNullOrWhiteSpace(request.BillingCycle) ? "monthly" : request.BillingCycle;
        sub.Status = "active";
        sub.UpdatedAtUtc = DateTime.UtcNow;
        sub.RenewAtUtc = sub.BillingCycle == "yearly" ? DateTime.UtcNow.AddYears(1) : DateTime.UtcNow.AddMonths(1);
        await db.SaveChangesAsync(ct);
        return Ok(new { changed = true, planCode = plan.Code });
    }

    [HttpGet("payment-config")]
    public async Task<IActionResult> PaymentConfig(CancellationToken ct)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        if (!rbac.HasPermission(BillingRead)) return Forbid();

        var cfg = await ReadPaymentSettingsAsync(ct);
        var provider = (cfg.TryGetValue("provider", out var p) ? p : "razorpay").Trim().ToLowerInvariant();
        var mode = NormalizeRazorpayMode(cfg.TryGetValue("mode", out var m) ? m : "test");
        var keyId = cfg.TryGetValue("keyId", out var kid) ? kid : string.Empty;

        return Ok(new
        {
            provider,
            mode,
            razorpay = new
            {
                enabled = provider == "razorpay" && !string.IsNullOrWhiteSpace(keyId),
                keyId
            }
        });
    }

    [HttpPost("razorpay/create-order")]
    public async Task<IActionResult> RazorpayCreateOrder([FromBody] ChangePlanRequest request, CancellationToken ct)
    {
        if (!auth.IsAuthenticated || !tenancy.IsSet) return Unauthorized();
        if (!rbac.HasPermission(BillingWrite)) return Forbid();
        if (string.IsNullOrWhiteSpace(request.PlanCode)) return BadRequest("planCode is required.");

        var plan = await db.BillingPlans.FirstOrDefaultAsync(x => x.Code == request.PlanCode && x.IsActive, ct);
        if (plan is null) return NotFound("Plan not found.");

        var cycle = string.IsNullOrWhiteSpace(request.BillingCycle) ? "monthly" : request.BillingCycle.Trim().ToLowerInvariant();
        if (cycle != "monthly" && cycle != "yearly") return BadRequest("billingCycle must be monthly or yearly.");

        var cfg = await ReadPaymentSettingsAsync(ct);
        var provider = (cfg.TryGetValue("provider", out var p) ? p : "razorpay").Trim().ToLowerInvariant();
        if (provider != "razorpay") return BadRequest("Configured payment provider is not Razorpay.");
        var mode = NormalizeRazorpayMode(cfg.TryGetValue("mode", out var m) ? m : "test");
        var keyId = cfg.TryGetValue("keyId", out var kid) ? kid : string.Empty;
        var keySecret = cfg.TryGetValue("keySecret", out var ks) ? ks : string.Empty;
        if (string.IsNullOrWhiteSpace(keyId) || string.IsNullOrWhiteSpace(keySecret))
            return BadRequest("Razorpay keyId/keySecret not configured in platform settings.");
        if (!IsRazorpayKeyModeValid(keyId, mode))
            return BadRequest($"Razorpay keyId does not match configured mode '{mode}'.");

        var amount = cycle == "yearly" ? plan.PriceYearly : plan.PriceMonthly;
        var amountPaise = (int)Math.Round(amount * 100m, MidpointRounding.AwayFromZero);
        if (amountPaise <= 0) return BadRequest("Invalid plan amount.");

        var receipt = $"txtz_{tenancy.TenantId:N}_{DateTime.UtcNow:yyyyMMddHHmmss}";
        var notes = new Dictionary<string, string>
        {
            ["tenantId"] = tenancy.TenantId.ToString(),
            ["planId"] = plan.Id.ToString(),
            ["planCode"] = plan.Code,
            ["billingCycle"] = cycle,
            ["mode"] = mode
        };

        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
        var authBytes = Encoding.UTF8.GetBytes($"{keyId}:{keySecret}");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(authBytes));

        var payload = new
        {
            amount = amountPaise,
            currency = string.IsNullOrWhiteSpace(plan.Currency) ? "INR" : plan.Currency.ToUpperInvariant(),
            receipt,
            notes
        };
        var json = JsonSerializer.Serialize(payload);
        using var content = new StringContent(json, Encoding.UTF8, "application/json");
        using var resp = await client.PostAsync("https://api.razorpay.com/v1/orders", content, ct);
        var raw = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode)
        {
            logger.LogWarning("Razorpay order create failed status={Status} body={Body}", (int)resp.StatusCode, redactor.RedactText(raw));
            return BadRequest("Failed to create Razorpay order.");
        }

        using var doc = JsonDocument.Parse(raw);
        var orderId = doc.RootElement.TryGetProperty("id", out var idEl) ? idEl.GetString() ?? string.Empty : string.Empty;
        if (string.IsNullOrWhiteSpace(orderId)) return BadRequest("Razorpay did not return order id.");

        var attempt = new BillingPaymentAttempt
        {
            Id = Guid.NewGuid(),
            TenantId = tenancy.TenantId,
            PlanId = plan.Id,
            BillingCycle = cycle,
            Provider = "razorpay",
            OrderId = orderId,
            Amount = amount,
            Currency = payload.currency,
            Status = "created",
            NotesJson = JsonSerializer.Serialize(notes),
            RawResponse = raw,
            CreatedAtUtc = DateTime.UtcNow,
            UpdatedAtUtc = DateTime.UtcNow
        };
        db.BillingPaymentAttempts.Add(attempt);
        await db.SaveChangesAsync(ct);

        return Ok(new
        {
            provider = "razorpay",
            mode,
            keyId,
            orderId,
            amount = amountPaise,
            currency = payload.currency,
            planCode = plan.Code,
            billingCycle = cycle,
            tenantId = tenancy.TenantId
        });
    }

    [HttpPost("razorpay/verify")]
    public async Task<IActionResult> RazorpayVerify([FromBody] RazorpayVerifyRequest request, CancellationToken ct)
    {
        if (!auth.IsAuthenticated || !tenancy.IsSet) return Unauthorized();
        if (!rbac.HasPermission(BillingWrite)) return Forbid();
        if (string.IsNullOrWhiteSpace(request.RazorpayOrderId) ||
            string.IsNullOrWhiteSpace(request.RazorpayPaymentId) ||
            string.IsNullOrWhiteSpace(request.RazorpaySignature))
            return BadRequest("Missing Razorpay payment fields.");

        var cfg = await ReadPaymentSettingsAsync(ct);
        var mode = NormalizeRazorpayMode(cfg.TryGetValue("mode", out var m) ? m : "test");
        var keyId = cfg.TryGetValue("keyId", out var kid) ? kid : string.Empty;
        var keySecret = cfg.TryGetValue("keySecret", out var ks) ? ks : string.Empty;
        if (string.IsNullOrWhiteSpace(keySecret) || string.IsNullOrWhiteSpace(keyId)) return BadRequest("Razorpay keyId/keySecret not configured.");
        if (!IsRazorpayKeyModeValid(keyId, mode))
            return BadRequest($"Razorpay keyId does not match configured mode '{mode}'.");

        var attempt = await db.BillingPaymentAttempts
            .Where(x => x.Provider == "razorpay" && x.OrderId == request.RazorpayOrderId && x.TenantId == tenancy.TenantId)
            .OrderByDescending(x => x.CreatedAtUtc)
            .FirstOrDefaultAsync(ct);
        if (attempt is null) return NotFound("Payment attempt not found.");

        if (attempt.Status == "paid")
            return Ok(new { verified = true, alreadyProcessed = true, planCode = request.PlanCode });

        var valid = VerifyRazorpaySignature(request.RazorpayOrderId, request.RazorpayPaymentId, request.RazorpaySignature, keySecret);
        if (!valid)
        {
            attempt.Status = "signature_failed";
            attempt.LastError = "Razorpay signature mismatch";
            attempt.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return BadRequest("Invalid payment signature.");
        }

        attempt.PaymentId = request.RazorpayPaymentId;
        attempt.Signature = request.RazorpaySignature;

        var validation = await ValidateRazorpayPaymentAsync(
            keyId,
            keySecret,
            request.RazorpayPaymentId,
            request.RazorpayOrderId,
            attempt.Amount,
            attempt.Currency,
            ct);
        if (!validation.ok)
        {
            attempt.Status = "payment_validation_failed";
            attempt.LastError = validation.error;
            attempt.UpdatedAtUtc = DateTime.UtcNow;
            attempt.RawResponse = validation.raw ?? attempt.RawResponse;
            await db.SaveChangesAsync(ct);
            return BadRequest(validation.error);
        }

        attempt.Status = "paid";
        attempt.PaidAtUtc = DateTime.UtcNow;
        attempt.UpdatedAtUtc = DateTime.UtcNow;
        attempt.RawResponse = validation.raw ?? attempt.RawResponse;

        await ActivateSubscriptionFromPaymentAsync(attempt, ct);
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("billing.razorpay.verify.success", $"tenant={tenancy.TenantId}; order={attempt.OrderId}", ct);
        return Ok(new { verified = true, planCode = request.PlanCode, billingCycle = attempt.BillingCycle });
    }

    [HttpPost("cancel")]
    public async Task<IActionResult> Cancel(CancellationToken ct)
    {
        if (!auth.IsAuthenticated || !tenancy.IsSet) return Unauthorized();
        if (!rbac.HasPermission(BillingWrite)) return Forbid();
        var sub = await db.TenantSubscriptions.Where(x => x.TenantId == tenancy.TenantId).OrderByDescending(x => x.CreatedAtUtc).FirstOrDefaultAsync(ct);
        if (sub is null) return NotFound("Subscription not found.");
        sub.Status = "cancelled";
        sub.CancelledAtUtc = DateTime.UtcNow;
        sub.UpdatedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return Ok(new { cancelled = true });
    }

    private static object MapPlan(Textzy.Api.Models.BillingPlan p) => new
    {
        p.Id,
        p.Code,
        p.Name,
        p.PriceMonthly,
        p.PriceYearly,
        p.Currency,
        p.IsActive,
        p.SortOrder,
        Features = ParseStringList(p.FeaturesJson),
        Limits = ParseLimits(p.LimitsJson)
    };

    private static List<string> ParseStringList(string json)
    {
        try { return JsonSerializer.Deserialize<List<string>>(json) ?? []; } catch { return []; }
    }
    private static Dictionary<string, int> ParseLimits(string json)
    {
        try { return JsonSerializer.Deserialize<Dictionary<string, int>>(json) ?? new(); } catch { return new(); }
    }

    public sealed class ChangePlanRequest
    {
        public string PlanCode { get; set; } = string.Empty;
        public string BillingCycle { get; set; } = "monthly";
    }

    public sealed class RazorpayVerifyRequest
    {
        public string PlanCode { get; set; } = string.Empty;
        public string BillingCycle { get; set; } = "monthly";
        public string RazorpayOrderId { get; set; } = string.Empty;
        public string RazorpayPaymentId { get; set; } = string.Empty;
        public string RazorpaySignature { get; set; } = string.Empty;
    }

    private async Task<Dictionary<string, string>> ReadPaymentSettingsAsync(CancellationToken ct)
    {
        var scopeRows = await db.PlatformSettings.Where(x => x.Scope == "payment-gateway").ToListAsync(ct);
        return scopeRows.ToDictionary(x => x.Key, x => crypto.Decrypt(x.ValueEncrypted), StringComparer.OrdinalIgnoreCase);
    }

    private static bool VerifyRazorpaySignature(string orderId, string paymentId, string signature, string secret)
    {
        var payload = $"{orderId}|{paymentId}";
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(payload));
        var expected = Convert.ToHexString(hash).ToLowerInvariant();
        return string.Equals(expected, signature.Trim().ToLowerInvariant(), StringComparison.Ordinal);
    }

    private static string NormalizeRazorpayMode(string? mode)
    {
        var normalized = (mode ?? string.Empty).Trim().ToLowerInvariant();
        return normalized == "live" ? "live" : "test";
    }

    private static bool IsRazorpayKeyModeValid(string keyId, string mode)
    {
        var key = (keyId ?? string.Empty).Trim().ToLowerInvariant();
        if (mode == "live") return key.StartsWith("rzp_live_");
        return key.StartsWith("rzp_test_");
    }

    private static async Task<(bool ok, string error, string raw)> ValidateRazorpayPaymentAsync(
        string keyId,
        string keySecret,
        string paymentId,
        string expectedOrderId,
        decimal expectedAmount,
        string expectedCurrency,
        CancellationToken ct)
    {
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
        var authBytes = Encoding.UTF8.GetBytes($"{keyId}:{keySecret}");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(authBytes));
        using var resp = await client.GetAsync($"https://api.razorpay.com/v1/payments/{Uri.EscapeDataString(paymentId)}", ct);
        var raw = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode)
            return (false, "Could not validate payment with Razorpay API.", raw);

        using var doc = JsonDocument.Parse(raw);
        var root = doc.RootElement;

        var status = root.TryGetProperty("status", out var st) ? (st.GetString() ?? string.Empty).Trim().ToLowerInvariant() : string.Empty;
        var orderId = root.TryGetProperty("order_id", out var ord) ? (ord.GetString() ?? string.Empty) : string.Empty;
        var amountPaise = root.TryGetProperty("amount", out var amt) && amt.TryGetInt32(out var vAmt) ? vAmt : -1;
        var currency = root.TryGetProperty("currency", out var cur) ? (cur.GetString() ?? string.Empty) : string.Empty;

        var expectedPaise = (int)Math.Round(expectedAmount * 100m, MidpointRounding.AwayFromZero);
        if (!string.Equals(status, "captured", StringComparison.OrdinalIgnoreCase))
            return (false, "Payment is not captured.", raw);
        if (!string.Equals(orderId, expectedOrderId, StringComparison.Ordinal))
            return (false, "Payment order mismatch.", raw);
        if (amountPaise != expectedPaise)
            return (false, "Payment amount mismatch.", raw);
        if (!string.Equals(currency, expectedCurrency, StringComparison.OrdinalIgnoreCase))
            return (false, "Payment currency mismatch.", raw);

        return (true, string.Empty, raw);
    }

    private async Task ActivateSubscriptionFromPaymentAsync(BillingPaymentAttempt attempt, CancellationToken ct)
    {
        var plan = await db.BillingPlans.FirstOrDefaultAsync(x => x.Id == attempt.PlanId, ct);
        if (plan is null) return;

        var sub = await db.TenantSubscriptions
            .Where(x => x.TenantId == attempt.TenantId)
            .OrderByDescending(x => x.CreatedAtUtc)
            .FirstOrDefaultAsync(ct);
        if (sub is null)
        {
            sub = new TenantSubscription
            {
                Id = Guid.NewGuid(),
                TenantId = attempt.TenantId,
                PlanId = attempt.PlanId,
                CreatedAtUtc = DateTime.UtcNow
            };
            db.TenantSubscriptions.Add(sub);
        }

        var start = DateTime.UtcNow;
        sub.PlanId = plan.Id;
        sub.BillingCycle = string.IsNullOrWhiteSpace(attempt.BillingCycle) ? "monthly" : attempt.BillingCycle;
        sub.Status = "active";
        sub.CancelledAtUtc = null;
        sub.StartedAtUtc = start;
        sub.RenewAtUtc = sub.BillingCycle == "yearly" ? start.AddYears(1) : start.AddMonths(1);
        sub.UpdatedAtUtc = DateTime.UtcNow;

        var periodStart = new DateTime(start.Year, start.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var periodEnd = sub.BillingCycle == "yearly" ? periodStart.AddYears(1).AddSeconds(-1) : periodStart.AddMonths(1).AddSeconds(-1);
        var existingInvoice = await db.BillingInvoices
            .FirstOrDefaultAsync(x => x.TenantId == attempt.TenantId && x.InvoiceNo == $"INV-{start:yyyyMMdd}-{attempt.OrderId}", ct);
        if (existingInvoice is null)
        {
            var subtotal = attempt.Amount;
            var tax = Math.Round(subtotal * 0.18m, 2, MidpointRounding.AwayFromZero);
            db.BillingInvoices.Add(new BillingInvoice
            {
                Id = Guid.NewGuid(),
                InvoiceNo = $"INV-{start:yyyyMMdd}-{attempt.OrderId}",
                TenantId = attempt.TenantId,
                PeriodStartUtc = periodStart,
                PeriodEndUtc = periodEnd,
                Subtotal = subtotal,
                TaxAmount = tax,
                Total = subtotal + tax,
                Status = "paid",
                PaidAtUtc = attempt.PaidAtUtc ?? DateTime.UtcNow,
                PdfUrl = string.Empty,
                CreatedAtUtc = DateTime.UtcNow
            });
        }
    }
}
