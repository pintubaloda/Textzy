using System.Net;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Textzy.Api.Data;
using Textzy.Api.Models;
using Textzy.Api.Services;
using static Textzy.Api.Services.PermissionCatalog;

namespace Textzy.Api.Controllers;

[ApiController]
[Route("api/platform/purchases")]
public class PlatformPurchasesController(
    ControlDbContext db,
    AuthContext auth,
    RbacService rbac,
    AuditLogService audit,
    EmailService emailService) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Report(
        [FromQuery] DateTime? fromUtc = null,
        [FromQuery] DateTime? toUtc = null,
        [FromQuery] string service = "",
        [FromQuery] string q = "",
        [FromQuery] string status = "",
        [FromQuery] int take = 250,
        CancellationToken ct = default)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        if (!rbac.HasPermission(PlatformSettingsRead)) return Forbid();

        var safeTake = Math.Clamp(take, 1, 1000);
        var normalizedService = (service ?? string.Empty).Trim().ToLowerInvariant();
        var normalizedQuery = (q ?? string.Empty).Trim().ToLowerInvariant();
        var normalizedStatus = (status ?? string.Empty).Trim().ToLowerInvariant();

        var invoiceQuery = db.BillingInvoices.AsNoTracking().AsQueryable();
        if (fromUtc.HasValue)
        {
            var start = DateTime.SpecifyKind(fromUtc.Value, DateTimeKind.Utc);
            invoiceQuery = invoiceQuery.Where(x => (x.PaidAtUtc ?? x.IssuedAtUtc) >= start);
        }

        if (toUtc.HasValue)
        {
            var end = DateTime.SpecifyKind(toUtc.Value, DateTimeKind.Utc);
            invoiceQuery = invoiceQuery.Where(x => (x.PaidAtUtc ?? x.IssuedAtUtc) <= end);
        }

        var invoices = await invoiceQuery
            .OrderByDescending(x => x.PaidAtUtc ?? x.IssuedAtUtc)
            .ToListAsync(ct);

        var tenantIds = invoices.Select(x => x.TenantId).Distinct().ToList();
        var referenceNos = invoices
            .Select(x => (x.ReferenceNo ?? string.Empty).Trim())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var tenants = await db.Tenants.AsNoTracking()
            .Where(x => tenantIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, ct);
        var profiles = await db.TenantCompanyProfiles.AsNoTracking()
            .Where(x => tenantIds.Contains(x.TenantId))
            .ToDictionaryAsync(x => x.TenantId, ct);
        var attempts = await db.BillingPaymentAttempts.AsNoTracking()
            .Where(x => referenceNos.Contains(x.OrderId))
            .ToListAsync(ct);
        var subscriptions = await db.TenantSubscriptions.AsNoTracking()
            .Where(x => tenantIds.Contains(x.TenantId))
            .ToListAsync(ct);
        var memberships = await db.TenantUsers.AsNoTracking()
            .Where(x => tenantIds.Contains(x.TenantId))
            .ToListAsync(ct);
        var userIds = memberships.Select(x => x.UserId).Distinct().ToList();
        var users = await db.Users.AsNoTracking()
            .Where(x => userIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, ct);

        var planIds = attempts.Select(x => x.PlanId)
            .Concat(subscriptions.Select(x => x.PlanId))
            .Distinct()
            .ToList();
        var plans = await db.BillingPlans.AsNoTracking()
            .Where(x => planIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, ct);

        var attemptByOrderId = attempts
            .GroupBy(x => x.OrderId, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                g => g.Key,
                g => g.OrderByDescending(x => x.PaidAtUtc ?? x.UpdatedAtUtc).First(),
                StringComparer.OrdinalIgnoreCase);

        var latestSubscriptionByTenant = subscriptions
            .GroupBy(x => x.TenantId)
            .ToDictionary(
                g => g.Key,
                g => g.OrderByDescending(x => x.CreatedAtUtc).First());

        var ownerByTenant = memberships
            .GroupBy(x => x.TenantId)
            .ToDictionary(
                g => g.Key,
                g =>
                {
                    var membership = g.OrderBy(x => RolePriority(x.Role)).ThenBy(x => x.CreatedAtUtc).FirstOrDefault();
                    if (membership is null) return (User?)null;
                    return users.TryGetValue(membership.UserId, out var user) ? user : (User?)null;
                });

        var rows = invoices.Select((invoice, index) =>
        {
            tenants.TryGetValue(invoice.TenantId, out var tenant);
            profiles.TryGetValue(invoice.TenantId, out var profile);
            ownerByTenant.TryGetValue(invoice.TenantId, out var owner);
            attemptByOrderId.TryGetValue((invoice.ReferenceNo ?? string.Empty).Trim(), out var attempt);

            BillingPlan? plan = null;
            if (attempt is not null && plans.TryGetValue(attempt.PlanId, out var attemptPlan))
                plan = attemptPlan;
            else if (latestSubscriptionByTenant.TryGetValue(invoice.TenantId, out var sub) && plans.TryGetValue(sub.PlanId, out var subPlan))
                plan = subPlan;

            var companyName = !string.IsNullOrWhiteSpace(profile?.CompanyName)
                ? profile.CompanyName
                : tenant?.Name ?? "Unknown Company";
            var userName = !string.IsNullOrWhiteSpace(owner?.FullName)
                ? owner.FullName
                : owner?.Email ?? (profile?.BillingEmail ?? "-");
            var userEmail = owner?.Email ?? profile?.BillingEmail ?? string.Empty;
            var serviceName = ResolveServiceName(plan, invoice);
            var serviceCode = (plan?.Code ?? string.Empty).Trim();
            var purchaseDateUtc = invoice.PaidAtUtc ?? invoice.IssuedAtUtc;
            var currency = string.IsNullOrWhiteSpace(attempt?.Currency) ? "INR" : attempt!.Currency.Trim().ToUpperInvariant();

            return new PurchaseReportRow(
                Index: index + 1,
                InvoiceId: invoice.Id,
                TenantId: invoice.TenantId,
                InvoiceNo: invoice.InvoiceNo,
                InvoiceKind: invoice.InvoiceKind,
                InvoiceStatus: invoice.Status,
                UserName: userName,
                UserEmail: userEmail,
                CompanyName: companyName,
                GstNo: profile?.Gstin ?? string.Empty,
                PurchaseDateUtc: purchaseDateUtc,
                InvoiceDateUtc: invoice.IssuedAtUtc,
                ServiceName: serviceName,
                ServiceCode: serviceCode,
                BillingCycle: invoice.BillingCycle,
                Amount: invoice.Subtotal,
                GstAmount: invoice.TaxAmount,
                TotalAmount: invoice.Total,
                Currency: currency,
                ReferenceNo: invoice.ReferenceNo ?? string.Empty,
                BillingEmail: profile?.BillingEmail ?? string.Empty,
                PaidAtUtc: invoice.PaidAtUtc,
                CreatedAtUtc: invoice.CreatedAtUtc);
        });

        var filtered = rows.Where(row =>
        {
            if (!string.IsNullOrWhiteSpace(normalizedService))
            {
                var matchesService = string.Equals((row.ServiceCode ?? string.Empty).Trim(), normalizedService, StringComparison.OrdinalIgnoreCase)
                    || string.Equals((row.ServiceName ?? string.Empty).Trim(), normalizedService, StringComparison.OrdinalIgnoreCase);
                if (!matchesService) return false;
            }

            if (!string.IsNullOrWhiteSpace(normalizedStatus) &&
                !string.Equals((row.InvoiceStatus ?? string.Empty).Trim(), normalizedStatus, StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            if (!string.IsNullOrWhiteSpace(normalizedQuery))
            {
                var haystack = string.Join(" ",
                    row.InvoiceNo,
                    row.UserName,
                    row.UserEmail,
                    row.CompanyName,
                    row.GstNo,
                    row.ServiceName,
                    row.ServiceCode,
                    row.ReferenceNo).ToLowerInvariant();
                if (!haystack.Contains(normalizedQuery)) return false;
            }

            return true;
        }).ToList();

        var serviceOptions = filtered
            .Select(x => new { code = x.ServiceCode, name = x.ServiceName })
            .Where(x => !string.IsNullOrWhiteSpace(x.name))
            .Distinct()
            .OrderBy(x => x.name)
            .ToList();

        var summary = new
        {
            totalPurchases = filtered.Count(),
            totalAmount = filtered.Sum(x => x.Amount),
            totalGst = filtered.Sum(x => x.GstAmount),
            totalInvoiceValue = filtered.Sum(x => x.TotalAmount),
            uniqueCustomers = filtered.Select(x => x.TenantId).Distinct().Count(),
            services = filtered.Select(x => x.ServiceName).Distinct(StringComparer.OrdinalIgnoreCase).Count()
        };

        return Ok(new
        {
            summary,
            serviceOptions,
            items = filtered.Take(safeTake).Select((row, idx) => new
            {
                sNo = idx + 1,
                row.InvoiceId,
                row.TenantId,
                row.InvoiceNo,
                row.InvoiceKind,
                invoiceStatus = row.InvoiceStatus,
                row.UserName,
                row.UserEmail,
                row.CompanyName,
                gstNo = row.GstNo,
                row.PurchaseDateUtc,
                row.InvoiceDateUtc,
                row.ServiceName,
                row.ServiceCode,
                row.BillingCycle,
                row.Amount,
                gstAmount = row.GstAmount,
                row.TotalAmount,
                row.Currency,
                row.ReferenceNo,
                row.BillingEmail,
                row.PaidAtUtc,
                row.CreatedAtUtc
            })
        });
    }

    [HttpGet("{invoiceId:guid}/view")]
    public async Task<IActionResult> ViewInvoice(Guid invoiceId, CancellationToken ct = default)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        if (!rbac.HasPermission(PlatformSettingsRead)) return Forbid();

        var invoice = await db.BillingInvoices.AsNoTracking().FirstOrDefaultAsync(x => x.Id == invoiceId, ct);
        if (invoice is null) return NotFound("Invoice not found.");

        var tenant = await db.Tenants.AsNoTracking().FirstOrDefaultAsync(x => x.Id == invoice.TenantId, ct);
        var profile = await db.TenantCompanyProfiles.AsNoTracking().FirstOrDefaultAsync(x => x.TenantId == invoice.TenantId, ct);
        var companyName = string.IsNullOrWhiteSpace(profile?.CompanyName) ? (tenant?.Name ?? "Textzy Workspace") : profile!.CompanyName;
        var legalName = string.IsNullOrWhiteSpace(profile?.LegalName) ? companyName : profile!.LegalName;
        var html = BuildInvoiceHtml(
            invoice,
            companyName,
            legalName,
            profile?.BillingEmail ?? string.Empty,
            profile?.Address ?? string.Empty,
            profile?.Gstin ?? string.Empty,
            profile?.Pan ?? string.Empty);

        return File(
            Encoding.UTF8.GetBytes(html),
            "text/html; charset=utf-8",
            $"{(string.IsNullOrWhiteSpace(invoice.InvoiceNo) ? invoice.Id.ToString("N") : invoice.InvoiceNo)}.html");
    }

    [HttpPost("{invoiceId:guid}/send")]
    public async Task<IActionResult> SendInvoice(Guid invoiceId, [FromBody] SendInvoiceRequest? request, CancellationToken ct = default)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        if (!rbac.HasPermission(PlatformSettingsWrite)) return Forbid();

        var invoice = await db.BillingInvoices.AsNoTracking().FirstOrDefaultAsync(x => x.Id == invoiceId, ct);
        if (invoice is null) return NotFound("Invoice not found.");

        var tenant = await db.Tenants.AsNoTracking().FirstOrDefaultAsync(x => x.Id == invoice.TenantId, ct);
        var profile = await db.TenantCompanyProfiles.AsNoTracking().FirstOrDefaultAsync(x => x.TenantId == invoice.TenantId, ct);
        var recipient = await ResolveBillingRecipientAsync(invoice.TenantId, request?.Email, ct);
        if (string.IsNullOrWhiteSpace(recipient.email))
            return BadRequest("Billing recipient email is not configured.");

        var attempt = await db.BillingPaymentAttempts.AsNoTracking()
            .Where(x => x.TenantId == invoice.TenantId && x.OrderId == invoice.ReferenceNo)
            .OrderByDescending(x => x.PaidAtUtc ?? x.UpdatedAtUtc)
            .FirstOrDefaultAsync(ct);
        var plan = attempt is null
            ? null
            : await db.BillingPlans.AsNoTracking().FirstOrDefaultAsync(x => x.Id == attempt.PlanId, ct);
        var serviceName = ResolveServiceName(plan, invoice);
        var currency = string.IsNullOrWhiteSpace(attempt?.Currency) ? "INR" : attempt!.Currency.Trim().ToUpperInvariant();
        var companyName = string.IsNullOrWhiteSpace(profile?.CompanyName) ? (tenant?.Name ?? "Textzy Workspace") : profile!.CompanyName;

        await emailService.SendBillingEventAsync(
            recipient.email,
            recipient.name,
            companyName,
            $"Invoice {invoice.InvoiceNo}",
            "Your billing invoice is ready for review.",
            new Dictionary<string, string>
            {
                ["Invoice No"] = invoice.InvoiceNo,
                ["Service"] = serviceName,
                ["Invoice Date"] = invoice.IssuedAtUtc.ToString("yyyy-MM-dd"),
                ["Amount"] = FormatCurrency(invoice.Subtotal, currency),
                ["GST"] = FormatCurrency(invoice.TaxAmount, currency),
                ["Total"] = FormatCurrency(invoice.Total, currency),
                ["Status"] = invoice.Status
            },
            ct);

        await audit.WriteAsync("platform.purchase.invoice.sent", $"invoice={invoiceId}; tenant={invoice.TenantId}; email={recipient.email}", ct);
        return Ok(new { sent = true, recipient = recipient.email, invoiceId });
    }

    [HttpPut("{invoiceId:guid}")]
    public async Task<IActionResult> UpdateInvoice(Guid invoiceId, [FromBody] UpdateInvoiceRequest request, CancellationToken ct = default)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        if (!rbac.HasPermission(PlatformSettingsWrite)) return Forbid();

        var invoice = await db.BillingInvoices.FirstOrDefaultAsync(x => x.Id == invoiceId, ct);
        if (invoice is null) return NotFound("Invoice not found.");

        if (!string.IsNullOrWhiteSpace(request.Status))
        {
            var normalizedStatus = request.Status.Trim().ToLowerInvariant();
            if (normalizedStatus is not ("issued" or "paid" or "refunded" or "cancelled"))
                return BadRequest("status must be issued, paid, refunded, or cancelled.");
            invoice.Status = normalizedStatus;
        }
        invoice.ReferenceNo = string.IsNullOrWhiteSpace(request.ReferenceNo) ? invoice.ReferenceNo : request.ReferenceNo.Trim();
        if (request.IssuedAtUtc.HasValue)
            invoice.IssuedAtUtc = DateTime.SpecifyKind(request.IssuedAtUtc.Value, DateTimeKind.Utc);
        invoice.PaidAtUtc = request.PaidAtUtc.HasValue
            ? DateTime.SpecifyKind(request.PaidAtUtc.Value, DateTimeKind.Utc)
            : null;
        invoice.IntegrityHash = ComputeInvoiceIntegrityHash(invoice);

        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("platform.purchase.invoice.updated", $"invoice={invoiceId}; status={invoice.Status}; reference={invoice.ReferenceNo}", ct);

        return Ok(new
        {
            invoice.Id,
            invoice.InvoiceNo,
            invoice.Status,
            invoice.ReferenceNo,
            invoice.IssuedAtUtc,
            invoice.PaidAtUtc,
            invoice.IntegrityHash
        });
    }

    private async Task<(string email, string name)> ResolveBillingRecipientAsync(Guid tenantId, string? overrideEmail, CancellationToken ct)
    {
        var trimmedOverride = (overrideEmail ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(trimmedOverride))
            return (trimmedOverride, trimmedOverride);

        var profile = await db.TenantCompanyProfiles.AsNoTracking().FirstOrDefaultAsync(x => x.TenantId == tenantId, ct);
        if (!string.IsNullOrWhiteSpace(profile?.BillingEmail))
            return (profile.BillingEmail.Trim(), string.IsNullOrWhiteSpace(profile.CompanyName) ? profile.BillingEmail.Trim() : profile.CompanyName);

        var ownerMemberships = await db.TenantUsers.AsNoTracking()
            .Where(x => x.TenantId == tenantId)
            .ToListAsync(ct);
        var ownerMembership = ownerMemberships
            .OrderBy(x => RolePriority(x.Role))
            .ThenBy(x => x.CreatedAtUtc)
            .FirstOrDefault();
        if (ownerMembership is not null)
        {
            var owner = await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == ownerMembership.UserId, ct);
            if (!string.IsNullOrWhiteSpace(owner?.Email))
                return (owner.Email.Trim(), string.IsNullOrWhiteSpace(owner.FullName) ? owner.Email.Trim() : owner.FullName);
        }

        if (!string.IsNullOrWhiteSpace(auth.Email))
            return (auth.Email.Trim(), string.IsNullOrWhiteSpace(auth.FullName) ? auth.Email.Trim() : auth.FullName);

        return (string.Empty, string.Empty);
    }

    private static string ResolveServiceName(BillingPlan? plan, BillingInvoice invoice)
    {
        if (!string.IsNullOrWhiteSpace(plan?.Name)) return plan.Name.Trim();
        var cycle = string.IsNullOrWhiteSpace(invoice.BillingCycle) ? "purchase" : invoice.BillingCycle.Trim().ToLowerInvariant();
        return cycle switch
        {
            "yearly" => "Yearly Subscription",
            "monthly" => "Monthly Subscription",
            "lifetime" => "Lifetime Subscription",
            "usage_based" => "Usage Pack",
            _ => "Platform Service"
        };
    }

    private static int RolePriority(string role)
    {
        var normalized = (role ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            "owner" => 0,
            "admin" => 1,
            "manager" => 2,
            "support" => 3,
            "marketing" => 4,
            "finance" => 5,
            _ => 99
        };
    }

    private static string FormatCurrency(decimal amount, string currency)
    {
        var code = string.IsNullOrWhiteSpace(currency) ? "INR" : currency.Trim().ToUpperInvariant();
        return $"{(code == "INR" ? "INR " : code + " ")}{amount:0.00}";
    }

    private static string BuildInvoiceHtml(BillingInvoice invoice, string companyName, string legalName, string billingEmail, string billingAddress, string gstin, string pan)
    {
        var safeInvoiceNo = WebUtility.HtmlEncode(invoice.InvoiceNo);
        var safeCompany = WebUtility.HtmlEncode(companyName);
        var safeLegalName = WebUtility.HtmlEncode(legalName);
        var safeEmail = WebUtility.HtmlEncode(billingEmail);
        var safeAddress = WebUtility.HtmlEncode(billingAddress);
        var safeGstin = WebUtility.HtmlEncode(gstin);
        var safePan = WebUtility.HtmlEncode(pan);
        var safeReference = WebUtility.HtmlEncode(invoice.ReferenceNo);
        var invoiceLabel = string.Equals(invoice.InvoiceKind, "proforma_invoice", StringComparison.OrdinalIgnoreCase) ? "Proforma Invoice" : "Tax Invoice";
        var safeInvoiceLabel = WebUtility.HtmlEncode(invoiceLabel);
        var safeTaxMode = WebUtility.HtmlEncode(string.Equals(invoice.TaxMode, "inclusive", StringComparison.OrdinalIgnoreCase) ? "incl. GST" : "+ GST");
        return $$"""
            <!doctype html>
            <html lang="en">
            <head>
              <meta charset="utf-8" />
              <title>{{safeInvoiceNo}}</title>
              <style>
                body { font-family: Segoe UI, Arial, sans-serif; margin: 24px; color: #0f172a; }
                .header { display:flex; justify-content:space-between; margin-bottom:16px; gap:16px; }
                .brand { font-size:24px; font-weight:700; color:#f97316; }
                .muted { color:#64748b; font-size:13px; }
                .pill { display:inline-block; padding:6px 12px; border-radius:999px; background:#fff7ed; color:#c2410c; font-size:12px; font-weight:700; }
                table { width:100%; border-collapse:collapse; margin-top:18px; }
                th, td { border:1px solid #e2e8f0; padding:10px; text-align:left; }
                th { background:#f8fafc; }
                .right { text-align:right; }
              </style>
            </head>
            <body>
              <div class="header">
                <div>
                  <div class="brand">Textzy</div>
                  <p class="muted">Platform billing document</p>
                </div>
                <div style="text-align:right;">
                  <span class="pill">{{safeInvoiceLabel}}</span>
                  <p class="muted" style="margin-top:12px;">Invoice No: <strong>{{safeInvoiceNo}}</strong></p>
                  <p class="muted">Reference: <strong>{{safeReference}}</strong></p>
                  <p class="muted">Issued: <strong>{{invoice.IssuedAtUtc:yyyy-MM-dd}}</strong></p>
                </div>
              </div>

              <table>
                <tr>
                  <th>Bill To</th>
                  <th>Invoice Summary</th>
                </tr>
                <tr>
                  <td>
                    <strong>{{safeCompany}}</strong><br />
                    {{safeLegalName}}<br />
                    {{safeAddress}}<br />
                    GSTIN: {{safeGstin}}<br />
                    PAN: {{safePan}}<br />
                    {{safeEmail}}
                  </td>
                  <td>
                    Type: {{safeInvoiceLabel}}<br />
                    Billing cycle: {{WebUtility.HtmlEncode(invoice.BillingCycle)}}<br />
                    Tax mode: {{safeTaxMode}}<br />
                    Status: {{WebUtility.HtmlEncode(invoice.Status)}}<br />
                    Paid at: {{(invoice.PaidAtUtc?.ToString("yyyy-MM-dd") ?? "-")}}
                  </td>
                </tr>
              </table>

              <table>
                <tr>
                  <th>Description</th>
                  <th class="right">Amount</th>
                </tr>
                <tr>
                  <td>Platform subscription / purchase</td>
                  <td class="right">{{invoice.Subtotal:0.00}}</td>
                </tr>
                <tr>
                  <td>GST</td>
                  <td class="right">{{invoice.TaxAmount:0.00}}</td>
                </tr>
                <tr>
                  <th>Total</th>
                  <th class="right">{{invoice.Total:0.00}}</th>
                </tr>
              </table>
            </body>
            </html>
            """;
    }

    private static string ComputeInvoiceIntegrityHash(BillingInvoice invoice)
    {
        var basis = string.Join("|",
            invoice.InvoiceNo,
            invoice.TenantId.ToString("D"),
            invoice.InvoiceKind,
            invoice.BillingCycle,
            invoice.TaxMode,
            invoice.ReferenceNo,
            invoice.PeriodStartUtc.ToUniversalTime().ToString("O"),
            invoice.PeriodEndUtc.ToUniversalTime().ToString("O"),
            invoice.Subtotal.ToString("0.00"),
            invoice.TaxAmount.ToString("0.00"),
            invoice.Total.ToString("0.00"),
            (invoice.PaidAtUtc ?? DateTime.MinValue).ToUniversalTime().ToString("O"),
            invoice.Status,
            invoice.IssuedAtUtc.ToUniversalTime().ToString("O"));

        var bytes = Encoding.UTF8.GetBytes(basis);
        var hash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(bytes));
        return hash;
    }

    private sealed record PurchaseReportRow(
        int Index,
        Guid InvoiceId,
        Guid TenantId,
        string InvoiceNo,
        string InvoiceKind,
        string InvoiceStatus,
        string UserName,
        string UserEmail,
        string CompanyName,
        string GstNo,
        DateTime PurchaseDateUtc,
        DateTime InvoiceDateUtc,
        string ServiceName,
        string ServiceCode,
        string BillingCycle,
        decimal Amount,
        decimal GstAmount,
        decimal TotalAmount,
        string Currency,
        string ReferenceNo,
        string BillingEmail,
        DateTime? PaidAtUtc,
        DateTime CreatedAtUtc);

    public sealed class SendInvoiceRequest
    {
        public string Email { get; set; } = string.Empty;
    }

    public sealed class UpdateInvoiceRequest
    {
        public string Status { get; set; } = string.Empty;
        public string ReferenceNo { get; set; } = string.Empty;
        public DateTime? IssuedAtUtc { get; set; }
        public DateTime? PaidAtUtc { get; set; }
    }
}
