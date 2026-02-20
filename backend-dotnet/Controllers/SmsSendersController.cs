using Microsoft.AspNetCore.Mvc;
using Textzy.Api.Data;
using Textzy.Api.Models;
using Textzy.Api.Services;
using static Textzy.Api.Services.PermissionCatalog;

namespace Textzy.Api.Controllers;

[ApiController]
[Route("api/sms/senders")]
[Route("api/sms/sender")]
public class SmsSendersController(TenantDbContext db, TenancyContext tenancy, RbacService rbac) : ControllerBase
{
    [HttpGet]
    public IActionResult List()
    {
        if (!rbac.HasPermission(TemplatesRead)) return Forbid();
        return Ok(db.SmsSenders.Where(x => x.TenantId == tenancy.TenantId && x.IsActive).OrderBy(x => x.SenderId).ToList());
    }

    public class UpsertSenderRequest
    {
        public string SenderId { get; set; } = string.Empty;
        public string EntityId { get; set; } = string.Empty;
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] UpsertSenderRequest request, CancellationToken ct)
    {
        if (!rbac.HasPermission(TemplatesWrite)) return Forbid();
        var sender = (request.SenderId ?? string.Empty).Trim().ToUpperInvariant();
        if (sender.Length is < 3 or > 6) return BadRequest("Sender ID must be 3-6 characters for India DLT.");
        if (string.IsNullOrWhiteSpace(request.EntityId)) return BadRequest("Entity ID is required.");

        var exists = db.SmsSenders.FirstOrDefault(x => x.TenantId == tenancy.TenantId && x.SenderId == sender && x.IsActive);
        if (exists is not null) return Ok(exists);

        var row = new SmsSender
        {
            Id = Guid.NewGuid(),
            TenantId = tenancy.TenantId,
            SenderId = sender,
            EntityId = request.EntityId.Trim(),
            IsActive = true,
            CreatedAtUtc = DateTime.UtcNow
        };
        db.SmsSenders.Add(row);
        await db.SaveChangesAsync(ct);
        return Ok(row);
    }
}
