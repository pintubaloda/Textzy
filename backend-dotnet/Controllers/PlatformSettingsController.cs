using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Textzy.Api.Data;
using Textzy.Api.Models;
using Textzy.Api.Services;
using static Textzy.Api.Services.PermissionCatalog;

namespace Textzy.Api.Controllers;

[ApiController]
[Route("api/platform/settings")]
public class PlatformSettingsController(
    ControlDbContext db,
    SecretCryptoService crypto,
    AuditLogService audit,
    AuthContext auth,
    RbacService rbac) : ControllerBase
{
    [HttpGet("{scope}")]
    public async Task<IActionResult> GetScope(string scope, CancellationToken ct)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        if (!rbac.HasPermission(PlatformSettingsRead)) return Forbid();

        var entries = await db.PlatformSettings
            .Where(x => x.Scope == scope)
            .ToListAsync(ct);

        var data = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var e in entries)
            data[e.Key] = crypto.Decrypt(e.ValueEncrypted);

        return Ok(new { scope, values = data });
    }

    [HttpPut("{scope}")]
    public async Task<IActionResult> UpsertScope(string scope, [FromBody] Dictionary<string, string> values, CancellationToken ct)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        if (!rbac.HasPermission(PlatformSettingsWrite)) return Forbid();
        if (values.Count == 0) return BadRequest("At least one key is required.");

        foreach (var kv in values)
        {
            var row = await db.PlatformSettings.FirstOrDefaultAsync(x => x.Scope == scope && x.Key == kv.Key, ct);
            if (row is null)
            {
                row = new PlatformSetting
                {
                    Id = Guid.NewGuid(),
                    Scope = scope,
                    Key = kv.Key
                };
                db.PlatformSettings.Add(row);
            }

            row.ValueEncrypted = crypto.Encrypt(kv.Value ?? string.Empty);
            row.UpdatedByUserId = auth.UserId;
            row.UpdatedAtUtc = DateTime.UtcNow;
        }

        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("platform.settings.updated", $"scope={scope}; keys={string.Join(",", values.Keys)}", ct);
        return Ok(new { scope, updated = values.Keys.Count });
    }
}
