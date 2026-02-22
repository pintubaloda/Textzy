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

    private sealed class StatusItem
    {
        public string MessageId { get; init; } = string.Empty;
        public string Status { get; init; } = string.Empty;
        public DateTime? AtUtc { get; init; }
        public string ErrorCode { get; init; } = string.Empty;
        public string ErrorTitle { get; init; } = string.Empty;
        public string ErrorDetail { get; init; } = string.Empty;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var item in queue.ReadAllAsync(stoppingToken))
        {
            using var scope = scopeFactory.CreateScope();
            var controlDb = scope.ServiceProvider.GetRequiredService<ControlDbContext>();
            var tenantResolver = scope.ServiceProvider.GetRequiredService<WabaTenantResolver>();
            var eventRow = await controlDb.WebhookEvents
                .FirstOrDefaultAsync(x => x.Provider == item.Provider && x.EventKey == item.EventKey, stoppingToken);

            if (eventRow is not null && eventRow.Status == "Processed")
            {
                continue;
            }

            if (eventRow is null)
            {
                eventRow = new WebhookEvent
                {
                    Id = item.Id,
                    Provider = item.Provider,
                    EventKey = item.EventKey,
                    PayloadJson = item.RawBody,
                    Status = "Queued",
                    RetryCount = Math.Max(item.Attempt - 1, 0),
                    MaxRetries = item.MaxAttempts,
                    ReceivedAtUtc = item.ReceivedAtUtc
                };
                controlDb.WebhookEvents.Add(eventRow);
                await controlDb.SaveChangesAsync(stoppingToken);
            }
            else
            {
                eventRow.PayloadJson = item.RawBody;
                eventRow.RetryCount = Math.Max(item.Attempt - 1, eventRow.RetryCount);
                eventRow.MaxRetries = item.MaxAttempts;
                eventRow.Status = "Processing";
                eventRow.LastError = string.Empty;
                await controlDb.SaveChangesAsync(stoppingToken);
            }

            try
            {
                var parse = ParsePayload(item.RawBody);
                if (!parse.Ok)
                {
                    eventRow.Status = "DeadLetter";
                    eventRow.LastError = $"parse_failed:{parse.Error}";
                    eventRow.DeadLetteredAtUtc = DateTime.UtcNow;
                    await controlDb.SaveChangesAsync(stoppingToken);
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
                    eventRow.Status = "Ignored";
                    eventRow.LastError = "missing_phone_or_events";
                    eventRow.ProcessedAtUtc = DateTime.UtcNow;
                    await controlDb.SaveChangesAsync(stoppingToken);
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
                    eventRow.Status = "Unmapped";
                    eventRow.PhoneNumberId = parse.PhoneNumberId;
                    eventRow.LastError = "tenant_not_mapped";
                    eventRow.ProcessedAtUtc = DateTime.UtcNow;
                    await controlDb.SaveChangesAsync(stoppingToken);
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
                eventRow.TenantId = resolved.TenantId;
                eventRow.PhoneNumberId = parse.PhoneNumberId;

                foreach (var status in parse.Statuses)
                {
                    var msg = await tenantDb.Set<Message>()
                        .FirstOrDefaultAsync(x => x.TenantId == resolved.TenantId && x.ProviderMessageId == status.MessageId, stoppingToken);
                    if (msg is null) continue;
                    ApplyStatusTransition(msg, status);
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
                eventRow.Status = "Processed";
                eventRow.ProcessedAtUtc = DateTime.UtcNow;
                eventRow.LastError = string.Empty;
                await controlDb.SaveChangesAsync(stoppingToken);
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
                    eventRow.Status = "RetryScheduled";
                    eventRow.RetryCount = item.Attempt;
                    eventRow.LastError = ex.GetType().Name;
                    await controlDb.SaveChangesAsync(stoppingToken);
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
                        Provider = item.Provider,
                        EventKey = item.EventKey,
                        RawBody = item.RawBody,
                        ReceivedAtUtc = item.ReceivedAtUtc,
                        Attempt = item.Attempt + 1,
                        MaxAttempts = item.MaxAttempts
                    }, stoppingToken);
                }
                else
                {
                    eventRow.Status = "DeadLetter";
                    eventRow.RetryCount = item.Attempt;
                    eventRow.LastError = $"{ex.GetType().Name}: {ex.Message}";
                    eventRow.DeadLetteredAtUtc = DateTime.UtcNow;
                    await controlDb.SaveChangesAsync(stoppingToken);
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

    private static (bool Ok, string Error, string PhoneNumberId, List<InboundItem> Inbound, List<StatusItem> Statuses) ParsePayload(string rawBody)
    {
        var phoneNumberId = string.Empty;
        var inbound = new List<InboundItem>();
        var statuses = new List<StatusItem>();
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
                            var errorCode = string.Empty;
                            var errorTitle = string.Empty;
                            var errorDetail = string.Empty;
                            if (s.TryGetProperty("errors", out var errorsNode) && errorsNode.ValueKind == JsonValueKind.Array && errorsNode.GetArrayLength() > 0)
                            {
                                var err = errorsNode[0];
                                errorCode = err.TryGetProperty("code", out var cNode) ? cNode.ToString() : string.Empty;
                                errorTitle = err.TryGetProperty("title", out var tNode) ? tNode.GetString() ?? string.Empty : string.Empty;
                                errorDetail = err.TryGetProperty("details", out var dNode) ? dNode.GetString() ?? string.Empty : string.Empty;
                            }
                            if (!string.IsNullOrWhiteSpace(messageId) && !string.IsNullOrWhiteSpace(status))
                                statuses.Add(new StatusItem
                                {
                                    MessageId = messageId,
                                    Status = status,
                                    AtUtc = atUtc,
                                    ErrorCode = errorCode,
                                    ErrorTitle = errorTitle,
                                    ErrorDetail = errorDetail
                                });
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

    private static void ApplyStatusTransition(Message msg, StatusItem incoming)
    {
        var next = NormalizeStatus(incoming.Status);
        if (string.IsNullOrWhiteSpace(next)) return;
        var currentPriority = StatusPriority(msg.Status);
        var nextPriority = StatusPriority(next);
        if (IsTerminal(msg.Status)) return;
        if (nextPriority <= currentPriority) return;

        msg.Status = next;
        if (next == "Delivered" && incoming.AtUtc.HasValue) msg.DeliveredAtUtc = incoming.AtUtc.Value;
        if (next == "Read" && incoming.AtUtc.HasValue) msg.ReadAtUtc = incoming.AtUtc.Value;
        if (next.StartsWith("Failed", StringComparison.Ordinal))
        {
            var reasonType = IsRetryableError(incoming.ErrorCode, incoming.ErrorTitle, incoming.ErrorDetail) ? "retryable" : "permanent";
            msg.LastError = $"{reasonType}; code={incoming.ErrorCode}; title={incoming.ErrorTitle}; details={incoming.ErrorDetail}".Trim();
        }
    }

    private static bool IsTerminal(string status)
        => string.Equals(status, "Read", StringComparison.OrdinalIgnoreCase)
           || status.StartsWith("Failed", StringComparison.OrdinalIgnoreCase);

    private static string NormalizeStatus(string raw)
    {
        return (raw ?? string.Empty).Trim().ToLowerInvariant() switch
        {
            "accepted" => "AcceptedByMeta",
            "sent" => "Sent",
            "delivered" => "Delivered",
            "read" => "Read",
            "failed" => "Failed",
            _ => string.Empty
        };
    }

    private static int StatusPriority(string status)
    {
        var s = (status ?? string.Empty).Trim();
        if (s.StartsWith("Failed", StringComparison.OrdinalIgnoreCase)) return 99;
        return s switch
        {
            "Queued" => 10,
            "Accepted" => 15,
            "AcceptedByMeta" => 20,
            "Sent" => 30,
            "Delivered" => 40,
            "Read" => 50,
            "Received" => 60,
            _ => 0
        };
    }

    private static bool IsRetryableError(string code, string title, string details)
    {
        var raw = $"{code} {title} {details}".ToLowerInvariant();
        if (raw.Contains("rate limit") || raw.Contains("temporar") || raw.Contains("timeout") || raw.Contains("server") || raw.Contains("5xx")) return true;
        if (raw.Contains("invalid") || raw.Contains("permission") || raw.Contains("policy") || raw.Contains("rejected") || raw.Contains("not registered") || raw.Contains("token")) return false;
        return false;
    }
}
