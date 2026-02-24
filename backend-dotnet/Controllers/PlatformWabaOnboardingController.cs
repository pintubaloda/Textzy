using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Textzy.Api.Data;
using Textzy.Api.Models;
using Textzy.Api.Services;
using static Textzy.Api.Services.PermissionCatalog;

namespace Textzy.Api.Controllers;

[ApiController]
[Route("api/platform/waba")]
public class PlatformWabaOnboardingController(
    ControlDbContext controlDb,
    AuthContext auth,
    RbacService rbac) : ControllerBase
{
    [HttpGet("onboarding-summary")]
    public async Task<IActionResult> GetOnboardingSummary(CancellationToken ct)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        if (!rbac.HasPermission(PlatformSettingsRead)) return Forbid();

        var tenants = await controlDb.Tenants
            .AsNoTracking()
            .OrderBy(x => x.Name)
            .ToListAsync(ct);

        var rows = new List<object>(tenants.Count);
        var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var knownStates = new[] { "requested", "code_received", "assets_linked", "webhook_subscribed", "ready", "not_configured", "error" };
        foreach (var s in knownStates) counts[s] = 0;

        foreach (var tenant in tenants)
        {
            try
            {
                using var tenantDb = SeedData.CreateTenantDbContext(tenant.DataConnectionString);
                var cfg = await tenantDb.TenantWabaConfigs
                    .AsNoTracking()
                    .Where(x => x.TenantId == tenant.Id)
                    .OrderByDescending(x => x.IsActive)
                    .ThenByDescending(x => x.ConnectedAtUtc)
                    .ThenByDescending(x => x.OnboardingStartedAtUtc)
                    .FirstOrDefaultAsync(ct);

                if (cfg is null)
                {
                    counts["not_configured"] += 1;
                    rows.Add(new
                    {
                        tenantId = tenant.Id,
                        tenantName = tenant.Name,
                        tenantSlug = tenant.Slug,
                        state = "not_configured",
                        isActive = false,
                        wabaId = "",
                        phoneNumberId = "",
                        displayPhoneNumber = "",
                        businessAccountName = "",
                        startedAtUtc = (DateTime?)null,
                        connectedAtUtc = (DateTime?)null,
                        lastError = ""
                    });
                    continue;
                }

                var state = NormalizeState(cfg.OnboardingState, cfg);
                if (!counts.ContainsKey(state)) counts[state] = 0;
                counts[state] += 1;

                rows.Add(new
                {
                    tenantId = tenant.Id,
                    tenantName = tenant.Name,
                    tenantSlug = tenant.Slug,
                    state,
                    isActive = cfg.IsActive,
                    wabaId = cfg.WabaId,
                    phoneNumberId = cfg.PhoneNumberId,
                    displayPhoneNumber = cfg.DisplayPhoneNumber,
                    businessAccountName = cfg.BusinessAccountName,
                    startedAtUtc = cfg.OnboardingStartedAtUtc,
                    connectedAtUtc = cfg.ConnectedAtUtc,
                    lastError = cfg.LastError
                });
            }
            catch (Exception ex)
            {
                counts["error"] += 1;
                rows.Add(new
                {
                    tenantId = tenant.Id,
                    tenantName = tenant.Name,
                    tenantSlug = tenant.Slug,
                    state = "error",
                    isActive = false,
                    wabaId = "",
                    phoneNumberId = "",
                    displayPhoneNumber = "",
                    businessAccountName = "",
                    startedAtUtc = (DateTime?)null,
                    connectedAtUtc = (DateTime?)null,
                    lastError = $"Tenant DB read failed: {ex.GetType().Name}"
                });
            }
        }

        return Ok(new
        {
            totalProjects = tenants.Count,
            counts,
            projects = rows
        });
    }

    private static string NormalizeState(string state, TenantWabaConfig cfg)
    {
        var s = (state ?? string.Empty).Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(s)) s = "requested";
        if (cfg.IsActive && string.Equals(s, "webhook_subscribed", StringComparison.OrdinalIgnoreCase) && cfg.PermissionAuditPassed)
            return "ready";
        return s;
    }
}

