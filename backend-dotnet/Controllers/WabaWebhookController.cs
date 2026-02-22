using Microsoft.AspNetCore.Mvc;
using Textzy.Api.Data;
using Textzy.Api.Models;
using Textzy.Api.Services;

namespace Textzy.Api.Controllers;

[ApiController]
[Route("api/waba/webhook")]
public class WabaWebhookController(
    WhatsAppCloudService whatsapp,
    WabaWebhookQueueService queue,
    ControlDbContext controlDb,
    IConfiguration config,
    ILogger<WabaWebhookController> logger) : ControllerBase
{
    [HttpGet]
    public IActionResult Verify(
        [FromQuery(Name = "hub.mode")] string mode,
        [FromQuery(Name = "hub.verify_token")] string verifyToken,
        [FromQuery(Name = "hub.challenge")] string challenge)
    {
        var expected = config.GetSection("WhatsApp").Get<WhatsAppOptions>()?.VerifyToken ?? string.Empty;
        if (mode == "subscribe" && verifyToken == expected) return Content(challenge);
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
}
