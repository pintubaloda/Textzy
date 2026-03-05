using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Net;
using Textzy.Api.Data;
using Textzy.Api.Models;
using Textzy.Api.Services;

namespace Textzy.Api.Controllers;

[ApiController]
[Route("api/payments/webhook")]
public class PaymentWebhookController(
    ControlDbContext db,
    SecretCryptoService crypto,
    AuditLogService audit,
    SensitiveDataRedactor redactor,
    ILogger<PaymentWebhookController> logger) : ControllerBase
{
    [HttpPost("{provider}")]
    public async Task<IActionResult> Receive(string provider, CancellationToken ct)
    {
        provider = (provider ?? string.Empty).Trim().ToLowerInvariant();
        if (provider.Length is < 2 or > 40) return BadRequest("Invalid provider.");

        using var reader = new StreamReader(Request.Body);
        var raw = await reader.ReadToEndAsync(ct);
        var scopeRows = await db.PlatformSettings.Where(x => x.Scope == "payment-gateway").ToListAsync(ct);
        var settings = scopeRows.ToDictionary(x => x.Key, x => crypto.Decrypt(x.ValueEncrypted), StringComparer.OrdinalIgnoreCase);
        var sourceIp = ResolveSourceIp(HttpContext);
        var allowedIpsRaw = settings.TryGetValue("webhookAllowedIps", out var ipRaw) ? ipRaw : string.Empty;
        if (!IsAllowedSourceIp(sourceIp, allowedIpsRaw))
        {
            db.AuditLogs.Add(new AuditLog
            {
                Id = Guid.NewGuid(),
                TenantId = null,
                ActorUserId = Guid.Empty,
                Action = "payment.webhook.rejected",
                Details = $"provider={provider}; reason=ip_untrusted; sourceIp={sourceIp}",
                CreatedAtUtc = DateTime.UtcNow
            });
            await db.SaveChangesAsync(ct);
            return StatusCode(StatusCodes.Status403Forbidden, "Untrusted source IP.");
        }

        var secret = settings.TryGetValue("webhookSecret", out var s) ? s : string.Empty;
        if (string.IsNullOrWhiteSpace(secret))
        {
            db.AuditLogs.Add(new AuditLog
            {
                Id = Guid.NewGuid(),
                TenantId = null,
                ActorUserId = Guid.Empty,
                Action = "payment.webhook.rejected",
                Details = $"provider={provider}; reason=webhook_secret_missing",
                CreatedAtUtc = DateTime.UtcNow
            });
            await db.SaveChangesAsync(ct);
            return Unauthorized("Webhook secret is not configured.");
        }

        var valid = Verify(provider, raw, secret, Request.Headers);
        if (!valid)
        {
            db.AuditLogs.Add(new AuditLog
            {
                Id = Guid.NewGuid(),
                TenantId = null,
                ActorUserId = Guid.Empty,
                Action = "payment.webhook.rejected",
                Details = $"provider={provider}; reason=signature_invalid",
                CreatedAtUtc = DateTime.UtcNow
            });
            await db.SaveChangesAsync(ct);
            return Unauthorized("Invalid webhook signature.");
        }

        var eventName = "";
        try
        {
            using var doc = JsonDocument.Parse(raw);
            if (doc.RootElement.TryGetProperty("event", out var e)) eventName = e.GetString() ?? "";
            if (string.IsNullOrWhiteSpace(eventName) && doc.RootElement.TryGetProperty("type", out var t)) eventName = t.GetString() ?? "";
        }
        catch { }

        var replayKey = ResolveReplayKey(provider, eventName, raw, Request.Headers);
        var duplicate = await db.WebhookReplayGuards
            .FirstOrDefaultAsync(x => x.Provider == provider && x.ReplayKey == replayKey, ct);
        if (duplicate is not null)
            return Ok(new { ok = true, duplicate = true });

        db.WebhookReplayGuards.Add(new WebhookReplayGuard
        {
            Id = Guid.NewGuid(),
            Provider = provider,
            ReplayKey = replayKey,
            FirstSeenAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddDays(2)
        });

        db.AuditLogs.Add(new AuditLog
        {
            Id = Guid.NewGuid(),
            TenantId = null,
            ActorUserId = Guid.Empty,
            Action = "payment.webhook.received",
            Details = $"provider={provider}; event={eventName}",
            CreatedAtUtc = DateTime.UtcNow
        });
        await db.SaveChangesAsync(ct);
        await HandleProviderEventAsync(provider, eventName, raw, ct);
        logger.LogInformation("Payment webhook received provider={Provider} event={Event}", provider, eventName);
        return Ok(new { ok = true });
    }

    private async Task HandleProviderEventAsync(string provider, string eventName, string raw, CancellationToken ct)
    {
        provider = (provider ?? string.Empty).Trim().ToLowerInvariant();
        if (provider != "razorpay") return;
        if (!string.Equals(eventName, "payment.captured", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(eventName, "order.paid", StringComparison.OrdinalIgnoreCase))
            return;

        try
        {
            using var doc = JsonDocument.Parse(raw);
            var root = doc.RootElement;
            var payload = root.TryGetProperty("payload", out var pl) ? pl : default;
            var paymentEntity = payload.ValueKind != JsonValueKind.Undefined &&
                                payload.TryGetProperty("payment", out var pay) &&
                                pay.TryGetProperty("entity", out var ent)
                ? ent
                : default;
            if (paymentEntity.ValueKind == JsonValueKind.Undefined) return;

            var orderId = paymentEntity.TryGetProperty("order_id", out var ordEl) ? ordEl.GetString() ?? string.Empty : string.Empty;
            var paymentId = paymentEntity.TryGetProperty("id", out var pidEl) ? pidEl.GetString() ?? string.Empty : string.Empty;
            var amountPaise = paymentEntity.TryGetProperty("amount", out var amtEl) && amtEl.TryGetInt32(out var amt) ? amt : -1;
            var currency = paymentEntity.TryGetProperty("currency", out var curEl) ? curEl.GetString() ?? string.Empty : string.Empty;
            var paymentStatus = paymentEntity.TryGetProperty("status", out var stEl) ? stEl.GetString() ?? string.Empty : string.Empty;
            if (string.IsNullOrWhiteSpace(orderId)) return;

            var attempt = await db.BillingPaymentAttempts
                .Where(x => x.Provider == "razorpay" && x.OrderId == orderId)
                .OrderByDescending(x => x.CreatedAtUtc)
                .FirstOrDefaultAsync(ct);
            if (attempt is null) return;

            if (attempt.Status == "paid") return;
            var expectedPaise = (int)Math.Round(attempt.Amount * 100m, MidpointRounding.AwayFromZero);
            if (!string.Equals(paymentStatus, "captured", StringComparison.OrdinalIgnoreCase))
            {
                attempt.Status = "payment_validation_failed";
                attempt.LastError = "Webhook payment not captured.";
                attempt.RawResponse = raw;
                attempt.UpdatedAtUtc = DateTime.UtcNow;
                await db.SaveChangesAsync(ct);
                return;
            }
            if (amountPaise != expectedPaise || !string.Equals(currency, attempt.Currency, StringComparison.OrdinalIgnoreCase))
            {
                attempt.Status = "amount_mismatch";
                attempt.LastError = $"Expected {expectedPaise} {attempt.Currency}, got {amountPaise} {currency}";
                attempt.RawResponse = raw;
                attempt.UpdatedAtUtc = DateTime.UtcNow;
                await db.SaveChangesAsync(ct);
                return;
            }

            attempt.PaymentId = string.IsNullOrWhiteSpace(paymentId) ? attempt.PaymentId : paymentId;
            attempt.Status = "paid";
            attempt.PaidAtUtc = DateTime.UtcNow;
            attempt.UpdatedAtUtc = DateTime.UtcNow;
            attempt.RawResponse = raw;

            await ActivateSubscriptionFromPaymentAsync(attempt, ct);
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("billing.razorpay.webhook.paid", $"tenant={attempt.TenantId}; order={attempt.OrderId}", ct);
        }
        catch (Exception ex)
        {
            logger.LogError("Payment webhook processing failed provider={Provider} event={Event}: {Error}", provider, eventName, redactor.RedactText(ex.Message));
        }
    }

    private static bool Verify(string provider, string body, string secret, IHeaderDictionary headers)
    {
        if (string.IsNullOrWhiteSpace(secret)) return false;
        provider = provider.Trim().ToLowerInvariant();

        if (provider == "razorpay")
        {
            var sig = headers["X-Razorpay-Signature"].ToString();
            if (string.IsNullOrWhiteSpace(sig)) return false;
            using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
            var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(body));
            var expected = Convert.ToHexString(hash).ToLowerInvariant();
            var actual = sig.Trim().ToLowerInvariant();
            var a = Encoding.UTF8.GetBytes(expected);
            var b = Encoding.UTF8.GetBytes(actual);
            return a.Length == b.Length && CryptographicOperations.FixedTimeEquals(a, b);
        }

        var generic = headers["X-Webhook-Secret"].ToString();
        if (string.IsNullOrWhiteSpace(generic)) generic = headers["X-Signature"].ToString();
        if (string.IsNullOrWhiteSpace(generic)) return false;
        return string.Equals(generic.Trim(), secret.Trim(), StringComparison.Ordinal);
    }

    private static string ResolveReplayKey(string provider, string eventName, string raw, IHeaderDictionary headers)
    {
        var h = headers["X-Razorpay-Event-Id"].ToString().Trim();
        if (!string.IsNullOrWhiteSpace(h)) return h;

        try
        {
            using var doc = JsonDocument.Parse(raw);
            var payload = doc.RootElement.TryGetProperty("payload", out var pl) ? pl : default;
            var paymentEntity = payload.ValueKind != JsonValueKind.Undefined &&
                                payload.TryGetProperty("payment", out var pay) &&
                                pay.TryGetProperty("entity", out var ent)
                ? ent
                : default;
            var paymentId = paymentEntity.ValueKind == JsonValueKind.Object &&
                            paymentEntity.TryGetProperty("id", out var pid)
                ? (pid.GetString() ?? string.Empty)
                : string.Empty;
            if (!string.IsNullOrWhiteSpace(paymentId))
                return $"{provider}:{eventName}:{paymentId}";
        }
        catch
        {
            // fallback to raw hash
        }

        using var sha = SHA256.Create();
        var hash = sha.ComputeHash(Encoding.UTF8.GetBytes(raw ?? string.Empty));
        return $"{provider}:{eventName}:{Convert.ToHexString(hash)}";
    }

    private static string ResolveSourceIp(HttpContext ctx)
    {
        var fwd = ctx.Request.Headers["X-Forwarded-For"].ToString();
        if (!string.IsNullOrWhiteSpace(fwd))
        {
            var first = fwd.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).FirstOrDefault();
            if (!string.IsNullOrWhiteSpace(first)) return first;
        }
        return ctx.Connection.RemoteIpAddress?.ToString() ?? string.Empty;
    }

    private static bool IsAllowedSourceIp(string sourceIpRaw, string allowedIpsRaw)
    {
        if (string.IsNullOrWhiteSpace(allowedIpsRaw)) return true; // backward compatible: empty means allow all
        if (string.IsNullOrWhiteSpace(sourceIpRaw)) return false;
        if (!IPAddress.TryParse(sourceIpRaw, out var sourceIp)) return false;

        var tokens = allowedIpsRaw
            .Split(new[] { ',', ';', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        foreach (var token in tokens)
        {
            if (TryMatchIpOrCidr(sourceIp, token)) return true;
        }
        return false;
    }

    private static bool TryMatchIpOrCidr(IPAddress source, string token)
    {
        if (IPAddress.TryParse(token, out var single))
            return source.Equals(single);

        var parts = token.Split('/', StringSplitOptions.TrimEntries);
        if (parts.Length != 2) return false;
        if (!IPAddress.TryParse(parts[0], out var network)) return false;
        if (!int.TryParse(parts[1], out var prefix)) return false;

        var srcBytes = source.GetAddressBytes();
        var netBytes = network.GetAddressBytes();
        if (srcBytes.Length != netBytes.Length) return false;

        var maxBits = srcBytes.Length * 8;
        if (prefix < 0 || prefix > maxBits) return false;

        var fullBytes = prefix / 8;
        var remBits = prefix % 8;

        for (var i = 0; i < fullBytes; i++)
        {
            if (srcBytes[i] != netBytes[i]) return false;
        }

        if (remBits == 0) return true;
        var mask = (byte)(0xFF << (8 - remBits));
        return (srcBytes[fullBytes] & mask) == (netBytes[fullBytes] & mask);
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

        var invoiceNo = $"INV-{start:yyyyMMdd}-{attempt.OrderId}";
        var exists = await db.BillingInvoices.AnyAsync(x => x.TenantId == attempt.TenantId && x.InvoiceNo == invoiceNo, ct);
        if (!exists)
        {
            var subtotal = attempt.Amount;
            var tax = Math.Round(subtotal * 0.18m, 2, MidpointRounding.AwayFromZero);
            var periodStart = new DateTime(start.Year, start.Month, 1, 0, 0, 0, DateTimeKind.Utc);
            var periodEnd = sub.BillingCycle == "yearly" ? periodStart.AddYears(1).AddSeconds(-1) : periodStart.AddMonths(1).AddSeconds(-1);
            db.BillingInvoices.Add(new BillingInvoice
            {
                Id = Guid.NewGuid(),
                InvoiceNo = invoiceNo,
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
