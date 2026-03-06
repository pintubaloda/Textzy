using System.Net;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Textzy.Api.Data;
using Textzy.Api.DTOs;
using Textzy.Api.Models;
using Textzy.Api.Services;

namespace Textzy.Api.Controllers;

[ApiController]
[Route("api/public/messages")]
public class PublicMessagesController(
    ControlDbContext controlDb,
    SecretCryptoService crypto,
    TenancyContext tenancy,
    MessagingService messaging) : ControllerBase
{
    [HttpGet("send")]
    public async Task<IActionResult> SendByQuery(CancellationToken ct)
    {
        var q = Request.Query;
        var req = new PublicSendRequest
        {
            Recipient = q["recipient"].FirstOrDefault() ?? string.Empty,
            Message = q["msg"].FirstOrDefault() ?? q["message"].FirstOrDefault() ?? string.Empty,
            User = q["user"].FirstOrDefault() ?? string.Empty,
            Password = q["pswd"].FirstOrDefault() ?? q["password"].FirstOrDefault() ?? string.Empty,
            ApiKey = q["apikey"].FirstOrDefault() ?? q["apiKey"].FirstOrDefault() ?? string.Empty,
            TenantSlug = q["tenantSlug"].FirstOrDefault() ?? string.Empty,
            Channel = q["channel"].FirstOrDefault() ?? "sms",
            Sender = q["sender"].FirstOrDefault() ?? q["senderid"].FirstOrDefault() ?? string.Empty,
            PeId = q["PE_ID"].FirstOrDefault() ?? q["peid"].FirstOrDefault() ?? q["entityid"].FirstOrDefault() ?? string.Empty,
            TemplateId = q["Template_ID"].FirstOrDefault() ?? q["templateid"].FirstOrDefault() ?? string.Empty,
            IdempotencyKey = q["idempotencyKey"].FirstOrDefault() ?? string.Empty
        };
        return await SendCore(req, ct);
    }

    [HttpPost("send")]
    public async Task<IActionResult> SendByPost([FromBody] PublicSendRequest request, CancellationToken ct)
    {
        return await SendCore(request, ct);
    }

    private async Task<IActionResult> SendCore(PublicSendRequest request, CancellationToken ct)
    {
        if (!tenancy.IsSet)
            return BadRequest("tenantSlug (or user) query parameter is required.");

        if (!IsHttpsRequest(HttpContext))
            return StatusCode(StatusCodes.Status403Forbidden, "HTTPS is required.");

        var settingsRows = await controlDb.PlatformSettings
            .AsNoTracking()
            .Where(x => x.Scope == "api-integration")
            .ToListAsync(ct);
        var settings = settingsRows.ToDictionary(x => x.Key, x => crypto.Decrypt(x.ValueEncrypted), StringComparer.OrdinalIgnoreCase);

        var enabled = ParseBool(GetValue(settings, "enabled", "false"), false);
        if (!enabled)
            return StatusCode(StatusCodes.Status403Forbidden, "Public API integration is disabled.");

        var expectedUser = GetValue(settings, "apiUsername", GetValue(settings, "apiUser", string.Empty)).Trim();
        var expectedPassword = GetValue(settings, "apiPassword", string.Empty).Trim();
        var expectedApiKey = GetValue(settings, "apiKey", string.Empty).Trim();

        if (string.IsNullOrWhiteSpace(expectedUser) || string.IsNullOrWhiteSpace(expectedPassword) || string.IsNullOrWhiteSpace(expectedApiKey))
            return StatusCode(StatusCodes.Status503ServiceUnavailable, "Public API credentials are not configured.");

        var providedUser = (request.User ?? string.Empty).Trim();
        var providedPassword = (request.Password ?? string.Empty).Trim();
        var providedApiKey = (request.ApiKey ?? string.Empty).Trim();

        if (!SecureEquals(providedUser, expectedUser) ||
            !SecureEquals(providedPassword, expectedPassword) ||
            !SecureEquals(providedApiKey, expectedApiKey))
        {
            return Unauthorized("Invalid API credentials.");
        }

        var ipWhitelist = GetValue(settings, "ipWhitelist", string.Empty);
        if (!IsIpAllowed(HttpContext.Connection.RemoteIpAddress, ipWhitelist))
            return StatusCode(StatusCodes.Status403Forbidden, "Client IP not allowed.");

        var recipient = (request.Recipient ?? string.Empty).Trim();
        var message = (request.Message ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(recipient)) return BadRequest("recipient is required.");
        if (string.IsNullOrWhiteSpace(message)) return BadRequest("msg is required.");

        var channel = ParseChannel(request.Channel);
        if (channel == ChannelType.Sms)
        {
            var sender = (request.Sender ?? string.Empty).Trim();
            var peId = (request.PeId ?? string.Empty).Trim();
            var templateId = (request.TemplateId ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(sender)) return BadRequest("sender is required for SMS DLT.");
            if (string.IsNullOrWhiteSpace(peId)) return BadRequest("PE_ID is required for SMS DLT.");
            if (string.IsNullOrWhiteSpace(templateId)) return BadRequest("Template_ID is required for SMS DLT.");
        }
        var idempotency = string.IsNullOrWhiteSpace(request.IdempotencyKey)
            ? $"public-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}-{Guid.NewGuid():N}"[..48]
            : request.IdempotencyKey.Trim();

        try
        {
            var queued = await messaging.EnqueueAsync(new SendMessageRequest
            {
                IdempotencyKey = idempotency,
                Recipient = recipient,
                Body = message,
                Channel = channel
            }, ct);

            return Ok(new
            {
                ok = true,
                tenantSlug = tenancy.TenantSlug,
                messageId = queued.Id,
                status = queued.Status,
                channel = queued.Channel.ToString()
            });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    private static string GetValue(Dictionary<string, string> map, string key, string fallback)
    {
        return map.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value)
            ? value
            : fallback;
    }

    private static bool ParseBool(string raw, bool fallback)
    {
        return bool.TryParse(raw, out var parsed) ? parsed : fallback;
    }

    private static ChannelType ParseChannel(string? raw)
    {
        var normalized = (raw ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            "whatsapp" or "wa" or "waba" => ChannelType.WhatsApp,
            _ => ChannelType.Sms
        };
    }

    private static bool IsHttpsRequest(HttpContext context)
    {
        if (context.Request.IsHttps) return true;
        var xfProto = context.Request.Headers["X-Forwarded-Proto"].FirstOrDefault();
        return string.Equals(xfProto, "https", StringComparison.OrdinalIgnoreCase);
    }

    private static bool SecureEquals(string left, string right)
    {
        var a = Encoding.UTF8.GetBytes(left ?? string.Empty);
        var b = Encoding.UTF8.GetBytes(right ?? string.Empty);
        return a.Length == b.Length && CryptographicOperations.FixedTimeEquals(a, b);
    }

    private static bool IsIpAllowed(IPAddress? remoteIp, string rawWhitelist)
    {
        if (string.IsNullOrWhiteSpace(rawWhitelist)) return true;
        if (remoteIp is null) return false;

        var ip = remoteIp.IsIPv4MappedToIPv6 ? remoteIp.MapToIPv4() : remoteIp;
        var rules = rawWhitelist.Split(new[] { ',', ';', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        foreach (var rule in rules)
        {
            if (string.IsNullOrWhiteSpace(rule)) continue;
            if (string.Equals(rule, "*", StringComparison.Ordinal)) return true;
            if (TryMatchCidr(ip, rule)) return true;

            if (IPAddress.TryParse(rule, out var allowed))
            {
                var normalizedAllowed = allowed.IsIPv4MappedToIPv6 ? allowed.MapToIPv4() : allowed;
                if (normalizedAllowed.Equals(ip)) return true;
            }
        }

        return false;
    }

    private static bool TryMatchCidr(IPAddress ip, string cidr)
    {
        var parts = cidr.Split('/');
        if (parts.Length != 2) return false;
        if (!IPAddress.TryParse(parts[0], out var baseIp)) return false;
        if (!int.TryParse(parts[1], out var prefixLength)) return false;

        var ipBytes = (ip.IsIPv4MappedToIPv6 ? ip.MapToIPv4() : ip).GetAddressBytes();
        var baseBytes = (baseIp.IsIPv4MappedToIPv6 ? baseIp.MapToIPv4() : baseIp).GetAddressBytes();
        if (ipBytes.Length != baseBytes.Length) return false;

        var bits = ipBytes.Length * 8;
        if (prefixLength < 0 || prefixLength > bits) return false;

        var fullBytes = prefixLength / 8;
        var remainingBits = prefixLength % 8;

        for (var i = 0; i < fullBytes; i++)
        {
            if (ipBytes[i] != baseBytes[i]) return false;
        }

        if (remainingBits == 0) return true;
        var mask = (byte)(0xFF << (8 - remainingBits));
        return (ipBytes[fullBytes] & mask) == (baseBytes[fullBytes] & mask);
    }

    public sealed class PublicSendRequest
    {
        public string Recipient { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
        public string User { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
        public string ApiKey { get; set; } = string.Empty;
        public string TenantSlug { get; set; } = string.Empty;
        public string Channel { get; set; } = "sms";
        public string Sender { get; set; } = string.Empty;
        public string PeId { get; set; } = string.Empty;
        public string TemplateId { get; set; } = string.Empty;
        public string IdempotencyKey { get; set; } = string.Empty;
    }
}
