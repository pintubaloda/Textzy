using Microsoft.AspNetCore.Mvc;
using Textzy.Api.DTOs;
using Textzy.Api.Services;
using static Textzy.Api.Services.PermissionCatalog;

namespace Textzy.Api.Controllers;

[ApiController]
[Route("api/waba")]
public class WabaOnboardingController(
    WhatsAppCloudService whatsapp,
    RbacService rbac) : ControllerBase
{
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
}
