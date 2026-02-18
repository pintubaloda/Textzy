using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Textzy.Api.Data;
using Textzy.Api.DTOs;
using Textzy.Api.Models;

namespace Textzy.Api.Services;

public class WhatsAppCloudService(
    TenantDbContext tenantDb,
    TenancyContext tenancy,
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    ILogger<WhatsAppCloudService> logger)
{
    private readonly WhatsAppOptions _options = configuration.GetSection("WhatsApp").Get<WhatsAppOptions>() ?? new WhatsAppOptions();

    private sealed class DiscoveredWabaAsset
    {
        public string WabaId { get; init; } = string.Empty;
        public string WabaName { get; init; } = string.Empty;
        public string PhoneNumberId { get; init; } = string.Empty;
        public string DisplayPhoneNumber { get; init; } = string.Empty;
    }

    public async Task<object> DebugProbeAsync(string accessToken, CancellationToken ct = default)
    {
        var steps = new List<object>();

        var meUrl = $"{_options.GraphApiBase}/{_options.ApiVersion}/me?fields=id,name,whatsapp_business_accounts{{id,name,phone_numbers{{id,display_phone_number,verified_name}}}}";
        var me = await GraphGetRawAsync(meUrl, accessToken, ct);
        steps.Add(new { step = "me_with_waba", me.StatusCode, me.Ok, me.Body });

        var businessesUrl = $"{_options.GraphApiBase}/{_options.ApiVersion}/me/businesses?fields=id,name";
        var businesses = await GraphGetRawAsync(businessesUrl, accessToken, ct);
        steps.Add(new { step = "me_businesses", businesses.StatusCode, businesses.Ok, businesses.Body });

        return new { steps };
    }

    public async Task<object> DebugTenantProbeAsync(CancellationToken ct = default)
    {
        var cfg = await GetTenantConfigAsync(ct);
        if (cfg is null || string.IsNullOrWhiteSpace(cfg.AccessToken))
        {
            return new { connected = false, reason = "No active tenant WABA config/token found." };
        }

        var probe = await DebugProbeAsync(cfg.AccessToken, ct);
        return new
        {
            connected = cfg.IsActive,
            cfg.WabaId,
            cfg.PhoneNumberId,
            cfg.BusinessAccountName,
            cfg.DisplayPhoneNumber,
            graph = probe
        };
    }

    public async Task<TenantWabaConfig?> GetTenantConfigAsync(CancellationToken ct = default)
        => await tenantDb.Set<TenantWabaConfig>().FirstOrDefaultAsync(x => x.TenantId == tenancy.TenantId && x.IsActive, ct);

    public bool VerifyWebhookSignature(string body, string signatureHeader)
    {
        if (string.IsNullOrWhiteSpace(_options.AppSecret) || string.IsNullOrWhiteSpace(signatureHeader)) return false;
        const string prefix = "sha256=";
        if (!signatureHeader.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return false;

        var expected = signatureHeader[prefix.Length..].Trim();
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(_options.AppSecret));
        var computed = Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes(body))).ToLowerInvariant();
        return CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(computed));
    }

    public async Task HandleWebhookAsync(string jsonBody, CancellationToken ct = default)
    {
        using var doc = JsonDocument.Parse(jsonBody);
        if (!doc.RootElement.TryGetProperty("entry", out var entries)) return;

        foreach (var entry in entries.EnumerateArray())
        {
            if (!entry.TryGetProperty("changes", out var changes)) continue;
            foreach (var change in changes.EnumerateArray())
            {
                if (!change.TryGetProperty("value", out var value)) continue;
                if (!value.TryGetProperty("messages", out var messages)) continue;

                foreach (var message in messages.EnumerateArray())
                {
                    if (!message.TryGetProperty("from", out var fromProp)) continue;
                    var from = fromProp.GetString() ?? string.Empty;
                    if (string.IsNullOrWhiteSpace(from)) continue;

                    var window = await tenantDb.Set<ConversationWindow>()
                        .FirstOrDefaultAsync(x => x.TenantId == tenancy.TenantId && x.Recipient == from, ct);

                    if (window is null)
                    {
                        window = new ConversationWindow
                        {
                            Id = Guid.NewGuid(),
                            TenantId = tenancy.TenantId,
                            Recipient = from,
                            LastInboundAtUtc = DateTime.UtcNow,
                            UpdatedAtUtc = DateTime.UtcNow
                        };
                        tenantDb.Set<ConversationWindow>().Add(window);
                    }
                    else
                    {
                        window.LastInboundAtUtc = DateTime.UtcNow;
                        window.UpdatedAtUtc = DateTime.UtcNow;
                    }
                }
            }
        }

        await tenantDb.SaveChangesAsync(ct);
    }

    public async Task<TenantWabaConfig> ExchangeEmbeddedCodeAsync(string code, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(code)) throw new InvalidOperationException("Code is required.");

        var accessToken = await ResolveAccessTokenAsync(code, ct);
        var discovered = await DiscoverWabaAssetsAsync(accessToken, ct)
            ?? throw new InvalidOperationException("Code exchange succeeded but WABA/phone discovery failed. Verify app scopes and embedded signup completion.");

        var config = await tenantDb.Set<TenantWabaConfig>().FirstOrDefaultAsync(x => x.TenantId == tenancy.TenantId, ct);
        if (config is null)
        {
            config = new TenantWabaConfig { Id = Guid.NewGuid(), TenantId = tenancy.TenantId };
            tenantDb.Set<TenantWabaConfig>().Add(config);
        }

        config.AccessToken = accessToken;
        config.IsActive = true;
        config.BusinessAccountName = discovered.WabaName;
        config.WabaId = discovered.WabaId;
        config.PhoneNumberId = discovered.PhoneNumberId;
        config.DisplayPhoneNumber = discovered.DisplayPhoneNumber;
        config.ConnectedAtUtc = DateTime.UtcNow;

        await tenantDb.SaveChangesAsync(ct);
        return config;
    }

    private async Task<string> ResolveAccessTokenAsync(string codeOrToken, CancellationToken ct)
    {
        if (codeOrToken.StartsWith("EA", StringComparison.OrdinalIgnoreCase)) return codeOrToken;
        if (string.IsNullOrWhiteSpace(_options.AppId) || string.IsNullOrWhiteSpace(_options.AppSecret))
            throw new InvalidOperationException("WhatsApp AppId/AppSecret missing.");

        var client = httpClientFactory.CreateClient();
        var tokenUrl = $"{_options.GraphApiBase}/{_options.ApiVersion}/oauth/access_token?client_id={Uri.EscapeDataString(_options.AppId)}&client_secret={Uri.EscapeDataString(_options.AppSecret)}&code={Uri.EscapeDataString(codeOrToken)}";
        var tokenResp = await client.GetAsync(tokenUrl, ct);
        var tokenPayload = await tokenResp.Content.ReadAsStringAsync(ct);
        if (!tokenResp.IsSuccessStatusCode)
        {
            logger.LogWarning("WABA code exchange failed: status={Status} body={Body}", (int)tokenResp.StatusCode, tokenPayload);
            throw new InvalidOperationException($"Failed to exchange embedded signup code. Graph status={(int)tokenResp.StatusCode} payload={tokenPayload}");
        }

        using var tokenDoc = JsonDocument.Parse(tokenPayload);
        var accessToken = tokenDoc.RootElement.TryGetProperty("access_token", out var at) ? at.GetString() ?? string.Empty : string.Empty;
        if (string.IsNullOrWhiteSpace(accessToken)) throw new InvalidOperationException("Missing access token in exchange response.");
        return accessToken;
    }

    private async Task<DiscoveredWabaAsset?> DiscoverWabaAssetsAsync(string accessToken, CancellationToken ct)
    {
        var meUrl = $"{_options.GraphApiBase}/{_options.ApiVersion}/me?fields=id,name,whatsapp_business_accounts{{id,name,phone_numbers{{id,display_phone_number,verified_name}}}}";
        var direct = await GraphGetAsync(meUrl, accessToken, ct);
        var fromDirect = ParseWabaAssetFromMe(direct);
        if (fromDirect is not null) return fromDirect;

        var businessesUrl = $"{_options.GraphApiBase}/{_options.ApiVersion}/me/businesses?fields=id,name";
        var businessesDoc = await GraphGetAsync(businessesUrl, accessToken, ct);
        var businessIds = ReadIdsFromDataArray(businessesDoc);

        foreach (var businessId in businessIds)
        {
            var ownedWabaUrl = $"{_options.GraphApiBase}/{_options.ApiVersion}/{businessId}/owned_whatsapp_business_accounts?fields=id,name";
            var ownedWabas = await GraphGetAsync(ownedWabaUrl, accessToken, ct);
            var wabas = ReadObjectsFromDataArray(ownedWabas);

            foreach (var waba in wabas)
            {
                var wabaId = TryGetString(waba, "id");
                if (string.IsNullOrWhiteSpace(wabaId)) continue;

                var wabaName = TryGetString(waba, "name");
                var phonesUrl = $"{_options.GraphApiBase}/{_options.ApiVersion}/{wabaId}/phone_numbers?fields=id,display_phone_number,verified_name";
                var phonesDoc = await GraphGetAsync(phonesUrl, accessToken, ct);
                var phones = ReadObjectsFromDataArray(phonesDoc);
                var phone = phones.FirstOrDefault();
                if (phone.ValueKind == JsonValueKind.Undefined) continue;

                var phoneId = TryGetString(phone, "id");
                if (string.IsNullOrWhiteSpace(phoneId)) continue;

                var display = TryGetString(phone, "display_phone_number");
                if (string.IsNullOrWhiteSpace(display)) display = TryGetString(phone, "verified_name");

                return new DiscoveredWabaAsset
                {
                    WabaId = wabaId,
                    WabaName = string.IsNullOrWhiteSpace(wabaName) ? "WhatsApp Business Account" : wabaName,
                    PhoneNumberId = phoneId,
                    DisplayPhoneNumber = string.IsNullOrWhiteSpace(display) ? "Unknown Number" : display
                };
            }
        }

        return null;
    }

    private static DiscoveredWabaAsset? ParseWabaAssetFromMe(JsonDocument? meDoc)
    {
        if (meDoc is null) return null;
        var root = meDoc.RootElement;
        if (!root.TryGetProperty("whatsapp_business_accounts", out var wabasNode)) return null;
        if (!wabasNode.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array) return null;

        foreach (var waba in data.EnumerateArray())
        {
            var wabaId = TryGetString(waba, "id");
            if (string.IsNullOrWhiteSpace(wabaId)) continue;
            var wabaName = TryGetString(waba, "name");
            if (!waba.TryGetProperty("phone_numbers", out var phonesNode) || !phonesNode.TryGetProperty("data", out var phonesData)) continue;

            foreach (var phone in phonesData.EnumerateArray())
            {
                var phoneId = TryGetString(phone, "id");
                if (string.IsNullOrWhiteSpace(phoneId)) continue;
                var display = TryGetString(phone, "display_phone_number");
                if (string.IsNullOrWhiteSpace(display)) display = TryGetString(phone, "verified_name");

                return new DiscoveredWabaAsset
                {
                    WabaId = wabaId,
                    WabaName = string.IsNullOrWhiteSpace(wabaName) ? "WhatsApp Business Account" : wabaName,
                    PhoneNumberId = phoneId,
                    DisplayPhoneNumber = string.IsNullOrWhiteSpace(display) ? "Unknown Number" : display
                };
            }
        }
        return null;
    }

    private async Task<(bool Ok, int StatusCode, string Body)> GraphGetRawAsync(string url, string accessToken, CancellationToken ct)
    {
        var client = httpClientFactory.CreateClient();
        using var req = new HttpRequestMessage(HttpMethod.Get, url);
        req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", accessToken);
        var resp = await client.SendAsync(req, ct);
        var body = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode)
            logger.LogWarning("Graph call failed: {Url} status={Status} body={Body}", url, (int)resp.StatusCode, body);
        return (resp.IsSuccessStatusCode, (int)resp.StatusCode, body);
    }

    private async Task<JsonDocument?> GraphGetAsync(string url, string accessToken, CancellationToken ct)
    {
        var raw = await GraphGetRawAsync(url, accessToken, ct);
        if (!raw.Ok || string.IsNullOrWhiteSpace(raw.Body)) return null;
        try { return JsonDocument.Parse(raw.Body); } catch { return null; }
    }

    private static List<string> ReadIdsFromDataArray(JsonDocument? doc)
    {
        var list = new List<string>();
        if (doc is null) return list;
        if (!doc.RootElement.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array) return list;
        foreach (var item in data.EnumerateArray())
        {
            var id = TryGetString(item, "id");
            if (!string.IsNullOrWhiteSpace(id)) list.Add(id);
        }
        return list;
    }

    private static List<JsonElement> ReadObjectsFromDataArray(JsonDocument? doc)
    {
        var list = new List<JsonElement>();
        if (doc is null) return list;
        if (!doc.RootElement.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array) return list;
        list.AddRange(data.EnumerateArray());
        return list;
    }

    private static string TryGetString(JsonElement element, string property)
        => element.TryGetProperty(property, out var v) ? v.GetString() ?? string.Empty : string.Empty;

    public async Task<string> SendSessionMessageAsync(string recipient, string body, CancellationToken ct = default)
    {
        var cfg = await GetTenantConfigAsync(ct) ?? throw new InvalidOperationException("WABA config not connected.");
        if (string.IsNullOrWhiteSpace(cfg.PhoneNumberId)) throw new InvalidOperationException("Phone number ID missing.");

        var client = httpClientFactory.CreateClient();
        var url = $"{_options.GraphApiBase}/{_options.ApiVersion}/{cfg.PhoneNumberId}/messages";
        var payload = JsonSerializer.Serialize(new { messaging_product = "whatsapp", to = recipient, type = "text", text = new { body } });

        using var req = new HttpRequestMessage(HttpMethod.Post, url) { Content = new StringContent(payload, Encoding.UTF8, "application/json") };
        req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", cfg.AccessToken);

        var resp = await client.SendAsync(req, ct);
        var responseBody = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode)
        {
            logger.LogWarning("WhatsApp session send failed: tenant={TenantId} status={Status} payload={Payload}", tenancy.TenantId, (int)resp.StatusCode, responseBody);
            throw new InvalidOperationException($"WhatsApp send failed ({(int)resp.StatusCode}): {responseBody}");
        }

        using var doc = JsonDocument.Parse(responseBody);
        return doc.RootElement.GetProperty("messages")[0].GetProperty("id").GetString() ?? $"wa_{Guid.NewGuid():N}";
    }

    public async Task<string> SendTemplateMessageAsync(WabaSendTemplateRequest request, CancellationToken ct = default)
    {
        var cfg = await GetTenantConfigAsync(ct) ?? throw new InvalidOperationException("WABA config not connected.");
        var client = httpClientFactory.CreateClient();
        var url = $"{_options.GraphApiBase}/{_options.ApiVersion}/{cfg.PhoneNumberId}/messages";

        var components = new[] { new { type = "body", parameters = request.BodyParameters.Select(x => new { type = "text", text = x }).ToArray() } };
        var payload = JsonSerializer.Serialize(new { messaging_product = "whatsapp", to = request.Recipient, type = "template", template = new { name = request.TemplateName, language = new { code = request.LanguageCode }, components } });

        using var req = new HttpRequestMessage(HttpMethod.Post, url) { Content = new StringContent(payload, Encoding.UTF8, "application/json") };
        req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", cfg.AccessToken);

        var resp = await client.SendAsync(req, ct);
        var responseBody = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode)
        {
            logger.LogWarning("WhatsApp template send failed: tenant={TenantId} status={Status} payload={Payload}", tenancy.TenantId, (int)resp.StatusCode, responseBody);
            throw new InvalidOperationException($"WhatsApp template send failed ({(int)resp.StatusCode}): {responseBody}");
        }

        using var doc = JsonDocument.Parse(responseBody);
        return doc.RootElement.GetProperty("messages")[0].GetProperty("id").GetString() ?? $"wa_tpl_{Guid.NewGuid():N}";
    }

    public async Task<bool> IsSessionWindowOpenAsync(string recipient, CancellationToken ct = default)
    {
        var window = await tenantDb.Set<ConversationWindow>().FirstOrDefaultAsync(x => x.TenantId == tenancy.TenantId && x.Recipient == recipient, ct);
        if (window is null) return false;
        return window.LastInboundAtUtc >= DateTime.UtcNow.AddHours(-24);
    }
}
