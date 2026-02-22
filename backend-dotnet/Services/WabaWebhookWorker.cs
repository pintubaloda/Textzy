using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Textzy.Api.Data;
using Textzy.Api.Models;

namespace Textzy.Api.Services;

public class WabaWebhookWorker(
    WabaWebhookQueueService queue,
    IServiceScopeFactory scopeFactory,
    IHubContext<InboxHub> hub,
    ILogger<WabaWebhookWorker> logger) : BackgroundService
{
    private sealed class InboundItem
    {
        public string MessageId { get; init; } = string.Empty;
        public string From { get; init; } = string.Empty;
        public string Name { get; init; } = string.Empty;
        public string Body { get; init; } = string.Empty;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var item in queue.ReadAllAsync(stoppingToken))
        {
            using var scope = scopeFactory.CreateScope();
            var controlDb = scope.ServiceProvider.GetRequiredService<ControlDbContext>();
            var tenantResolver = scope.ServiceProvider.GetRequiredService<WabaTenantResolver>();

            try
            {
                var parse = ParsePayload(item.RawBody);
                if (!parse.Ok)
                {
                    controlDb.AuditLogs.Add(new AuditLog
                    {
                        Id = Guid.NewGuid(),
                        TenantId = null,
                        ActorUserId = Guid.Empty,
                        Action = "waba.webhook.dead_letter",
                        Details = $"queueId={item.Id}; attempt={item.Attempt}; reason=parse_failed:{parse.Error}",
                        CreatedAtUtc = DateTime.UtcNow
                    });
                    await controlDb.SaveChangesAsync(stoppingToken);
                    continue;
                }

                if (string.IsNullOrWhiteSpace(parse.PhoneNumberId) || (parse.Inbound.Count == 0 && parse.Statuses.Count == 0))
                {
                    controlDb.AuditLogs.Add(new AuditLog
                    {
                        Id = Guid.NewGuid(),
                        TenantId = null,
                        ActorUserId = Guid.Empty,
                        Action = "waba.webhook.ignored",
                        Details = $"queueId={item.Id}; attempt={item.Attempt}; reason=missing_phone_or_events",
                        CreatedAtUtc = DateTime.UtcNow
                    });
                    await controlDb.SaveChangesAsync(stoppingToken);
                    continue;
                }

                var resolved = await tenantResolver.ResolveByPhoneNumberIdAsync(parse.PhoneNumberId, stoppingToken);
                if (resolved is null)
                {
                    controlDb.AuditLogs.Add(new AuditLog
                    {
                        Id = Guid.NewGuid(),
                        TenantId = null,
                        ActorUserId = Guid.Empty,
                        Action = "waba.webhook.unmapped",
                        Details = $"provider=meta; queueId={item.Id}; attempt={item.Attempt}; phoneNumberId={parse.PhoneNumberId}",
                        CreatedAtUtc = DateTime.UtcNow
                    });                    
                    await controlDb.SaveChangesAsync(stoppingToken);
                    continue;
                }

                using var tenantDb = SeedData.CreateTenantDbContext(resolved.DataConnectionString);
                var cfg = await tenantDb.Set<TenantWabaConfig>()
                    .FirstOrDefaultAsync(x => x.TenantId == resolved.TenantId && x.IsActive && x.PhoneNumberId == parse.PhoneNumberId, stoppingToken);
                if (cfg is null)
                {
                    await tenantResolver.InvalidateAsync(parse.PhoneNumberId, stoppingToken);
                    throw new InvalidOperationException("cached_mapping_stale");
                }

                cfg.WebhookVerifiedAtUtc = DateTime.UtcNow;
                if (cfg.WebhookSubscribedAtUtc.HasValue && cfg.PermissionAuditPassed)
                    cfg.OnboardingState = "ready";

                foreach (var status in parse.Statuses)
                {
                    var msg = await tenantDb.Set<Message>()
                        .FirstOrDefaultAsync(x => x.TenantId == resolved.TenantId && x.ProviderMessageId == status.MessageId, stoppingToken);
                    if (msg is null) continue;
                    var normalized = status.Status.Trim().ToLowerInvariant();
                    msg.Status = normalized switch
                    {
                        "sent" => "Sent",
                        "delivered" => "Delivered",
                        "read" => "Read",
                        "failed" => "Failed",
                        _ => msg.Status
                    };
                    if (normalized == "delivered" && status.AtUtc.HasValue) msg.DeliveredAtUtc = status.AtUtc.Value;
                    if (normalized == "read" && status.AtUtc.HasValue) msg.ReadAtUtc = status.AtUtc.Value;
                }

                foreach (var inbound in parse.Inbound)
                {
                    var window = await tenantDb.Set<ConversationWindow>()
                        .FirstOrDefaultAsync(x => x.TenantId == resolved.TenantId && x.Recipient == inbound.From, stoppingToken);
                    if (window is null)
                    {
                        window = new ConversationWindow
                        {
                            Id = Guid.NewGuid(),
                            TenantId = resolved.TenantId,
                            Recipient = inbound.From,
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
                        .FirstOrDefaultAsync(x => x.TenantId == resolved.TenantId && x.CustomerPhone == inbound.From, stoppingToken);
                    if (convo is null)
                    {
                        convo = new Conversation
                        {
                            Id = Guid.NewGuid(),
                            TenantId = resolved.TenantId,
                            CustomerPhone = inbound.From,
                            CustomerName = string.IsNullOrWhiteSpace(inbound.Name) ? inbound.From : inbound.Name,
                            Status = "Open",
                            LastMessageAtUtc = DateTime.UtcNow,
                            CreatedAtUtc = DateTime.UtcNow
                        };
                        tenantDb.Set<Conversation>().Add(convo);
                    }
                    else
                    {
                        if (!string.IsNullOrWhiteSpace(inbound.Name)) convo.CustomerName = inbound.Name;
                        convo.Status = "Open";
                        convo.LastMessageAtUtc = DateTime.UtcNow;
                    }

                    var existingContact = await tenantDb.Set<Contact>()
                        .FirstOrDefaultAsync(x => x.TenantId == resolved.TenantId && x.Phone == inbound.From, stoppingToken);
                    if (existingContact is null)
                    {
                        var defaultSegment = await tenantDb.Set<ContactSegment>()
                            .FirstOrDefaultAsync(x => x.TenantId == resolved.TenantId && x.Name.ToLower() == "new", stoppingToken);
                        if (defaultSegment is null)
                        {
                            defaultSegment = new ContactSegment
                            {
                                Id = Guid.NewGuid(),
                                TenantId = resolved.TenantId,
                                Name = "New",
                                RuleJson = "{}",
                                CreatedAtUtc = DateTime.UtcNow
                            };
                            tenantDb.Set<ContactSegment>().Add(defaultSegment);
                        }

                        tenantDb.Set<Contact>().Add(new Contact
                        {
                            Id = Guid.NewGuid(),
                            TenantId = resolved.TenantId,
                            Name = string.IsNullOrWhiteSpace(inbound.Name) ? inbound.From : inbound.Name,
                            Phone = inbound.From,
                            SegmentId = defaultSegment.Id,
                            TagsCsv = "New",
                            OptInStatus = "opted_in",
                            CreatedAtUtc = DateTime.UtcNow
                        });
                    }
                    else if (!string.IsNullOrWhiteSpace(inbound.Name))
                    {
                        existingContact.Name = inbound.Name;
                    }

                    var inboundProviderId = string.IsNullOrWhiteSpace(inbound.MessageId) ? $"wa_in_{Guid.NewGuid():N}" : inbound.MessageId;
                    var existingInbound = await tenantDb.Set<Message>()
                        .FirstOrDefaultAsync(x => x.TenantId == resolved.TenantId && x.ProviderMessageId == inboundProviderId, stoppingToken);
                    if (existingInbound is null)
                    {
                        tenantDb.Set<Message>().Add(new Message
                        {
                            Id = Guid.NewGuid(),
                            TenantId = resolved.TenantId,
                            Channel = ChannelType.WhatsApp,
                            Recipient = inbound.From,
                            Body = string.IsNullOrWhiteSpace(inbound.Body) ? "[Inbound message]" : inbound.Body,
                            MessageType = "session",
                            Status = "Received",
                            ProviderMessageId = inboundProviderId,
                            CreatedAtUtc = DateTime.UtcNow
                        });
                    }
                }

                await tenantDb.SaveChangesAsync(stoppingToken);
                controlDb.AuditLogs.Add(new AuditLog
                {
                    Id = Guid.NewGuid(),
                    TenantId = resolved.TenantId,
                    ActorUserId = Guid.Empty,
                    Action = "waba.webhook.processed",
                    Details = $"provider=meta; queueId={item.Id}; attempt={item.Attempt}; inboundCount={parse.Inbound.Count}; statusCount={parse.Statuses.Count}",
                    CreatedAtUtc = DateTime.UtcNow
                });
                await controlDb.SaveChangesAsync(stoppingToken);

                await hub.Clients.Group($"tenant:{resolved.TenantSlug}")
                    .SendAsync("webhook.inbound", new { phoneNumberId = parse.PhoneNumberId, inboundCount = parse.Inbound.Count, statusCount = parse.Statuses.Count }, stoppingToken);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "WABA webhook worker failed for queue item {QueueId} attempt={Attempt}", item.Id, item.Attempt);
                if (item.Attempt < item.MaxAttempts)
                {
                    controlDb.AuditLogs.Add(new AuditLog
                    {
                        Id = Guid.NewGuid(),
                        TenantId = null,
                        ActorUserId = Guid.Empty,
                        Action = "waba.webhook.retry",
                        Details = $"queueId={item.Id}; attempt={item.Attempt}; nextAttempt={item.Attempt + 1}; error={ex.GetType().Name}",
                        CreatedAtUtc = DateTime.UtcNow
                    });
                    await controlDb.SaveChangesAsync(stoppingToken);
                    await queue.EnqueueAsync(new WabaWebhookQueueItem
                    {
                        Id = item.Id,
                        RawBody = item.RawBody,
                        ReceivedAtUtc = item.ReceivedAtUtc,
                        Attempt = item.Attempt + 1,
                        MaxAttempts = item.MaxAttempts
                    }, stoppingToken);
                }
                else
                {
                    controlDb.AuditLogs.Add(new AuditLog
                    {
                        Id = Guid.NewGuid(),
                        TenantId = null,
                        ActorUserId = Guid.Empty,
                        Action = "waba.webhook.dead_letter",
                        Details = $"queueId={item.Id}; attempts={item.Attempt}; error={ex.GetType().Name}; message={ex.Message}",
                        CreatedAtUtc = DateTime.UtcNow
                    });
                    await controlDb.SaveChangesAsync(stoppingToken);
                }
            }
        }
    }

    private static (bool Ok, string Error, string PhoneNumberId, List<InboundItem> Inbound, List<(string MessageId, string Status, DateTime? AtUtc)> Statuses) ParsePayload(string rawBody)
    {
        var phoneNumberId = string.Empty;
        var inbound = new List<InboundItem>();
        var statuses = new List<(string MessageId, string Status, DateTime? AtUtc)>();
        try
        {
            using var doc = JsonDocument.Parse(rawBody);
            if (!doc.RootElement.TryGetProperty("entry", out var entries))
                return (false, "entry_missing", string.Empty, inbound, statuses);

            foreach (var entry in entries.EnumerateArray())
            {
                if (!entry.TryGetProperty("changes", out var changes)) continue;
                foreach (var change in changes.EnumerateArray())
                {
                    if (!change.TryGetProperty("value", out var value)) continue;
                    if (value.TryGetProperty("metadata", out var metadata) && metadata.TryGetProperty("phone_number_id", out var pni))
                        phoneNumberId = pni.GetString() ?? string.Empty;

                    if (value.TryGetProperty("statuses", out var statusesNode) && statusesNode.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var s in statusesNode.EnumerateArray())
                        {
                            var messageId = s.TryGetProperty("id", out var idNode) ? idNode.GetString() ?? string.Empty : string.Empty;
                            var status = s.TryGetProperty("status", out var statusNode) ? statusNode.GetString() ?? string.Empty : string.Empty;
                            DateTime? atUtc = null;
                            if (s.TryGetProperty("timestamp", out var tsNode) && long.TryParse(tsNode.GetString(), out var unixTs))
                                atUtc = DateTimeOffset.FromUnixTimeSeconds(unixTs).UtcDateTime;
                            if (!string.IsNullOrWhiteSpace(messageId) && !string.IsNullOrWhiteSpace(status))
                                statuses.Add((messageId, status, atUtc));
                        }
                    }

                    if (!value.TryGetProperty("messages", out var messages) || messages.ValueKind != JsonValueKind.Array) continue;
                    foreach (var msg in messages.EnumerateArray())
                    {
                        if (!msg.TryGetProperty("from", out var fromProp)) continue;
                        var from = fromProp.GetString() ?? string.Empty;
                        if (string.IsNullOrWhiteSpace(from)) continue;
                        var textBody = msg.TryGetProperty("text", out var textNode) && textNode.TryGetProperty("body", out var bodyNode)
                            ? bodyNode.GetString() ?? string.Empty
                            : string.Empty;
                        var name = value.TryGetProperty("contacts", out var contactsNode)
                            && contactsNode.ValueKind == JsonValueKind.Array
                            && contactsNode.GetArrayLength() > 0
                            && contactsNode[0].TryGetProperty("profile", out var profileNode)
                            && profileNode.TryGetProperty("name", out var nameNode)
                            ? nameNode.GetString() ?? string.Empty
                            : string.Empty;
                        var messageId = msg.TryGetProperty("id", out var msgIdNode) ? msgIdNode.GetString() ?? string.Empty : string.Empty;
                        inbound.Add(new InboundItem
                        {
                            MessageId = messageId,
                            From = from,
                            Name = name,
                            Body = textBody
                        });
                    }
                }
            }

            return (true, string.Empty, phoneNumberId, inbound, statuses);
        }
        catch (Exception ex)
        {
            return (false, ex.GetType().Name, string.Empty, inbound, statuses);
        }
    }
}
