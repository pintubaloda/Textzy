using Textzy.Api.Data;
using Textzy.Api.DTOs;
using Textzy.Api.Models;
using Textzy.Api.Providers;

namespace Textzy.Api.Services;

public class MessagingService(
    TenantDbContext db,
    TenancyContext tenancy,
    IMessageProvider provider,
    WhatsAppCloudService whatsapp)
{
    public async Task<Message> SendAsync(SendMessageRequest request, CancellationToken ct = default)
    {
        string providerMessageId;

        if (request.Channel == ChannelType.WhatsApp)
        {
            if (request.UseTemplate)
            {
                providerMessageId = await whatsapp.SendTemplateMessageAsync(new WabaSendTemplateRequest
                {
                    Recipient = request.Recipient,
                    TemplateName = request.TemplateName,
                    LanguageCode = request.TemplateLanguageCode,
                    BodyParameters = request.TemplateParameters
                }, ct);
            }
            else
            {
                var isOpen = await whatsapp.IsSessionWindowOpenAsync(request.Recipient, ct);
                if (!isOpen)
                    throw new InvalidOperationException("24-hour WhatsApp session closed. Use template message.");

                providerMessageId = await whatsapp.SendSessionMessageAsync(request.Recipient, request.Body, ct);
            }
        }
        else
        {
            providerMessageId = await provider.SendAsync(request.Channel, request.Recipient, request.Body, ct);
        }

        var message = new Message
        {
            Id = Guid.NewGuid(),
            TenantId = tenancy.TenantId,
            CampaignId = request.CampaignId,
            Channel = request.Channel,
            Recipient = request.Recipient,
            Body = request.Body,
            ProviderMessageId = providerMessageId,
            Status = "Accepted"
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
        return message;
    }
}
