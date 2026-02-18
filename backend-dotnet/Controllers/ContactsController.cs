using Microsoft.AspNetCore.Mvc;
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
        return Ok(db.Contacts.Where(x => x.TenantId == tenancy.TenantId).OrderByDescending(x => x.CreatedAtUtc).ToList());
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
            Phone = request.Phone,
            GroupId = request.GroupId
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
        item.Phone = request.Phone;
        item.GroupId = request.GroupId;
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
