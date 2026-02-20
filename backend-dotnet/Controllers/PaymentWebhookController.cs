using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Textzy.Api.Data;
using Textzy.Api.Models;
using Textzy.Api.Services;

namespace Textzy.Api.Controllers;

[ApiController]
[Route("api/payments/webhook")]
public class PaymentWebhookController(
    ControlDbContext db,
    SecretCryptoService crypto,
    ILogger<PaymentWebhookController> logger) : ControllerBase
{
    [HttpPost("{provider}")]
    public async Task<IActionResult> Receive(string provider, CancellationToken ct)
    {
        using var reader = new StreamReader(Request.Body);
        var raw = await reader.ReadToEndAsync(ct);
        var scopeRows = await db.PlatformSettings.Where(x => x.Scope == "payment-gateway").ToListAsync(ct);
        var settings = scopeRows.ToDictionary(x => x.Key, x => crypto.Decrypt(x.ValueEncrypted), StringComparer.OrdinalIgnoreCase);

        var secret = settings.TryGetValue("webhookSecret", out var s) ? s : string.Empty;
        var valid = Verify(provider, raw, secret, Request.Headers);
        if (!valid)
        {
            db.AuditLogs.Add(new AuditLog
            {
                Id = Guid.NewGuid(),
                TenantId = null,
                ActorUserId = Guid.Empty,
                Action = "payment.webhook.rejected",
                Details = $"provider={provider}; reason=signature_invalid",
                CreatedAtUtc = DateTime.UtcNow
            });
            await db.SaveChangesAsync(ct);
            return Unauthorized("Invalid webhook signature.");
        }

        var eventName = "";
        try
        {
            using var doc = JsonDocument.Parse(raw);
            if (doc.RootElement.TryGetProperty("event", out var e)) eventName = e.GetString() ?? "";
            if (string.IsNullOrWhiteSpace(eventName) && doc.RootElement.TryGetProperty("type", out var t)) eventName = t.GetString() ?? "";
        }
        catch { }

        db.AuditLogs.Add(new AuditLog
        {
            Id = Guid.NewGuid(),
            TenantId = null,
            ActorUserId = Guid.Empty,
            Action = "payment.webhook.received",
            Details = $"provider={provider}; event={eventName}",
            CreatedAtUtc = DateTime.UtcNow
        });
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Payment webhook received provider={Provider} event={Event}", provider, eventName);
        return Ok(new { ok = true });
    }

    private static bool Verify(string provider, string body, string secret, IHeaderDictionary headers)
    {
        if (string.IsNullOrWhiteSpace(secret)) return true;
        provider = provider.Trim().ToLowerInvariant();

        if (provider == "razorpay")
        {
            var sig = headers["X-Razorpay-Signature"].ToString();
            if (string.IsNullOrWhiteSpace(sig)) return false;
            using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
            var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(body));
            var hex = Convert.ToHexString(hash).ToLowerInvariant();
            return string.Equals(hex, sig.Trim().ToLowerInvariant(), StringComparison.Ordinal);
        }

        var generic = headers["X-Webhook-Secret"].ToString();
        if (string.IsNullOrWhiteSpace(generic)) generic = headers["X-Signature"].ToString();
        if (string.IsNullOrWhiteSpace(generic)) return false;
        return string.Equals(generic.Trim(), secret.Trim(), StringComparison.Ordinal);
    }
}
