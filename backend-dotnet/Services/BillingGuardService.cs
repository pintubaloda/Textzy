using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Textzy.Api.Data;

namespace Textzy.Api.Services;

public class BillingGuardService(ControlDbContext db)
{
    public string CurrentMonthKey => DateTime.UtcNow.ToString("yyyy-MM");

    public async Task<(bool Allowed, int Limit, int Used, string Message)> CheckLimitAsync(Guid tenantId, string key, int nextUsed, CancellationToken ct = default)
    {
        var sub = await db.TenantSubscriptions
            .Where(x => x.TenantId == tenantId)
            .OrderByDescending(x => x.CreatedAtUtc)
            .FirstOrDefaultAsync(ct);
        if (sub is null) return (false, 0, nextUsed, "No active subscription found.");
        if (string.Equals(sub.Status, "cancelled", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(sub.Status, "suspended", StringComparison.OrdinalIgnoreCase))
            return (false, 0, nextUsed, $"Subscription status is {sub.Status}. Please renew plan.");

        var plan = await db.BillingPlans.FirstOrDefaultAsync(x => x.Id == sub.PlanId && x.IsActive, ct);
        if (plan is null) return (false, 0, nextUsed, "Subscription plan is inactive or missing.");

        Dictionary<string, int> limits;
        try { limits = JsonSerializer.Deserialize<Dictionary<string, int>>(plan.LimitsJson) ?? new(); }
        catch { limits = new(); }

        if (!limits.TryGetValue(key, out var limit) || limit <= 0) return (true, int.MaxValue, nextUsed, string.Empty);
        if (nextUsed <= limit) return (true, limit, nextUsed, string.Empty);
        return (false, limit, nextUsed, $"Plan limit exceeded for {key}: {nextUsed}/{limit}");
    }

    public async Task<int> GetCurrentUsageAsync(Guid tenantId, string key, CancellationToken ct = default)
    {
        var usage = await GetOrCreateUsageAsync(tenantId, ct);
        return key switch
        {
            "whatsappMessages" => usage.WhatsappMessagesUsed,
            "smsCredits" => usage.SmsCreditsUsed,
            "contacts" => usage.ContactsUsed,
            "teamMembers" => usage.TeamMembersUsed,
            "chatbots" => usage.ChatbotsUsed,
            "flows" => usage.FlowsUsed,
            "apiCalls" => usage.ApiCallsUsed,
            _ => 0
        };
    }

    public async Task<(bool Allowed, int Limit, int Used, string Message)> TryConsumeAsync(Guid tenantId, string key, int delta = 1, CancellationToken ct = default)
    {
        var usage = await GetOrCreateUsageAsync(tenantId, ct);
        var current = await GetCurrentUsageAsync(tenantId, key, ct);
        var next = Math.Max(0, current + delta);
        var check = await CheckLimitAsync(tenantId, key, next, ct);
        if (!check.Allowed) return check;

        SetUsageValue(usage, key, next);
        usage.UpdatedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return check;
    }

    public async Task SetAbsoluteUsageAsync(Guid tenantId, string key, int value, CancellationToken ct = default)
    {
        var usage = await GetOrCreateUsageAsync(tenantId, ct);
        SetUsageValue(usage, key, Math.Max(0, value));
        usage.UpdatedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
    }

    public async Task RotateMonthlyBucketAsync(Guid tenantId, CancellationToken ct = default)
    {
        var monthKey = CurrentMonthKey;
        var exists = await db.TenantUsages.AnyAsync(x => x.TenantId == tenantId && x.MonthKey == monthKey, ct);
        if (exists) return;
        db.TenantUsages.Add(new Textzy.Api.Models.TenantUsage
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            MonthKey = monthKey,
            WhatsappMessagesUsed = 0,
            SmsCreditsUsed = 0,
            ContactsUsed = 0,
            TeamMembersUsed = 0,
            ChatbotsUsed = 0,
            FlowsUsed = 0,
            ApiCallsUsed = 0,
            UpdatedAtUtc = DateTime.UtcNow
        });
        await db.SaveChangesAsync(ct);
    }

    private async Task<Textzy.Api.Models.TenantUsage> GetOrCreateUsageAsync(Guid tenantId, CancellationToken ct)
    {
        var monthKey = CurrentMonthKey;
        var usage = await db.TenantUsages.FirstOrDefaultAsync(x => x.TenantId == tenantId && x.MonthKey == monthKey, ct);
        if (usage is not null) return usage;
        usage = new Textzy.Api.Models.TenantUsage
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            MonthKey = monthKey,
            WhatsappMessagesUsed = 0,
            SmsCreditsUsed = 0,
            ContactsUsed = 0,
            TeamMembersUsed = 0,
            ChatbotsUsed = 0,
            FlowsUsed = 0,
            ApiCallsUsed = 0,
            UpdatedAtUtc = DateTime.UtcNow
        };
        db.TenantUsages.Add(usage);
        await db.SaveChangesAsync(ct);
        return usage;
    }

    private static void SetUsageValue(Textzy.Api.Models.TenantUsage usage, string key, int value)
    {
        switch (key)
        {
            case "whatsappMessages": usage.WhatsappMessagesUsed = value; break;
            case "smsCredits": usage.SmsCreditsUsed = value; break;
            case "contacts": usage.ContactsUsed = value; break;
            case "teamMembers": usage.TeamMembersUsed = value; break;
            case "chatbots": usage.ChatbotsUsed = value; break;
            case "flows": usage.FlowsUsed = value; break;
            case "apiCalls": usage.ApiCallsUsed = value; break;
        }
    }
}
