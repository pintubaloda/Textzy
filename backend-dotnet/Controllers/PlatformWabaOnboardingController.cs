using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Net.Http.Headers;
using System.Text.Json;
using Textzy.Api.Data;
using Textzy.Api.Models;
using Textzy.Api.Services;
using static Textzy.Api.Services.PermissionCatalog;

namespace Textzy.Api.Controllers;

[ApiController]
[Route("api/platform/waba")]
public class PlatformWabaOnboardingController(
    ControlDbContext controlDb,
    SecretCryptoService crypto,
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    AuthContext auth,
    RbacService rbac) : ControllerBase
{
    private readonly WhatsAppOptions _waOptions = configuration.GetSection("WhatsApp").Get<WhatsAppOptions>() ?? new WhatsAppOptions();

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

    [HttpGet("lookup/by-phone")]
    public async Task<IActionResult> LookupByPhone([FromQuery] Guid tenantId, [FromQuery] string phoneNumberId, CancellationToken ct)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        if (!rbac.HasPermission(PlatformSettingsRead)) return Forbid();
        if (tenantId == Guid.Empty) return BadRequest("tenantId is required.");
        if (string.IsNullOrWhiteSpace(phoneNumberId)) return BadRequest("phoneNumberId is required.");

        var ctx = await ResolveTenantTokenAsync(tenantId, ct);
        if (ctx is null) return NotFound("Tenant or active WABA config not found.");

        var url = $"{_waOptions.GraphApiBase}/{_waOptions.ApiVersion}/{phoneNumberId.Trim()}?fields=id,display_phone_number,verified_name,quality_rating,name_status,whatsapp_business_account{{id,name}}";
        var (ok, status, body) = await GraphGetRawAsync(url, ctx.Value.accessToken, ct);
        if (!ok) return StatusCode(status, new { error = "graph_lookup_failed", status, detail = body });

        string wabaId = string.Empty;
        string wabaName = string.Empty;
        string display = string.Empty;
        string verifiedName = string.Empty;
        string quality = string.Empty;
        string nameStatus = string.Empty;

        using (var doc = JsonDocument.Parse(body))
        {
            var root = doc.RootElement;
            display = TryGetString(root, "display_phone_number");
            verifiedName = TryGetString(root, "verified_name");
            quality = TryGetString(root, "quality_rating");
            nameStatus = TryGetString(root, "name_status");
            if (root.TryGetProperty("whatsapp_business_account", out var wabaNode))
            {
                wabaId = TryGetString(wabaNode, "id");
                wabaName = TryGetString(wabaNode, "name");
            }
        }

        return Ok(new
        {
            tenantId = ctx.Value.tenantId,
            tenantName = ctx.Value.tenantName,
            tenantSlug = ctx.Value.tenantSlug,
            phoneNumberId = phoneNumberId.Trim(),
            displayPhoneNumber = display,
            verifiedName,
            qualityRating = quality,
            nameStatus,
            wabaId,
            wabaName,
            raw = body
        });
    }

    [HttpGet("lookup/by-waba")]
    public async Task<IActionResult> LookupByWaba([FromQuery] Guid tenantId, [FromQuery] string wabaId, CancellationToken ct)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        if (!rbac.HasPermission(PlatformSettingsRead)) return Forbid();
        if (tenantId == Guid.Empty) return BadRequest("tenantId is required.");
        if (string.IsNullOrWhiteSpace(wabaId)) return BadRequest("wabaId is required.");

        var ctx = await ResolveTenantTokenAsync(tenantId, ct);
        if (ctx is null) return NotFound("Tenant or active WABA config not found.");

        var wabaUrl = $"{_waOptions.GraphApiBase}/{_waOptions.ApiVersion}/{wabaId.Trim()}?fields=id,name,business_verification_status,account_review_status";
        var phonesUrl = $"{_waOptions.GraphApiBase}/{_waOptions.ApiVersion}/{wabaId.Trim()}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,name_status,status";

        var (okWaba, statusWaba, bodyWaba) = await GraphGetRawAsync(wabaUrl, ctx.Value.accessToken, ct);
        if (!okWaba) return StatusCode(statusWaba, new { error = "graph_lookup_failed", status = statusWaba, detail = bodyWaba });

        var (okPhones, statusPhones, bodyPhones) = await GraphGetRawAsync(phonesUrl, ctx.Value.accessToken, ct);
        if (!okPhones) return StatusCode(statusPhones, new { error = "graph_lookup_failed", status = statusPhones, detail = bodyPhones });

        string wabaName = string.Empty;
        string verification = string.Empty;
        string reviewStatus = string.Empty;
        var phoneRows = new List<object>();

        using (var doc = JsonDocument.Parse(bodyWaba))
        {
            var root = doc.RootElement;
            wabaName = TryGetString(root, "name");
            verification = TryGetString(root, "business_verification_status");
            reviewStatus = TryGetString(root, "account_review_status");
        }

        using (var doc = JsonDocument.Parse(bodyPhones))
        {
            if (doc.RootElement.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Array)
            {
                foreach (var x in data.EnumerateArray())
                {
                    phoneRows.Add(new
                    {
                        id = TryGetString(x, "id"),
                        displayPhoneNumber = TryGetString(x, "display_phone_number"),
                        verifiedName = TryGetString(x, "verified_name"),
                        qualityRating = TryGetString(x, "quality_rating"),
                        nameStatus = TryGetString(x, "name_status"),
                        status = TryGetString(x, "status")
                    });
                }
            }
        }

        return Ok(new
        {
            tenantId = ctx.Value.tenantId,
            tenantName = ctx.Value.tenantName,
            tenantSlug = ctx.Value.tenantSlug,
            wabaId = wabaId.Trim(),
            wabaName,
            businessVerificationStatus = verification,
            accountReviewStatus = reviewStatus,
            phones = phoneRows,
            rawWaba = bodyWaba,
            rawPhones = bodyPhones
        });
    }

    private async Task<(Guid tenantId, string tenantName, string tenantSlug, string accessToken)?> ResolveTenantTokenAsync(Guid tenantId, CancellationToken ct)
    {
        var tenant = await controlDb.Tenants
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == tenantId, ct);
        if (tenant is null) return null;

        using var tenantDb = SeedData.CreateTenantDbContext(tenant.DataConnectionString);
        var cfg = await tenantDb.TenantWabaConfigs
            .AsNoTracking()
            .Where(x => x.TenantId == tenantId && !string.IsNullOrWhiteSpace(x.AccessToken))
            .OrderByDescending(x => x.IsActive)
            .ThenByDescending(x => x.ConnectedAtUtc)
            .ThenByDescending(x => x.ExchangedAtUtc)
            .ThenByDescending(x => x.CodeReceivedAtUtc)
            .FirstOrDefaultAsync(ct);
        if (cfg is null || string.IsNullOrWhiteSpace(cfg.AccessToken)) return null;

        var accessToken = crypto.Decrypt(cfg.AccessToken);
        if (string.IsNullOrWhiteSpace(accessToken)) return null;
        return (tenant.Id, tenant.Name, tenant.Slug, accessToken);
    }

    private async Task<(bool ok, int status, string body)> GraphGetRawAsync(string url, string accessToken, CancellationToken ct)
    {
        var client = httpClientFactory.CreateClient("whatsapp-cloud");
        using var req = new HttpRequestMessage(HttpMethod.Get, url);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        using var resp = await client.SendAsync(req, ct);
        var body = await resp.Content.ReadAsStringAsync(ct);
        return (resp.IsSuccessStatusCode, (int)resp.StatusCode, body);
    }

    private static string TryGetString(JsonElement root, string property)
    {
        if (!root.TryGetProperty(property, out var p)) return string.Empty;
        return p.ValueKind switch
        {
            JsonValueKind.String => p.GetString() ?? string.Empty,
            JsonValueKind.Number => p.GetRawText(),
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            _ => string.Empty
        };
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
