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
    TenantDbContext tenantDb,
    TenancyContext tenancy,
    WhatsAppCloudService whatsapp,
    RbacService rbac) : ControllerBase
{
    [HttpGet("status")]
    public async Task<IActionResult> Status(CancellationToken ct)
    {
        if (!rbac.HasPermission(InboxRead)) return Forbid();
        var cfg = await tenantDb.Set<Textzy.Api.Models.TenantWabaConfig>()
            .FirstOrDefaultAsync(x => x.TenantId == tenancy.TenantId, ct);

        return Ok(new
        {
            isConnected = cfg is not null && cfg.IsActive,
            businessName = cfg?.BusinessAccountName,
            phone = cfg?.DisplayPhoneNumber,
            wabaId = cfg?.WabaId,
            connectedAtUtc = cfg?.ConnectedAtUtc
        });
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
}
