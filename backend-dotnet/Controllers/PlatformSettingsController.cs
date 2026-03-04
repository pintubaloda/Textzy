using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Net;
using System.Net.Mail;
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
    RbacService rbac,
    IConfiguration config) : ControllerBase
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

    [HttpPost("smtp/test")]
    public async Task<IActionResult> TestSmtp([FromBody] SmtpTestRequest request, CancellationToken ct)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        if (!rbac.HasPermission(PlatformSettingsWrite)) return Forbid();

        var values = await db.PlatformSettings
            .Where(x => x.Scope == "smtp")
            .ToDictionaryAsync(x => x.Key, x => crypto.Decrypt(x.ValueEncrypted), StringComparer.OrdinalIgnoreCase, ct);

        var host = Pick(values, "host", config["Smtp:Host"], config["SMTP_HOST"]);
        var portRaw = Pick(values, "port", config["Smtp:Port"], config["SMTP_PORT"], "587");
        var timeoutRaw = Pick(values, "timeoutMs", config["Smtp:TimeoutMs"], config["SMTP_TIMEOUT_MS"], "15000");
        var username = Pick(values, "username", config["Smtp:Username"], config["SMTP_USERNAME"]);
        var password = Pick(values, "password", config["Smtp:Password"], config["SMTP_PASSWORD"]);
        var fromEmail = Pick(values, "fromEmail", config["Smtp:FromEmail"], config["SMTP_FROM_EMAIL"]);
        var fromName = Pick(values, "fromName", config["Smtp:FromName"], config["SMTP_FROM_NAME"], "Textzy");
        var enableSslRaw = Pick(values, "enableSsl", config["Smtp:EnableSsl"], config["SMTP_ENABLE_SSL"], "true");

        if (string.IsNullOrWhiteSpace(host) || string.IsNullOrWhiteSpace(fromEmail))
            return BadRequest("SMTP host/fromEmail not configured.");

        var toEmail = (request.Email ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(toEmail))
            return BadRequest("Test recipient email is required.");
        try
        {
            toEmail = InputGuardService.RequireTrimmed(toEmail, "Email", 320);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }

        var msg = new MailMessage
        {
            From = new MailAddress(fromEmail, fromName),
            Subject = "Textzy SMTP Test",
            Body = $"""
                This is a test email from Textzy platform settings.

                Sent at: {DateTime.UtcNow:O} UTC
                Host: {host}
                """,
            IsBodyHtml = false
        };
        msg.To.Add(new MailAddress(toEmail));

        using var client = new SmtpClient(host, int.TryParse(portRaw, out var p) ? p : 587)
        {
            EnableSsl = bool.TryParse(enableSslRaw, out var ssl) ? ssl : true,
            DeliveryMethod = SmtpDeliveryMethod.Network
        };
        var timeoutMs = ParseTimeout(timeoutRaw);
        client.Timeout = timeoutMs;
        if (!string.IsNullOrWhiteSpace(username))
            client.Credentials = new NetworkCredential(username, password ?? string.Empty);

        try
        {
            using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeoutCts.CancelAfter(timeoutMs);
            using var reg = timeoutCts.Token.Register(() => client.SendAsyncCancel());
            var sendTask = client.SendMailAsync(msg);
            var completed = await Task.WhenAny(sendTask, Task.Delay(timeoutMs, ct));
            if (completed != sendTask)
                throw new TimeoutException($"SMTP test timed out after {timeoutMs}ms.");
            await sendTask;
            await audit.WriteAsync("platform.smtp.test.success", $"to={toEmail}", ct);
            return Ok(new { ok = true, message = "SMTP test email sent." });
        }
        catch (Exception ex)
        {
            await audit.WriteAsync("platform.smtp.test.failed", $"to={toEmail}; err={ex.Message}", ct);
            return StatusCode(StatusCodes.Status502BadGateway, ex.Message);
        }
    }

    private static string Pick(Dictionary<string, string> values, string key, params string?[] fallbacks)
    {
        if (values.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value))
            return value.Trim();
        foreach (var f in fallbacks)
        {
            if (!string.IsNullOrWhiteSpace(f)) return f.Trim();
        }
        return string.Empty;
    }

    private static int ParseTimeout(string raw)
    {
        if (!int.TryParse(raw, out var ms)) ms = 15000;
        if (ms < 3000) ms = 3000;
        if (ms > 60000) ms = 60000;
        return ms;
    }

    public sealed class SmtpTestRequest
    {
        public string Email { get; set; } = string.Empty;
    }
}
