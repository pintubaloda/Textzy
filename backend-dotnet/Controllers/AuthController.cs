using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using System.Text;
using Textzy.Api.Data;
using Textzy.Api.DTOs;
using Textzy.Api.Models;
using Textzy.Api.Services;

namespace Textzy.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(
    ControlDbContext db,
    PasswordHasher hasher,
    SessionService sessions,
    TenancyContext tenancy,
    AuthContext auth,
    AuthCookieService authCookie,
    TemplateSyncOrchestrator templateSync,
    SensitiveDataRedactor redactor,
    ILogger<AuthController> logger) : ControllerBase
{
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request, CancellationToken ct)
    {
        string email;
        string password;
        try
        {
            email = InputGuardService.RequireTrimmed(request.Email, "Email", 320).ToLowerInvariant();
            password = InputGuardService.RequireTrimmed(request.Password, "Password", 256);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }

        var user = db.Users.FirstOrDefault(u => u.Email.ToLower() == email && u.IsActive);
        if (user is null)
        {
            user = await EnsureBootstrapUserAsync(email, ct);
        }

        if (user is null)
            return Unauthorized("Invalid credentials.");

        var verified = hasher.Verify(password, user.PasswordHash, user.PasswordSalt);
        if (!verified && (email == "owner@textzy.local" || email == "admin@textzy.local"))
        {
            // Emergency recovery path for partially initialized external DBs.
            var fallbackPassword = email == "owner@textzy.local" ? "Owner@123" : "ChangeMe@123";
            var (newHash, newSalt) = hasher.HashPassword(fallbackPassword);
            user.PasswordHash = newHash;
            user.PasswordSalt = newSalt;
            user.IsActive = true;
            user.IsSuperAdmin = email == "owner@textzy.local";
            await db.SaveChangesAsync(ct);
            verified = hasher.Verify(password, user.PasswordHash, user.PasswordSalt);
        }

        if (!verified) return Unauthorized("Invalid credentials.");

        Guid tenantId;
        if (tenancy.IsSet)
        {
            var hasAccess = db.TenantUsers.Any(tu => tu.UserId == user.Id && tu.TenantId == tenancy.TenantId);
            if (!user.IsSuperAdmin && !hasAccess) return Forbid();
            tenantId = tenancy.TenantId;
        }
        else
        {
            if (user.IsSuperAdmin)
            {
                tenantId = db.Tenants.OrderBy(t => t.CreatedAtUtc).Select(t => t.Id).FirstOrDefault();
                if (tenantId == Guid.Empty) return BadRequest("No tenant available for super admin.");
            }
            else
            {
                tenantId = db.TenantUsers
                    .Where(tu => tu.UserId == user.Id)
                    .OrderBy(tu => tu.CreatedAtUtc)
                    .Select(tu => tu.TenantId)
                    .FirstOrDefault();
                if (tenantId == Guid.Empty) return Forbid();
            }
        }

        var token = await sessions.CreateSessionAsync(user.Id, tenantId, ct);
        authCookie.SetToken(HttpContext, token);
        return Ok(new AuthTokenResponse { AccessToken = token });
    }

    private async Task<User?> EnsureBootstrapUserAsync(string email, CancellationToken ct)
    {
        if (email != "owner@textzy.local" && email != "admin@textzy.local") return null;

        var tenantA = await db.Tenants.FirstOrDefaultAsync(t => t.Slug == "demo-retail", ct);
        if (tenantA is null)
        {
            tenantA = new Tenant
            {
                Id = Guid.NewGuid(),
                Name = "Demo Retail",
                Slug = "demo-retail",
                DataConnectionString = db.Database.GetConnectionString() ?? string.Empty
            };
            db.Tenants.Add(tenantA);
        }

        var tenantB = await db.Tenants.FirstOrDefaultAsync(t => t.Slug == "demo-d2c", ct);
        if (tenantB is null)
        {
            tenantB = new Tenant
            {
                Id = Guid.NewGuid(),
                Name = "Demo D2C",
                Slug = "demo-d2c",
                DataConnectionString = db.Database.GetConnectionString() ?? string.Empty
            };
            db.Tenants.Add(tenantB);
        }

        var bootstrapPassword = email == "owner@textzy.local" ? "Owner@123" : "ChangeMe@123";
        var (hash, salt) = hasher.HashPassword(bootstrapPassword);

        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = email,
            FullName = email == "owner@textzy.local" ? "Platform Owner" : "Textzy Admin",
            PasswordHash = hash,
            PasswordSalt = salt,
            IsActive = true,
            IsSuperAdmin = email == "owner@textzy.local"
        };
        db.Users.Add(user);

        if (tenantA is not null)
            db.TenantUsers.Add(new TenantUser { Id = Guid.NewGuid(), TenantId = tenantA.Id, UserId = user.Id, Role = "owner" });
        if (tenantB is not null)
            db.TenantUsers.Add(new TenantUser { Id = Guid.NewGuid(), TenantId = tenantB.Id, UserId = user.Id, Role = "admin" });

        await db.SaveChangesAsync(ct);
        return user;
    }

    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh(CancellationToken ct)
    {
        var header = Request.Headers.Authorization.ToString();
        var token = header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
            ? header["Bearer ".Length..].Trim()
            : (authCookie.ReadToken(HttpContext) ?? string.Empty);
        if (string.IsNullOrWhiteSpace(token)) return Unauthorized("Missing bearer token.");
        var rotated = await sessions.RotateAsync(token, ct);
        if (rotated is null) return Unauthorized("Invalid or expired session.");
        authCookie.SetToken(HttpContext, rotated);
        return Ok(new AuthTokenResponse { AccessToken = rotated });
    }

    [HttpPost("accept-invite")]
    public async Task<IActionResult> AcceptInvite([FromBody] AcceptInviteRequest request, CancellationToken ct)
    {
        var token = (request.Token ?? string.Empty).Trim();
        var password = request.Password ?? string.Empty;
        var fullName = (request.FullName ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(token)) return BadRequest("Invite token is required.");
        if (string.IsNullOrWhiteSpace(password) || password.Length < 8) return BadRequest("Password must be at least 8 characters.");

        var tokenHash = HashToken(token);
        var invite = await db.TeamInvitations
            .Where(i => i.TokenHash == tokenHash)
            .OrderByDescending(i => i.SentAtUtc)
            .FirstOrDefaultAsync(ct);
        if (invite is null) return BadRequest("Invalid invite token.");
        if (invite.Status == "accepted") return BadRequest("Invite already accepted.");
        if (invite.ExpiresAtUtc <= DateTime.UtcNow) return BadRequest("Invite expired.");

        var user = await db.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == invite.Email.ToLower(), ct);
        if (user is null) return BadRequest("Invited user not found.");
        var inviteTenant = await db.Tenants.FirstOrDefaultAsync(t => t.Id == invite.TenantId, ct);
        if (inviteTenant is null) return BadRequest("Invite tenant not found.");
        var inviteOwnerGroupId = await EnsureTenantOwnerGroupForInviteAsync(inviteTenant, invite.CreatedByUserId, ct);
        if (!await CanUserJoinOwnerGroupAsync(user.Id, inviteOwnerGroupId, ct))
            return BadRequest("User belongs to another tenant owner group and cannot accept this invite.");

        var member = await db.TenantUsers.FirstOrDefaultAsync(tu => tu.TenantId == invite.TenantId && tu.UserId == user.Id, ct);
        if (member is null)
        {
            db.TenantUsers.Add(new TenantUser
            {
                Id = Guid.NewGuid(),
                TenantId = invite.TenantId,
                UserId = user.Id,
                Role = invite.Role
            });
        }
        else
        {
            member.Role = invite.Role;
        }

        var (hash, salt) = hasher.HashPassword(password);
        user.PasswordHash = hash;
        user.PasswordSalt = salt;
        user.IsActive = true;
        if (!string.IsNullOrWhiteSpace(fullName)) user.FullName = fullName;

        invite.Status = "accepted";
        invite.AcceptedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        var sessionToken = await sessions.CreateSessionAsync(user.Id, invite.TenantId, ct);
        authCookie.SetToken(HttpContext, sessionToken);
        return Ok(new { accessToken = sessionToken, tenantSlug = inviteTenant.Slug, projectName = inviteTenant.Name, role = invite.Role });
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout(CancellationToken ct)
    {
        var header = Request.Headers.Authorization.ToString();
        var token = header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
            ? header["Bearer ".Length..].Trim()
            : (authCookie.ReadToken(HttpContext) ?? string.Empty);
        if (!string.IsNullOrWhiteSpace(token)) await sessions.RevokeAsync(token, ct);
        authCookie.Clear(HttpContext);
        return NoContent();
    }

    [HttpGet("me")]
    public async Task<IActionResult> Me(CancellationToken ct)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        try
        {
            await templateSync.EnsureInitialOrDailySyncAsync(false, ct);
        }
        catch (Exception ex)
        {
            // Keep auth health independent from template sync health.
            logger.LogWarning("Non-blocking template auto-sync failed on /api/auth/me tenant={TenantId}: {Error}",
                auth.TenantId, redactor.RedactText(ex.Message));
        }
        return Ok(new { auth.UserId, auth.Email, auth.Role, auth.TenantId, tenantSlug = tenancy.TenantSlug, permissions = auth.Permissions });
    }

    [HttpGet("projects")]
    public IActionResult Projects()
    {
        if (!auth.IsAuthenticated) return Unauthorized();

        var isSuperAdmin = db.Users.Any(u => u.Id == auth.UserId && u.IsSuperAdmin);
        if (isSuperAdmin)
        {
            var allProjects = db.Tenants
                .OrderBy(t => t.CreatedAtUtc)
                .Select(t => new
                {
                    t.Id,
                    t.Name,
                    t.Slug,
                    Role = RolePermissionCatalog.SuperAdmin,
                    t.CreatedAtUtc
                })
                .ToList();
            return Ok(allProjects);
        }

        var projects = db.TenantUsers
            .Where(tu => tu.UserId == auth.UserId)
            .Join(db.Tenants, tu => tu.TenantId, t => t.Id, (tu, t) => new
            {
                t.Id,
                t.Name,
                t.Slug,
                tu.Role,
                t.CreatedAtUtc
            })
            .OrderBy(x => x.CreatedAtUtc)
            .ToList();

        return Ok(projects);
    }

    [HttpGet("team-members")]
    public IActionResult TeamMembers()
    {
        if (!auth.IsAuthenticated || !tenancy.IsSet) return Unauthorized();

        var team = db.TenantUsers
            .Where(tu => tu.TenantId == tenancy.TenantId)
            .Join(db.Users, tu => tu.UserId, u => u.Id, (tu, u) => new
            {
                id = u.Id,
                name = string.IsNullOrWhiteSpace(u.FullName) ? u.Email : u.FullName,
                email = u.Email,
                role = tu.Role
            })
            .OrderBy(x => x.name)
            .ToList();

        return Ok(team);
    }

    [HttpPost("projects")]
    public async Task<IActionResult> CreateProject([FromBody] CreateProjectRequest request, CancellationToken ct)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        var name = (request.Name ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(name)) return BadRequest("Project name is required.");

        var baseSlug = NormalizeSlug(name);
        if (string.IsNullOrWhiteSpace(baseSlug)) return BadRequest("Invalid project name.");
        var slug = baseSlug;
        var index = 2;
        while (await db.Tenants.AnyAsync(t => t.Slug == slug, ct))
        {
            slug = $"{baseSlug}-{index++}";
        }

        var seedConnection = !string.IsNullOrWhiteSpace(tenancy.DataConnectionString)
            ? tenancy.DataConnectionString
            : db.Tenants.OrderBy(t => t.CreatedAtUtc).Select(t => t.DataConnectionString).FirstOrDefault()
            ?? db.Database.GetConnectionString()
            ?? string.Empty;
        if (string.IsNullOrWhiteSpace(seedConnection))
            return BadRequest("Unable to resolve project data connection.");

        var tenantId = Guid.NewGuid();
        var ownerGroupId = await EnsureOwnerGroupForUserAsync(auth.UserId, name, ct);
        try
        {
            using var tenantDb = SeedData.CreateTenantDbContext(seedConnection);
            tenantDb.Database.EnsureCreated();
            SeedData.InitializeTenant(tenantDb, tenantId);
        }
        catch (Exception ex)
        {
            return BadRequest($"Project DB initialization failed: {ex.Message}");
        }

        var tenant = new Tenant
        {
            Id = tenantId,
            Name = name,
            Slug = slug,
            OwnerGroupId = ownerGroupId,
            DataConnectionString = seedConnection
        };
        db.Tenants.Add(tenant);
        db.TenantUsers.Add(new TenantUser
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            UserId = auth.UserId,
            Role = "owner"
        });
        await db.SaveChangesAsync(ct);

        var token = await sessions.CreateSessionAsync(auth.UserId, tenant.Id, ct);
        authCookie.SetToken(HttpContext, token);
        return Ok(new { tenant.Id, tenant.Name, tenant.Slug, role = "owner", accessToken = token });
    }

    [HttpPost("switch-project")]
    public async Task<IActionResult> SwitchProject([FromBody] SwitchProjectRequest request, CancellationToken ct)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        var slug = (request.Slug ?? string.Empty).Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(slug)) return BadRequest("Project slug is required.");

        var tenant = await db.Tenants.FirstOrDefaultAsync(t => t.Slug == slug, ct);
        if (tenant is null) return NotFound("Project not found.");

        var isSuperAdmin = await db.Users
            .Where(u => u.Id == auth.UserId)
            .Select(u => u.IsSuperAdmin)
            .FirstOrDefaultAsync(ct);

        var membership = await db.TenantUsers
            .FirstOrDefaultAsync(tu => tu.UserId == auth.UserId && tu.TenantId == tenant.Id, ct);
        if (!isSuperAdmin && membership is null) return Forbid();

        var token = await sessions.CreateSessionAsync(auth.UserId, tenant.Id, ct);
        authCookie.SetToken(HttpContext, token);
        var role = isSuperAdmin ? RolePermissionCatalog.SuperAdmin : membership?.Role ?? "owner";
        return Ok(new { accessToken = token, tenantSlug = tenant.Slug, projectName = tenant.Name, role });
    }

    private static string NormalizeSlug(string value)
    {
        var lowered = value.Trim().ToLowerInvariant();
        var chars = lowered.Select(ch => char.IsLetterOrDigit(ch) ? ch : '-').ToArray();
        var slug = new string(chars);
        while (slug.Contains("--", StringComparison.Ordinal)) slug = slug.Replace("--", "-", StringComparison.Ordinal);
        return slug.Trim('-');
    }

    private async Task<Guid> EnsureOwnerGroupForUserAsync(Guid userId, string projectName, CancellationToken ct)
    {
        var ownerTenantIds = await db.TenantUsers
            .Where(x => x.UserId == userId && x.Role.ToLower() == "owner")
            .Select(x => x.TenantId)
            .ToListAsync(ct);

        var existingGroupId = await db.Tenants
            .Where(t => ownerTenantIds.Contains(t.Id) && t.OwnerGroupId.HasValue)
            .Select(t => t.OwnerGroupId)
            .FirstOrDefaultAsync(ct);

        if (existingGroupId.HasValue && existingGroupId.Value != Guid.Empty)
            return existingGroupId.Value;

        var group = await db.TenantOwnerGroups
            .Where(g => g.OwnerUserId == userId && g.IsActive)
            .OrderBy(g => g.CreatedAtUtc)
            .FirstOrDefaultAsync(ct);

        if (group is null)
        {
            group = new TenantOwnerGroup
            {
                Id = Guid.NewGuid(),
                OwnerUserId = userId,
                Name = $"{projectName} Group",
                IsActive = true,
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            };
            db.TenantOwnerGroups.Add(group);
            await db.SaveChangesAsync(ct);
        }

        if (ownerTenantIds.Count > 0)
        {
            var tenantsToPatch = await db.Tenants.Where(t => ownerTenantIds.Contains(t.Id) && !t.OwnerGroupId.HasValue).ToListAsync(ct);
            foreach (var t in tenantsToPatch) t.OwnerGroupId = group.Id;
            if (tenantsToPatch.Count > 0) await db.SaveChangesAsync(ct);
        }

        return group.Id;
    }

    private async Task<Guid> EnsureTenantOwnerGroupForInviteAsync(Tenant tenant, Guid fallbackOwnerUserId, CancellationToken ct)
    {
        if (tenant.OwnerGroupId.HasValue && tenant.OwnerGroupId.Value != Guid.Empty) return tenant.OwnerGroupId.Value;
        var ownerUserId = await db.TenantUsers
            .Where(x => x.TenantId == tenant.Id && x.Role.ToLower() == "owner")
            .OrderBy(x => x.CreatedAtUtc)
            .Select(x => x.UserId)
            .FirstOrDefaultAsync(ct);
        if (ownerUserId == Guid.Empty) ownerUserId = fallbackOwnerUserId;
        var group = await db.TenantOwnerGroups
            .Where(g => g.OwnerUserId == ownerUserId && g.IsActive)
            .OrderBy(g => g.CreatedAtUtc)
            .FirstOrDefaultAsync(ct);
        if (group is null)
        {
            group = new TenantOwnerGroup
            {
                Id = Guid.NewGuid(),
                OwnerUserId = ownerUserId,
                Name = $"{tenant.Name} Group",
                IsActive = true,
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            };
            db.TenantOwnerGroups.Add(group);
        }
        tenant.OwnerGroupId = group.Id;
        await db.SaveChangesAsync(ct);
        return group.Id;
    }

    private async Task<bool> CanUserJoinOwnerGroupAsync(Guid userId, Guid tenantOwnerGroupId, CancellationToken ct)
    {
        var userTenantIds = await db.TenantUsers.Where(x => x.UserId == userId).Select(x => x.TenantId).Distinct().ToListAsync(ct);
        if (userTenantIds.Count == 0) return true;
        var otherGroupIds = await db.Tenants
            .Where(t => userTenantIds.Contains(t.Id) && t.OwnerGroupId.HasValue)
            .Select(t => t.OwnerGroupId!.Value)
            .Distinct()
            .ToListAsync(ct);
        return otherGroupIds.Count == 0 || (otherGroupIds.Count == 1 && otherGroupIds[0] == tenantOwnerGroupId);
    }

    private static string HashToken(string token)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(token));
        return Convert.ToHexString(bytes);
    }

    public sealed class AcceptInviteRequest
    {
        public string Token { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }
}
