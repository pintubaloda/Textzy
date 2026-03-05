using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Textzy.Api.Data;
using Textzy.Api.Models;
using Textzy.Api.Services;

namespace Textzy.Api.Providers;

public class TataSmsMessageProvider(
    IConfiguration config,
    ControlDbContext controlDb,
    SecretCryptoService crypto,
    IHttpClientFactory httpClientFactory,
    ILogger<TataSmsMessageProvider> logger) : IMessageProvider
{
    public async Task<string> SendAsync(ChannelType channel, string recipient, string body, SmsSendContext? context = null, CancellationToken ct = default)
    {
        if (channel != ChannelType.Sms)
            return $"mock_{channel.ToString().ToLowerInvariant()}_{Guid.NewGuid():N}";

        var platformProvider = await ResolvePlatformProviderAsync(ct);
        var provider = FirstNonEmpty(platformProvider, config["Sms:Provider"], "tata")!.Trim().ToLowerInvariant();
        if (provider != "tata")
            return $"mock_sms_{Guid.NewGuid():N}";

        var (baseUrl, username, password, defaultSender, defaultPeId, defaultTemplateId, timeoutMs) = await ResolveGatewayConfigAsync(ct);
        if (string.IsNullOrWhiteSpace(baseUrl) || string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
            throw new InvalidOperationException("SMS gateway credentials are missing. Configure Sms:Tata:* or platform scope sms-gateway.");

        var messageText = body ?? string.Empty;
        var sender = defaultSender;
        var peId = defaultPeId;
        var templateId = defaultTemplateId;

        if (context is not null &&
            context.TenantId != Guid.Empty &&
            string.Equals(context.MessageType, "template", StringComparison.OrdinalIgnoreCase))
        {
            var parsed = ParseTemplateBody(body ?? string.Empty);
            if (!string.IsNullOrWhiteSpace(parsed.TemplateName))
            {
                var tenant = await controlDb.Tenants.AsNoTracking().FirstOrDefaultAsync(x => x.Id == context.TenantId, ct);
                if (tenant is not null)
                {
                    using var tenantDb = SeedData.CreateTenantDbContext(tenant.DataConnectionString);
                    var tpl = await tenantDb.Templates
                        .AsNoTracking()
                        .Where(x => x.TenantId == context.TenantId && x.Channel == ChannelType.Sms && x.Name == parsed.TemplateName)
                        .OrderByDescending(x => x.CreatedAtUtc)
                        .FirstOrDefaultAsync(ct);

                    if (tpl is not null)
                    {
                        sender = string.IsNullOrWhiteSpace(tpl.SmsSenderId) ? sender : tpl.SmsSenderId;
                        peId = string.IsNullOrWhiteSpace(tpl.DltEntityId) ? peId : tpl.DltEntityId;
                        templateId = string.IsNullOrWhiteSpace(tpl.DltTemplateId) ? templateId : tpl.DltTemplateId;
                        messageText = RenderTemplate(tpl.Body, parsed.Parameters);
                    }
                }
            }
        }

        if (string.IsNullOrWhiteSpace(sender) || string.IsNullOrWhiteSpace(peId) || string.IsNullOrWhiteSpace(templateId))
            throw new InvalidOperationException("SMS send blocked: senderAddress / PE_ID / Template_ID is missing.");

        var query = new[]
        {
            $"recipient={Uri.EscapeDataString(recipient)}",
            "dr=false",
            $"msg={Uri.EscapeDataString(messageText)}",
            $"user={Uri.EscapeDataString(username)}",
            $"pswd={Uri.EscapeDataString(password)}",
            $"sender={Uri.EscapeDataString(sender)}",
            $"PE_ID={Uri.EscapeDataString(peId)}",
            $"Template_ID={Uri.EscapeDataString(templateId)}",
        };

        var url = $"{baseUrl.TrimEnd('?')}{(baseUrl.Contains('?') ? "&" : "?")}{string.Join("&", query)}";
        var http = httpClientFactory.CreateClient();
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(TimeSpan.FromMilliseconds(timeoutMs));
        using var req = new HttpRequestMessage(HttpMethod.Get, url);
        using var res = await http.SendAsync(req, cts.Token);
        var responseBody = await res.Content.ReadAsStringAsync(cts.Token);
        if (!res.IsSuccessStatusCode)
            throw new InvalidOperationException($"TATA SMS failed ({(int)res.StatusCode}): {responseBody}");

        var providerId = TryExtractProviderId(responseBody);
        logger.LogInformation("TATA SMS accepted recipient={Recipient} providerId={ProviderId}", recipient, providerId);
        return providerId;
    }

    private async Task<(string baseUrl, string username, string password, string sender, string peId, string templateId, int timeoutMs)> ResolveGatewayConfigAsync(CancellationToken ct)
    {
        var rows = await controlDb.PlatformSettings.AsNoTracking()
            .Where(x => x.Scope == "sms-gateway")
            .ToListAsync(ct);
        var settings = rows.ToDictionary(x => x.Key, x => SafeDecrypt(x.ValueEncrypted), StringComparer.OrdinalIgnoreCase);

        var baseUrl = FirstNonEmpty(settings.TryGetValue("tataBaseUrl", out var s1) ? s1 : null, config["Sms:Tata:BaseUrl"], "https://smsgw.tatatel.co.in:9095/campaignService/campaigns/qs");
        var username = FirstNonEmpty(settings.TryGetValue("tataUsername", out var s2) ? s2 : null, config["Sms:Tata:Username"]);
        var password = FirstNonEmpty(settings.TryGetValue("tataPassword", out var s3) ? s3 : null, config["Sms:Tata:Password"]);
        var sender = FirstNonEmpty(settings.TryGetValue("defaultSenderAddress", out var s4) ? s4 : null, config["Sms:Tata:SenderAddress"]);
        var peId = FirstNonEmpty(settings.TryGetValue("defaultPeId", out var s5) ? s5 : null, config["Sms:Tata:PeId"]);
        var templateId = FirstNonEmpty(settings.TryGetValue("defaultTemplateId", out var s6) ? s6 : null, config["Sms:Tata:TemplateId"]);
        var timeoutRaw = FirstNonEmpty(settings.TryGetValue("timeoutMs", out var s7) ? s7 : null, config["Sms:Tata:TimeoutMs"]);
        var timeoutMs = int.TryParse(timeoutRaw, out var parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 15000;

        return (baseUrl ?? string.Empty, username ?? string.Empty, password ?? string.Empty, sender ?? string.Empty, peId ?? string.Empty, templateId ?? string.Empty, timeoutMs);
    }

    private async Task<string?> ResolvePlatformProviderAsync(CancellationToken ct)
    {
        var providerRow = await controlDb.PlatformSettings.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Scope == "sms-gateway" && x.Key == "provider", ct);
        if (providerRow is null) return null;
        return SafeDecrypt(providerRow.ValueEncrypted);
    }

    private string SafeDecrypt(string input)
    {
        try { return crypto.Decrypt(input); } catch { return string.Empty; }
    }

    private static string? FirstNonEmpty(params string?[] values)
        => values.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v))?.Trim();

    private static (string TemplateName, List<string> Parameters) ParseTemplateBody(string body)
    {
        var parts = (body ?? string.Empty).Split('|', 3, StringSplitOptions.TrimEntries);
        if (parts.Length == 0) return (string.Empty, []);
        var templateName = (parts[0] ?? string.Empty).Trim();
        var parameters = new List<string>();
        if (parts.Length > 1 && !string.IsNullOrWhiteSpace(parts[1]))
            parameters = parts[1].Split(',', StringSplitOptions.None).Select(x => (x ?? string.Empty).Trim()).ToList();
        return (templateName, parameters);
    }

    private static string RenderTemplate(string templateBody, IReadOnlyList<string> parameters)
    {
        return Regex.Replace(templateBody ?? string.Empty, @"\{\{(\d+)\}\}", m =>
        {
            if (!int.TryParse(m.Groups[1].Value, out var idx) || idx <= 0) return m.Value;
            var pos = idx - 1;
            if (pos >= parameters.Count) return m.Value;
            return parameters[pos] ?? string.Empty;
        });
    }

    private static string TryExtractProviderId(string response)
    {
        if (string.IsNullOrWhiteSpace(response))
            return $"tata_{Guid.NewGuid():N}";
        var m = Regex.Match(response, @"(?i)(msgid|messageid|id)\s*[:=]\s*([A-Za-z0-9\-_]+)");
        if (m.Success) return $"tata_{m.Groups[2].Value}";
        return $"tata_{Guid.NewGuid():N}";
    }
}
