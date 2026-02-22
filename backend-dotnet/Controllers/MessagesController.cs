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
