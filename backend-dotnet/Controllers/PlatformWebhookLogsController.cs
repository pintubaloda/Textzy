using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Textzy.Api.Data;
using Textzy.Api.Services;
using static Textzy.Api.Services.PermissionCatalog;

namespace Textzy.Api.Controllers;

[ApiController]
[Route("api/platform/webhook-logs")]
public class PlatformWebhookLogsController(ControlDbContext db, AuthContext auth, RbacService rbac) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string provider = "", [FromQuery] int limit = 100, CancellationToken ct = default)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        if (!rbac.HasPermission(PlatformSettingsRead)) return Forbid();
        limit = Math.Clamp(limit, 1, 500);

        var q = db.AuditLogs.Where(x => x.Action.Contains("webhook"));
        if (!string.IsNullOrWhiteSpace(provider))
            q = q.Where(x => x.Details.Contains($"provider={provider}"));

        var rows = await q.OrderByDescending(x => x.CreatedAtUtc).Take(limit).ToListAsync(ct);
        return Ok(rows.Select(x => new
        {
            x.Id,
            x.Action,
            x.Details,
            x.CreatedAtUtc
        }));
    }
}
