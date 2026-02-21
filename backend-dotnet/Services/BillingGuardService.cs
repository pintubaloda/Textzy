using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Textzy.Api.Data;

namespace Textzy.Api.Services;

public class BillingGuardService(ControlDbContext db)
{
    public async Task<(bool Allowed, int Limit, int Used, string Message)> CheckLimitAsync(Guid tenantId, string key, int nextUsed, CancellationToken ct = default)
    {
        var sub = await db.TenantSubscriptions
            .Where(x => x.TenantId == tenantId)
            .OrderByDescending(x => x.CreatedAtUtc)
            .FirstOrDefaultAsync(ct);
        if (sub is null) return (true, int.MaxValue, nextUsed, string.Empty);

        var plan = await db.BillingPlans.FirstOrDefaultAsync(x => x.Id == sub.PlanId && x.IsActive, ct);
        if (plan is null) return (true, int.MaxValue, nextUsed, string.Empty);

        Dictionary<string, int> limits;
        try { limits = JsonSerializer.Deserialize<Dictionary<string, int>>(plan.LimitsJson) ?? new(); }
        catch { limits = new(); }

        if (!limits.TryGetValue(key, out var limit) || limit <= 0) return (true, int.MaxValue, nextUsed, string.Empty);
        if (nextUsed <= limit) return (true, limit, nextUsed, string.Empty);
        return (false, limit, nextUsed, $"Plan limit exceeded for {key}: {nextUsed}/{limit}");
    }
}
