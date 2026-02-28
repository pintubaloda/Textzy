using System.Text.Json;
using Google.Apis.Auth.OAuth2;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Textzy.Api.Data;
using Textzy.Api.Models;
using WebPush;

namespace Textzy.Api.Services;

public class WabaWebhookWorker(
    WabaWebhookQueueService queue,
    IServiceScopeFactory scopeFactory,
    IHubContext<InboxHub> hub,
    UserPresenceService presence,
    IConfiguration config,
    TenantSchemaGuardService schemaGuard,
    SensitiveDataRedactor redactor,
    ILogger<WabaWebhookWorker> logger) : BackgroundService
{
    private static readonly TimeSpan PresenceTtl = TimeSpan.FromMinutes(2);
    private readonly SemaphoreSlim _fcmTokenLock = new(1, 1);
    private string _fcmAccessToken = string.Empty;
    private DateTime _fcmAccessTokenExpiryUtc = DateTime.MinValue;
    private sealed class TriggerInboundContext
    {
        public string MessageId { get; init; } = string.Empty;
        public string From { get; init; } = string.Empty;
        public string Name { get; init; } = string.Empty;
        public string MessageText { get; init; } = string.Empty;
    }

    private sealed class FlowNode
    {
        public string Id { get; init; } = string.Empty;
        public string Type { get; init; } = string.Empty;
        public string Next { get; init; } = string.Empty;
        public string OnTrue { get; init; } = string.Empty;
        public string OnFalse { get; init; } = string.Empty;
        public string OnSuccess { get; init; } = string.Empty;
        public string OnFailure { get; init; } = string.Empty;
        public Dictionary<string, object?> Config { get; init; } = new(StringComparer.OrdinalIgnoreCase);
    }

    private sealed class InboundItem
    {
        public string MessageId { get; init; } = string.Empty;
        public string From { get; init; } = string.Empty;
        public string Name { get; init; } = string.Empty;
        public string Body { get; init; } = string.Empty;
        public string MessageType { get; init; } = string.Empty;
        public DateTime? AtUtc { get; init; }
        public string MediaId { get; init; } = string.Empty;
        public string MediaMimeType { get; init; } = string.Empty;
        public string MediaSha256 { get; init; } = string.Empty;
        public string MediaCaption { get; init; } = string.Empty;
        public string MediaFileName { get; init; } = string.Empty;
        public string ButtonPayload { get; init; } = string.Empty;
        public string ButtonText { get; init; } = string.Empty;
        public string InteractiveType { get; init; } = string.Empty;
        public string ListReplyId { get; init; } = string.Empty;
        public string ListReplyTitle { get; init; } = string.Empty;
        public string LocationSummary { get; init; } = string.Empty;
        public string ContextMessageId { get; init; } = string.Empty;
        public string ReferralSourceUrl { get; init; } = string.Empty;
        public string ReferralHeadline { get; init; } = string.Empty;
        public string ReactionEmoji { get; init; } = string.Empty;
        public string ReactionMessageId { get; init; } = string.Empty;
        public string OrderSummary { get; init; } = string.Empty;
        public string ContactsSummary { get; init; } = string.Empty;
        public string RawJson { get; init; } = "{}";
    }

    private sealed class StatusItem
    {
        public string MessageId { get; init; } = string.Empty;
        public string Status { get; init; } = string.Empty;
        public DateTime? AtUtc { get; init; }
        public string RecipientId { get; init; } = string.Empty;
        public string ConversationId { get; init; } = string.Empty;
        public string ConversationOriginType { get; init; } = string.Empty;
        public DateTime? ConversationExpirationUtc { get; init; }
        public bool? PricingBillable { get; init; }
        public string PricingCategory { get; init; } = string.Empty;
        public string ErrorCode { get; init; } = string.Empty;
        public string ErrorTitle { get; init; } = string.Empty;
        public string ErrorDetail { get; init; } = string.Empty;
        public string RawJson { get; init; } = "{}";
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var item in queue.ReadAllAsync(stoppingToken))
        {
            using var scope = scopeFactory.CreateScope();
                var controlDb = scope.ServiceProvider.GetRequiredService<ControlDbContext>();
                var tenantResolver = scope.ServiceProvider.GetRequiredService<WabaTenantResolver>();
                var contactPii = scope.ServiceProvider.GetRequiredService<ContactPiiService>();
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

                await schemaGuard.EnsureContactEncryptionColumnsAsync(resolved.TenantId, resolved.DataConnectionString, stoppingToken);
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
                    if (msg is not null)
                    {
                        ApplyStatusTransition(msg, status, controlDb);
                    }
                    tenantDb.MessageEvents.Add(new MessageEvent
                    {
                        Id = Guid.NewGuid(),
                        TenantId = resolved.TenantId,
                        MessageId = msg?.Id,
                        ProviderMessageId = status.MessageId,
                        Direction = "outbound",
                        EventType = $"status.{status.Status.ToLowerInvariant()}",
                        State = MessageStateMachine.NormalizeWebhookStatus(status.Status),
                        StatePriority = MessageStateMachine.Priority(MessageStateMachine.NormalizeWebhookStatus(status.Status)),
                        EventTimestampUtc = status.AtUtc ?? DateTime.UtcNow,
                        RecipientId = status.RecipientId,
                        CustomerPhone = status.RecipientId,
                        ConversationId = status.ConversationId,
                        ConversationOriginType = status.ConversationOriginType,
                        ConversationExpirationUtc = status.ConversationExpirationUtc,
                        PricingBillable = status.PricingBillable,
                        PricingCategory = status.PricingCategory,
                        MessageType = msg?.MessageType ?? "session",
                        RawPayloadJson = status.RawJson,
                        CreatedAtUtc = DateTime.UtcNow
                    });
                }

                foreach (var inbound in parse.Inbound)
                {
                    TriggerInboundContext? triggerInbound = null;
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

                    var inboundPhoneHash = contactPii.IsEnabled ? contactPii.ComputePhoneHash(inbound.From) : string.Empty;
                    var existingContact = contactPii.IsEnabled
                        ? await tenantDb.Set<Contact>()
                            .FirstOrDefaultAsync(x => x.TenantId == resolved.TenantId && x.PhoneHash == inboundPhoneHash, stoppingToken)
                        : await tenantDb.Set<Contact>()
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

                        var newContact = new Contact
                        {
                            Id = Guid.NewGuid(),
                            TenantId = resolved.TenantId,
                            Name = string.IsNullOrWhiteSpace(inbound.Name) ? inbound.From : inbound.Name,
                            Phone = inbound.From,
                            SegmentId = defaultSegment.Id,
                            TagsCsv = "New",
                            OptInStatus = "opted_in",
                            CreatedAtUtc = DateTime.UtcNow
                        };
                        contactPii.Protect(newContact);
                        tenantDb.Set<Contact>().Add(newContact);
                    }
                    else if (!string.IsNullOrWhiteSpace(inbound.Name))
                    {
                        existingContact.Name = inbound.Name;
                        contactPii.Protect(existingContact);
                    }

                    var inboundProviderId = string.IsNullOrWhiteSpace(inbound.MessageId) ? $"wa_in_{Guid.NewGuid():N}" : inbound.MessageId;
                    var existingInbound = await tenantDb.Set<Message>()
                        .FirstOrDefaultAsync(x => x.TenantId == resolved.TenantId && x.ProviderMessageId == inboundProviderId, stoppingToken);
                    if (existingInbound is null)
                    {
                        var inboundMessageType = IsMediaType(inbound.MessageType) ? $"media:{inbound.MessageType}" : "session";
                        var normalizedInboundBody = IsMediaType(inbound.MessageType)
                            ? ComposeInboundMediaBody(inbound)
                            : ComposeInboundBody(inbound);
                        if (!string.IsNullOrWhiteSpace(inbound.ContextMessageId))
                        {
                            var replyPrefix = await BuildInboundReplyPrefixAsync(
                                tenantDb,
                                resolved.TenantId,
                                inbound.ContextMessageId,
                                string.IsNullOrWhiteSpace(inbound.Name) ? "Customer" : inbound.Name,
                                stoppingToken);
                            if (!string.IsNullOrWhiteSpace(replyPrefix) && !IsMediaType(inbound.MessageType))
                            {
                                normalizedInboundBody = $"{replyPrefix}\n{normalizedInboundBody}".Trim();
                            }
                        }
                        tenantDb.Set<Message>().Add(new Message
                        {
                            Id = Guid.NewGuid(),
                            TenantId = resolved.TenantId,
                            Channel = ChannelType.WhatsApp,
                            Recipient = inbound.From,
                            Body = normalizedInboundBody,
                            MessageType = inboundMessageType,
                            Status = "Received",
                            ProviderMessageId = inboundProviderId,
                            CreatedAtUtc = inbound.AtUtc ?? DateTime.UtcNow
                        });
                        triggerInbound = new TriggerInboundContext
                        {
                            MessageId = inboundProviderId,
                            From = inbound.From,
                            Name = inbound.Name,
                            MessageText = ComposeInboundBody(inbound)
                        };
                    }
                    tenantDb.MessageEvents.Add(new MessageEvent
                    {
                        Id = Guid.NewGuid(),
                        TenantId = resolved.TenantId,
                        MessageId = existingInbound?.Id,
                        ProviderMessageId = inboundProviderId,
                        Direction = "inbound",
                        EventType = "received",
                        State = MessageStateMachine.Received,
                        StatePriority = MessageStateMachine.Priority(MessageStateMachine.Received),
                        EventTimestampUtc = inbound.AtUtc ?? DateTime.UtcNow,
                        RecipientId = inbound.From,
                        CustomerPhone = inbound.From,
                        MessageType = string.IsNullOrWhiteSpace(inbound.MessageType) ? "text" : inbound.MessageType,
                        MediaId = inbound.MediaId,
                        MediaMimeType = inbound.MediaMimeType,
                        MediaSha256 = inbound.MediaSha256,
                        ButtonPayload = inbound.ButtonPayload,
                        ButtonText = inbound.ButtonText,
                        InteractiveType = inbound.InteractiveType,
                        ListReplyId = inbound.ListReplyId,
                        ListReplyTitle = inbound.ListReplyTitle,
                        RawPayloadJson = inbound.RawJson,
                        CreatedAtUtc = DateTime.UtcNow
                    });

                    if (triggerInbound is not null)
                    {
                        await RunTriggeredAutomationsAsync(
                            scope.ServiceProvider,
                            controlDb,
                            tenantDb,
                            resolved.TenantId,
                            resolved.TenantSlug,
                            resolved.DataConnectionString,
                            parse.PhoneNumberId,
                            triggerInbound,
                            stoppingToken);
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

                if (parse.Inbound.Count > 0)
                {
                    var latestInbound = parse.Inbound
                        .OrderByDescending(x => x.AtUtc ?? DateTime.MinValue)
                        .FirstOrDefault();
                    if (latestInbound is not null)
                    {
                        await TrySendBrowserPushAsync(
                            controlDb,
                            resolved.TenantId,
                            resolved.TenantSlug,
                            latestInbound,
                            stoppingToken);
                    }
                }
            }
            catch (Exception ex)
            {
                logger.LogError("WABA webhook worker failed for queue item {QueueId} attempt={Attempt}: {Error}", item.Id, item.Attempt, redactor.RedactText(ex.Message));
                if (item.Attempt < item.MaxAttempts)
                {
                    eventRow.Status = "RetryScheduled";
                    eventRow.RetryCount = item.Attempt;
                    eventRow.LastError = redactor.RedactText(ex.GetType().Name);
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
                    eventRow.LastError = redactor.RedactText($"{ex.GetType().Name}: {ex.Message}");
                    eventRow.DeadLetteredAtUtc = DateTime.UtcNow;
                    await controlDb.SaveChangesAsync(stoppingToken);
                    controlDb.AuditLogs.Add(new AuditLog
                    {
                        Id = Guid.NewGuid(),
                        TenantId = null,
                        ActorUserId = Guid.Empty,
                        Action = "waba.webhook.dead_letter",
                        Details = $"queueId={item.Id}; attempts={item.Attempt}; error={redactor.RedactText(ex.GetType().Name)}; message={redactor.RedactText(ex.Message)}",
                        CreatedAtUtc = DateTime.UtcNow
                    });
                    await controlDb.SaveChangesAsync(stoppingToken);
                }
            }
        }
    }

    private async Task TrySendBrowserPushAsync(
        ControlDbContext controlDb,
        Guid tenantId,
        string tenantSlug,
        InboundItem inbound,
        CancellationToken ct)
    {
        var vapidPublicKey = (config["Push:VapidPublicKey"] ?? string.Empty).Trim();
        var vapidPrivateKey = (config["Push:VapidPrivateKey"] ?? string.Empty).Trim();
        var vapidSubject = (config["Push:VapidSubject"] ?? "mailto:support@textzy.local").Trim();
        var fcmProjectId = (config["Push:FcmProjectId"] ?? string.Empty).Trim();
        var fcmSaJson = (config["Push:FcmServiceAccountJson"] ?? string.Empty).Trim();
        var fcmSaPath = (config["Push:FcmServiceAccountPath"] ?? string.Empty).Trim();
        var webPushEnabled = !string.IsNullOrWhiteSpace(vapidPublicKey) && !string.IsNullOrWhiteSpace(vapidPrivateKey);
        var fcmEnabled = !string.IsNullOrWhiteSpace(fcmProjectId) && (!string.IsNullOrWhiteSpace(fcmSaJson) || !string.IsNullOrWhiteSpace(fcmSaPath));
        if (!webPushEnabled && !fcmEnabled) return;

        var tenantUsers = await controlDb.TenantUsers
            .Where(x => x.TenantId == tenantId)
            .Select(x => x.UserId)
            .Distinct()
            .ToListAsync(ct);
        if (tenantUsers.Count == 0) return;

        var users = await controlDb.Users
            .Where(x => tenantUsers.Contains(x.Id))
            .Select(x => new { x.Id, x.Email })
            .ToListAsync(ct);
        if (users.Count == 0) return;

        var activeMap = BuildPresenceMap(tenantSlug);
        var targetUserIds = users
            .Where(u => !IsUserActive(activeMap, u.Email))
            .Select(u => u.Id)
            .ToHashSet();
        if (targetUserIds.Count == 0) return;

        var subscriptions = await controlDb.UserPushSubscriptions
            .Where(x => x.TenantId == tenantId && x.IsActive && targetUserIds.Contains(x.UserId))
            .ToListAsync(ct);
        if (subscriptions.Count == 0) return;

        var bodyText = string.IsNullOrWhiteSpace(inbound.Body)
            ? (!string.IsNullOrWhiteSpace(inbound.MessageType) ? $"New {inbound.MessageType} message" : "You received a new customer message")
            : inbound.Body;
        if (bodyText.Length > 120) bodyText = $"{bodyText[..117]}...";

        var payload = JsonSerializer.Serialize(new
        {
            title = inbound.Name,
            body = bodyText,
            tag = $"textzy-inbox-{tenantId:N}",
            data = new
            {
                tenantSlug,
                from = inbound.From,
                messageId = inbound.MessageId,
                at = (inbound.AtUtc ?? DateTime.UtcNow).ToString("O")
            }
        });

        var webPushClient = webPushEnabled ? new WebPushClient() : null;
        var vapid = webPushEnabled ? new VapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey) : null;
        var http = fcmEnabled ? new HttpClient() : null;
        foreach (var sub in subscriptions)
        {
            try
            {
                if (string.Equals(sub.Provider, "fcm", StringComparison.OrdinalIgnoreCase))
                {
                    if (http is null) continue;
                    var bearer = await GetFcmBearerTokenAsync(fcmSaJson, fcmSaPath, ct);
                    if (string.IsNullOrWhiteSpace(bearer)) continue;
                    using var req = new HttpRequestMessage(HttpMethod.Post, $"https://fcm.googleapis.com/v1/projects/{fcmProjectId}/messages:send");
                    req.Headers.TryAddWithoutValidation("Authorization", $"Bearer {bearer}");
                    req.Content = new StringContent(JsonSerializer.Serialize(new
                    {
                        message = new
                        {
                            token = sub.Endpoint,
                            notification = new { title = inbound.Name, body = bodyText },
                            data = new
                            {
                                tenantSlug,
                                from = inbound.From,
                                messageId = inbound.MessageId,
                                at = (inbound.AtUtc ?? DateTime.UtcNow).ToString("O")
                            }
                        }
                    }));
                    req.Content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/json");
                    using var resp = await http.SendAsync(req, ct);
                    if (!resp.IsSuccessStatusCode)
                    {
                        var txt = await resp.Content.ReadAsStringAsync(ct);
                        if (txt.Contains("UNREGISTERED", StringComparison.OrdinalIgnoreCase) || txt.Contains("registration-token-not-registered", StringComparison.OrdinalIgnoreCase) || txt.Contains("INVALID_ARGUMENT", StringComparison.OrdinalIgnoreCase))
                        {
                            sub.IsActive = false;
                        }
                        else
                        {
                            logger.LogWarning("FCM send failed tenant={TenantId} user={UserId} status={Status}: {Error}",
                                tenantId, sub.UserId, (int)resp.StatusCode, redactor.RedactText(txt));
                        }
                    }
                }
                else
                {
                    if (!webPushEnabled || webPushClient is null || vapid is null) continue;
                    var pushSub = new PushSubscription(sub.Endpoint, sub.P256dh, sub.Auth);
                    await webPushClient.SendNotificationAsync(pushSub, payload, vapid);
                }
                sub.LastSeenAtUtc = DateTime.UtcNow;
                sub.UpdatedAtUtc = DateTime.UtcNow;
            }
            catch (WebPushException ex) when ((int?)ex.StatusCode is 404 or 410)
            {
                sub.IsActive = false;
                sub.UpdatedAtUtc = DateTime.UtcNow;
            }
            catch (Exception ex)
            {
                logger.LogWarning("Push send failed tenant={TenantId} user={UserId}: {Error}",
                    tenantId, sub.UserId, redactor.RedactText(ex.Message));
            }
        }

        await controlDb.SaveChangesAsync(ct);
    }

    private async Task<string> GetFcmBearerTokenAsync(string serviceAccountJson, string serviceAccountPath, CancellationToken ct)
    {
        if (!string.IsNullOrWhiteSpace(_fcmAccessToken) && DateTime.UtcNow < _fcmAccessTokenExpiryUtc.AddMinutes(-2))
            return _fcmAccessToken;

        await _fcmTokenLock.WaitAsync(ct);
        try
        {
            if (!string.IsNullOrWhiteSpace(_fcmAccessToken) && DateTime.UtcNow < _fcmAccessTokenExpiryUtc.AddMinutes(-2))
                return _fcmAccessToken;

            GoogleCredential cred;
            if (!string.IsNullOrWhiteSpace(serviceAccountJson))
            {
                cred = GoogleCredential.FromJson(serviceAccountJson);
            }
            else if (!string.IsNullOrWhiteSpace(serviceAccountPath))
            {
                cred = GoogleCredential.FromFile(serviceAccountPath);
            }
            else
            {
                return string.Empty;
            }

            cred = cred.CreateScoped("https://www.googleapis.com/auth/firebase.messaging");
            var token = await cred.UnderlyingCredential.GetAccessTokenForRequestAsync(null, ct);
            if (string.IsNullOrWhiteSpace(token)) return string.Empty;
            _fcmAccessToken = token;
            _fcmAccessTokenExpiryUtc = DateTime.UtcNow.AddMinutes(50);
            return _fcmAccessToken;
        }
        catch (Exception ex)
        {
            logger.LogWarning("FCM access token fetch failed: {Error}", redactor.RedactText(ex.Message));
            return string.Empty;
        }
        finally
        {
            _fcmTokenLock.Release();
        }
    }

    private Dictionary<string, bool> BuildPresenceMap(string tenantSlug)
    {
        var now = DateTime.UtcNow;
        return presence.Snapshot(tenantSlug)
            .Where(x => !string.IsNullOrWhiteSpace(x.UserKey))
            .GroupBy(x => x.UserKey, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                g => g.Key,
                g => g.Any(x => x.IsOnline && x.IsTabActive && now - x.LastHeartbeatUtc <= PresenceTtl),
                StringComparer.OrdinalIgnoreCase);
    }

    private static bool IsUserActive(Dictionary<string, bool> activeMap, string? email)
    {
        if (string.IsNullOrWhiteSpace(email)) return false;
        return activeMap.TryGetValue(email.Trim().ToLowerInvariant(), out var isActive) && isActive;
    }

    private static string NormalizeMatchText(string value)
    {
        var s = (value ?? string.Empty).Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(s)) return string.Empty;
        var chars = s.Where(c => char.IsLetterOrDigit(c) || char.IsWhiteSpace(c)).ToArray();
        return new string(chars).Trim();
    }

    private static bool MatchByMode(string text, string keyword, string mode)
    {
        if (string.IsNullOrWhiteSpace(text) || string.IsNullOrWhiteSpace(keyword)) return false;
        var t = NormalizeMatchText(text);
        var k = NormalizeMatchText(keyword);
        if (string.IsNullOrWhiteSpace(t) || string.IsNullOrWhiteSpace(k)) return false;
        return mode switch
        {
            "exact" => string.Equals(t, k, StringComparison.OrdinalIgnoreCase),
            "starts" or "starts_with" => t.StartsWith(k, StringComparison.OrdinalIgnoreCase),
            _ => t.Contains(k, StringComparison.OrdinalIgnoreCase)
        };
    }

    private static (bool Matched, string Reason) EvaluateTriggerMatch(AutomationFlow flow, string inboundText, string? definitionJson = null)
    {
        var triggerType = (flow.TriggerType ?? string.Empty).Trim().ToLowerInvariant();
        if (triggerType is not ("keyword" or "intent")) return (false, "unsupported_trigger_type");
        var text = (inboundText ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(text)) return (false, "empty_inbound_text");

        static bool TryMatchFromJson(string json, string inbound, out bool matched, out string reason)
        {
            matched = false;
            reason = "no_match";
            using var cfgDoc = JsonDocument.Parse(string.IsNullOrWhiteSpace(json) ? "{}" : json);
            var root = cfgDoc.RootElement;
            var mode = root.TryGetProperty("match", out var modeNode)
                ? (modeNode.GetString() ?? string.Empty).Trim().ToLowerInvariant()
                : "contains";

            if (root.TryGetProperty("keywords", out var keywordsNode) && keywordsNode.ValueKind == JsonValueKind.Array)
            {
                foreach (var k in keywordsNode.EnumerateArray())
                {
                    if (MatchByMode(inbound, k.ToString() ?? string.Empty, mode))
                    {
                        matched = true;
                        reason = $"matched_keywords_array:{mode}";
                        return true;
                    }
                }
            }
            if (root.TryGetProperty("keywords", out var keywordsCsvNode) && keywordsCsvNode.ValueKind == JsonValueKind.String)
            {
                foreach (var raw in (keywordsCsvNode.GetString() ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                {
                    if (MatchByMode(inbound, raw, mode))
                    {
                        matched = true;
                        reason = $"matched_keywords_csv:{mode}";
                        return true;
                    }
                }
            }
            if (root.TryGetProperty("keyword", out var keywordNode))
            {
                if (MatchByMode(inbound, keywordNode.ToString() ?? string.Empty, mode))
                {
                    matched = true;
                    reason = $"matched_keyword:{mode}";
                    return true;
                }
            }
            if (root.TryGetProperty("triggerKeywords", out var triggerKeywordsNode) && triggerKeywordsNode.ValueKind == JsonValueKind.Array)
            {
                foreach (var k in triggerKeywordsNode.EnumerateArray())
                {
                    if (MatchByMode(inbound, k.ToString() ?? string.Empty, mode))
                    {
                        matched = true;
                        reason = $"matched_trigger_keywords:{mode}";
                        return true;
                    }
                }
            }
            reason = $"no_keyword_match:{mode}";
            return true;
        }

        try
        {
            if (TryMatchFromJson(flow.TriggerConfigJson, text, out var byFlow, out var flowReason) && byFlow)
                return (true, flowReason);

            if (!string.IsNullOrWhiteSpace(definitionJson))
            {
                using var defDoc = JsonDocument.Parse(definitionJson);
                var root = defDoc.RootElement;
                if (root.TryGetProperty("trigger", out var triggerNode))
                {
                    if (TryMatchFromJson(triggerNode.GetRawText(), text, out var byDef, out var defReason) && byDef)
                        return (true, $"fallback_definition:{defReason}");
                    return (false, $"no_match_in_definition:{defReason}");
                }
                return (false, $"no_match_in_flow_config:{flowReason}");
            }
            return (false, $"no_match_in_flow_config:{flowReason}");
        }
        catch
        {
            return (false, "trigger_parse_error");
        }
    }

    private static Dictionary<string, object?> BuildPayload(TriggerInboundContext inbound)
    {
        return new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
        {
            ["recipient"] = inbound.From,
            ["name"] = string.IsNullOrWhiteSpace(inbound.Name) ? inbound.From : inbound.Name,
            ["message"] = inbound.MessageText,
            ["inbound_message_id"] = inbound.MessageId
        };
    }

    private static (Dictionary<string, FlowNode> nodes, string startNodeId) ParseFlowDefinition(string definitionJson)
    {
        var nodes = new Dictionary<string, FlowNode>(StringComparer.OrdinalIgnoreCase);
        var startNodeId = string.Empty;
        using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(definitionJson) ? "{}" : definitionJson);
        var root = doc.RootElement;
        if (root.TryGetProperty("startNodeId", out var startNode)) startNodeId = startNode.ToString();
        if (!root.TryGetProperty("nodes", out var nodesNode) || nodesNode.ValueKind != JsonValueKind.Array)
            return (nodes, startNodeId);

        foreach (var item in nodesNode.EnumerateArray())
        {
            var id = item.TryGetProperty("id", out var idNode) ? idNode.ToString() : Guid.NewGuid().ToString("N");
            var type = item.TryGetProperty("type", out var typeNode) ? typeNode.ToString() : "text";
            var node = new FlowNode
            {
                Id = id,
                Type = type,
                Next = item.TryGetProperty("next", out var nextNode) ? nextNode.ToString() : string.Empty,
                OnTrue = item.TryGetProperty("onTrue", out var onTrueNode) ? onTrueNode.ToString() : string.Empty,
                OnFalse = item.TryGetProperty("onFalse", out var onFalseNode) ? onFalseNode.ToString() : string.Empty,
                OnSuccess = item.TryGetProperty("onSuccess", out var onSuccessNode) ? onSuccessNode.ToString() : string.Empty,
                OnFailure = item.TryGetProperty("onFailure", out var onFailureNode) ? onFailureNode.ToString() : string.Empty,
                Config = item.TryGetProperty("config", out var cfgNode) && cfgNode.ValueKind == JsonValueKind.Object
                    ? cfgNode.EnumerateObject().ToDictionary(x => x.Name, x => (object?)x.Value, StringComparer.OrdinalIgnoreCase)
                    : new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
            };
            nodes[id] = node;
            if (string.IsNullOrWhiteSpace(startNodeId) && string.Equals(type, "start", StringComparison.OrdinalIgnoreCase))
                startNodeId = id;
        }
        if (root.TryGetProperty("edges", out var edgesNode) && edgesNode.ValueKind == JsonValueKind.Array)
        {
            foreach (var edge in edgesNode.EnumerateArray())
            {
                var from = edge.TryGetProperty("from", out var fromNode) ? fromNode.ToString() : string.Empty;
                var to = edge.TryGetProperty("to", out var toNode) ? toNode.ToString() : string.Empty;
                if (string.IsNullOrWhiteSpace(from) || string.IsNullOrWhiteSpace(to)) continue;
                if (!nodes.TryGetValue(from, out var source)) continue;
                var label = edge.TryGetProperty("label", out var labelNode)
                    ? (labelNode.ToString() ?? string.Empty).Trim().ToLowerInvariant()
                    : string.Empty;
                if (label is "true")
                {
                    if (string.IsNullOrWhiteSpace(source.OnTrue)) source.OnTrue = to;
                    continue;
                }
                if (label is "false")
                {
                    if (string.IsNullOrWhiteSpace(source.OnFalse)) source.OnFalse = to;
                    continue;
                }
                if (string.IsNullOrWhiteSpace(source.Next)) source.Next = to;
            }
        }
        if (string.IsNullOrWhiteSpace(startNodeId) && nodes.Count > 0) startNodeId = nodes.Keys.First();
        return (nodes, startNodeId);
    }

    private static bool EvaluateCondition(Dictionary<string, object?> config, Dictionary<string, object?> payload)
    {
        var field = config.TryGetValue("field", out var f) ? f?.ToString() ?? string.Empty : string.Empty;
        var @operator = config.TryGetValue("operator", out var op) ? op?.ToString()?.ToLowerInvariant() ?? "equals" : "equals";
        var expected = config.TryGetValue("value", out var v) ? v?.ToString() ?? string.Empty : string.Empty;
        var actual = payload.TryGetValue(field, out var a) ? a?.ToString() ?? string.Empty : string.Empty;

        return @operator switch
        {
            "contains" => actual.Contains(expected, StringComparison.OrdinalIgnoreCase),
            "starts_with" => actual.StartsWith(expected, StringComparison.OrdinalIgnoreCase),
            "ends_with" => actual.EndsWith(expected, StringComparison.OrdinalIgnoreCase),
            "not_equals" => !string.Equals(actual, expected, StringComparison.OrdinalIgnoreCase),
            "regex" => System.Text.RegularExpressions.Regex.IsMatch(actual, expected),
            _ => string.Equals(actual, expected, StringComparison.OrdinalIgnoreCase)
        };
    }

    private static string Interpolate(string text, Dictionary<string, object?> payload)
    {
        var output = text ?? string.Empty;
        foreach (var pair in payload)
        {
            output = output.Replace($"{{{{{pair.Key}}}}}", pair.Value?.ToString() ?? string.Empty, StringComparison.OrdinalIgnoreCase);
        }
        return output;
    }

    private static string ResolveValue(Dictionary<string, object?> config, Dictionary<string, object?> payload, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (config.TryGetValue(key, out var raw))
            {
                var val = raw?.ToString() ?? string.Empty;
                if (!string.IsNullOrWhiteSpace(val)) return Interpolate(val, payload);
            }
            if (payload.TryGetValue(key, out var fromPayload))
            {
                var val = fromPayload?.ToString() ?? string.Empty;
                if (!string.IsNullOrWhiteSpace(val)) return val;
            }
        }
        return string.Empty;
    }

    private static string ResolveNodeReplyText(string nodeType, Dictionary<string, object?> config, Dictionary<string, object?> payload)
    {
        if (nodeType == "bot_reply")
        {
            var replyMode = ResolveValue(config, payload, "replyMode");
            if (string.Equals(replyMode, "media", StringComparison.OrdinalIgnoreCase))
            {
                var mediaText = ResolveValue(config, payload, "mediaText", "body", "message");
                if (!string.IsNullOrWhiteSpace(mediaText)) return mediaText;
            }
            var simpleText = ResolveValue(config, payload, "simpleText", "body", "message", "question", "prompt");
            if (!string.IsNullOrWhiteSpace(simpleText)) return simpleText;
        }

        if (nodeType is "buttons" or "list" or "cta_url" or "media")
        {
            var body = ResolveValue(config, payload, "body", "message", "question", "prompt");
            if (!string.IsNullOrWhiteSpace(body)) return body;
        }

        return ResolveValue(config, payload, "body", "message", "question", "prompt");
    }

    private async Task RunTriggeredAutomationsAsync(
        IServiceProvider sp,
        ControlDbContext controlDb,
        TenantDbContext tenantDb,
        Guid tenantId,
        string tenantSlug,
        string tenantConnectionString,
        string phoneNumberId,
        TriggerInboundContext inbound,
        CancellationToken ct)
    {
        var flows = await tenantDb.AutomationFlows
            .AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.IsActive && (x.PublishedVersionId != null || x.CurrentVersionId != null))
            .ToListAsync(ct);
        if (flows.Count == 0) return;

        var tenancy = sp.GetRequiredService<TenancyContext>();
        tenancy.SetTenant(tenantId, tenantSlug, tenantConnectionString);
        var messaging = sp.GetRequiredService<MessagingService>();

        foreach (var flow in flows)
        {
            var targetVersionId = flow.PublishedVersionId ?? flow.CurrentVersionId;
            if (!targetVersionId.HasValue)
            {
                controlDb.AuditLogs.Add(new AuditLog
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    ActorUserId = Guid.Empty,
                    Action = "waba.workflow.trigger_eval",
                    Details = $"phoneNumberId={phoneNumberId}; inboundMessageId={inbound.MessageId}; flowId={flow.Id}; matched=false; reason=missing_target_version; matched_flow_id=",
                    CreatedAtUtc = DateTime.UtcNow
                });
                await controlDb.SaveChangesAsync(ct);
                continue;
            }
            var version = await tenantDb.AutomationFlowVersions
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.TenantId == tenantId && x.FlowId == flow.Id && x.Id == targetVersionId.Value, ct);
            if (version is null)
            {
                controlDb.AuditLogs.Add(new AuditLog
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    ActorUserId = Guid.Empty,
                    Action = "waba.workflow.trigger_eval",
                    Details = $"phoneNumberId={phoneNumberId}; inboundMessageId={inbound.MessageId}; flowId={flow.Id}; matched=false; reason=version_not_found; matched_flow_id=",
                    CreatedAtUtc = DateTime.UtcNow
                });
                await controlDb.SaveChangesAsync(ct);
                continue;
            }
            if (!string.Equals((flow.Channel ?? "waba").Trim(), "waba", StringComparison.OrdinalIgnoreCase))
            {
                controlDb.AuditLogs.Add(new AuditLog
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    ActorUserId = Guid.Empty,
                    Action = "waba.workflow.trigger_eval",
                    Details = $"phoneNumberId={phoneNumberId}; inboundMessageId={inbound.MessageId}; flowId={flow.Id}; matched=false; reason=channel_not_waba; matched_flow_id=",
                    CreatedAtUtc = DateTime.UtcNow
                });
                await controlDb.SaveChangesAsync(ct);
                continue;
            }
            var triggerEval = EvaluateTriggerMatch(flow, inbound.MessageText, version.DefinitionJson);
            if (!triggerEval.Matched)
            {
                controlDb.AuditLogs.Add(new AuditLog
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    ActorUserId = Guid.Empty,
                    Action = "waba.workflow.trigger_eval",
                    Details = $"phoneNumberId={phoneNumberId}; inboundMessageId={inbound.MessageId}; flowId={flow.Id}; matched=false; reason={triggerEval.Reason}; matched_flow_id=",
                    CreatedAtUtc = DateTime.UtcNow
                });
                await controlDb.SaveChangesAsync(ct);
                continue;
            }
            controlDb.AuditLogs.Add(new AuditLog
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ActorUserId = Guid.Empty,
                Action = "waba.workflow.trigger_eval",
                Details = $"phoneNumberId={phoneNumberId}; inboundMessageId={inbound.MessageId}; flowId={flow.Id}; matched=true; reason={triggerEval.Reason}; matched_flow_id={flow.Id}",
                CreatedAtUtc = DateTime.UtcNow
            });
            await controlDb.SaveChangesAsync(ct);

            var idempotencyKey = $"auto:{flow.Id}:{inbound.MessageId}";
            var existing = await tenantDb.AutomationRuns
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.TenantId == tenantId && x.FlowId == flow.Id && x.IdempotencyKey == idempotencyKey, ct);
            if (existing is not null) continue;

            var payload = BuildPayload(inbound);
            var run = new AutomationRun
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                FlowId = flow.Id,
                VersionId = version.Id,
                Mode = "live",
                TriggerType = string.IsNullOrWhiteSpace(flow.TriggerType) ? "keyword" : flow.TriggerType,
                IdempotencyKey = idempotencyKey,
                TriggerPayloadJson = JsonSerializer.Serialize(payload),
                Status = "running",
                StartedAtUtc = DateTime.UtcNow
            };
            tenantDb.AutomationRuns.Add(run);
            await tenantDb.SaveChangesAsync(ct);

            var (nodes, startNodeId) = ParseFlowDefinition(version.DefinitionJson);
            var trace = new List<object>();
            var log = new List<string>();
            var cursor = startNodeId;
            var guard = 0;
            try
            {
                while (!string.IsNullOrWhiteSpace(cursor) && guard < 250)
                {
                    guard++;
                    if (!nodes.TryGetValue(cursor, out var node))
                    {
                        log.Add($"missing-node:{cursor}");
                        break;
                    }
                    var nodeType = (node.Type ?? string.Empty).Trim().ToLowerInvariant().Replace("-", "_");
                    var next = node.Next;
                    if (nodeType is "start")
                    {
                        next = node.Next;
                    }
                    else if (nodeType is "text" or "send_text" or "bot_reply" or "botreply" or "buttons" or "list" or "cta_url" or "media")
                    {
                        var recipient = ResolveValue(node.Config, payload, "recipient");
                        if (string.IsNullOrWhiteSpace(recipient)) recipient = inbound.From;
                        var body = ResolveNodeReplyText(nodeType, node.Config, payload);
                        if (!string.IsNullOrWhiteSpace(recipient) && !string.IsNullOrWhiteSpace(body))
                        {
                            await messaging.EnqueueAsync(new DTOs.SendMessageRequest
                            {
                                Recipient = recipient,
                                Body = Interpolate(body, payload),
                                Channel = ChannelType.WhatsApp,
                                IdempotencyKey = $"auto-msg:{flow.Id}:{inbound.MessageId}:{node.Id}"
                            }, ct);
                        }
                        else
                        {
                            controlDb.AuditLogs.Add(new AuditLog
                            {
                                Id = Guid.NewGuid(),
                                TenantId = tenantId,
                                ActorUserId = Guid.Empty,
                                Action = "waba.workflow.send_skipped",
                                Details = $"phoneNumberId={phoneNumberId}; inboundMessageId={inbound.MessageId}; flowId={flow.Id}; nodeId={node.Id}; nodeType={nodeType}; reason=empty_recipient_or_body",
                                CreatedAtUtc = DateTime.UtcNow
                            });
                            await controlDb.SaveChangesAsync(ct);
                        }
                        next = node.OnSuccess ?? node.Next;
                    }
                    else if (nodeType == "template")
                    {
                        var recipient = ResolveValue(node.Config, payload, "recipient");
                        var templateName = ResolveValue(node.Config, payload, "templateName", "template_name");
                        var languageCode = ResolveValue(node.Config, payload, "languageCode", "language");
                        var body = ResolveValue(node.Config, payload, "body", "message");
                        var paramValues = new List<string>();
                        if (node.Config.TryGetValue("parameters", out var p) && p is JsonElement pElem && pElem.ValueKind == JsonValueKind.Array)
                        {
                            foreach (var item in pElem.EnumerateArray()) paramValues.Add(Interpolate(item.ToString(), payload));
                        }
                        if (!string.IsNullOrWhiteSpace(recipient) && !string.IsNullOrWhiteSpace(templateName))
                        {
                            await messaging.EnqueueAsync(new DTOs.SendMessageRequest
                            {
                                Recipient = recipient,
                                Body = body,
                                Channel = ChannelType.WhatsApp,
                                UseTemplate = true,
                                TemplateName = templateName,
                                TemplateLanguageCode = string.IsNullOrWhiteSpace(languageCode) ? "en" : languageCode,
                                TemplateParameters = paramValues,
                                IdempotencyKey = $"auto-tpl:{flow.Id}:{inbound.MessageId}:{node.Id}"
                            }, ct);
                        }
                        next = node.OnSuccess ?? node.Next;
                    }
                    else if (nodeType is "condition" or "split")
                    {
                        var ok = EvaluateCondition(node.Config, payload);
                        next = ok ? (node.OnTrue ?? node.OnSuccess ?? node.Next) : (node.OnFalse ?? node.OnFailure ?? node.Next);
                    }
                    else if (nodeType == "end")
                    {
                        trace.Add(new { nodeId = node.Id, nodeType, nextNodeId = "", status = "ok" });
                        break;
                    }
                    else
                    {
                        next = node.OnSuccess ?? node.Next;
                    }
                    trace.Add(new { nodeId = node.Id, nodeType, nextNodeId = next, status = "ok" });
                    log.Add($"{nodeType}:{node.Id}->{next}");
                    if (string.IsNullOrWhiteSpace(next)) break;
                    cursor = next;
                }
                run.Status = "completed";
                run.Log = string.Join('\n', log);
                run.TraceJson = JsonSerializer.Serialize(trace);
                run.CompletedAtUtc = DateTime.UtcNow;
            }
            catch (Exception ex)
            {
                run.Status = "failed";
                run.FailureReason = ex.Message;
                run.Log = string.Join('\n', log);
                run.TraceJson = JsonSerializer.Serialize(trace);
                run.CompletedAtUtc = DateTime.UtcNow;
                controlDb.AuditLogs.Add(new AuditLog
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    ActorUserId = Guid.Empty,
                    Action = "waba.workflow.execution_failed",
                    Details = $"phoneNumberId={phoneNumberId}; inboundMessageId={inbound.MessageId}; flowId={flow.Id}; error={redactor.RedactText(ex.Message)}",
                    CreatedAtUtc = DateTime.UtcNow
                });
                await controlDb.SaveChangesAsync(ct);
            }
            await tenantDb.SaveChangesAsync(ct);
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
                            var recipientId = s.TryGetProperty("recipient_id", out var recNode) ? recNode.GetString() ?? string.Empty : string.Empty;
                            var conversationId = string.Empty;
                            var conversationOriginType = string.Empty;
                            DateTime? conversationExpirationUtc = null;
                            if (s.TryGetProperty("conversation", out var convNode))
                            {
                                conversationId = convNode.TryGetProperty("id", out var convIdNode) ? convIdNode.GetString() ?? string.Empty : string.Empty;
                                if (convNode.TryGetProperty("origin", out var originNode))
                                    conversationOriginType = originNode.TryGetProperty("type", out var typeNode) ? typeNode.GetString() ?? string.Empty : string.Empty;
                                if (convNode.TryGetProperty("expiration_timestamp", out var expNode) && long.TryParse(expNode.GetString(), out var expUnix))
                                    conversationExpirationUtc = DateTimeOffset.FromUnixTimeSeconds(expUnix).UtcDateTime;
                            }
                            bool? pricingBillable = null;
                            var pricingCategory = string.Empty;
                            if (s.TryGetProperty("pricing", out var pricingNode))
                            {
                                if (pricingNode.TryGetProperty("billable", out var billNode) && (billNode.ValueKind == JsonValueKind.True || billNode.ValueKind == JsonValueKind.False))
                                    pricingBillable = billNode.GetBoolean();
                                pricingCategory = pricingNode.TryGetProperty("category", out var catNode) ? catNode.GetString() ?? string.Empty : string.Empty;
                            }
                            var errorCode = string.Empty;
                            var errorTitle = string.Empty;
                            var errorDetail = string.Empty;
                            if (s.TryGetProperty("errors", out var errorsNode) && errorsNode.ValueKind == JsonValueKind.Array && errorsNode.GetArrayLength() > 0)
                            {
                                var err = errorsNode[0];
                                errorCode = err.TryGetProperty("code", out var cNode) ? cNode.ToString() : string.Empty;
                                errorTitle = err.TryGetProperty("title", out var tNode) ? tNode.GetString() ?? string.Empty : string.Empty;
                                errorDetail = err.TryGetProperty("details", out var dNode) ? dNode.GetString() ?? string.Empty : string.Empty;
                                if (string.IsNullOrWhiteSpace(errorDetail) && err.TryGetProperty("message", out var mNode))
                                    errorDetail = mNode.GetString() ?? string.Empty;
                            }
                            if (!string.IsNullOrWhiteSpace(messageId) && !string.IsNullOrWhiteSpace(status))
                                statuses.Add(new StatusItem
                                {
                                    MessageId = messageId,
                                    Status = status,
                                    AtUtc = atUtc,
                                    RecipientId = recipientId,
                                    ConversationId = conversationId,
                                    ConversationOriginType = conversationOriginType,
                                    ConversationExpirationUtc = conversationExpirationUtc,
                                    PricingBillable = pricingBillable,
                                    PricingCategory = pricingCategory,
                                    ErrorCode = errorCode,
                                    ErrorTitle = errorTitle,
                                    ErrorDetail = errorDetail,
                                    RawJson = s.GetRawText()
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
                        var type = msg.TryGetProperty("type", out var typeNode) ? typeNode.GetString() ?? string.Empty : string.Empty;
                        DateTime? atUtc = null;
                        if (msg.TryGetProperty("timestamp", out var msgTsNode) && long.TryParse(msgTsNode.GetString(), out var msgUnixTs))
                            atUtc = DateTimeOffset.FromUnixTimeSeconds(msgUnixTs).UtcDateTime;
                        var mediaId = string.Empty;
                        var mediaMime = string.Empty;
                        var mediaSha = string.Empty;
                        var mediaCaption = string.Empty;
                        var mediaFileName = string.Empty;
                        if (type is "image" or "video" or "audio" or "document" or "sticker")
                        {
                            if (msg.TryGetProperty(type, out var mediaNode))
                            {
                                mediaId = mediaNode.TryGetProperty("id", out var mId) ? mId.GetString() ?? string.Empty : string.Empty;
                                mediaMime = mediaNode.TryGetProperty("mime_type", out var mMime) ? mMime.GetString() ?? string.Empty : string.Empty;
                                mediaSha = mediaNode.TryGetProperty("sha256", out var mSha) ? mSha.GetString() ?? string.Empty : string.Empty;
                                mediaCaption = mediaNode.TryGetProperty("caption", out var mCap) ? mCap.GetString() ?? string.Empty : string.Empty;
                                mediaFileName = mediaNode.TryGetProperty("filename", out var mName) ? mName.GetString() ?? string.Empty : string.Empty;
                            }
                        }
                        var buttonPayload = string.Empty;
                        var buttonText = string.Empty;
                        if (msg.TryGetProperty("button", out var buttonNode))
                        {
                            buttonPayload = buttonNode.TryGetProperty("payload", out var pNode) ? pNode.GetString() ?? string.Empty : string.Empty;
                            buttonText = buttonNode.TryGetProperty("text", out var btNode) ? btNode.GetString() ?? string.Empty : string.Empty;
                        }
                        var interactiveType = string.Empty;
                        var listReplyId = string.Empty;
                        var listReplyTitle = string.Empty;
                        if (msg.TryGetProperty("interactive", out var interNode))
                        {
                            interactiveType = interNode.TryGetProperty("type", out var iTypeNode) ? iTypeNode.GetString() ?? string.Empty : string.Empty;
                            if (interNode.TryGetProperty("list_reply", out var listReply))
                            {
                                listReplyId = listReply.TryGetProperty("id", out var lrId) ? lrId.GetString() ?? string.Empty : string.Empty;
                                listReplyTitle = listReply.TryGetProperty("title", out var lrTitle) ? lrTitle.GetString() ?? string.Empty : string.Empty;
                            }
                            if (interNode.TryGetProperty("button_reply", out var buttonReply))
                            {
                                if (string.IsNullOrWhiteSpace(listReplyId))
                                    listReplyId = buttonReply.TryGetProperty("id", out var brId) ? brId.GetString() ?? string.Empty : string.Empty;
                                if (string.IsNullOrWhiteSpace(listReplyTitle))
                                    listReplyTitle = buttonReply.TryGetProperty("title", out var brTitle) ? brTitle.GetString() ?? string.Empty : string.Empty;
                            }
                        }
                        var locationSummary = string.Empty;
                        if (msg.TryGetProperty("location", out var locNode))
                        {
                            var nameText = locNode.TryGetProperty("name", out var nm) ? nm.GetString() ?? string.Empty : string.Empty;
                            var addr = locNode.TryGetProperty("address", out var ad) ? ad.GetString() ?? string.Empty : string.Empty;
                            var lat = locNode.TryGetProperty("latitude", out var latNode) ? latNode.ToString() : string.Empty;
                            var lng = locNode.TryGetProperty("longitude", out var lngNode) ? lngNode.ToString() : string.Empty;
                            locationSummary = $"Location: {nameText} {addr} ({lat},{lng})".Trim();
                        }
                        var contextMessageId = string.Empty;
                        if (msg.TryGetProperty("context", out var contextNode))
                        {
                            contextMessageId = contextNode.TryGetProperty("id", out var ctxId) ? ctxId.GetString() ?? string.Empty : string.Empty;
                        }

                        var referralSourceUrl = string.Empty;
                        var referralHeadline = string.Empty;
                        if (msg.TryGetProperty("referral", out var referralNode))
                        {
                            referralSourceUrl = referralNode.TryGetProperty("source_url", out var rUrl) ? rUrl.GetString() ?? string.Empty : string.Empty;
                            referralHeadline = referralNode.TryGetProperty("headline", out var rHead) ? rHead.GetString() ?? string.Empty : string.Empty;
                        }

                        var reactionEmoji = string.Empty;
                        var reactionMessageId = string.Empty;
                        if (msg.TryGetProperty("reaction", out var reactionNode))
                        {
                            reactionEmoji = reactionNode.TryGetProperty("emoji", out var rEmoji) ? rEmoji.GetString() ?? string.Empty : string.Empty;
                            reactionMessageId = reactionNode.TryGetProperty("message_id", out var rMid) ? rMid.GetString() ?? string.Empty : string.Empty;
                        }

                        var orderSummary = string.Empty;
                        if (msg.TryGetProperty("order", out var orderNode))
                        {
                            var catalogId = orderNode.TryGetProperty("catalog_id", out var cId) ? cId.GetString() ?? string.Empty : string.Empty;
                            var text = orderNode.TryGetProperty("text", out var oText) ? oText.GetString() ?? string.Empty : string.Empty;
                            var productCount = orderNode.TryGetProperty("product_items", out var itemsNode) && itemsNode.ValueKind == JsonValueKind.Array
                                ? itemsNode.GetArrayLength()
                                : 0;
                            orderSummary = $"Order: catalog={catalogId}; items={productCount}; text={text}".Trim();
                        }

                        var contactsSummary = string.Empty;
                        if (msg.TryGetProperty("contacts", out var msgContactsNode) && msgContactsNode.ValueKind == JsonValueKind.Array)
                        {
                            contactsSummary = $"Shared contacts: {msgContactsNode.GetArrayLength()}";
                        }
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
                            Body = textBody,
                            MessageType = type,
                            AtUtc = atUtc,
                            MediaId = mediaId,
                            MediaMimeType = mediaMime,
                            MediaSha256 = mediaSha,
                            MediaCaption = mediaCaption,
                            MediaFileName = mediaFileName,
                            ButtonPayload = buttonPayload,
                            ButtonText = buttonText,
                            InteractiveType = interactiveType,
                            ListReplyId = listReplyId,
                            ListReplyTitle = listReplyTitle,
                            LocationSummary = locationSummary,
                            ContextMessageId = contextMessageId,
                            ReferralSourceUrl = referralSourceUrl,
                            ReferralHeadline = referralHeadline,
                            ReactionEmoji = reactionEmoji,
                            ReactionMessageId = reactionMessageId,
                            OrderSummary = orderSummary,
                            ContactsSummary = contactsSummary,
                            RawJson = msg.GetRawText()
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

    private static string ComposeInboundBody(InboundItem inbound)
    {
        if (!string.IsNullOrWhiteSpace(inbound.Body)) return inbound.Body;
        if (!string.IsNullOrWhiteSpace(inbound.ButtonText)) return $"Button reply: {inbound.ButtonText}";
        if (!string.IsNullOrWhiteSpace(inbound.ListReplyTitle)) return $"Interactive reply: {inbound.ListReplyTitle}";
        if (!string.IsNullOrWhiteSpace(inbound.ReactionEmoji)) return $"Reaction: {inbound.ReactionEmoji}";
        if (!string.IsNullOrWhiteSpace(inbound.OrderSummary)) return inbound.OrderSummary;
        if (!string.IsNullOrWhiteSpace(inbound.LocationSummary)) return inbound.LocationSummary;
        if (!string.IsNullOrWhiteSpace(inbound.ContactsSummary)) return inbound.ContactsSummary;
        if (!string.IsNullOrWhiteSpace(inbound.ReferralHeadline)) return $"Referral: {inbound.ReferralHeadline}";
        if (!string.IsNullOrWhiteSpace(inbound.MessageType)) return $"Inbound {inbound.MessageType} message";
        return "[Inbound message]";
    }

    private static bool IsMediaType(string? messageType)
    {
        var t = (messageType ?? string.Empty).Trim().ToLowerInvariant();
        return t is "image" or "video" or "audio" or "document" or "sticker";
    }

    private static string ComposeInboundMediaBody(InboundItem inbound)
    {
        return JsonSerializer.Serialize(new
        {
            mediaId = inbound.MediaId ?? string.Empty,
            mimeType = inbound.MediaMimeType ?? string.Empty,
            caption = inbound.MediaCaption ?? string.Empty,
            fileName = inbound.MediaFileName ?? string.Empty,
            kind = inbound.MessageType ?? "media"
        });
    }

    private static async Task<string> BuildInboundReplyPrefixAsync(
        TenantDbContext tenantDb,
        Guid tenantId,
        string contextMessageId,
        string customerName,
        CancellationToken ct)
    {
        var targetProviderId = (contextMessageId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(targetProviderId)) return string.Empty;
        var target = await tenantDb.Set<Message>()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.TenantId == tenantId && x.ProviderMessageId == targetProviderId, ct);
        if (target is null)
        {
            var fallbackLabel = string.IsNullOrWhiteSpace(customerName) ? "Customer" : customerName;
            return $"↪ Reply to ({fallbackLabel}): [Referenced message]";
        }

        var label = string.Equals(target.Status, "Received", StringComparison.OrdinalIgnoreCase)
            ? (string.IsNullOrWhiteSpace(customerName) ? "Customer" : customerName)
            : "Agent";
        var at = target.CreatedAtUtc.ToLocalTime().ToString("HH:mm");
        var preview = BuildMessagePreview(target);
        if (string.IsNullOrWhiteSpace(preview)) preview = "Message";
        return $"↪ Reply to ({label} {at}): {preview}";
    }

    private static string BuildMessagePreview(Message message)
    {
        if (message.MessageType.StartsWith("media:", StringComparison.OrdinalIgnoreCase))
        {
            var kind = message.MessageType["media:".Length..];
            try
            {
                using var doc = JsonDocument.Parse(message.Body ?? "{}");
                var root = doc.RootElement;
                var fileName = root.TryGetProperty("fileName", out var fNode) ? (fNode.GetString() ?? string.Empty).Trim() : string.Empty;
                var caption = root.TryGetProperty("caption", out var cNode) ? (cNode.GetString() ?? string.Empty).Trim() : string.Empty;
                if (!string.IsNullOrWhiteSpace(caption)) return $"{kind}: {caption}";
                if (!string.IsNullOrWhiteSpace(fileName)) return $"{kind}: {fileName}";
                return $"{kind} attachment";
            }
            catch
            {
                return $"{kind} attachment";
            }
        }
        var body = (message.Body ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(body)) return "Message";
        var firstLine = body.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).FirstOrDefault();
        if (string.IsNullOrWhiteSpace(firstLine)) return "Message";
        return firstLine.Length <= 120 ? firstLine : $"{firstLine[..120]}...";
    }

    private static void ApplyStatusTransition(Message msg, StatusItem incoming, ControlDbContext controlDb)
    {
        var next = MessageStateMachine.NormalizeWebhookStatus(incoming.Status);
        if (string.IsNullOrWhiteSpace(next)) return;
        if (!MessageStateMachine.CanTransition(msg.Status, next)) return;

        msg.Status = next;
        if (next == "Delivered" && incoming.AtUtc.HasValue) msg.DeliveredAtUtc = incoming.AtUtc.Value;
        if (next == "Read" && incoming.AtUtc.HasValue) msg.ReadAtUtc = incoming.AtUtc.Value;
        if (next.StartsWith("Failed", StringComparison.OrdinalIgnoreCase))
        {
            var reasonType = IsRetryableError(controlDb, incoming.ErrorCode, incoming.ErrorTitle, incoming.ErrorDetail) ? "retryable" : "permanent";
            msg.LastError = $"{reasonType}; code={incoming.ErrorCode}; title={incoming.ErrorTitle}; details={incoming.ErrorDetail}".Trim();
        }
    }

    private static bool IsRetryableError(ControlDbContext controlDb, string code, string title, string details)
    {
        var policy = controlDb.WabaErrorPolicies.FirstOrDefault(x => x.Code == (code ?? string.Empty) && x.IsActive);
        if (policy is not null) return string.Equals(policy.Classification, "retryable", StringComparison.OrdinalIgnoreCase);

        var raw = $"{code} {title} {details}".ToLowerInvariant();
        if (raw.Contains("rate limit") || raw.Contains("temporar") || raw.Contains("timeout") || raw.Contains("server") || raw.Contains("5xx")) return true;
        if (raw.Contains("invalid") || raw.Contains("permission") || raw.Contains("policy") || raw.Contains("rejected") || raw.Contains("not registered") || raw.Contains("token")) return false;
        return false;
    }
}
