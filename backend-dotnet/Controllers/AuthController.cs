using Microsoft.AspNetCore.Mvc;
using Textzy.Api.Data;
using Textzy.Api.DTOs;
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
        if (!tenancy.IsSet) return BadRequest("Missing tenant context.");

        var user = db.Users.FirstOrDefault(u => u.Email == request.Email && u.IsActive);
        if (user is null || !hasher.Verify(request.Password, user.PasswordHash, user.PasswordSalt))
            return Unauthorized("Invalid credentials.");

        var hasAccess = db.TenantUsers.Any(tu => tu.UserId == user.Id && tu.TenantId == tenancy.TenantId);
        if (!user.IsSuperAdmin && !hasAccess) return Forbid();

        var token = await sessions.CreateSessionAsync(user.Id, tenancy.TenantId, ct);
        return Ok(new AuthTokenResponse { AccessToken = token });
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
        return Ok(new { auth.UserId, auth.Email, auth.Role, auth.TenantId, permissions = auth.Permissions });
    }
}
