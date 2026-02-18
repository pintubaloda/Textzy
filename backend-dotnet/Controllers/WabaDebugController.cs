using Microsoft.AspNetCore.Mvc;
using Textzy.Api.Services;
using static Textzy.Api.Services.PermissionCatalog;

namespace Textzy.Api.Controllers;

[ApiController]
[Route("api/waba/debug")]
public class WabaDebugController(WhatsAppCloudService whatsapp, RbacService rbac) : ControllerBase
{
    [HttpPost("graph-probe")]
    public async Task<IActionResult> Probe([FromBody] Dictionary<string, string> request, CancellationToken ct)
    {
        if (!rbac.HasPermission(ApiRead)) return Forbid();
        var token = request.TryGetValue("accessToken", out var v) ? v : string.Empty;
        if (string.IsNullOrWhiteSpace(token)) return BadRequest("accessToken required");

        var result = await whatsapp.DebugProbeAsync(token, ct);
        return Ok(result);
    }

    [HttpGet("tenant-probe")]
    public async Task<IActionResult> TenantProbe(CancellationToken ct)
    {
        if (!rbac.HasPermission(ApiRead)) return Forbid();
        var result = await whatsapp.DebugTenantProbeAsync(ct);
        return Ok(result);
    }
}
