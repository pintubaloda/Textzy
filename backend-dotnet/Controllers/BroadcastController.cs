using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Textzy.Api.Data;
using Textzy.Api.DTOs;
using Textzy.Api.Models;
using Textzy.Api.Services;
using static Textzy.Api.Services.PermissionCatalog;

namespace Textzy.Api.Controllers;

[ApiController]
[Route("api/broadcasts")]
public class BroadcastController(
    TenantDbContext db,
    TenancyContext tenancy,
    BroadcastQueueService queue,
    RbacService rbac) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateBroadcastJobRequest req, CancellationToken ct)
    {
        if (!rbac.HasPermission(CampaignsWrite)) return Forbid();

        var recipients = req.Recipients.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        if (recipients.Count > 10000) return BadRequest("Broadcast recipient limit exceeded.");

        var job = new BroadcastJob
        {
            Id = Guid.NewGuid(),
            TenantId = tenancy.TenantId,
            Name = req.Name,
            Channel = req.Channel,
            MessageBody = req.MessageBody,
            RecipientCsv = string.Join(',', recipients),
            Status = "Queued"
        };

        db.BroadcastJobs.Add(job);
        await db.SaveChangesAsync(ct);
        await queue.EnqueueAsync(job, ct);
        return Ok(job);
    }

    [HttpGet]
    public IActionResult List()
    {
        if (!rbac.HasPermission(CampaignsRead)) return Forbid();
        return Ok(db.BroadcastJobs.Where(x => x.TenantId == tenancy.TenantId).OrderByDescending(x => x.CreatedAtUtc).ToList());
    }
}
