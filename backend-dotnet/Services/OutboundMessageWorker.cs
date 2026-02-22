using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Textzy.Api.Data;
using Textzy.Api.Models;
using Textzy.Api.Providers;
using System.Text;
using System.Text.Json;

namespace Textzy.Api.Services;

public class OutboundMessageWorker(
    OutboundMessageQueueService queue,
    IServiceScopeFactory scopeFactory,
    IHubContext<InboxHub> hub,
    ILogger<OutboundMessageWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var job = await queue.DequeueAsync(stoppingToken);
            if (job is null)
            {
                await Task.Delay(150, stoppingToken);
                continue;
            }

            try
            {
                using var scope = scopeFactory.CreateScope();
                var controlDb = scope.ServiceProvider.GetRequiredService<ControlDbContext>();
                var crypto = scope.ServiceProvider.GetRequiredService<SecretCryptoService>();
                var httpClientFactory = scope.ServiceProvider.GetRequiredService<IHttpClientFactory>();
                var configuration = scope.ServiceProvider.GetRequiredService<IConfiguration>();
                var waOptions = configuration.GetSection("WhatsApp").Get<WhatsAppOptions>() ?? new WhatsAppOptions();
                var tenant = await controlDb.Tenants.FirstOrDefaultAsync(x => x.Id == job.TenantId, stoppingToken);
                if (tenant is null) continue;

                using var tenantDb = SeedData.CreateTenantDbContext(tenant.DataConnectionString);
                var message = await tenantDb.Messages.FirstOrDefaultAsync(x => x.Id == job.MessageId, stoppingToken);
                if (message is null) continue;
                if (message.Status is "Accepted" or "Sent" or "Delivered" or "Read") continue;
                if (message.NextRetryAtUtc.HasValue && message.NextRetryAtUtc.Value > DateTime.UtcNow)
                {
                    await queue.EnqueueAsync(job, stoppingToken);
                    continue;
                }

                var provider = scope.ServiceProvider.GetRequiredService<IMessageProvider>();
                var whatsapp = scope.ServiceProvider.GetRequiredService<WhatsAppCloudService>();
                message.Status = "Processing";
                await tenantDb.SaveChangesAsync(stoppingToken);

                try
                {
                    string providerId;
                    if (message.Channel == ChannelType.WhatsApp)
                    {
                        var wabaCfg = await tenantDb.Set<TenantWabaConfig>()
                            .Where(x => x.TenantId == tenant.Id && x.IsActive)
                            .OrderByDescending(x => x.ConnectedAtUtc)
                            .FirstOrDefaultAsync(stoppingToken);
                        if (wabaCfg is null) throw new InvalidOperationException("WABA config not connected.");
                        if (string.IsNullOrWhiteSpace(wabaCfg.PhoneNumberId)) throw new InvalidOperationException("Phone number ID missing.");
                        var accessToken = UnprotectToken(wabaCfg.AccessToken, crypto);
                        if (string.IsNullOrWhiteSpace(accessToken)) throw new InvalidOperationException("WABA access token missing.");

                        var useTemplate = message.MessageType == "template";
                        if (useTemplate)
                        {
                            var name = ExtractTemplateName(message.Body);
                            var bodyParams = ExtractTemplateParams(message.Body);
                            providerId = await SendWhatsAppTemplateAsync(httpClientFactory, waOptions, wabaCfg.PhoneNumberId, accessToken, message.Recipient, name, "en", bodyParams, stoppingToken);
                        }
                        else
                        {
                            var window = await tenantDb.Set<ConversationWindow>()
                                .FirstOrDefaultAsync(x => x.TenantId == tenant.Id && x.Recipient == message.Recipient, stoppingToken);
                            var isOpen = window is not null && window.LastInboundAtUtc >= DateTime.UtcNow.AddHours(-24);
                            if (!isOpen)
                                throw new InvalidOperationException("24-hour WhatsApp session closed. Use template message.");
                            providerId = await SendWhatsAppSessionAsync(httpClientFactory, waOptions, wabaCfg.PhoneNumberId, accessToken, message.Recipient, message.Body, stoppingToken);
                        }
                    }
                    else
                    {
                        providerId = await provider.SendAsync(message.Channel, message.Recipient, message.Body, stoppingToken);
                    }

                    message.ProviderMessageId = providerId;
                    message.Status = "Accepted";
                    message.LastError = string.Empty;
                    message.NextRetryAtUtc = null;
                    await tenantDb.SaveChangesAsync(stoppingToken);
                    await hub.Clients.Group($"tenant:{tenant.Slug}").SendAsync("message.sent", new
                    {
                        message.Id,
                        message.Recipient,
                        message.Body,
                        message.Channel,
                        message.Status,
                        message.CreatedAtUtc
                    }, stoppingToken);
                }
                catch (Exception ex)
                {
                    var retryable = IsRetryable(ex, out var reason);
                    message.RetryCount += 1;
                    message.LastError = Truncate($"{reason}: {ex.Message}", 1500);

                    if (!retryable || message.RetryCount >= 5)
                    {
                        message.Status = "Failed";
                        message.NextRetryAtUtc = null;
                    }
                    else
                    {
                        message.Status = "RetryScheduled";
                        var delay = RetryDelay(message.RetryCount);
                        message.NextRetryAtUtc = DateTime.UtcNow.Add(delay);
                        _ = Task.Run(async () =>
                        {
                            try
                            {
                                await Task.Delay(delay, stoppingToken);
                                await queue.EnqueueAsync(job, stoppingToken);
                            }
                            catch { }
                        }, stoppingToken);
                    }

                    await tenantDb.SaveChangesAsync(stoppingToken);
                    logger.LogWarning(ex, "Outbound send failed for message {MessageId}. retryable={Retryable}", message.Id, retryable);
                }
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Outbound worker failed for tenant {TenantId} message {MessageId}", job.TenantId, job.MessageId);
            }
        }
    }

    private static bool IsRetryable(Exception ex, out string reason)
    {
        var msg = (ex.Message ?? string.Empty).ToLowerInvariant();
        if (msg.Contains("invalid oauth") || msg.Contains("(401)") || msg.Contains("(403)") || msg.Contains("permission") || msg.Contains("policy") || msg.Contains("session closed"))
        {
            reason = "non_retryable_auth_or_policy";
            return false;
        }
        if (msg.Contains("(429)") || msg.Contains("timeout") || msg.Contains("(500)") || msg.Contains("(502)") || msg.Contains("(503)") || msg.Contains("(504)"))
        {
            reason = "retryable_transient";
            return true;
        }

        reason = "retryable_unknown";
        return true;
    }

    private static TimeSpan RetryDelay(int retryCount)
    {
        return retryCount switch
        {
            1 => TimeSpan.FromSeconds(1),
            2 => TimeSpan.FromSeconds(5),
            3 => TimeSpan.FromSeconds(30),
            4 => TimeSpan.FromMinutes(2),
            _ => TimeSpan.FromMinutes(10)
        };
    }

    private static string Truncate(string value, int max) => value.Length <= max ? value : value[..max];
    private static string UnprotectToken(string token, SecretCryptoService crypto)
    {
        if (string.IsNullOrWhiteSpace(token)) return string.Empty;
        if (!token.StartsWith("enc:", StringComparison.Ordinal)) return token;
        try { return crypto.Decrypt(token[4..]); } catch { return string.Empty; }
    }

    private static string ExtractTemplateName(string payload)
    {
        var split = (payload ?? string.Empty).Split('|', 3);
        return split.Length > 0 && !string.IsNullOrWhiteSpace(split[0]) ? split[0] : "welcome_customer";
    }

    private static List<string> ExtractTemplateParams(string payload)
    {
        var split = (payload ?? string.Empty).Split('|', 3);
        if (split.Length < 2 || string.IsNullOrWhiteSpace(split[1])) return [];
        return split[1].Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
    }

    private static async Task<string> SendWhatsAppSessionAsync(
        IHttpClientFactory httpClientFactory,
        WhatsAppOptions options,
        string phoneNumberId,
        string accessToken,
        string recipient,
        string body,
        CancellationToken ct)
    {
        var client = httpClientFactory.CreateClient();
        var url = $"{options.GraphApiBase}/{options.ApiVersion}/{phoneNumberId}/messages";
        var payload = JsonSerializer.Serialize(new { messaging_product = "whatsapp", to = recipient, type = "text", text = new { body } });
        using var req = new HttpRequestMessage(HttpMethod.Post, url) { Content = new StringContent(payload, Encoding.UTF8, "application/json") };
        req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", accessToken);
        var resp = await client.SendAsync(req, ct);
        var responseBody = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode) throw new InvalidOperationException($"WhatsApp send failed ({(int)resp.StatusCode}): {responseBody}");
        using var doc = JsonDocument.Parse(responseBody);
        return doc.RootElement.GetProperty("messages")[0].GetProperty("id").GetString() ?? $"wa_{Guid.NewGuid():N}";
    }

    private static async Task<string> SendWhatsAppTemplateAsync(
        IHttpClientFactory httpClientFactory,
        WhatsAppOptions options,
        string phoneNumberId,
        string accessToken,
        string recipient,
        string templateName,
        string languageCode,
        List<string> bodyParameters,
        CancellationToken ct)
    {
        var client = httpClientFactory.CreateClient();
        var url = $"{options.GraphApiBase}/{options.ApiVersion}/{phoneNumberId}/messages";
        var components = new[] { new { type = "body", parameters = bodyParameters.Select(x => new { type = "text", text = x }).ToArray() } };
        var payload = JsonSerializer.Serialize(new { messaging_product = "whatsapp", to = recipient, type = "template", template = new { name = templateName, language = new { code = languageCode }, components } });
        using var req = new HttpRequestMessage(HttpMethod.Post, url) { Content = new StringContent(payload, Encoding.UTF8, "application/json") };
        req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", accessToken);
        var resp = await client.SendAsync(req, ct);
        var responseBody = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode) throw new InvalidOperationException($"WhatsApp template send failed ({(int)resp.StatusCode}): {responseBody}");
        using var doc = JsonDocument.Parse(responseBody);
        return doc.RootElement.GetProperty("messages")[0].GetProperty("id").GetString() ?? $"wa_tpl_{Guid.NewGuid():N}";
    }
}
