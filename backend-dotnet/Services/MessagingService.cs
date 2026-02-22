using Textzy.Api.Data;
using Textzy.Api.DTOs;
using Textzy.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Textzy.Api.Services;

public class MessagingService(
    TenantDbContext db,
    TenancyContext tenancy,
    OutboundMessageQueueService queue)
{
    public async Task<Message> EnqueueAsync(SendMessageRequest request, CancellationToken ct = default)
    {
        var idempotencyKey = (request.IdempotencyKey ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(idempotencyKey))
        {
            idempotencyKey = $"msg-{tenancy.TenantId:N}-{request.Channel}-{request.Recipient}-{StableHash($"{request.UseTemplate}|{request.TemplateName}|{request.TemplateLanguageCode}|{string.Join(",", request.TemplateParameters)}|{request.Body}")}";
        }

        var existing = await db.Messages
            .FirstOrDefaultAsync(x => x.TenantId == tenancy.TenantId && x.IdempotencyKey == idempotencyKey, ct);
        if (existing is not null) return existing;

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
