using Microsoft.EntityFrameworkCore;
using Textzy.Api.Data;

namespace Textzy.Api.Services;

public class SecurityMonitoringWorker(
    IServiceScopeFactory scopeFactory,
    OutboundMessageQueueService outboundQueue,
    WabaWebhookQueueService webhookQueue,
    ILogger<SecurityMonitoringWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<ControlDbContext>();
                var controls = scope.ServiceProvider.GetRequiredService<SecurityControlService>();

                var now = DateTime.UtcNow;
                var from = now.AddMinutes(-5);
                var authFailures = await db.PlatformRequestLogs
                    .CountAsync(x => x.CreatedAtUtc >= from && x.Path.Contains("/api/auth/login") && x.StatusCode >= 400, stoppingToken);
                if (authFailures >= 20)
                {
                    await controls.AddSignalAsync(null, "auth_failure_burst", "high", authFailures, "High login failure burst in last 5 minutes.", stoppingToken);
                }

                var tokenFailures = await db.WebhookEvents
                    .CountAsync(x => x.ReceivedAtUtc >= from && x.LastError.ToLower().Contains("token"), stoppingToken);
                if (tokenFailures >= 10)
                {
                    await controls.AddSignalAsync(null, "token_failure_burst", "high", tokenFailures, "Token-related webhook failures crossed threshold.", stoppingToken);
                }

                var outboundDepth = await outboundQueue.GetDepthAsync(stoppingToken);
                if (outboundDepth >= 2000)
                {
                    await controls.AddSignalAsync(null, "outbound_queue_growth", "critical", (int)Math.Min(outboundDepth, int.MaxValue), "Outbound queue depth critical; circuit breaker recommended.", stoppingToken);
                }

                var webhookDepth = await webhookQueue.GetDepthAsync(stoppingToken);
                if (webhookDepth >= 5000)
                {
                    await controls.AddSignalAsync(null, "webhook_queue_growth", "critical", (int)Math.Min(webhookDepth, int.MaxValue), "Webhook queue depth critical.", stoppingToken);
                }

                var oldRows = await db.SecuritySignals
                    .Where(x => x.CreatedAtUtc < now.AddDays(-14))
                    .OrderBy(x => x.CreatedAtUtc)
                    .Take(2000)
                    .ToListAsync(stoppingToken);
                if (oldRows.Count > 0)
                {
                    db.SecuritySignals.RemoveRange(oldRows);
                    await db.SaveChangesAsync(stoppingToken);
                }

                var oldReplay = await db.WebhookReplayGuards
                    .Where(x => x.ExpiresAtUtc <= now)
                    .OrderBy(x => x.ExpiresAtUtc)
                    .Take(5000)
                    .ToListAsync(stoppingToken);
                if (oldReplay.Count > 0)
                {
                    db.WebhookReplayGuards.RemoveRange(oldReplay);
                    await db.SaveChangesAsync(stoppingToken);
                }
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Security monitor iteration failed.");
            }

            await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
        }
    }
}
