using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
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
    SecretCryptoService crypto,
    TemplateSyncOrchestrator templateSync,
    SensitiveDataRedactor redactor,
    ILogger<AuthController> logger,
    IHttpClientFactory httpClientFactory) : ControllerBase
{
    private static readonly string[] DefaultAppApiCatalog =
    [
        "/api/auth/login",
        "/api/auth/refresh",
        "/api/auth/logout",
        "/api/auth/me",
        "/api/auth/projects",
        "/api/auth/switch-project",
        "/api/auth/app-bootstrap",
        "/api/auth/devices",
        "/api/auth/devices/pair-qr",
        "/api/public/mobile/pair/exchange",
        "/api/inbox/conversations",
        "/api/inbox/conversations/{id}/messages",
        "/api/inbox/conversations/{id}/assign",
        "/api/inbox/conversations/{id}/transfer",
        "/api/inbox/conversations/{id}/labels",
        "/api/inbox/conversations/{id}/notes",
        "/api/inbox/typing",
        "/api/inbox/sla",
        "/api/messages/send",
        "/api/messages/media/{mediaId}",
        "/hubs/inbox"
    ];

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
            return Unauthorized("Invalid credentials.");

        var verified = hasher.Verify(password, user.PasswordHash, user.PasswordSalt);
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
        authCookie.EnsureCsrfToken(HttpContext);
        WriteAuthHeaders(token);
        return Ok(new AuthTokenResponse { AccessToken = token });
    }

    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh(CancellationToken ct)
    {
        var header = Request.Headers.Authorization.ToString();
        var bearerToken = header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
            ? header["Bearer ".Length..].Trim()
            : string.Empty;
        var cookieToken = authCookie.ReadToken(HttpContext) ?? string.Empty;

        string? rotated = null;
        if (!string.IsNullOrWhiteSpace(bearerToken))
            rotated = await sessions.RotateAsync(bearerToken, ct);
        // Fallback to cookie token when bearer is stale/missing.
        if (rotated is null && !string.IsNullOrWhiteSpace(cookieToken))
            rotated = await sessions.RotateAsync(cookieToken, ct);

        if (rotated is null) return Unauthorized("Invalid or expired session.");
        authCookie.SetToken(HttpContext, rotated);
        authCookie.EnsureCsrfToken(HttpContext);
        WriteAuthHeaders(rotated);
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
        authCookie.EnsureCsrfToken(HttpContext);
        WriteAuthHeaders(sessionToken);
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
        authCookie.EnsureCsrfToken(HttpContext);
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

    [HttpGet("app-bootstrap")]
    public async Task<IActionResult> AppBootstrap(CancellationToken ct)
    {
        if (!auth.IsAuthenticated) return Unauthorized();

        var entries = await db.PlatformSettings
            .Where(x => x.Scope == "mobile-app")
            .ToListAsync(ct);
        var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var e in entries)
            values[e.Key] = crypto.Decrypt(e.ValueEncrypted);

        var appName = GetSetting(values, "appName", "Textzy");
        var baseDomain = GetSetting(values, "baseDomain", string.Empty);
        var apiBaseUrl = GetSetting(values, "apiBaseUrl", $"{Request.Scheme}://{Request.Host.Value}");
        var hubPath = GetSetting(values, "hubPath", "/hubs/inbox");
        var supportUrl = GetSetting(values, "supportUrl", string.Empty);
        var termsUrl = GetSetting(values, "termsUrl", string.Empty);
        var privacyUrl = GetSetting(values, "privacyUrl", string.Empty);
        var apiCatalog = ParseApiCatalog(values, DefaultAppApiCatalog);
        var allowedApiPrefixes = ParseAllowedPrefixes(values, apiCatalog);
        var enforceAllowList = ParseBool(GetSetting(values, "enforceApiAllowList", "false"));
        var maxDevicesPerUser = ParseInt(GetSetting(values, "maxDevicesPerUser", "3"), 3, 1, 20);
        var pairCodeTtlSeconds = ParseInt(GetSetting(values, "pairCodeTtlSeconds", "180"), 180, 60, 600);
        var minSupportedAppVersion = GetSetting(values, "minSupportedAppVersion", string.Empty);
        var pairSchemaVersion = GetSetting(values, "pairSchemaVersion", "1");

        return Ok(new
        {
            app = new
            {
                appName,
                baseDomain,
                apiBaseUrl,
                hubPath,
                supportUrl,
                termsUrl,
                privacyUrl,
                enforceApiAllowList = enforceAllowList,
                allowedApiPrefixes,
                apiCatalog,
                maxDevicesPerUser,
                pairCodeTtlSeconds,
                minSupportedAppVersion,
                pairSchemaVersion
            },
            auth = new
            {
                auth.UserId,
                auth.Email,
                auth.Role,
                auth.TenantId,
                tenantSlug = tenancy.TenantSlug,
                permissions = auth.Permissions
            }
        });
    }

    [HttpGet("devices")]
    public IActionResult ListConnectedDevices()
    {
        if (!auth.IsAuthenticated) return Unauthorized();

        var devices = db.UserMobileDevices
            .Where(x => x.UserId == auth.UserId && x.TenantId == auth.TenantId && x.RevokedAtUtc == null)
            .OrderByDescending(x => x.LastSeenAtUtc)
            .Select(x => new
            {
                x.Id,
                x.DeviceName,
                x.Platform,
                x.AppVersion,
                x.CreatedAtUtc,
                x.LastSeenAtUtc
            })
            .ToList();

        return Ok(devices);
    }

    [HttpDelete("devices/{deviceId:guid}")]
    public async Task<IActionResult> RemoveConnectedDevice([FromRoute] Guid deviceId, CancellationToken ct)
    {
        if (!auth.IsAuthenticated) return Unauthorized();

        var device = await db.UserMobileDevices
            .FirstOrDefaultAsync(x => x.Id == deviceId && x.UserId == auth.UserId && x.TenantId == auth.TenantId, ct);
        if (device is null) return NotFound("Device not found.");
        if (device.RevokedAtUtc is not null) return NoContent();

        device.RevokedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpPost("devices/pair-qr")]
    public async Task<IActionResult> CreatePairQr([FromBody] PairQrRequest request, CancellationToken ct)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        if (!IsSecureRequest()) return StatusCode(StatusCodes.Status400BadRequest, "HTTPS is required.");

        var settings = await ReadMobileAppSettingsAsync(ct);
        var maxDevicesPerUser = ParseInt(GetSetting(settings, "maxDevicesPerUser", "3"), 3, 1, 20);
        var pairCodeTtlSeconds = ParseInt(GetSetting(settings, "pairCodeTtlSeconds", "180"), 180, 60, 600);
        var pairSchemaVersion = GetSetting(settings, "pairSchemaVersion", "1");
        var minSupportedAppVersion = GetSetting(settings, "minSupportedAppVersion", string.Empty);
        var apiBaseUrl = GetSetting(settings, "apiBaseUrl", $"{Request.Scheme}://{Request.Host.Value}");

        var activeDeviceCount = await db.UserMobileDevices
            .CountAsync(x => x.UserId == auth.UserId && x.TenantId == auth.TenantId && x.RevokedAtUtc == null, ct);
        if (activeDeviceCount >= maxDevicesPerUser)
            return BadRequest($"Device limit reached ({maxDevicesPerUser}). Remove a device first.");

        var token = CreateOpaqueToken(32);
        var tokenHash = HashToken(token);
        var now = DateTime.UtcNow;
        var expiresAt = now.AddSeconds(pairCodeTtlSeconds);
        var tenantSlug = tenancy.TenantSlug ?? string.Empty;

        var payload = new PairingPayloadDto
        {
            V = pairSchemaVersion,
            Token = token,
            ApiBaseUrl = apiBaseUrl,
            TenantSlug = tenantSlug,
            IssuedAtUtc = now,
            ExpiresAtUtc = expiresAt,
            MinSupportedAppVersion = minSupportedAppVersion,
            BuildHint = (request.BuildHint ?? string.Empty).Trim()
        };
        var payloadJson = JsonSerializer.Serialize(payload);

        db.MobilePairingRequests.Add(new MobilePairingRequest
        {
            Id = Guid.NewGuid(),
            UserId = auth.UserId,
            TenantId = auth.TenantId,
            PairingTokenHash = tokenHash,
            PairingPayloadJson = payloadJson,
            CreatedAtUtc = now,
            ExpiresAtUtc = expiresAt
        });
        await db.SaveChangesAsync(ct);

        return Ok(new
        {
            qrPayload = payloadJson,
            pairingToken = token,
            expiresAtUtc = expiresAt,
            maxDevicesPerUser,
            activeDeviceCount
        });
    }

    [HttpGet("devices/pair-qr-image")]
    public async Task<IActionResult> GetPairQrImage([FromQuery] string pairingToken, CancellationToken ct)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        if (!IsSecureRequest()) return StatusCode(StatusCodes.Status400BadRequest, "HTTPS is required.");
        var token = (pairingToken ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(token)) return BadRequest("Pairing token is required.");

        var tokenHash = HashToken(token);
        var now = DateTime.UtcNow;
        var pair = await db.MobilePairingRequests
            .Where(x => x.PairingTokenHash == tokenHash)
            .OrderByDescending(x => x.CreatedAtUtc)
            .FirstOrDefaultAsync(ct);

        if (pair is null || pair.UserId != auth.UserId || pair.TenantId != auth.TenantId)
            return NotFound("Pair request not found.");
        if (pair.ConsumedAtUtc is not null || pair.ExpiresAtUtc <= now)
            return BadRequest("Pairing code expired or already used.");

        try
        {
            var encoded = Uri.EscapeDataString(pair.PairingPayloadJson);
            var qrUrl = $"https://api.qrserver.com/v1/create-qr-code/?size=320x320&ecc=M&data={encoded}";
            var client = httpClientFactory.CreateClient();
            var qrBytes = await client.GetByteArrayAsync(qrUrl, ct);
            var qrBase64 = Convert.ToBase64String(qrBytes);
            var logoPath = Path.Combine(AppContext.BaseDirectory, "Assets", "textzy-logo.png");
            if (!System.IO.File.Exists(logoPath))
                logoPath = Path.Combine(Directory.GetCurrentDirectory(), "Assets", "textzy-logo.png");
            var logoBase64 = System.IO.File.Exists(logoPath)
                ? Convert.ToBase64String(await System.IO.File.ReadAllBytesAsync(logoPath, ct))
                : string.Empty;
            var logoOverlay = string.IsNullOrWhiteSpace(logoBase64)
                ? string.Empty
                : $"<image x=\"39%\" y=\"39%\" width=\"22%\" height=\"22%\" href=\"data:image/png;base64,{logoBase64}\" preserveAspectRatio=\"xMidYMid meet\" />";
            var svg = $"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"320\" height=\"320\" viewBox=\"0 0 320 320\"><image x=\"0\" y=\"0\" width=\"320\" height=\"320\" href=\"data:image/png;base64,{qrBase64}\"/>{logoOverlay}</svg>";
            return Content(svg, "image/svg+xml; charset=utf-8");
        }
        catch (Exception ex)
        {
            logger.LogWarning("Failed to render QR image: {Error}", redactor.RedactText(ex.Message));
            return StatusCode(StatusCodes.Status503ServiceUnavailable, "QR image temporarily unavailable.");
        }
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
        authCookie.EnsureCsrfToken(HttpContext);
        WriteAuthHeaders(token);
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
        authCookie.SetToken(HttpContext, token);
        authCookie.EnsureCsrfToken(HttpContext);
        WriteAuthHeaders(token);
        var role = membership.Role;
        return Ok(new { accessToken = token, tenantSlug = tenant.Slug, projectName = tenant.Name, role });
    }

    private void WriteAuthHeaders(string token)
    {
        var csrf = authCookie.EnsureCsrfToken(HttpContext);
        Response.Headers["Authorization"] = $"Bearer {token}";
        Response.Headers["X-Access-Token"] = token;
        Response.Headers["X-CSRF-Token"] = csrf;
    }

    private static string NormalizeSlug(string value)
    {
        var lowered = value.Trim().ToLowerInvariant();
        var chars = lowered.Select(ch => char.IsLetterOrDigit(ch) ? ch : '-').ToArray();
        var slug = new string(chars);
        while (slug.Contains("--", StringComparison.Ordinal)) slug = slug.Replace("--", "-", StringComparison.Ordinal);
        return slug.Trim('-');
    }

    private static string GetSetting(Dictionary<string, string> values, string key, string fallback)
    {
        return values.TryGetValue(key, out var raw) && !string.IsNullOrWhiteSpace(raw)
            ? raw.Trim()
            : fallback;
    }

    private static string[] ParseApiCatalog(Dictionary<string, string> values, string[] fallback)
    {
        var raw = GetSetting(values, "apiCatalog", string.Empty);
        if (string.IsNullOrWhiteSpace(raw)) return fallback;

        var parsed = ParseStringArray(raw);
        return parsed.Length == 0 ? fallback : parsed;
    }

    private static string[] ParseAllowedPrefixes(Dictionary<string, string> values, string[] fallback)
    {
        var raw = GetSetting(values, "allowedApiPrefixes", string.Empty);
        if (string.IsNullOrWhiteSpace(raw)) return fallback;

        var parsed = ParseStringArray(raw);
        return parsed.Length == 0 ? fallback : parsed;
    }

    private static string[] ParseStringArray(string raw)
    {
        try
        {
            if (raw.TrimStart().StartsWith("[", StringComparison.Ordinal))
            {
                var fromJson = JsonSerializer.Deserialize<string[]>(raw);
                if (fromJson is not null)
                {
                    return fromJson
                        .Where(x => !string.IsNullOrWhiteSpace(x))
                        .Select(x => x.Trim())
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .ToArray();
                }
            }
        }
        catch
        {
            // fallback to csv/newline parsing
        }

        return raw
            .Split([',', '\n', '\r'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static bool ParseBool(string raw)
    {
        return bool.TryParse(raw, out var value) && value;
    }

    private async Task<Dictionary<string, string>> ReadMobileAppSettingsAsync(CancellationToken ct)
    {
        var entries = await db.PlatformSettings
            .Where(x => x.Scope == "mobile-app")
            .ToListAsync(ct);
        var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var e in entries)
            values[e.Key] = crypto.Decrypt(e.ValueEncrypted);
        return values;
    }

    private static int ParseInt(string raw, int fallback, int min, int max)
    {
        if (!int.TryParse(raw, out var value)) value = fallback;
        if (value < min) value = min;
        if (value > max) value = max;
        return value;
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

    private static string CreateOpaqueToken(int byteLength)
    {
        var tokenBytes = RandomNumberGenerator.GetBytes(byteLength);
        return Convert.ToBase64String(tokenBytes)
            .Replace('+', '-')
            .Replace('/', '_')
            .TrimEnd('=');
    }

    private bool IsSecureRequest()
    {
        if (Request.IsHttps) return true;
        if (string.Equals(Request.Headers["X-Forwarded-Proto"].FirstOrDefault(), "https", StringComparison.OrdinalIgnoreCase))
            return true;
        return false;
    }

    public sealed class AcceptInviteRequest
    {
        public string Token { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }

    public sealed class PairQrRequest
    {
        public string BuildHint { get; set; } = string.Empty;
    }

    public sealed class PairingPayloadDto
    {
        public string V { get; set; } = "1";
        public string Token { get; set; } = string.Empty;
        public string ApiBaseUrl { get; set; } = string.Empty;
        public string TenantSlug { get; set; } = string.Empty;
        public DateTime IssuedAtUtc { get; set; }
        public DateTime ExpiresAtUtc { get; set; }
        public string MinSupportedAppVersion { get; set; } = string.Empty;
        public string BuildHint { get; set; } = string.Empty;
    }
}
