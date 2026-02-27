using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Textzy.Api.Data;
using Textzy.Api.Models;
using Textzy.Api.Services;

namespace Textzy.Api.Controllers;

[ApiController]
[Route("api/settings")]
public class SettingsController(
    ControlDbContext db,
    AuthContext auth,
    TenancyContext tenancy) : ControllerBase
{
    [HttpGet("company")]
    public async Task<IActionResult> GetCompany(CancellationToken ct)
    {
        if (!auth.IsAuthenticated || !tenancy.IsSet) return Unauthorized();

        var tenant = await db.Tenants.FirstOrDefaultAsync(t => t.Id == tenancy.TenantId, ct);
        if (tenant is null) return NotFound("Tenant not found.");

        var ownerGroupId = await EnsureOwnerGroupAsync(tenant, auth.UserId, ct);
        var profile = await db.TenantCompanyProfiles.FirstOrDefaultAsync(x => x.TenantId == tenant.Id, ct);
        if (profile is null)
        {
            profile = new TenantCompanyProfile
            {
                Id = Guid.NewGuid(),
                TenantId = tenant.Id,
                OwnerGroupId = ownerGroupId,
                CompanyName = tenant.Name,
                LegalName = tenant.Name,
                BillingEmail = auth.Email ?? string.Empty,
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            };
            db.TenantCompanyProfiles.Add(profile);
            await db.SaveChangesAsync(ct);
        }

        return Ok(Map(profile));
    }

    [HttpPut("company")]
    public async Task<IActionResult> UpsertCompany([FromBody] UpsertCompanyProfileRequest request, CancellationToken ct)
    {
        if (!auth.IsAuthenticated || !tenancy.IsSet) return Unauthorized();

        var tenant = await db.Tenants.FirstOrDefaultAsync(t => t.Id == tenancy.TenantId, ct);
        if (tenant is null) return NotFound("Tenant not found.");

        var ownerGroupId = await EnsureOwnerGroupAsync(tenant, auth.UserId, ct);
        var now = DateTime.UtcNow;
        var profile = await db.TenantCompanyProfiles.FirstOrDefaultAsync(x => x.TenantId == tenant.Id, ct);
        if (profile is null)
        {
            profile = new TenantCompanyProfile
            {
                Id = Guid.NewGuid(),
                TenantId = tenant.Id,
                CreatedAtUtc = now
            };
            db.TenantCompanyProfiles.Add(profile);
        }

        profile.OwnerGroupId = ownerGroupId;
        profile.CompanyName = (request.CompanyName ?? string.Empty).Trim();
        profile.LegalName = (request.LegalName ?? string.Empty).Trim();
        profile.Industry = (request.Industry ?? string.Empty).Trim();
        profile.Website = (request.Website ?? string.Empty).Trim();
        profile.CompanySize = (request.CompanySize ?? string.Empty).Trim();
        profile.Gstin = (request.Gstin ?? string.Empty).Trim();
        profile.Pan = (request.Pan ?? string.Empty).Trim();
        profile.Address = (request.Address ?? string.Empty).Trim();
        profile.BillingEmail = InputGuardService.ValidateEmailOrEmpty(request.BillingEmail, "Billing email");
        profile.BillingPhone = (request.BillingPhone ?? string.Empty).Trim();
        profile.IsActive = request.IsActive;
        profile.UpdatedAtUtc = now;

        if (string.IsNullOrWhiteSpace(profile.CompanyName))
            return BadRequest("Company name is required.");
        if (profile.CompanyName.Length > 256)
            return BadRequest("Company name is too long.");
        if (!string.IsNullOrWhiteSpace(profile.Website) && profile.Website.Length > 512)
            return BadRequest("Website is too long.");
        if (profile.Address.Length > 2048)
            return BadRequest("Address is too long.");

        await db.SaveChangesAsync(ct);
        return Ok(Map(profile));
    }

    private async Task<Guid> EnsureOwnerGroupAsync(Tenant tenant, Guid actorUserId, CancellationToken ct)
    {
        if (tenant.OwnerGroupId.HasValue) return tenant.OwnerGroupId.Value;

        var ownerUserId = await db.TenantUsers
            .Where(x => x.TenantId == tenant.Id && x.Role.ToLower() == "owner")
            .OrderBy(x => x.CreatedAtUtc)
            .Select(x => x.UserId)
            .FirstOrDefaultAsync(ct);
        if (ownerUserId == Guid.Empty) ownerUserId = actorUserId;

        var existing = await db.TenantOwnerGroups
            .Where(g => g.OwnerUserId == ownerUserId && g.IsActive)
            .OrderBy(g => g.CreatedAtUtc)
            .FirstOrDefaultAsync(ct);

        if (existing is null)
        {
            existing = new TenantOwnerGroup
            {
                Id = Guid.NewGuid(),
                OwnerUserId = ownerUserId,
                Name = $"{tenant.Name} Group",
                IsActive = true,
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            };
            db.TenantOwnerGroups.Add(existing);
        }

        tenant.OwnerGroupId = existing.Id;
        await db.SaveChangesAsync(ct);
        return existing.Id;
    }

    private static object Map(TenantCompanyProfile p) => new
    {
        p.TenantId,
        p.OwnerGroupId,
        p.CompanyName,
        p.LegalName,
        p.Industry,
        p.Website,
        p.CompanySize,
        p.Gstin,
        p.Pan,
        p.Address,
        p.BillingEmail,
        p.BillingPhone,
        p.IsActive,
        p.UpdatedAtUtc
    };

    public sealed class UpsertCompanyProfileRequest
    {
        public string CompanyName { get; set; } = string.Empty;
        public string LegalName { get; set; } = string.Empty;
        public string Industry { get; set; } = string.Empty;
        public string Website { get; set; } = string.Empty;
        public string CompanySize { get; set; } = string.Empty;
        public string Gstin { get; set; } = string.Empty;
        public string Pan { get; set; } = string.Empty;
        public string Address { get; set; } = string.Empty;
        public string BillingEmail { get; set; } = string.Empty;
        public string BillingPhone { get; set; } = string.Empty;
        public bool IsActive { get; set; } = true;
    }
}
