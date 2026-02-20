using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Textzy.Api.Data;
using Textzy.Api.Models;
using Textzy.Api.Services;
using Textzy.Api.Providers;

namespace Textzy.Api.Controllers;

[ApiController]
[Route("api/waba/webhook")]
public class WabaWebhookController(
    WhatsAppCloudService whatsapp,
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
        var body = await reader.ReadToEndAsync(ct);

        var sig = Request.Headers["X-Hub-Signature-256"].ToString();
        if (!whatsapp.VerifyWebhookSignature(body, sig))
        {
            logger.LogWarning("WABA webhook signature validation failed. signature={Signature} payload={Payload}", sig, body);
            return Unauthorized("Invalid webhook signature.");
        }

        string phoneNumberId = string.Empty;
        var inboundMessages = new List<(string From, string Name, string Body)>();

        try
        {
            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.TryGetProperty("entry", out var entries))
            {
                foreach (var entry in entries.EnumerateArray())
                {
                    if (!entry.TryGetProperty("changes", out var changes)) continue;
                    foreach (var change in changes.EnumerateArray())
                    {
                        if (!change.TryGetProperty("value", out var value)) continue;

                        if (value.TryGetProperty("metadata", out var metadata) && metadata.TryGetProperty("phone_number_id", out var pni))
                            phoneNumberId = pni.GetString() ?? string.Empty;

                        if (!value.TryGetProperty("messages", out var messages)) continue;
                        foreach (var msg in messages.EnumerateArray())
                        {
                            if (!msg.TryGetProperty("from", out var fromProp)) continue;
                            var from = fromProp.GetString() ?? string.Empty;
                            if (string.IsNullOrWhiteSpace(from)) continue;
                            var body = msg.TryGetProperty("text", out var textNode) && textNode.TryGetProperty("body", out var bodyNode)
                                ? bodyNode.GetString() ?? string.Empty
                                : string.Empty;
                            var name = value.TryGetProperty("contacts", out var contactsNode)
                                && contactsNode.ValueKind == JsonValueKind.Array
                                && contactsNode.GetArrayLength() > 0
                                && contactsNode[0].TryGetProperty("profile", out var profileNode)
                                && profileNode.TryGetProperty("name", out var nameNode)
                                ? nameNode.GetString() ?? string.Empty
                                : string.Empty;
                            inboundMessages.Add((from, name, body));
                        }
                    }
                }
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "WABA webhook parse failure. payload={Payload}", body);
            return BadRequest("Invalid webhook payload.");
        }

        if (string.IsNullOrWhiteSpace(phoneNumberId) || inboundMessages.Count == 0) return Ok();

        var tenants = await controlDb.Tenants.ToListAsync(ct);
        foreach (var tenant in tenants)
        {
            using var tenantDb = SeedData.CreateTenantDbContext(tenant.DataConnectionString);
            var cfg = await tenantDb.Set<TenantWabaConfig>()
                .FirstOrDefaultAsync(x => x.TenantId == tenant.Id && x.IsActive && x.PhoneNumberId == phoneNumberId, ct);

            if (cfg is null) continue;
            cfg.WebhookVerifiedAtUtc = DateTime.UtcNow;
            if (cfg.WebhookSubscribedAtUtc.HasValue && cfg.PermissionAuditPassed) cfg.OnboardingState = "ready";

            foreach (var item in inboundMessages)
            {
                var from = item.From;
                var window = await tenantDb.Set<ConversationWindow>()
                    .FirstOrDefaultAsync(x => x.TenantId == tenant.Id && x.Recipient == from, ct);

                if (window is null)
                {
                    window = new ConversationWindow
                    {
                        Id = Guid.NewGuid(),
                        TenantId = tenant.Id,
                        Recipient = from,
                        LastInboundAtUtc = DateTime.UtcNow,
                        UpdatedAtUtc = DateTime.UtcNow
                    };
                    tenantDb.Set<ConversationWindow>().Add(window);
                }
                else
                {
                    window.LastInboundAtUtc = DateTime.UtcNow;
                    window.UpdatedAtUtc = DateTime.UtcNow;
                }

                var convo = await tenantDb.Set<Conversation>()
                    .FirstOrDefaultAsync(x => x.TenantId == tenant.Id && x.CustomerPhone == from, ct);
                if (convo is null)
                {
                    convo = new Conversation
                    {
                        Id = Guid.NewGuid(),
                        TenantId = tenant.Id,
                        CustomerPhone = from,
                        CustomerName = string.IsNullOrWhiteSpace(item.Name) ? from : item.Name,
                        Status = "Open",
                        LastMessageAtUtc = DateTime.UtcNow,
                        CreatedAtUtc = DateTime.UtcNow
                    };
                    tenantDb.Set<Conversation>().Add(convo);
                }
                else
                {
                    if (!string.IsNullOrWhiteSpace(item.Name)) convo.CustomerName = item.Name;
                    convo.Status = "Open";
                    convo.LastMessageAtUtc = DateTime.UtcNow;
                }

                var existingContact = await tenantDb.Set<Contact>()
                    .FirstOrDefaultAsync(x => x.TenantId == tenant.Id && x.Phone == from, ct);
                if (existingContact is null)
                {
                    tenantDb.Set<Contact>().Add(new Contact
                    {
                        Id = Guid.NewGuid(),
                        TenantId = tenant.Id,
                        Name = string.IsNullOrWhiteSpace(item.Name) ? from : item.Name,
                        Phone = from,
                        OptInStatus = "opted_in",
                        CreatedAtUtc = DateTime.UtcNow
                    });
                }

                tenantDb.Set<Message>().Add(new Message
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenant.Id,
                    Channel = ChannelType.WhatsApp,
                    Recipient = from,
                    Body = string.IsNullOrWhiteSpace(item.Body) ? "[Inbound message]" : item.Body,
                    MessageType = "session",
                    Status = "Received",
                    ProviderMessageId = $"wa_in_{Guid.NewGuid():N}",
                    CreatedAtUtc = DateTime.UtcNow
                });
            }

            await tenantDb.SaveChangesAsync(ct);
            break;
        }

        return Ok();
    }
}
