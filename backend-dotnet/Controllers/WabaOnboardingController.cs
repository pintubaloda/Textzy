using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Textzy.Api.Data;
using Textzy.Api.DTOs;
using Textzy.Api.Services;
using static Textzy.Api.Services.PermissionCatalog;

namespace Textzy.Api.Controllers;

[ApiController]
[Route("api/waba")]
public class WabaOnboardingController(
    WhatsAppCloudService whatsapp,
    RbacService rbac,
    ControlDbContext db,
    SecretCryptoService crypto) : ControllerBase
{
    [HttpGet("embedded-config")]
    public async Task<IActionResult> EmbeddedConfig(CancellationToken ct)
    {
        if (!rbac.HasPermission(InboxRead)) return Forbid();

        var rows = await db.PlatformSettings
            .AsNoTracking()
            .Where(x => x.Scope == "waba-master")
            .ToListAsync(ct);

        var values = rows.ToDictionary(x => x.Key, x => crypto.Decrypt(x.ValueEncrypted), StringComparer.OrdinalIgnoreCase);
        var appId = values.TryGetValue("appId", out var aid) ? (aid ?? string.Empty).Trim() : string.Empty;
        var embeddedConfigId =
            values.TryGetValue("embeddedConfigId", out var ecid) ? (ecid ?? string.Empty).Trim()
            : values.TryGetValue("configId", out var cid) ? (cid ?? string.Empty).Trim()
            : string.Empty;

        return Ok(new
        {
            appId,
            embeddedConfigId,
            available = !string.IsNullOrWhiteSpace(appId) && !string.IsNullOrWhiteSpace(embeddedConfigId)
        });
    }

    [HttpPost("onboarding/start")]
    public async Task<IActionResult> Start(CancellationToken ct)
    {
        if (!rbac.HasPermission(InboxWrite)) return Forbid();
        var cfg = await whatsapp.StartOnboardingAsync(ct);
        return Ok(new { state = cfg.OnboardingState, startedAtUtc = cfg.OnboardingStartedAtUtc });
    }

    [HttpGet("onboarding/status")]
    public async Task<IActionResult> OnboardingStatus(CancellationToken ct)
    {
        if (!rbac.HasPermission(InboxRead)) return Forbid();
        return Ok(await whatsapp.GetOnboardingStatusAsync(ct));
    }

    [HttpGet("status")]
    public async Task<IActionResult> Status(CancellationToken ct)
    {
        if (!rbac.HasPermission(InboxRead)) return Forbid();
        var payload = await whatsapp.GetOnboardingStatusAsync(ct);

        return Ok(payload);
    }

    [HttpPost("embedded-signup/exchange")]
    public async Task<IActionResult> Exchange([FromBody] WabaExchangeCodeRequest request, CancellationToken ct)
    {
        if (!rbac.HasPermission(InboxWrite)) return Forbid();

        try
        {
            var cfg = await whatsapp.ExchangeEmbeddedCodeAsync(request.Code, ct);
            return Ok(new
            {
                cfg.WabaId,
                cfg.PhoneNumberId,
                cfg.BusinessAccountName,
                cfg.DisplayPhoneNumber,
                cfg.IsActive,
                cfg.ConnectedAtUtc
            });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    [HttpPost("onboarding/recheck")]
    public async Task<IActionResult> Recheck(CancellationToken ct)
    {
        if (!rbac.HasPermission(InboxWrite)) return Forbid();
        return Ok(await whatsapp.GetOnboardingStatusAsync(ct));
    }

    [HttpPost("onboarding/reuse-existing")]
    public async Task<IActionResult> ReuseExisting([FromBody] WabaReuseExistingRequest request, CancellationToken ct)
    {
        if (!rbac.HasPermission(InboxWrite)) return Forbid();
        try
        {
            var result = await whatsapp.ReuseExistingFromCodeAsync(request.Code, request.WabaId, request.PhoneNumberId, ct);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }
}
