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
        var knownStates = new[] { "requested", "code_received", "assets_linked", "webhook_subscribed", "ready", "cancelled", "not_configured", "error" };
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

    [HttpPost("cancel-request")]
    public async Task<IActionResult> CancelRequest([FromBody] CancelRequestDto request, CancellationToken ct)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        if (!rbac.HasPermission(PlatformSettingsWrite)) return Forbid();
        if (request.TenantId == Guid.Empty) return BadRequest("tenantId is required.");

        var tenant = await controlDb.Tenants.FirstOrDefaultAsync(x => x.Id == request.TenantId, ct);
        if (tenant is null) return NotFound("Project not found.");

        using var tenantDb = SeedData.CreateTenantDbContext(tenant.DataConnectionString);
        var cfg = await tenantDb.TenantWabaConfigs
            .Where(x => x.TenantId == request.TenantId)
            .OrderByDescending(x => x.IsActive)
            .ThenByDescending(x => x.ConnectedAtUtc)
            .ThenByDescending(x => x.OnboardingStartedAtUtc)
            .FirstOrDefaultAsync(ct);

        if (cfg is null) return Ok(new { cancelled = false, reason = "not_configured" });

        cfg.IsActive = false;
        cfg.OnboardingState = "cancelled";
        cfg.LastError = string.IsNullOrWhiteSpace(request.Reason)
            ? "Onboarding request cancelled by platform owner."
            : $"Onboarding request cancelled: {request.Reason.Trim()}";
        cfg.LastGraphError = string.Empty;
        cfg.WebhookSubscribedAtUtc = null;
        cfg.WebhookVerifiedAtUtc = null;
        await tenantDb.SaveChangesAsync(ct);

        return Ok(new { cancelled = true, tenantId = request.TenantId });
    }

    private static string NormalizeState(string state, TenantWabaConfig cfg)
    {
        if (IsPlaceholderNotConfigured(cfg)) return "not_configured";

        var s = (state ?? string.Empty).Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(s)) s = "not_configured";
        if (cfg.IsActive && string.Equals(s, "webhook_subscribed", StringComparison.OrdinalIgnoreCase) && cfg.PermissionAuditPassed)
            return "ready";
        return s;
    }

    private static bool IsPlaceholderNotConfigured(TenantWabaConfig cfg)
    {
        return !cfg.IsActive
               && string.IsNullOrWhiteSpace(cfg.WabaId)
               && string.IsNullOrWhiteSpace(cfg.PhoneNumberId)
               && string.IsNullOrWhiteSpace(cfg.AccessToken)
               && string.IsNullOrWhiteSpace(cfg.BusinessManagerId)
               && string.IsNullOrWhiteSpace(cfg.SystemUserId)
               && !cfg.ExchangedAtUtc.HasValue
               && (string.IsNullOrWhiteSpace(cfg.OnboardingState)
                   || string.Equals(cfg.OnboardingState, "requested", StringComparison.OrdinalIgnoreCase)
                   || string.Equals(cfg.OnboardingState, "not_configured", StringComparison.OrdinalIgnoreCase));
    }

    public sealed class CancelRequestDto
    {
        public Guid TenantId { get; set; }
        public string Reason { get; set; } = string.Empty;
    }
}
