using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Textzy.Api.Data;
using Textzy.Api.Services;
using static Textzy.Api.Services.PermissionCatalog;

namespace Textzy.Api.Controllers;

[ApiController]
[Route("api/platform/customers")]
public class PlatformCustomersController(
    ControlDbContext db,
    AuthContext auth,
    RbacService rbac) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string q = "", CancellationToken ct = default)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        if (!rbac.HasPermission(PlatformSettingsRead)) return Forbid();

        var query = db.Tenants.AsQueryable();
        var search = (q ?? string.Empty).Trim().ToLowerInvariant();
        if (!string.IsNullOrWhiteSpace(search))
        {
            query = query.Where(t => t.Name.ToLower().Contains(search) || t.Slug.ToLower().Contains(search));
        }

        var tenants = await query.OrderByDescending(t => t.CreatedAtUtc).ToListAsync(ct);
        var tenantIds = tenants.Select(t => t.Id).ToList();

        var users = await db.TenantUsers.Where(x => tenantIds.Contains(x.TenantId)).ToListAsync(ct);
        var userIds = users.Select(x => x.UserId).Distinct().ToList();
        var userMap = await db.Users.Where(u => userIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, ct);
        var subs = await db.TenantSubscriptions.Where(s => tenantIds.Contains(s.TenantId)).ToListAsync(ct);
        var plans = await db.BillingPlans.ToListAsync(ct);
        var planMap = plans.ToDictionary(x => x.Id, x => x);
        var invoices = await db.BillingInvoices.Where(i => tenantIds.Contains(i.TenantId)).ToListAsync(ct);

        var result = tenants.Select(t =>
        {
            var members = users.Where(u => u.TenantId == t.Id).ToList();
            var owner = members
                .OrderBy(m => RolePriority(m.Role))
                .Select(m => userMap.TryGetValue(m.UserId, out var u) ? u : null)
                .FirstOrDefault(u => u is not null);
            var sub = subs.Where(x => x.TenantId == t.Id).OrderByDescending(x => x.CreatedAtUtc).FirstOrDefault();
            var plan = sub is not null && planMap.TryGetValue(sub.PlanId, out var p) ? p : null;
            var inv = invoices.Where(i => i.TenantId == t.Id).ToList();
            var revenue = inv.Sum(i => i.Total);
            return new
            {
                tenantId = t.Id,
                tenantName = t.Name,
                tenantSlug = t.Slug,
                createdAtUtc = t.CreatedAtUtc,
                ownerName = owner?.FullName ?? owner?.Email ?? "-",
                ownerEmail = owner?.Email ?? "-",
                users = members.Count,
                activeUsers = members.Count(m => userMap.TryGetValue(m.UserId, out var u) && u.IsActive),
                planCode = plan?.Code ?? "",
                planName = plan?.Name ?? "No Plan",
                subscriptionStatus = sub?.Status ?? "none",
                monthlyPrice = plan?.PriceMonthly ?? 0,
                invoiceCount = inv.Count,
                totalRevenue = revenue
            };
        });

        return Ok(result);
    }

    [HttpGet("{tenantId:guid}")]
    public async Task<IActionResult> Details(Guid tenantId, CancellationToken ct)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        if (!rbac.HasPermission(PlatformSettingsRead)) return Forbid();

        var tenant = await db.Tenants.FirstOrDefaultAsync(t => t.Id == tenantId, ct);
        if (tenant is null) return NotFound("Tenant not found.");

        var members = await db.TenantUsers.Where(x => x.TenantId == tenantId).ToListAsync(ct);
        var userIds = members.Select(x => x.UserId).Distinct().ToList();
        var users = await db.Users.Where(u => userIds.Contains(u.Id)).ToListAsync(ct);
        var latestSub = await db.TenantSubscriptions.Where(x => x.TenantId == tenantId).OrderByDescending(x => x.CreatedAtUtc).FirstOrDefaultAsync(ct);
        var plan = latestSub is null ? null : await db.BillingPlans.FirstOrDefaultAsync(x => x.Id == latestSub.PlanId, ct);

        return Ok(new
        {
            tenant = new { tenant.Id, tenant.Name, tenant.Slug, tenant.CreatedAtUtc },
            subscription = latestSub is null ? null : new
            {
                latestSub.Id,
                latestSub.Status,
                latestSub.BillingCycle,
                latestSub.StartedAtUtc,
                latestSub.RenewAtUtc,
                latestSub.CancelledAtUtc,
                plan = plan is null ? null : new
                {
                    plan.Id,
                    plan.Code,
                    plan.Name,
                    plan.PriceMonthly,
                    plan.PriceYearly,
                    plan.Currency,
                    features = ParseStringList(plan.FeaturesJson),
                    limits = ParseLimits(plan.LimitsJson)
                }
            },
            members = members.Select(m =>
            {
                var user = users.FirstOrDefault(u => u.Id == m.UserId);
                return new
                {
                    userId = m.UserId,
                    role = m.Role,
                    joinedAtUtc = m.CreatedAtUtc,
                    name = user?.FullName ?? user?.Email ?? "-",
                    email = user?.Email ?? "-",
                    isActive = user?.IsActive ?? false
                };
            }).OrderBy(x => x.role).ThenBy(x => x.name)
        });
    }

    [HttpGet("{tenantId:guid}/usage")]
    public async Task<IActionResult> Usage(Guid tenantId, [FromQuery] string month = "", CancellationToken ct = default)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        if (!rbac.HasPermission(PlatformSettingsRead)) return Forbid();

        var monthKey = string.IsNullOrWhiteSpace(month) ? DateTime.UtcNow.ToString("yyyy-MM") : month.Trim();
        var usage = await db.TenantUsages
            .Where(x => x.TenantId == tenantId && x.MonthKey == monthKey)
            .OrderByDescending(x => x.UpdatedAtUtc)
            .FirstOrDefaultAsync(ct);
        if (usage is null) return Ok(new { tenantId, monthKey, values = new Dictionary<string, int>() });

        return Ok(new
        {
            tenantId,
            monthKey,
            usage.UpdatedAtUtc,
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

    [HttpGet("{tenantId:guid}/subscriptions")]
    public async Task<IActionResult> Subscriptions(Guid tenantId, CancellationToken ct)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        if (!rbac.HasPermission(PlatformSettingsRead)) return Forbid();

        var rows = await db.TenantSubscriptions
            .Where(x => x.TenantId == tenantId)
            .OrderByDescending(x => x.CreatedAtUtc)
            .ToListAsync(ct);
        var planIds = rows.Select(x => x.PlanId).Distinct().ToList();
        var plans = await db.BillingPlans.Where(x => planIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);

        return Ok(rows.Select(x => new
        {
            x.Id,
            x.TenantId,
            x.Status,
            x.BillingCycle,
            x.StartedAtUtc,
            x.RenewAtUtc,
            x.CancelledAtUtc,
            x.CreatedAtUtc,
            x.UpdatedAtUtc,
            plan = plans.TryGetValue(x.PlanId, out var p) ? new { p.Id, p.Code, p.Name, p.PriceMonthly, p.PriceYearly, p.Currency } : null
        }));
    }

    [HttpGet("{tenantId:guid}/invoices")]
    public async Task<IActionResult> Invoices(Guid tenantId, CancellationToken ct)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        if (!rbac.HasPermission(PlatformSettingsRead)) return Forbid();

        var rows = await db.BillingInvoices
            .Where(x => x.TenantId == tenantId)
            .OrderByDescending(x => x.CreatedAtUtc)
            .Take(200)
            .ToListAsync(ct);
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

    [HttpGet("{tenantId:guid}/members")]
    public async Task<IActionResult> Members(Guid tenantId, CancellationToken ct)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        if (!rbac.HasPermission(PlatformSettingsRead)) return Forbid();

        var rows = await db.TenantUsers
            .Where(x => x.TenantId == tenantId)
            .Join(db.Users, tu => tu.UserId, u => u.Id, (tu, u) => new
            {
                userId = u.Id,
                u.FullName,
                u.Email,
                u.IsActive,
                tu.Role,
                tu.CreatedAtUtc
            })
            .OrderBy(x => x.Role)
            .ThenBy(x => x.FullName)
            .ToListAsync(ct);
        return Ok(rows.Select(x => new
        {
            x.userId,
            name = string.IsNullOrWhiteSpace(x.FullName) ? x.Email : x.FullName,
            x.Email,
            x.IsActive,
            x.Role,
            joinedAtUtc = x.CreatedAtUtc
        }));
    }

    [HttpGet("{tenantId:guid}/activity")]
    public async Task<IActionResult> Activity(Guid tenantId, [FromQuery] int limit = 100, CancellationToken ct = default)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        if (!rbac.HasPermission(PlatformSettingsRead)) return Forbid();
        var safeLimit = Math.Clamp(limit, 1, 500);
        var rows = await db.AuditLogs
            .Where(x => x.TenantId == tenantId)
            .OrderByDescending(x => x.CreatedAtUtc)
            .Take(safeLimit)
            .ToListAsync(ct);
        return Ok(rows.Select(x => new
        {
            x.Id,
            x.ActorUserId,
            x.Action,
            x.Details,
            x.CreatedAtUtc
        }));
    }

    private static int RolePriority(string role)
    {
        var r = (role ?? string.Empty).ToLowerInvariant();
        return r switch
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

    private static List<string> ParseStringList(string json)
    {
        try { return JsonSerializer.Deserialize<List<string>>(json) ?? []; } catch { return []; }
    }

    private static Dictionary<string, int> ParseLimits(string json)
    {
        try { return JsonSerializer.Deserialize<Dictionary<string, int>>(json) ?? new(); } catch { return new(); }
    }
}

