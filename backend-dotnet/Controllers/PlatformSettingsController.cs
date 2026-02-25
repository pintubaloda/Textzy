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
        try
        {
            scope = InputGuardService.RequireTrimmed(scope, "Scope", 80).ToLowerInvariant();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }

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
        try
        {
            scope = InputGuardService.RequireTrimmed(scope, "Scope", 80).ToLowerInvariant();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
        if (values.Count == 0) return BadRequest("At least one key is required.");
        if (values.Count > 200) return BadRequest("Too many settings in one request.");

        foreach (var kv in values)
        {
            string key;
            try
            {
                key = InputGuardService.RequireTrimmed(kv.Key, "Key", 120);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(ex.Message);
            }
            var value = kv.Value ?? string.Empty;
            if (value.Length > 12000) return BadRequest($"Value too long for key '{key}'.");

            var row = await db.PlatformSettings.FirstOrDefaultAsync(x => x.Scope == scope && x.Key == key, ct);
            if (row is null)
            {
                row = new PlatformSetting
                {
                    Id = Guid.NewGuid(),
                    Scope = scope,
                    Key = key
                };
                db.PlatformSettings.Add(row);
            }

            row.ValueEncrypted = crypto.Encrypt(value);
            row.UpdatedByUserId = auth.UserId;
            row.UpdatedAtUtc = DateTime.UtcNow;
        }

        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("platform.settings.updated", $"scope={scope}; keys={string.Join(",", values.Keys)}", ct);
        return Ok(new { scope, updated = values.Keys.Count });
    }
}
