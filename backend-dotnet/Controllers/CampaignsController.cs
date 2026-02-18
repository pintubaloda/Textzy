using Microsoft.AspNetCore.Mvc;
using Textzy.Api.Data;
using Textzy.Api.Models;
using Textzy.Api.Services;
using static Textzy.Api.Services.PermissionCatalog;

namespace Textzy.Api.Controllers;

[ApiController]
[Route("api/campaigns")]
public class CampaignsController(TenantDbContext db, TenancyContext tenancy, RbacService rbac) : ControllerBase
{
    [HttpGet]
    public IActionResult List()
    {
        if (!rbac.HasPermission(CampaignsRead)) return Forbid();

        var campaigns = db.Campaigns
            .Where(c => c.TenantId == tenancy.TenantId)
            .Select(c => new { c.Id, c.Name, c.Channel, c.TemplateText, c.CreatedAtUtc })
            .ToList();

        return Ok(campaigns);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Campaign request, CancellationToken ct)
    {
        if (!rbac.HasPermission(CampaignsWrite)) return Forbid();
        var item = new Campaign
        {
            Id = Guid.NewGuid(),
            TenantId = tenancy.TenantId,
            Name = request.Name,
            Channel = request.Channel,
            TemplateText = request.TemplateText
        };
        db.Campaigns.Add(item);
        await db.SaveChangesAsync(ct);
        return Ok(item);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] Campaign request, CancellationToken ct)
    {
        if (!rbac.HasPermission(CampaignsWrite)) return Forbid();
        var item = db.Campaigns.FirstOrDefault(x => x.Id == id && x.TenantId == tenancy.TenantId);
        if (item is null) return NotFound();
        item.Name = request.Name;
        item.Channel = request.Channel;
        item.TemplateText = request.TemplateText;
        await db.SaveChangesAsync(ct);
        return Ok(item);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        if (!rbac.HasPermission(CampaignsWrite)) return Forbid();
        var item = db.Campaigns.FirstOrDefault(x => x.Id == id && x.TenantId == tenancy.TenantId);
        if (item is null) return NotFound();
        db.Campaigns.Remove(item);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}
