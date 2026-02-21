using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Textzy.Api.Data;
using Textzy.Api.Models;
using Textzy.Api.Services;
using static Textzy.Api.Services.PermissionCatalog;

namespace Textzy.Api.Controllers;

[ApiController]
[Route("api/platform/billing/plans")]
public class PlatformBillingPlansController(
    ControlDbContext db,
    AuthContext auth,
    RbacService rbac,
    AuditLogService audit) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        if (!rbac.HasPermission(PlatformSettingsRead)) return Forbid();

        var rows = await db.BillingPlans.OrderBy(x => x.SortOrder).ThenBy(x => x.Name).ToListAsync(ct);
        return Ok(rows.Select(MapPlan));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] UpsertPlanRequest request, CancellationToken ct)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        if (!rbac.HasPermission(PlatformSettingsWrite)) return Forbid();
        var code = NormalizeCode(request.Code);
        if (string.IsNullOrWhiteSpace(code)) return BadRequest("Plan code is required.");
        if (await db.BillingPlans.AnyAsync(x => x.Code == code, ct)) return Conflict("Plan code already exists.");

        var row = new BillingPlan
        {
            Id = Guid.NewGuid(),
            Code = code,
            Name = request.Name?.Trim() ?? code,
            PriceMonthly = request.PriceMonthly,
            PriceYearly = request.PriceYearly,
            Currency = string.IsNullOrWhiteSpace(request.Currency) ? "INR" : request.Currency.Trim().ToUpperInvariant(),
            IsActive = request.IsActive,
            SortOrder = request.SortOrder,
            FeaturesJson = JsonSerializer.Serialize(request.Features ?? []),
            LimitsJson = JsonSerializer.Serialize(request.Limits ?? new Dictionary<string, int>())
        };
        db.BillingPlans.Add(row);
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("platform.billing.plan.create", $"code={row.Code}", ct);
        return Ok(MapPlan(row));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpsertPlanRequest request, CancellationToken ct)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        if (!rbac.HasPermission(PlatformSettingsWrite)) return Forbid();
        var row = await db.BillingPlans.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (row is null) return NotFound();

        var code = NormalizeCode(request.Code);
        if (string.IsNullOrWhiteSpace(code)) return BadRequest("Plan code is required.");
        if (await db.BillingPlans.AnyAsync(x => x.Id != id && x.Code == code, ct)) return Conflict("Plan code already exists.");

        row.Code = code;
        row.Name = request.Name?.Trim() ?? row.Name;
        row.PriceMonthly = request.PriceMonthly;
        row.PriceYearly = request.PriceYearly;
        row.Currency = string.IsNullOrWhiteSpace(request.Currency) ? row.Currency : request.Currency.Trim().ToUpperInvariant();
        row.IsActive = request.IsActive;
        row.SortOrder = request.SortOrder;
        row.FeaturesJson = JsonSerializer.Serialize(request.Features ?? []);
        row.LimitsJson = JsonSerializer.Serialize(request.Limits ?? new Dictionary<string, int>());
        row.UpdatedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("platform.billing.plan.update", $"code={row.Code}", ct);
        return Ok(MapPlan(row));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Archive(Guid id, CancellationToken ct)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        if (!rbac.HasPermission(PlatformSettingsWrite)) return Forbid();
        var row = await db.BillingPlans.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (row is null) return NotFound();
        row.IsActive = false;
        row.UpdatedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("platform.billing.plan.archive", $"code={row.Code}", ct);
        return NoContent();
    }

    private static object MapPlan(BillingPlan row) => new
    {
        row.Id,
        row.Code,
        row.Name,
        row.PriceMonthly,
        row.PriceYearly,
        row.Currency,
        row.IsActive,
        row.SortOrder,
        Features = ParseStringList(row.FeaturesJson),
        Limits = ParseLimits(row.LimitsJson)
    };

    private static string NormalizeCode(string? code)
    {
        var v = (code ?? string.Empty).Trim().ToLowerInvariant();
        return new string(v.Select(ch => char.IsLetterOrDigit(ch) ? ch : '_').ToArray()).Trim('_');
    }

    private static List<string> ParseStringList(string json)
    {
        try { return JsonSerializer.Deserialize<List<string>>(json) ?? []; } catch { return []; }
    }

    private static Dictionary<string, int> ParseLimits(string json)
    {
        try { return JsonSerializer.Deserialize<Dictionary<string, int>>(json) ?? new(); } catch { return new(); }
    }

    public sealed class UpsertPlanRequest
    {
        public string Code { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public decimal PriceMonthly { get; set; }
        public decimal PriceYearly { get; set; }
        public string Currency { get; set; } = "INR";
        public bool IsActive { get; set; } = true;
        public int SortOrder { get; set; }
        public List<string> Features { get; set; } = [];
        public Dictionary<string, int> Limits { get; set; } = new();
    }
}
