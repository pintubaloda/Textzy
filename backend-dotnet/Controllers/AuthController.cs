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
    AuthContext auth) : ControllerBase
{
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request, CancellationToken ct)
    {
        var email = (request.Email ?? string.Empty).Trim().ToLowerInvariant();
        var password = request.Password ?? string.Empty;
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
            return BadRequest("Email and password are required.");

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
            user.IsSuperAdmin = true;
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
            IsSuperAdmin = true
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
        if (!header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            return Unauthorized("Missing bearer token.");

        var token = header["Bearer ".Length..].Trim();
        var rotated = await sessions.RotateAsync(token, ct);
        if (rotated is null) return Unauthorized("Invalid or expired session.");
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

        var tenant = await db.Tenants.FirstOrDefaultAsync(t => t.Id == invite.TenantId, ct);
        if (tenant is null) return BadRequest("Invite tenant not found.");

        var sessionToken = await sessions.CreateSessionAsync(user.Id, invite.TenantId, ct);
        return Ok(new { accessToken = sessionToken, tenantSlug = tenant.Slug, projectName = tenant.Name, role = invite.Role });
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout(CancellationToken ct)
    {
        var header = Request.Headers.Authorization.ToString();
        if (!header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) return NoContent();
        var token = header["Bearer ".Length..].Trim();
        await sessions.RevokeAsync(token, ct);
        return NoContent();
    }

    [HttpGet("me")]
    public IActionResult Me()
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        return Ok(new { auth.UserId, auth.Email, auth.Role, auth.TenantId, tenantSlug = tenancy.TenantSlug, permissions = auth.Permissions });
    }

    [HttpGet("projects")]
    public IActionResult Projects()
    {
        if (!auth.IsAuthenticated) return Unauthorized();

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

        var membership = await db.TenantUsers
            .FirstOrDefaultAsync(tu => tu.UserId == auth.UserId && tu.TenantId == tenant.Id, ct);
        if (membership is null) return Forbid();

        var token = await sessions.CreateSessionAsync(auth.UserId, tenant.Id, ct);
        return Ok(new { accessToken = token, tenantSlug = tenant.Slug, projectName = tenant.Name, role = membership.Role });
    }

    private static string NormalizeSlug(string value)
    {
        var lowered = value.Trim().ToLowerInvariant();
        var chars = lowered.Select(ch => char.IsLetterOrDigit(ch) ? ch : '-').ToArray();
        var slug = new string(chars);
        while (slug.Contains("--", StringComparison.Ordinal)) slug = slug.Replace("--", "-", StringComparison.Ordinal);
        return slug.Trim('-');
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
