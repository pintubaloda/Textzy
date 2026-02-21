using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Textzy.Api.Data;
using Textzy.Api.DTOs;
using Textzy.Api.Models;
using Textzy.Api.Services;
using static Textzy.Api.Services.PermissionCatalog;

namespace Textzy.Api.Controllers;

[ApiController]
[Route("api/contacts")]
public class ContactsController(TenantDbContext db, TenancyContext tenancy, RbacService rbac) : ControllerBase
{
    [HttpGet]
    public IActionResult List()
    {
        if (!rbac.HasPermission(ContactsRead)) return Forbid();
        var rows = (
            from c in db.Contacts
            join s in db.ContactSegments on c.SegmentId equals s.Id into seg
            from s in seg.DefaultIfEmpty()
            where c.TenantId == tenancy.TenantId
            orderby c.CreatedAtUtc descending
            select new
            {
                c.Id,
                c.TenantId,
                c.GroupId,
                c.SegmentId,
                Segment = s != null ? s.Name : null,
                c.Name,
                c.Email,
                c.TagsCsv,
                Tags = string.IsNullOrWhiteSpace(c.TagsCsv)
                    ? Array.Empty<string>()
                    : c.TagsCsv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
                c.Phone,
                c.OptInStatus,
                c.CreatedAtUtc
            }).ToList();
        return Ok(rows);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] UpsertContactRequest request, CancellationToken ct)
    {
        if (!rbac.HasPermission(ContactsWrite)) return Forbid();
        var item = new Contact
        {
            Id = Guid.NewGuid(),
            TenantId = tenancy.TenantId,
            Name = request.Name,
            Email = request.Email ?? string.Empty,
            TagsCsv = request.TagsCsv ?? string.Empty,
            Phone = request.Phone,
            GroupId = request.GroupId,
            SegmentId = request.SegmentId
        };
        db.Contacts.Add(item);
        await db.SaveChangesAsync(ct);
        return Ok(item);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpsertContactRequest request, CancellationToken ct)
    {
        if (!rbac.HasPermission(ContactsWrite)) return Forbid();
        var item = db.Contacts.FirstOrDefault(x => x.Id == id && x.TenantId == tenancy.TenantId);
        if (item is null) return NotFound();
        item.Name = request.Name;
        item.Email = request.Email ?? string.Empty;
        item.TagsCsv = request.TagsCsv ?? string.Empty;
        item.Phone = request.Phone;
        item.GroupId = request.GroupId;
        item.SegmentId = request.SegmentId;
        await db.SaveChangesAsync(ct);
        return Ok(item);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        if (!rbac.HasPermission(ContactsWrite)) return Forbid();
        var item = db.Contacts.FirstOrDefault(x => x.Id == id && x.TenantId == tenancy.TenantId);
        if (item is null) return NotFound();
        db.Contacts.Remove(item);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}
