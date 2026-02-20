using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Textzy.Api.Data;
using Textzy.Api.DTOs;
using Textzy.Api.Services;
using static Textzy.Api.Services.PermissionCatalog;

namespace Textzy.Api.Controllers;

[ApiController]
[Route("api/inbox")]
public class InboxController(
    TenantDbContext db,
    TenancyContext tenancy,
    AuthContext auth,
    RbacService rbac,
    IHubContext<InboxHub> hub) : ControllerBase
{
    [HttpGet("conversations")]
    public IActionResult Conversations([FromQuery] string? q = null)
    {
        if (!rbac.HasPermission(InboxRead)) return Forbid();
        var query = db.Conversations.Where(x => x.TenantId == tenancy.TenantId);
        if (!string.IsNullOrWhiteSpace(q))
            query = query.Where(x => x.CustomerPhone.Contains(q) || x.CustomerName.Contains(q));
        var items = query.OrderByDescending(x => x.LastMessageAtUtc).Take(200).ToList();
        var phones = items.Select(x => x.CustomerPhone).Distinct().ToList();
        var windows = db.ConversationWindows
            .Where(x => x.TenantId == tenancy.TenantId && phones.Contains(x.Recipient))
            .ToDictionary(x => x.Recipient, x => x.LastInboundAtUtc);

        var now = DateTime.UtcNow;
        var data = items.Select(c =>
        {
            var hasInbound = windows.TryGetValue(c.CustomerPhone, out var lastInboundAt);
            var hoursSinceInbound = hasInbound ? (now - lastInboundAt).TotalHours : 999d;
            var canReply = hasInbound && hoursSinceInbound <= 24d;
            return new
            {
                c.Id,
                c.CustomerPhone,
                c.CustomerName,
                c.Status,
                c.AssignedUserId,
                c.AssignedUserName,
                c.LabelsCsv,
                c.LastMessageAtUtc,
                c.CreatedAtUtc,
                lastInboundAtUtc = hasInbound ? lastInboundAt : (DateTime?)null,
                canReply,
                hoursSinceInbound
            };
        }).ToList();

        return Ok(data);
    }

    [HttpPost("conversations/{id:guid}/assign")]
    public async Task<IActionResult> Assign(Guid id, [FromBody] AssignConversationRequest req, CancellationToken ct)
    {
        if (!rbac.HasPermission(InboxWrite)) return Forbid();
        var c = await db.Conversations.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenancy.TenantId, ct);
        if (c is null) return NotFound();
        c.AssignedUserId = req.UserId;
        c.AssignedUserName = req.UserName;
        await db.SaveChangesAsync(ct);
        await hub.Clients.Group($"tenant:{tenancy.TenantSlug}").SendAsync("conversation.assigned", new { c.Id, c.AssignedUserId, c.AssignedUserName }, ct);
        return Ok(c);
    }

    [HttpPost("conversations/{id:guid}/transfer")]
    public async Task<IActionResult> Transfer(Guid id, [FromBody] TransferConversationRequest req, CancellationToken ct)
    {
        if (!rbac.HasPermission(InboxWrite)) return Forbid();
        var c = await db.Conversations.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenancy.TenantId, ct);
        if (c is null) return NotFound();
        c.AssignedUserId = req.UserId;
        c.AssignedUserName = req.UserName;
        c.Status = "Open";
        await db.SaveChangesAsync(ct);
        await hub.Clients.Group($"tenant:{tenancy.TenantSlug}").SendAsync("conversation.transferred", new { c.Id, c.AssignedUserId, c.AssignedUserName }, ct);
        return Ok(c);
    }

    [HttpPost("conversations/{id:guid}/labels")]
    public async Task<IActionResult> Labels(Guid id, [FromBody] UpdateConversationLabelsRequest req, CancellationToken ct)
    {
        if (!rbac.HasPermission(InboxWrite)) return Forbid();
        var c = await db.Conversations.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenancy.TenantId, ct);
        if (c is null) return NotFound();
        c.LabelsCsv = string.Join(",", (req.Labels ?? []).Select(x => (x ?? string.Empty).Trim()).Where(x => !string.IsNullOrWhiteSpace(x)).Distinct(StringComparer.OrdinalIgnoreCase));
        await db.SaveChangesAsync(ct);
        await hub.Clients.Group($"tenant:{tenancy.TenantSlug}").SendAsync("conversation.labels", new { c.Id, c.LabelsCsv }, ct);
        return Ok(c);
    }

    [HttpPost("conversations/{id:guid}/notes")]
    public async Task<IActionResult> AddNote(Guid id, [FromBody] AddConversationNoteRequest req, CancellationToken ct)
    {
        if (!rbac.HasPermission(InboxWrite)) return Forbid();
        var c = await db.Conversations.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenancy.TenantId, ct);
        if (c is null) return NotFound();

        var note = new Textzy.Api.Models.ConversationNote
        {
            Id = Guid.NewGuid(),
            TenantId = tenancy.TenantId,
            ConversationId = id,
            Body = req.Body,
            CreatedByUserId = auth.UserId,
            CreatedByName = auth.Email
        };
        db.ConversationNotes.Add(note);
        await db.SaveChangesAsync(ct);
        await hub.Clients.Group($"tenant:{tenancy.TenantSlug}").SendAsync("conversation.note", note, ct);
        return Ok(note);
    }

    [HttpGet("conversations/{id:guid}/notes")]
    public IActionResult Notes(Guid id)
    {
        if (!rbac.HasPermission(InboxRead)) return Forbid();
        return Ok(db.ConversationNotes.Where(x => x.TenantId == tenancy.TenantId && x.ConversationId == id).OrderByDescending(x => x.CreatedAtUtc).ToList());
    }

    [HttpPost("typing")]
    public async Task<IActionResult> Typing([FromBody] TypingEventRequest req, CancellationToken ct)
    {
        if (!rbac.HasPermission(InboxWrite)) return Forbid();
        await hub.Clients.Group($"tenant:{tenancy.TenantSlug}").SendAsync("conversation.typing", new { req.ConversationId, user = auth.Email, req.IsTyping }, ct);
        return Ok();
    }

    [HttpGet("sla")]
    public IActionResult Sla([FromQuery] int thresholdMinutes = 15)
    {
        if (!rbac.HasPermission(InboxRead)) return Forbid();
        var threshold = DateTime.UtcNow.AddMinutes(-Math.Abs(thresholdMinutes));
        var breached = db.Conversations
            .Where(x => x.TenantId == tenancy.TenantId && x.Status == "Open" && x.LastMessageAtUtc <= threshold)
            .OrderBy(x => x.LastMessageAtUtc)
            .ToList();
        return Ok(new { thresholdMinutes = Math.Abs(thresholdMinutes), breachedCount = breached.Count, items = breached });
    }
}
