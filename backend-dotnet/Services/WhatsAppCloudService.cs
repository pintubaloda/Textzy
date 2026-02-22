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
    ControlDbContext controlDb,
    TenancyContext tenancy,
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    SecretCryptoService crypto,
    WabaTenantResolver tenantResolver,
    ILogger<WhatsAppCloudService> logger)
{
    private readonly WhatsAppOptions _options = configuration.GetSection("WhatsApp").Get<WhatsAppOptions>() ?? new WhatsAppOptions();

    private sealed class DiscoveredWabaAsset
    {
        public string BusinessId { get; init; } = string.Empty;
        public string WabaId { get; init; } = string.Empty;
        public string WabaName { get; init; } = string.Empty;
        public string PhoneNumberId { get; init; } = string.Empty;
        public string DisplayPhoneNumber { get; init; } = string.Empty;
    }

    private sealed class SystemUserLifecycleResult
    {
        public string BusinessId { get; init; } = string.Empty;
        public string SystemUserId { get; init; } = string.Empty;
        public string SystemUserName { get; init; } = string.Empty;
        public DateTime? SystemUserCreatedAtUtc { get; init; }
        public DateTime? AssetsAssignedAtUtc { get; init; }
        public string AccessToken { get; init; } = string.Empty;
        public DateTime? TokenExpiresAtUtc { get; init; }
        public string TokenSource { get; init; } = "embedded_exchange";
        public List<string> Warnings { get; init; } = [];
    }

    private sealed class OnboardingAudit
    {
        public bool WebhookSubscribed { get; init; }
        public bool PermissionAuditPassed { get; init; }
        public string BusinessVerificationStatus { get; init; } = string.Empty;
        public string PhoneQualityRating { get; init; } = string.Empty;
        public string PhoneNameStatus { get; init; } = string.Empty;
        public List<string> Warnings { get; init; } = [];
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

        var probe = await DebugProbeAsync(UnprotectToken(cfg.AccessToken), ct);
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
        => await GetTenantConfigRowAsync(onlyActive: true, ct);

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

    public async Task<TenantWabaConfig> StartOnboardingAsync(CancellationToken ct = default)
    {
        var config = await GetOrCreateTenantConfigAsync(ct);

        config.OnboardingState = "requested";
        config.OnboardingStartedAtUtc = DateTime.UtcNow;
        config.LastError = string.Empty;
        await tenantDb.SaveChangesAsync(ct);
        return config;
    }

    public async Task<TenantWabaConfig> ExchangeEmbeddedCodeAsync(string code, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(code)) throw new InvalidOperationException("Code is required.");
        if (code.StartsWith("EA", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Strict embedded signup requires authorization code exchange. Direct access token payloads are not allowed.");

        var config = await GetOrCreateTenantConfigAsync(ct);

        config.OnboardingState = "code_received";
        config.CodeReceivedAtUtc = DateTime.UtcNow;
        config.LastError = string.Empty;
        await tenantDb.SaveChangesAsync(ct);

        var accessToken = await ResolveAccessTokenAsync(code, ct);
        var discovered = await DiscoverWabaAssetsAsync(accessToken, ct)
            ?? throw new InvalidOperationException("Code exchange succeeded but WABA/phone discovery failed. Verify app scopes and embedded signup completion.");
        var conflict = await FindTenantBindingConflictAsync(discovered.WabaId, discovered.PhoneNumberId, ct);
        if (conflict is not null)
        {
            throw new InvalidOperationException($"This WhatsApp account/number is already linked to another project ({conflict.Value.TenantName} / {conflict.Value.TenantSlug}). Use a different number or disconnect there first.");
        }

        var lifecycle = await ProvisionSystemUserAndPermanentTokenAsync(accessToken, discovered, ct);
        if (lifecycle.Warnings.Count > 0)
        {
            config.LastError = string.Join(" | ", lifecycle.Warnings);
        }

        var effectiveToken = string.IsNullOrWhiteSpace(lifecycle.AccessToken) ? accessToken : lifecycle.AccessToken;
        config.AccessToken = ProtectToken(effectiveToken);
        config.TokenSource = string.IsNullOrWhiteSpace(lifecycle.AccessToken) ? "embedded_exchange" : lifecycle.TokenSource;
        config.BusinessManagerId = lifecycle.BusinessId;
        config.SystemUserId = lifecycle.SystemUserId;
        config.SystemUserName = lifecycle.SystemUserName;
        config.SystemUserCreatedAtUtc = lifecycle.SystemUserCreatedAtUtc;
        config.AssetsAssignedAtUtc = lifecycle.AssetsAssignedAtUtc;
        config.PermanentTokenIssuedAtUtc = string.IsNullOrWhiteSpace(lifecycle.AccessToken) ? null : DateTime.UtcNow;
        config.PermanentTokenExpiresAtUtc = lifecycle.TokenExpiresAtUtc;
        config.IsActive = true;
        config.BusinessAccountName = discovered.WabaName;
        config.WabaId = discovered.WabaId;
        config.PhoneNumberId = discovered.PhoneNumberId;
        config.DisplayPhoneNumber = discovered.DisplayPhoneNumber;
        config.ConnectedAtUtc = DateTime.UtcNow;
        config.ExchangedAtUtc = DateTime.UtcNow;
        config.AssetsLinkedAtUtc = DateTime.UtcNow;
        config.OnboardingState = "assets_linked";

        var webhookOk = await EnsureWebhookSubscriptionAsync(config, effectiveToken, ct);
        config.WebhookSubscribedAtUtc = webhookOk ? DateTime.UtcNow : null;
        config.OnboardingState = webhookOk ? "webhook_subscribed" : "assets_linked";

        var audit = await RunPostOnboardingChecksAsync(config, effectiveToken, ct);
        config.PermissionAuditPassed = audit.PermissionAuditPassed;
        config.BusinessVerificationStatus = audit.BusinessVerificationStatus;
        config.PhoneQualityRating = audit.PhoneQualityRating;
        config.PhoneNameStatus = audit.PhoneNameStatus;
        if (audit.Warnings.Count > 0) config.LastError = string.Join(" | ", audit.Warnings);
        config.OnboardingState = webhookOk && audit.PermissionAuditPassed ? "ready" : config.OnboardingState;
        await tenantResolver.InvalidateAsync(config.PhoneNumberId, ct);

        await tenantDb.SaveChangesAsync(ct);
        return config;
    }

    public async Task<object> GetOnboardingStatusAsync(CancellationToken ct = default)
    {
        var config = await GetTenantConfigRowAsync(onlyActive: false, ct);
        if (config is null)
        {
            return new
            {
                state = "requested",
                isConnected = false,
                readyToSend = false,
                tenantId = tenancy.TenantId,
                tenantSlug = tenancy.TenantSlug
            };
        }

        if (!string.IsNullOrWhiteSpace(config.AccessToken) && !string.IsNullOrWhiteSpace(config.WabaId))
        {
            var token = UnprotectToken(config.AccessToken);
            var audit = await RunPostOnboardingChecksAsync(config, token, ct);
            config.PermissionAuditPassed = audit.PermissionAuditPassed;
            config.BusinessVerificationStatus = audit.BusinessVerificationStatus;
            config.PhoneQualityRating = audit.PhoneQualityRating;
            config.PhoneNameStatus = audit.PhoneNameStatus;
            if (audit.Warnings.Count > 0)
            {
                config.LastError = string.Join(" | ", audit.Warnings);
            }

            if (audit.WebhookSubscribed && config.WebhookSubscribedAtUtc is null)
                config.WebhookSubscribedAtUtc = DateTime.UtcNow;

            if (config.OnboardingState != "ready" && audit.WebhookSubscribed && audit.PermissionAuditPassed)
                config.OnboardingState = "ready";

            await tenantDb.SaveChangesAsync(ct);
        }

        var ready = config.IsActive
            && !string.IsNullOrWhiteSpace(config.WabaId)
            && !string.IsNullOrWhiteSpace(config.PhoneNumberId)
            && config.PermissionAuditPassed
            && config.WebhookSubscribedAtUtc.HasValue;

        return new
        {
            state = config.OnboardingState,
            isConnected = config.IsActive,
            readyToSend = ready,
            businessName = config.BusinessAccountName,
            phone = config.DisplayPhoneNumber,
            wabaId = config.WabaId,
            phoneNumberId = config.PhoneNumberId,
            businessManagerId = config.BusinessManagerId,
            systemUserId = config.SystemUserId,
            systemUserName = config.SystemUserName,
            tokenSource = config.TokenSource,
            permanentTokenIssuedAtUtc = config.PermanentTokenIssuedAtUtc,
            permanentTokenExpiresAtUtc = config.PermanentTokenExpiresAtUtc,
            businessVerificationStatus = config.BusinessVerificationStatus,
            phoneQualityRating = config.PhoneQualityRating,
            phoneNameStatus = config.PhoneNameStatus,
            permissionAuditPassed = config.PermissionAuditPassed,
            webhookSubscribed = config.WebhookSubscribedAtUtc.HasValue,
            timeline = new
            {
                requestedAtUtc = config.OnboardingStartedAtUtc,
                codeReceivedAtUtc = config.CodeReceivedAtUtc,
                exchangedAtUtc = config.ExchangedAtUtc,
                assetsLinkedAtUtc = config.AssetsLinkedAtUtc,
                webhookSubscribedAtUtc = config.WebhookSubscribedAtUtc,
                verifiedAtUtc = config.WebhookVerifiedAtUtc
            },
            lastError = config.LastError,
            lastGraphError = config.LastGraphError,
            tenantId = tenancy.TenantId,
            tenantSlug = tenancy.TenantSlug
        };
    }

    private async Task<string> ResolveAccessTokenAsync(string codeOrToken, CancellationToken ct)
    {
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

    public async Task MarkWebhookVerifiedAsync(string phoneNumberId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(phoneNumberId)) return;
        var cfg = await tenantDb.Set<TenantWabaConfig>()
            .FirstOrDefaultAsync(x => x.TenantId == tenancy.TenantId && x.PhoneNumberId == phoneNumberId, ct);
        if (cfg is null) return;
        cfg.WebhookVerifiedAtUtc = DateTime.UtcNow;
        if (cfg.OnboardingState != "ready" && cfg.WebhookSubscribedAtUtc.HasValue && cfg.PermissionAuditPassed)
            cfg.OnboardingState = "ready";
        await tenantDb.SaveChangesAsync(ct);
    }

    private async Task<bool> EnsureWebhookSubscriptionAsync(TenantWabaConfig config, string accessToken, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(config.WabaId) || string.IsNullOrWhiteSpace(accessToken)) return false;
        var url = $"{_options.GraphApiBase}/{_options.ApiVersion}/{config.WabaId}/subscribed_apps";
        var post = await GraphPostRawAsync(url, accessToken, null, ct);
        if (!post.Ok)
        {
            config.LastGraphError = post.Body;
            return false;
        }

        return true;
    }

    private async Task<OnboardingAudit> RunPostOnboardingChecksAsync(TenantWabaConfig config, string accessToken, CancellationToken ct)
    {
        var warnings = new List<string>();
        var businessVerificationStatus = string.Empty;
        var phoneQualityRating = string.Empty;
        var phoneNameStatus = string.Empty;
        var permissionAuditPassed = false;
        var webhookSubscribed = false;

        if (string.IsNullOrWhiteSpace(accessToken))
            return new OnboardingAudit { Warnings = ["Missing access token."] };

        if (!string.IsNullOrWhiteSpace(config.WabaId))
        {
            var wabaUrl = $"{_options.GraphApiBase}/{_options.ApiVersion}/{config.WabaId}?fields=id,name,account_review_status,business_verification_status";
            var waba = await GraphGetRawAsync(wabaUrl, accessToken, ct);
            if (waba.Ok && !string.IsNullOrWhiteSpace(waba.Body))
            {
                try
                {
                    using var wabaDoc = JsonDocument.Parse(waba.Body);
                    businessVerificationStatus = TryGetString(wabaDoc.RootElement, "business_verification_status");
                }
                catch
                {
                    warnings.Add("Unable to parse WABA verification status.");
                }
            }
            else
            {
                warnings.Add("Failed to fetch WABA status.");
                config.LastGraphError = waba.Body;
            }

            var subscribedUrl = $"{_options.GraphApiBase}/{_options.ApiVersion}/{config.WabaId}/subscribed_apps";
            var subscribed = await GraphGetRawAsync(subscribedUrl, accessToken, ct);
            webhookSubscribed = subscribed.Ok;
            if (!subscribed.Ok) warnings.Add("Webhook subscription check failed.");
        }

        if (!string.IsNullOrWhiteSpace(config.PhoneNumberId))
        {
            var phoneUrl = $"{_options.GraphApiBase}/{_options.ApiVersion}/{config.PhoneNumberId}?fields=id,verified_name,quality_rating,name_status";
            var phone = await GraphGetRawAsync(phoneUrl, accessToken, ct);
            if (phone.Ok && !string.IsNullOrWhiteSpace(phone.Body))
            {
                try
                {
                    using var phoneDoc = JsonDocument.Parse(phone.Body);
                    phoneQualityRating = TryGetString(phoneDoc.RootElement, "quality_rating");
                    phoneNameStatus = TryGetString(phoneDoc.RootElement, "name_status");
                }
                catch
                {
                    warnings.Add("Unable to parse phone quality/name status.");
                }
            }
            else
            {
                warnings.Add("Failed to fetch phone quality status.");
            }
        }

        var permsUrl = $"{_options.GraphApiBase}/{_options.ApiVersion}/me/permissions";
        var permsRaw = await GraphGetRawAsync(permsUrl, accessToken, ct);
        if (permsRaw.Ok && !string.IsNullOrWhiteSpace(permsRaw.Body))
        {
            permissionAuditPassed = permsRaw.Body.Contains("whatsapp_business_management", StringComparison.OrdinalIgnoreCase)
                && permsRaw.Body.Contains("whatsapp_business_messaging", StringComparison.OrdinalIgnoreCase)
                && permsRaw.Body.Contains("business_management", StringComparison.OrdinalIgnoreCase);
            if (!permissionAuditPassed) warnings.Add("Required scopes are missing.");
        }
        else
        {
            warnings.Add("Permissions audit failed.");
        }

        return new OnboardingAudit
        {
            WebhookSubscribed = webhookSubscribed,
            PermissionAuditPassed = permissionAuditPassed,
            BusinessVerificationStatus = businessVerificationStatus,
            PhoneQualityRating = phoneQualityRating,
            PhoneNameStatus = phoneNameStatus,
            Warnings = warnings
        };
    }

    private async Task<DiscoveredWabaAsset?> DiscoverWabaAssetsAsync(string accessToken, CancellationToken ct)
    {
        var meUrl = $"{_options.GraphApiBase}/{_options.ApiVersion}/me?fields=id,name,whatsapp_business_accounts{{id,name,phone_numbers{{id,display_phone_number,verified_name}}}}";
        var direct = await GraphGetAsync(meUrl, accessToken, ct);
        var fromDirect = ParseWabaAssetFromMe(direct);
        if (fromDirect is not null)
        {
            if (string.IsNullOrWhiteSpace(fromDirect.BusinessId))
            {
                var businessId = await FindBusinessForWabaAsync(accessToken, fromDirect.WabaId, ct);
                if (!string.IsNullOrWhiteSpace(businessId))
                {
                    fromDirect = new DiscoveredWabaAsset
                    {
                        BusinessId = businessId,
                        WabaId = fromDirect.WabaId,
                        WabaName = fromDirect.WabaName,
                        PhoneNumberId = fromDirect.PhoneNumberId,
                        DisplayPhoneNumber = fromDirect.DisplayPhoneNumber
                    };
                }
            }

            return fromDirect;
        }

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
                    BusinessId = businessId,
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

    private async Task<(bool Ok, int StatusCode, string Body)> GraphPostRawAsync(string url, string accessToken, string? payload, CancellationToken ct)
    {
        var client = httpClientFactory.CreateClient();
        using var req = new HttpRequestMessage(HttpMethod.Post, url);
        req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", accessToken);
        if (!string.IsNullOrWhiteSpace(payload))
            req.Content = new StringContent(payload, Encoding.UTF8, "application/json");
        var resp = await client.SendAsync(req, ct);
        var body = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode)
            logger.LogWarning("Graph POST failed: {Url} status={Status} body={Body}", url, (int)resp.StatusCode, body);
        return (resp.IsSuccessStatusCode, (int)resp.StatusCode, body);
    }

    private async Task<string> FindBusinessForWabaAsync(string accessToken, string wabaId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(wabaId)) return string.Empty;
        var businessesUrl = $"{_options.GraphApiBase}/{_options.ApiVersion}/me/businesses?fields=id,name";
        var businessesDoc = await GraphGetAsync(businessesUrl, accessToken, ct);
        var businessIds = ReadIdsFromDataArray(businessesDoc);
        foreach (var businessId in businessIds)
        {
            var ownedWabaUrl = $"{_options.GraphApiBase}/{_options.ApiVersion}/{businessId}/owned_whatsapp_business_accounts?fields=id";
            var ownedWabas = await GraphGetAsync(ownedWabaUrl, accessToken, ct);
            var wabas = ReadObjectsFromDataArray(ownedWabas);
            if (wabas.Any(x => string.Equals(TryGetString(x, "id"), wabaId, StringComparison.OrdinalIgnoreCase)))
                return businessId;
        }

        return string.Empty;
    }

    private async Task<SystemUserLifecycleResult> ProvisionSystemUserAndPermanentTokenAsync(string bootstrapToken, DiscoveredWabaAsset discovered, CancellationToken ct)
    {
        var warnings = new List<string>();
        var businessId = discovered.BusinessId;
        var systemUserId = string.Empty;
        var systemUserName = string.Empty;
        DateTime? systemUserCreatedAt = null;
        DateTime? assetsAssignedAt = null;
        string permanentToken = string.Empty;
        DateTime? tokenExpiresAt = null;

        if (string.IsNullOrWhiteSpace(businessId))
        {
            businessId = await FindBusinessForWabaAsync(bootstrapToken, discovered.WabaId, ct);
        }

        if (string.IsNullOrWhiteSpace(businessId))
        {
            warnings.Add("Business Manager ID could not be discovered; continuing with exchanged token.");
            return new SystemUserLifecycleResult
            {
                BusinessId = string.Empty,
                AccessToken = string.Empty,
                TokenSource = "embedded_exchange",
                Warnings = warnings
            };
        }

        var systemUserCreate = await CreateSystemUserAsync(bootstrapToken, businessId, ct);
        if (!string.IsNullOrWhiteSpace(systemUserCreate.SystemUserId))
        {
            systemUserId = systemUserCreate.SystemUserId;
            systemUserName = systemUserCreate.SystemUserName;
            systemUserCreatedAt = DateTime.UtcNow;
        }
        else
        {
            warnings.Add("System user creation failed; continuing with exchanged token.");
            if (!string.IsNullOrWhiteSpace(systemUserCreate.Error))
                warnings.Add($"system_user_error={systemUserCreate.Error}");
        }

        if (!string.IsNullOrWhiteSpace(systemUserId))
        {
            var assigned = await AssignSystemUserAssetsAsync(bootstrapToken, systemUserId, discovered.WabaId, discovered.PhoneNumberId, ct);
            if (assigned)
            {
                assetsAssignedAt = DateTime.UtcNow;
            }
            else
            {
                warnings.Add("System user asset assignment failed.");
            }

            var token = await GenerateSystemUserTokenAsync(bootstrapToken, systemUserId, ct);
            if (!string.IsNullOrWhiteSpace(token.AccessToken))
            {
                permanentToken = token.AccessToken;
                tokenExpiresAt = token.ExpiresAtUtc;
            }
            else
            {
                warnings.Add("Permanent system user token generation failed; continuing with exchanged token.");
                if (!string.IsNullOrWhiteSpace(token.Error))
                    warnings.Add($"system_token_error={token.Error}");
            }
        }

        return new SystemUserLifecycleResult
        {
            BusinessId = businessId,
            SystemUserId = systemUserId,
            SystemUserName = systemUserName,
            SystemUserCreatedAtUtc = systemUserCreatedAt,
            AssetsAssignedAtUtc = assetsAssignedAt,
            AccessToken = permanentToken,
            TokenExpiresAtUtc = tokenExpiresAt,
            TokenSource = string.IsNullOrWhiteSpace(permanentToken) ? "embedded_exchange" : "system_user_permanent",
            Warnings = warnings
        };
    }

    private async Task<(string SystemUserId, string SystemUserName, string Error)> CreateSystemUserAsync(string accessToken, string businessId, CancellationToken ct)
    {
        var slugPart = string.IsNullOrWhiteSpace(tenancy.TenantSlug) ? tenancy.TenantId.ToString("N")[..8] : tenancy.TenantSlug;
        var name = $"textzy-{slugPart}-{DateTime.UtcNow:yyyyMMddHHmmss}";
        var url = $"{_options.GraphApiBase}/{_options.ApiVersion}/{businessId}/system_users";
        var content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["name"] = name,
            ["role"] = "EMPLOYEE"
        });

        var client = httpClientFactory.CreateClient();
        using var req = new HttpRequestMessage(HttpMethod.Post, url);
        req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", accessToken);
        req.Content = content;
        var resp = await client.SendAsync(req, ct);
        var body = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode)
        {
            logger.LogWarning("System user create failed: tenant={TenantId} business={BusinessId} status={Status} body={Body}", tenancy.TenantId, businessId, (int)resp.StatusCode, body);
            return (string.Empty, string.Empty, body);
        }

        try
        {
            using var doc = JsonDocument.Parse(body);
            var id = doc.RootElement.TryGetProperty("id", out var idProp) ? idProp.GetString() ?? string.Empty : string.Empty;
            return (id, name, string.Empty);
        }
        catch
        {
            return (string.Empty, string.Empty, body);
        }
    }

    private async Task<bool> AssignSystemUserAssetsAsync(string accessToken, string systemUserId, string wabaId, string phoneNumberId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(systemUserId)) return false;
        var client = httpClientFactory.CreateClient();
        async Task<bool> AssignOneAsync(string assetId)
        {
            if (string.IsNullOrWhiteSpace(assetId)) return true;
            var url = $"{_options.GraphApiBase}/{_options.ApiVersion}/{systemUserId}/assigned_assets";
            var content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["asset"] = assetId,
                ["tasks"] = "[\"MANAGE\"]"
            });
            using var req = new HttpRequestMessage(HttpMethod.Post, url);
            req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", accessToken);
            req.Content = content;
            var resp = await client.SendAsync(req, ct);
            var body = await resp.Content.ReadAsStringAsync(ct);
            if (!resp.IsSuccessStatusCode)
            {
                logger.LogWarning("System user asset assignment failed: tenant={TenantId} su={SystemUserId} asset={AssetId} status={Status} body={Body}", tenancy.TenantId, systemUserId, assetId, (int)resp.StatusCode, body);
            }

            return resp.IsSuccessStatusCode;
        }

        var okWaba = await AssignOneAsync(wabaId);
        var okPhone = await AssignOneAsync(phoneNumberId);
        return okWaba && okPhone;
    }

    private async Task<(string AccessToken, DateTime? ExpiresAtUtc, string Error)> GenerateSystemUserTokenAsync(string accessToken, string systemUserId, CancellationToken ct)
    {
        var url = $"{_options.GraphApiBase}/{_options.ApiVersion}/{systemUserId}/access_tokens";
        var scope = "[\"whatsapp_business_management\",\"whatsapp_business_messaging\",\"business_management\"]";
        var content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["app_id"] = _options.AppId,
            ["scope"] = scope
        });

        var client = httpClientFactory.CreateClient();
        using var req = new HttpRequestMessage(HttpMethod.Post, url);
        req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", accessToken);
        req.Content = content;
        var resp = await client.SendAsync(req, ct);
        var body = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode)
        {
            logger.LogWarning("System user token generation failed: tenant={TenantId} su={SystemUserId} status={Status} body={Body}", tenancy.TenantId, systemUserId, (int)resp.StatusCode, body);
            return (string.Empty, null, body);
        }

        try
        {
            using var doc = JsonDocument.Parse(body);
            var token = doc.RootElement.TryGetProperty("access_token", out var tokenProp) ? tokenProp.GetString() ?? string.Empty : string.Empty;
            DateTime? expires = null;
            if (doc.RootElement.TryGetProperty("expires_at", out var expProp))
            {
                if (expProp.ValueKind == JsonValueKind.Number && expProp.TryGetInt64(out var expUnix))
                    expires = DateTimeOffset.FromUnixTimeSeconds(expUnix).UtcDateTime;
                else if (expProp.ValueKind == JsonValueKind.String && long.TryParse(expProp.GetString(), out var expUnixStr))
                    expires = DateTimeOffset.FromUnixTimeSeconds(expUnixStr).UtcDateTime;
            }
            return (token, expires, string.Empty);
        }
        catch
        {
            return (string.Empty, null, body);
        }
    }

    private async Task<JsonDocument?> GraphGetAsync(string url, string accessToken, CancellationToken ct)
    {
        var raw = await GraphGetRawAsync(url, accessToken, ct);
        if (!raw.Ok || string.IsNullOrWhiteSpace(raw.Body)) return null;
        try { return JsonDocument.Parse(raw.Body); } catch { return null; }
    }

    private async Task<TenantWabaConfig?> GetTenantConfigRowAsync(bool onlyActive, CancellationToken ct)
    {
        var rows = await tenantDb.Set<TenantWabaConfig>()
            .Where(x => x.TenantId == tenancy.TenantId && (!onlyActive || x.IsActive))
            .OrderByDescending(x => x.ConnectedAtUtc)
            .ThenByDescending(x => x.OnboardingStartedAtUtc)
            .ToListAsync(ct);

        if (rows.Count <= 1) return rows.FirstOrDefault();

        // Keep latest row only to avoid legacy duplicate records leaking inconsistent state.
        var keep = rows[0];
        tenantDb.Set<TenantWabaConfig>().RemoveRange(rows.Skip(1));
        await tenantDb.SaveChangesAsync(ct);
        return keep;
    }

    private async Task<TenantWabaConfig> GetOrCreateTenantConfigAsync(CancellationToken ct)
    {
        var config = await GetTenantConfigRowAsync(onlyActive: false, ct);
        if (config is not null) return config;
        config = new TenantWabaConfig { Id = Guid.NewGuid(), TenantId = tenancy.TenantId };
        tenantDb.Set<TenantWabaConfig>().Add(config);
        return config;
    }

    private async Task<(Guid TenantId, string TenantSlug, string TenantName)?> FindTenantBindingConflictAsync(string wabaId, string phoneNumberId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(wabaId) && string.IsNullOrWhiteSpace(phoneNumberId)) return null;
        var tenants = await controlDb.Tenants.ToListAsync(ct);
        foreach (var tenant in tenants)
        {
            if (tenant.Id == tenancy.TenantId) continue;
            try
            {
                using var otherDb = SeedData.CreateTenantDbContext(tenant.DataConnectionString);
                var cfg = await otherDb.Set<TenantWabaConfig>()
                    .Where(x => x.TenantId == tenant.Id && x.IsActive)
                    .OrderByDescending(x => x.ConnectedAtUtc)
                    .FirstOrDefaultAsync(ct);
                if (cfg is null) continue;
                var sameWaba = !string.IsNullOrWhiteSpace(wabaId) && string.Equals(cfg.WabaId, wabaId, StringComparison.OrdinalIgnoreCase);
                var samePhone = !string.IsNullOrWhiteSpace(phoneNumberId) && string.Equals(cfg.PhoneNumberId, phoneNumberId, StringComparison.OrdinalIgnoreCase);
                if (sameWaba || samePhone)
                {
                    return (tenant.Id, tenant.Slug, tenant.Name);
                }
            }
            catch
            {
                // Ignore unreachable tenant DB in conflict scan.
            }
        }

        return null;
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
        var token = UnprotectToken(cfg.AccessToken);

        var client = httpClientFactory.CreateClient();
        var url = $"{_options.GraphApiBase}/{_options.ApiVersion}/{cfg.PhoneNumberId}/messages";
        var payload = JsonSerializer.Serialize(new { messaging_product = "whatsapp", to = recipient, type = "text", text = new { body } });

        using var req = new HttpRequestMessage(HttpMethod.Post, url) { Content = new StringContent(payload, Encoding.UTF8, "application/json") };
        req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

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
        var token = UnprotectToken(cfg.AccessToken);
        var client = httpClientFactory.CreateClient();
        var url = $"{_options.GraphApiBase}/{_options.ApiVersion}/{cfg.PhoneNumberId}/messages";

        var components = new[] { new { type = "body", parameters = request.BodyParameters.Select(x => new { type = "text", text = x }).ToArray() } };
        var payload = JsonSerializer.Serialize(new { messaging_product = "whatsapp", to = request.Recipient, type = "template", template = new { name = request.TemplateName, language = new { code = request.LanguageCode }, components } });

        using var req = new HttpRequestMessage(HttpMethod.Post, url) { Content = new StringContent(payload, Encoding.UTF8, "application/json") };
        req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

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

    private string ProtectToken(string token)
    {
        if (string.IsNullOrWhiteSpace(token)) return string.Empty;
        if (token.StartsWith("enc:", StringComparison.Ordinal)) return token;
        return $"enc:{crypto.Encrypt(token)}";
    }

    private string UnprotectToken(string token)
    {
        if (string.IsNullOrWhiteSpace(token)) return string.Empty;
        if (!token.StartsWith("enc:", StringComparison.Ordinal)) return token;
        var payload = token[4..];
        try
        {
            return crypto.Decrypt(payload);
        }
        catch
        {
            return string.Empty;
        }
    }
}
