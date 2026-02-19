using System.Security.Cryptography;
using System.Text;
using Textzy.Api.Data;
using Textzy.Api.Models;

namespace Textzy.Api.Services;

public class SessionService(ControlDbContext db)
{
    private const int SessionHours = 12;

    public async Task<string> CreateSessionAsync(Guid userId, Guid tenantId, CancellationToken ct = default)
    {
        var tokenBytes = RandomNumberGenerator.GetBytes(32);
        var opaqueToken = Convert.ToBase64String(tokenBytes)
            .Replace('+', '-')
            .Replace('/', '_')
            .TrimEnd('=');

        var session = new SessionToken
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            TenantId = tenantId,
            TokenHash = HashToken(opaqueToken),
            ExpiresAtUtc = DateTime.UtcNow.AddHours(SessionHours)
        };

        db.SessionTokens.Add(session);
        await db.SaveChangesAsync(ct);
        return opaqueToken;
    }

    public SessionToken? Validate(string opaqueToken)
    {
        var hash = HashToken(opaqueToken);
        var now = DateTime.UtcNow;
        return db.SessionTokens.FirstOrDefault(s =>
            s.TokenHash == hash &&
            s.RevokedAtUtc == null &&
            s.ExpiresAtUtc > now);
    }

    public async Task RevokeAsync(string opaqueToken, CancellationToken ct = default)
    {
        var session = Validate(opaqueToken);
        if (session is null) return;
        session.RevokedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
    }

    public async Task<string?> RotateAsync(string opaqueToken, CancellationToken ct = default)
    {
        var session = Validate(opaqueToken);
        if (session is null) return null;

        session.RevokedAtUtc = DateTime.UtcNow;
        var newToken = await CreateSessionAsync(session.UserId, session.TenantId, ct);
        return newToken;
    }

    private static string HashToken(string opaqueToken)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(opaqueToken));
        return Convert.ToHexString(bytes);
    }
}
