using Textzy.Api.Data;
using Textzy.Api.DTOs;
using Textzy.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Textzy.Api.Services;

public class MessagingService(
    TenantDbContext db,
    TenancyContext tenancy,
    OutboundMessageQueueService queue,
    BillingGuardService billingGuard,
    SecurityControlService security,
    ContactPiiService contactPii)
{
    public async Task<Message> EnqueueAsync(SendMessageRequest request, CancellationToken ct = default)
    {
        await billingGuard.RotateMonthlyBucketAsync(tenancy.TenantId, ct);
        if (await security.IsCircuitBreakerOpenAsync(tenancy.TenantId, ct))
            throw new InvalidOperationException("Tenant circuit breaker is active. Outbound messaging is paused.");

        var idempotencyKey = (request.IdempotencyKey ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(idempotencyKey))
            throw new InvalidOperationException("Idempotency-Key header is required.");
        if (idempotencyKey.Length > 180) throw new InvalidOperationException("Idempotency-Key is too long.");

        request.Recipient = InputGuardService.ValidatePhone(request.Recipient, "Recipient");
        if (!request.UseTemplate)
        {
            request.Body = InputGuardService.RequireTrimmed(request.Body, "Message body", 4096);
        }

        var rpmOverride = await security.GetRatePerMinuteOverrideAsync(tenancy.TenantId, ct);
        if (rpmOverride.HasValue)
        {
            var minuteAgo = DateTime.UtcNow.AddMinutes(-1);
            var sentLastMinute = await db.Messages.CountAsync(x => x.TenantId == tenancy.TenantId && x.CreatedAtUtc >= minuteAgo, ct);
            if (sentLastMinute >= rpmOverride.Value)
                throw new InvalidOperationException($"Rate override reached ({rpmOverride.Value}/minute). Please retry shortly.");
        }

        var now = DateTime.UtcNow;
        var keyRow = await db.IdempotencyKeys.FirstOrDefaultAsync(x => x.TenantId == tenancy.TenantId && x.Key == idempotencyKey, ct);
        if (keyRow is not null && keyRow.ExpiresAtUtc <= now)
        {
            db.IdempotencyKeys.Remove(keyRow);
            await db.SaveChangesAsync(ct);
            keyRow = null;
        }
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
                Status = "reserved",
                CreatedAtUtc = now,
                ExpiresAtUtc = now.AddHours(24)
            };
            db.IdempotencyKeys.Add(keyRow);
        }
        else
        {
            keyRow.MessageId = message.Id;
            keyRow.Status = "reserved";
            keyRow.ExpiresAtUtc = now.AddHours(24);
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

            var newContact = new Contact
            {
                Id = Guid.NewGuid(),
                TenantId = tenancy.TenantId,
                Name = request.Recipient,
                Phone = request.Recipient,
                SegmentId = defaultSegment.Id,
                TagsCsv = "New",
                OptInStatus = "unknown",
                CreatedAtUtc = DateTime.UtcNow
            };
            contactPii.Protect(newContact);
            db.Contacts.Add(newContact);
            var currentContacts = await db.Contacts.CountAsync(x => x.TenantId == tenancy.TenantId, ct);
            await billingGuard.SetAbsoluteUsageAsync(tenancy.TenantId, "contacts", currentContacts + 1, ct);
        }
        else
        {
            if (string.IsNullOrWhiteSpace(existingContact.Name))
                existingContact.Name = request.Recipient;
            contactPii.Protect(existingContact);
        }

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            var existingAfterConflict = await db.Messages
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.TenantId == tenancy.TenantId && x.IdempotencyKey == idempotencyKey, ct);
            if (existingAfterConflict is not null) return existingAfterConflict;
            throw;
        }
        await queue.EnqueueAsync(new OutboundMessageQueueItem
        {
            MessageId = message.Id,
            TenantId = tenancy.TenantId,
            TenantSlug = tenancy.TenantSlug,
            IdempotencyKey = idempotencyKey
        }, ct);
        return message;
    }
}
