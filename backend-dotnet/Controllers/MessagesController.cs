using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Textzy.Api.Data;
using Textzy.Api.DTOs;
using Textzy.Api.Services;
using static Textzy.Api.Services.PermissionCatalog;

namespace Textzy.Api.Controllers;

[ApiController]
[Route("api/messages")]
public class MessagesController(
    MessagingService messaging,
    TenantDbContext db,
    TenancyContext tenancy,
    RbacService rbac,
    IHubContext<InboxHub> hub) : ControllerBase
{
    [HttpPost("send")]
    public async Task<IActionResult> Send([FromBody] SendMessageRequest request, CancellationToken ct)
    {
        if (!rbac.HasPermission(InboxWrite)) return Forbid();
        var idempotencyKey = Request.Headers["Idempotency-Key"].FirstOrDefault()?.Trim();
        if (string.IsNullOrWhiteSpace(idempotencyKey))
            return BadRequest(new { error = "Idempotency-Key header is required." });
        request.IdempotencyKey = idempotencyKey;
        try
        {
            request.Recipient = InputGuardService.ValidatePhone(request.Recipient, "Recipient");
            request.Body = InputGuardService.RequireTrimmed(request.Body, "Message body", 4000);
            if (request.UseTemplate && string.IsNullOrWhiteSpace(request.TemplateName))
                return BadRequest(new { error = "Template name is required when UseTemplate is true." });
            if (request.UseTemplate)
                request.TemplateName = InputGuardService.RequireTrimmed(request.TemplateName, "Template name", 128);
            request.TemplateLanguageCode = string.IsNullOrWhiteSpace(request.TemplateLanguageCode)
                ? "en"
                : InputGuardService.RequireTrimmed(request.TemplateLanguageCode, "Template language", 12).ToLowerInvariant();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }

        try
        {
            var message = await messaging.EnqueueAsync(request, ct);
            await hub.Clients.Group($"tenant:{tenancy.TenantSlug}").SendAsync("message.queued", new
            {
                message.Id,
                message.Recipient,
                message.Body,
                message.Channel,
                message.Status,
                message.CreatedAtUtc
            }, ct);
            return Ok(new
            {
                message.Id,
                message.IdempotencyKey,
                message.ProviderMessageId,
                message.Status,
                message.CreatedAtUtc
            });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpGet]
    public IActionResult List()
    {
        if (!rbac.HasPermission(InboxRead)) return Forbid();

        var items = db.Messages
            .Where(m => m.TenantId == tenancy.TenantId)
            .OrderByDescending(m => m.CreatedAtUtc)
            .Take(100)
            .ToList();

        return Ok(items);
    }
}
