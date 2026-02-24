using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Textzy.Api.Data;
using Textzy.Api.Models;
using Textzy.Api.Services;
using System.Security.Cryptography;
using System.Text;

namespace Textzy.Api.Controllers;

[ApiController]
[Route("api/waba/webhook")]
public class WabaWebhookController(
    WhatsAppCloudService whatsapp,
    WabaWebhookQueueService queue,
    ControlDbContext controlDb,
    SecretCryptoService crypto,
    IConfiguration config,
    ILogger<WabaWebhookController> logger) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Verify(
        [FromQuery(Name = "hub.mode")] string mode,
        [FromQuery(Name = "hub.verify_token")] string verifyToken,
        [FromQuery(Name = "hub.challenge")] string challenge,
        CancellationToken ct)
    {
        var expectedFromConfig = config.GetSection("WhatsApp").Get<WhatsAppOptions>()?.VerifyToken ?? string.Empty;
        var expectedFromPlatform = string.Empty;
        try
        {
            var row = await controlDb.PlatformSettings
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.Scope == "waba-master" && x.Key == "verifyToken", ct);
            if (row is not null && !string.IsNullOrWhiteSpace(row.ValueEncrypted))
                expectedFromPlatform = crypto.Decrypt(row.ValueEncrypted);
        }
        catch
        {
            // Keep webhook verification resilient even if settings read fails.
        }

        var verified = mode == "subscribe" &&
                       (!string.IsNullOrWhiteSpace(verifyToken)) &&
                       (
                           string.Equals(verifyToken, expectedFromPlatform, StringComparison.Ordinal) ||
                           string.Equals(verifyToken, expectedFromConfig, StringComparison.Ordinal)
                       );

        if (verified) return Content(challenge);
        return Forbid();
    }

    [HttpPost]
    public async Task<IActionResult> Receive(CancellationToken ct)
    {
        using var reader = new StreamReader(Request.Body);
        var rawBody = await reader.ReadToEndAsync(ct);

        var sig = Request.Headers["X-Hub-Signature-256"].ToString();
        if (!whatsapp.VerifyWebhookSignature(rawBody, sig))
        {
            logger.LogWarning("WABA webhook signature validation failed. signature={Signature} payload={Payload}", sig, rawBody);
            controlDb.AuditLogs.Add(new AuditLog
            {
                Id = Guid.NewGuid(),
                TenantId = null,
                ActorUserId = Guid.Empty,
                Action = "waba.webhook.rejected",
                Details = "reason=signature_invalid",
                CreatedAtUtc = DateTime.UtcNow
            });
            await controlDb.SaveChangesAsync(ct);
            // Always ACK to provider to avoid redelivery storms; event is rejected internally.
            return Ok(new { ok = true, queued = false, rejected = "invalid_signature" });
        }

        try
        {
            await queue.EnqueueAsync(new WabaWebhookQueueItem
            {
                Provider = "meta",
                EventKey = ComputeEventKey(rawBody),
                RawBody = rawBody,
                ReceivedAtUtc = DateTime.UtcNow
            }, ct);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "WABA webhook enqueue failure.");
            controlDb.AuditLogs.Add(new AuditLog
            {
                Id = Guid.NewGuid(),
                TenantId = null,
                ActorUserId = Guid.Empty,
                Action = "waba.webhook.enqueue_failed",
                Details = $"reason={ex.GetType().Name}",
                CreatedAtUtc = DateTime.UtcNow
            });
            await controlDb.SaveChangesAsync(ct);
            return Ok(new { ok = true, queued = false });
        }

        return Ok(new { ok = true, queued = true });
    }

    private static string ComputeEventKey(string rawBody)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(rawBody ?? string.Empty));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}
