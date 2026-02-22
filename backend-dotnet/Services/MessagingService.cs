using Textzy.Api.Data;
using Textzy.Api.DTOs;
using Textzy.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Textzy.Api.Services;

public class MessagingService(
    TenantDbContext db,
    TenancyContext tenancy,
    OutboundMessageQueueService queue,
    BillingGuardService billingGuard)
{
    public async Task<Message> EnqueueAsync(SendMessageRequest request, CancellationToken ct = default)
    {
        await billingGuard.RotateMonthlyBucketAsync(tenancy.TenantId, ct);
        var idempotencyKey = (request.IdempotencyKey ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(idempotencyKey))
        {
            idempotencyKey = $"msg-{tenancy.TenantId:N}-{request.Channel}-{request.Recipient}-{StableHash($"{request.UseTemplate}|{request.TemplateName}|{request.TemplateLanguageCode}|{string.Join(",", request.TemplateParameters)}|{request.Body}")}";
        }

        var keyRow = await db.IdempotencyKeys.FirstOrDefaultAsync(x => x.TenantId == tenancy.TenantId && x.Key == idempotencyKey, ct);
        if (keyRow?.MessageId is Guid linkedMessageId)
        {
            var linked = await db.Messages.FirstOrDefaultAsync(x => x.Id == linkedMessageId && x.TenantId == tenancy.TenantId, ct);
            if (linked is not null) return linked;
        }

        var existing = await db.Messages
            .FirstOrDefaultAsync(x => x.TenantId == tenancy.TenantId && x.IdempotencyKey == idempotencyKey, ct);
        if (existing is not null) return existing;

        if (request.Channel == ChannelType.WhatsApp)
        {
            var c = await billingGuard.TryConsumeAsync(tenancy.TenantId, "whatsappMessages", 1, ct);
            if (!c.Allowed) throw new InvalidOperationException(c.Message);
        }
        else if (request.Channel == ChannelType.Sms)
        {
            var c = await billingGuard.TryConsumeAsync(tenancy.TenantId, "smsCredits", 1, ct);
            if (!c.Allowed) throw new InvalidOperationException(c.Message);
        }

        var messageBody = request.UseTemplate
            ? $"{request.TemplateName}|{string.Join(",", request.TemplateParameters)}|{request.TemplateLanguageCode}"
            : request.Body;

        var message = new Message
        {
            Id = Guid.NewGuid(),
            TenantId = tenancy.TenantId,
            CampaignId = request.CampaignId,
            Channel = request.Channel,
            Recipient = request.Recipient,
            Body = messageBody,
            MessageType = request.UseTemplate ? "template" : "session",
            IdempotencyKey = idempotencyKey,
            RetryCount = 0,
            LastError = string.Empty,
            QueueProvider = queue.ActiveProvider,
            Status = "Queued"
        };

        db.Messages.Add(message);
        if (keyRow is null)
        {
            keyRow = new IdempotencyKeyRecord
            {
                Id = Guid.NewGuid(),
                TenantId = tenancy.TenantId,
                Key = idempotencyKey,
                MessageId = message.Id,
                Status = "queued",
                CreatedAtUtc = DateTime.UtcNow
            };
            db.IdempotencyKeys.Add(keyRow);
        }
        else
        {
            keyRow.MessageId = message.Id;
            keyRow.Status = "queued";
        }
        db.MessageEvents.Add(new MessageEvent
        {
            Id = Guid.NewGuid(),
            TenantId = tenancy.TenantId,
            MessageId = message.Id,
            ProviderMessageId = message.ProviderMessageId,
            Direction = "outbound",
            EventType = "queued",
            State = "Queued",
            StatePriority = 10,
            EventTimestampUtc = DateTime.UtcNow,
            RecipientId = message.Recipient,
            CustomerPhone = message.Recipient,
            MessageType = message.MessageType,
            RawPayloadJson = "{}",
            CreatedAtUtc = DateTime.UtcNow
        });

        // Auto-create/update contact from outbound sends (WhatsApp/SMS).
        var existingContact = db.Contacts.FirstOrDefault(x => x.TenantId == tenancy.TenantId && x.Phone == request.Recipient);
        if (existingContact is null)
        {
            var defaultSegment = db.ContactSegments.FirstOrDefault(x => x.TenantId == tenancy.TenantId && x.Name.ToLower() == "new");
            if (defaultSegment is null)
            {
                defaultSegment = new ContactSegment
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenancy.TenantId,
                    Name = "New",
                    RuleJson = "{}",
                    CreatedAtUtc = DateTime.UtcNow
                };
                db.ContactSegments.Add(defaultSegment);
            }

            db.Contacts.Add(new Contact
            {
                Id = Guid.NewGuid(),
                TenantId = tenancy.TenantId,
                Name = request.Recipient,
                Phone = request.Recipient,
                SegmentId = defaultSegment.Id,
                TagsCsv = "New",
                OptInStatus = "unknown",
                CreatedAtUtc = DateTime.UtcNow
            });
            var currentContacts = await db.Contacts.CountAsync(x => x.TenantId == tenancy.TenantId, ct);
            await billingGuard.SetAbsoluteUsageAsync(tenancy.TenantId, "contacts", currentContacts + 1, ct);
        }
        else
        {
            if (string.IsNullOrWhiteSpace(existingContact.Name))
                existingContact.Name = request.Recipient;
        }

        await db.SaveChangesAsync(ct);
        await queue.EnqueueAsync(new OutboundMessageQueueItem
        {
            MessageId = message.Id,
            TenantId = tenancy.TenantId,
            TenantSlug = tenancy.TenantSlug
        }, ct);
        return message;
    }

    private static string StableHash(string raw)
    {
        var bytes = System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(raw ?? string.Empty));
        return Convert.ToHexString(bytes)[..16].ToLowerInvariant();
    }
}
