using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Textzy.Api.Data;
using Textzy.Api.Models;
using Textzy.Api.Services;

namespace Textzy.Api.Controllers;

[ApiController]
[Route("api/sms/webhook")]
public class SmsWebhookController(
    ControlDbContext controlDb,
    SecretCryptoService crypto,
    TenantSchemaGuardService tenantSchemaGuard,
    SensitiveDataRedactor redactor,
    ILogger<SmsWebhookController> logger) : ControllerBase
{
    [HttpPost("tata")]
    [AllowAnonymous]
    public async Task<IActionResult> Tata([FromQuery] string tenantSlug = "", CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(tenantSlug))
            return BadRequest("tenantSlug is required.");

        var tenant = await controlDb.Tenants.AsNoTracking().FirstOrDefaultAsync(x => x.Slug == tenantSlug, ct);
        if (tenant is null) return NotFound("Tenant not found.");
        await tenantSchemaGuard.EnsureContactEncryptionColumnsAsync(tenant.Id, tenant.DataConnectionString, ct);

        using var tenantDb = SeedData.CreateTenantDbContext(tenant.DataConnectionString);

        var settings = await controlDb.PlatformSettings.AsNoTracking()
            .Where(x => x.Scope == "sms-gateway")
            .ToDictionaryAsync(x => x.Key, x => crypto.Decrypt(x.ValueEncrypted), StringComparer.OrdinalIgnoreCase, ct);
        var expectedSecret = settings.TryGetValue("webhookSecret", out var s) ? s?.Trim() : string.Empty;
        var receivedSecret = Request.Headers["X-SMS-Webhook-Secret"].FirstOrDefault()
                             ?? Request.Query["secret"].FirstOrDefault()
                             ?? string.Empty;
        if (!string.IsNullOrWhiteSpace(expectedSecret) && !string.Equals(expectedSecret, receivedSecret, StringComparison.Ordinal))
            return Unauthorized("Invalid webhook secret.");

        string rawBody;
        using (var reader = new StreamReader(Request.Body))
            rawBody = await reader.ReadToEndAsync(ct);

        var query = Request.Query.ToDictionary(x => x.Key, x => x.Value.ToString(), StringComparer.OrdinalIgnoreCase);
        var payload = ParsePayload(rawBody, query);
        var providerMessageId = (payload.TryGetValue("msgid", out var id1) ? id1 : payload.TryGetValue("messageid", out var id2) ? id2 : string.Empty)?.Trim();
        var statusRaw = (payload.TryGetValue("status", out var st1) ? st1 : payload.TryGetValue("dlrstatus", out var st2) ? st2 : string.Empty)?.Trim();
        var phone = (payload.TryGetValue("recipient", out var ph1) ? ph1 : payload.TryGetValue("mobile", out var ph2) ? ph2 : string.Empty)?.Trim();
        var reason = (payload.TryGetValue("reason", out var rs1) ? rs1 : payload.TryGetValue("error", out var rs2) ? rs2 : string.Empty)?.Trim();

        if (string.IsNullOrWhiteSpace(providerMessageId))
            return BadRequest("Missing provider message id.");

        var message = await tenantDb.Messages.FirstOrDefaultAsync(
            x => x.TenantId == tenant.Id && (x.ProviderMessageId == providerMessageId || x.ProviderMessageId.EndsWith("_" + providerMessageId)), ct);
        if (message is null)
        {
            logger.LogWarning("TATA DLR ignored: message not found tenant={TenantSlug} providerMessageId={ProviderMessageId}", tenantSlug, providerMessageId);
            return Ok(new { ok = true, ignored = "message_not_found" });
        }

        var normalized = NormalizeDeliveryState(statusRaw ?? string.Empty, reason ?? string.Empty);
        if (normalized == "delivered")
            message.Status = MessageStateMachine.Delivered;
        else if (normalized == "failed")
            message.Status = MessageStateMachine.Failed;

        if (!string.IsNullOrWhiteSpace(reason))
            message.LastError = redactor.RedactText(reason);

        tenantDb.MessageEvents.Add(new MessageEvent
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            MessageId = message.Id,
            ProviderMessageId = message.ProviderMessageId,
            Direction = "outbound",
            EventType = "sms.dlr",
            State = normalized,
            StatePriority = normalized == "delivered" ? 50 : normalized == "failed" ? 90 : 40,
            EventTimestampUtc = DateTime.UtcNow,
            RecipientId = phone ?? string.Empty,
            CustomerPhone = phone ?? string.Empty,
            MessageType = message.MessageType,
            RawPayloadJson = string.IsNullOrWhiteSpace(rawBody) ? JsonSerializer.Serialize(payload) : rawBody,
            CreatedAtUtc = DateTime.UtcNow
        });

        await tenantDb.SaveChangesAsync(ct);
        return Ok(new { ok = true, state = normalized, messageId = message.Id, providerMessageId });
    }

    private static Dictionary<string, string> ParsePayload(string rawBody, Dictionary<string, string> query)
    {
        var map = new Dictionary<string, string>(query, StringComparer.OrdinalIgnoreCase);

        if (!string.IsNullOrWhiteSpace(rawBody))
        {
            try
            {
                using var doc = JsonDocument.Parse(rawBody);
                if (doc.RootElement.ValueKind == JsonValueKind.Object)
                {
                    foreach (var p in doc.RootElement.EnumerateObject())
                        map[p.Name] = p.Value.ToString();
                    return map;
                }
            }
            catch
            {
                // ignore and try form urlencoded parsing
            }

            if (rawBody.Contains('='))
            {
                var pairs = rawBody.Split('&', StringSplitOptions.RemoveEmptyEntries);
                foreach (var pair in pairs)
                {
                    var kv = pair.Split('=', 2);
                    var k = Uri.UnescapeDataString(kv[0] ?? string.Empty);
                    var v = kv.Length > 1 ? Uri.UnescapeDataString(kv[1]) : string.Empty;
                    if (!string.IsNullOrWhiteSpace(k))
                        map[k] = v;
                }
            }
        }

        return map;
    }

    private static string NormalizeDeliveryState(string status, string reason)
    {
        var s = (status ?? string.Empty).Trim().ToLowerInvariant();
        var r = (reason ?? string.Empty).Trim().ToLowerInvariant();
        var full = $"{s} {r}";
        if (full.Contains("deliver")) return "delivered";
        if (full.Contains("failed") || full.Contains("reject") || full.Contains("undeliver") || full.Contains("invalid") || full.Contains("dlt"))
            return "failed";
        if (full.Contains("submit") || full.Contains("accept") || full.Contains("sent"))
            return "submitted";
        return "unknown";
    }
}
