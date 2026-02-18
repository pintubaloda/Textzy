using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Textzy.Api.Data;
using Textzy.Api.Services;
using static Textzy.Api.Services.PermissionCatalog;

namespace Textzy.Api.Controllers;

[ApiController]
[Route("api/template-lifecycle")]
public class TemplateLifecycleController(TenantDbContext db, TenancyContext tenancy, RbacService rbac) : ControllerBase
{
    [HttpPost("{id:guid}/submit")]
    public async Task<IActionResult> Submit(Guid id, CancellationToken ct)
    {
        if (!rbac.HasPermission(TemplatesWrite)) return Forbid();
        var t = await db.Templates.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenancy.TenantId, ct);
        if (t is null) return NotFound();
        t.LifecycleStatus = "submitted";
        await db.SaveChangesAsync(ct);
        return Ok(t);
    }

    [HttpPost("{id:guid}/approve")]
    public async Task<IActionResult> Approve(Guid id, CancellationToken ct)
    {
        if (!rbac.HasPermission(TemplatesWrite)) return Forbid();
        var t = await db.Templates.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenancy.TenantId, ct);
        if (t is null) return NotFound();
        t.LifecycleStatus = "approved";
        await db.SaveChangesAsync(ct);
        return Ok(t);
    }

    [HttpPost("{id:guid}/reject")]
    public async Task<IActionResult> Reject(Guid id, CancellationToken ct)
    {
        if (!rbac.HasPermission(TemplatesWrite)) return Forbid();
        var t = await db.Templates.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenancy.TenantId, ct);
        if (t is null) return NotFound();
        t.LifecycleStatus = "rejected";
        await db.SaveChangesAsync(ct);
        return Ok(t);
    }

    [HttpPost("{id:guid}/disable")]
    public async Task<IActionResult> Disable(Guid id, CancellationToken ct)
    {
        if (!rbac.HasPermission(TemplatesWrite)) return Forbid();
        var t = await db.Templates.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenancy.TenantId, ct);
        if (t is null) return NotFound();
        t.LifecycleStatus = "disabled";
        await db.SaveChangesAsync(ct);
        return Ok(t);
    }

    [HttpPost("{id:guid}/version")]
    public async Task<IActionResult> NewVersion(Guid id, CancellationToken ct)
    {
        if (!rbac.HasPermission(TemplatesWrite)) return Forbid();
        var current = await db.Templates.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenancy.TenantId, ct);
        if (current is null) return NotFound();
        var next = new Textzy.Api.Models.Template
        {
            Id = Guid.NewGuid(),
            TenantId = current.TenantId,
            Name = current.Name,
            Channel = current.Channel,
            Category = current.Category,
            Language = current.Language,
            Body = current.Body,
            LifecycleStatus = "draft",
            Version = current.Version + 1,
            VariantGroup = string.IsNullOrWhiteSpace(current.VariantGroup) ? current.Name : current.VariantGroup,
            Status = current.Status
        };
        db.Templates.Add(next);
        await db.SaveChangesAsync(ct);
        return Ok(next);
    }
}
