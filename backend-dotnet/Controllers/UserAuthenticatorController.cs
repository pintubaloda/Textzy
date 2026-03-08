using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Textzy.Api.Data;
using Textzy.Api.Services;

namespace Textzy.Api.Controllers;

[ApiController]
[Route("api/security/authenticator")]
public class UserAuthenticatorController(
    ControlDbContext db,
    AuthContext auth,
    SecretCryptoService crypto) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetStatus(CancellationToken ct)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == auth.UserId, ct);
        if (user is null) return Unauthorized();

        return Ok(new
        {
            provider = string.IsNullOrWhiteSpace(user.AuthenticatorProvider) ? "" : user.AuthenticatorProvider,
            enabled = user.AuthenticatorEnabledAtUtc.HasValue,
            enrolledAtUtc = user.AuthenticatorEnabledAtUtc
        });
    }

    [HttpPost("setup")]
    public async Task<IActionResult> Setup([FromBody] SetupRequest request, CancellationToken ct)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        var user = await db.Users.FirstOrDefaultAsync(x => x.Id == auth.UserId && x.IsActive, ct);
        if (user is null) return Unauthorized();

        var provider = NormalizeProvider(request.Provider);
        if (provider.Length == 0) return BadRequest("provider must be google_authenticator or microsoft_authenticator.");

        var secret = GenerateBase32Secret();
        user.AuthenticatorSecretEncrypted = crypto.Encrypt(secret);
        user.AuthenticatorProvider = provider;
        user.AuthenticatorEnabledAtUtc = null;
        await db.SaveChangesAsync(ct);

        var issuer = "Textzy";
        var label = $"{issuer}:{user.Email}";
        var otpauth = $"otpauth://totp/{Uri.EscapeDataString(label)}?secret={Uri.EscapeDataString(secret)}&issuer={Uri.EscapeDataString(issuer)}&algorithm=SHA1&digits=6&period=30";
        var qrUrl = $"https://api.qrserver.com/v1/create-qr-code/?size=280x280&data={Uri.EscapeDataString(otpauth)}";

        return Ok(new
        {
            provider,
            enabled = false,
            otpauthUrl = otpauth,
            qrUrl,
            label = user.Email
        });
    }

    [HttpPost("verify")]
    public async Task<IActionResult> Verify([FromBody] VerifyRequest request, CancellationToken ct)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        var user = await db.Users.FirstOrDefaultAsync(x => x.Id == auth.UserId && x.IsActive, ct);
        if (user is null) return Unauthorized();
        if (string.IsNullOrWhiteSpace(user.AuthenticatorSecretEncrypted) || string.IsNullOrWhiteSpace(user.AuthenticatorProvider))
            return BadRequest("Authenticator setup is not initialized.");

        var secret = crypto.Decrypt(user.AuthenticatorSecretEncrypted);
        if (!VerifyTotp(secret, request.Code))
            return BadRequest("Invalid authenticator code.");

        user.AuthenticatorEnabledAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return Ok(new { ok = true, provider = user.AuthenticatorProvider, enabled = true, enrolledAtUtc = user.AuthenticatorEnabledAtUtc });
    }

    [HttpDelete]
    public async Task<IActionResult> Disable(CancellationToken ct)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        var user = await db.Users.FirstOrDefaultAsync(x => x.Id == auth.UserId && x.IsActive, ct);
        if (user is null) return Unauthorized();

        user.AuthenticatorSecretEncrypted = string.Empty;
        user.AuthenticatorProvider = string.Empty;
        user.AuthenticatorEnabledAtUtc = null;
        await db.SaveChangesAsync(ct);
        return Ok(new { ok = true });
    }

    private static string NormalizeProvider(string? provider)
    {
        var normalized = (provider ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            "google_authenticator" => "google_authenticator",
            "google-authenticator" => "google_authenticator",
            "microsoft_authenticator" => "microsoft_authenticator",
            "microsoft-authenticator" => "microsoft_authenticator",
            _ => string.Empty
        };
    }

    private static string GenerateBase32Secret()
    {
        Span<byte> bytes = stackalloc byte[20];
        RandomNumberGenerator.Fill(bytes);
        return Base32Encode(bytes);
    }

    private static bool VerifyTotp(string secret, string? code)
    {
        var normalizedCode = new string((code ?? string.Empty).Where(char.IsDigit).ToArray());
        if (normalizedCode.Length != 6) return false;

        var secretBytes = Base32Decode(secret);
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var step = now / 30;
        for (var offset = -1; offset <= 1; offset++)
        {
            var candidate = ComputeTotp(secretBytes, step + offset);
            if (candidate == normalizedCode) return true;
        }

        return false;
    }

    private static string ComputeTotp(byte[] secret, long timestep)
    {
        Span<byte> counter = stackalloc byte[8];
        for (var i = 7; i >= 0; i--)
        {
            counter[i] = (byte)(timestep & 0xff);
            timestep >>= 8;
        }

        using var hmac = new HMACSHA1(secret);
        var hash = hmac.ComputeHash(counter.ToArray());
        var offset = hash[^1] & 0x0f;
        var binary =
            ((hash[offset] & 0x7f) << 24) |
            ((hash[offset + 1] & 0xff) << 16) |
            ((hash[offset + 2] & 0xff) << 8) |
            (hash[offset + 3] & 0xff);
        return (binary % 1_000_000).ToString("D6");
    }

    private static string Base32Encode(ReadOnlySpan<byte> data)
    {
        const string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        var output = new StringBuilder((int)Math.Ceiling(data.Length / 5d) * 8);
        var buffer = 0;
        var bitsLeft = 0;
        foreach (var b in data)
        {
            buffer = (buffer << 8) | b;
            bitsLeft += 8;
            while (bitsLeft >= 5)
            {
                output.Append(alphabet[(buffer >> (bitsLeft - 5)) & 31]);
                bitsLeft -= 5;
            }
        }
        if (bitsLeft > 0)
            output.Append(alphabet[(buffer << (5 - bitsLeft)) & 31]);
        return output.ToString();
    }

    private static byte[] Base32Decode(string input)
    {
        const string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        var cleaned = new string((input ?? string.Empty).ToUpperInvariant().Where(c => !char.IsWhiteSpace(c) && c != '=').ToArray());
        var bytes = new List<byte>();
        var buffer = 0;
        var bitsLeft = 0;
        foreach (var c in cleaned)
        {
            var val = alphabet.IndexOf(c);
            if (val < 0) continue;
            buffer = (buffer << 5) | val;
            bitsLeft += 5;
            if (bitsLeft >= 8)
            {
                bytes.Add((byte)((buffer >> (bitsLeft - 8)) & 0xff));
                bitsLeft -= 8;
            }
        }
        return bytes.ToArray();
    }

    public sealed class SetupRequest
    {
        public string Provider { get; set; } = string.Empty;
    }

    public sealed class VerifyRequest
    {
        public string Code { get; set; } = string.Empty;
    }
}
