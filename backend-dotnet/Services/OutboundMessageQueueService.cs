using System.Text.Json;
using System.Threading.Channels;
using StackExchange.Redis;

namespace Textzy.Api.Services;

public sealed class OutboundMessageQueueItem
{
    public Guid MessageId { get; init; }
    public Guid TenantId { get; init; }
    public string TenantSlug { get; init; } = string.Empty;
}

public class OutboundMessageQueueService(IConfiguration config, ILogger<OutboundMessageQueueService> logger)
{
    private readonly Channel<OutboundMessageQueueItem> _memory = Channel.CreateUnbounded<OutboundMessageQueueItem>();
    private readonly string _provider = (config["OutboundQueue:Provider"] ?? "memory").Trim().ToLowerInvariant();
    private readonly string _redisConn = config["OutboundQueue:RedisConnection"] ?? config["REDIS_URL"] ?? string.Empty;
    private readonly string _redisKey = config["OutboundQueue:RedisListKey"] ?? "textzy:outbound:queue";
    private readonly Lazy<ConnectionMultiplexer?> _redis = new(() =>
    {
        try
        {
            return string.IsNullOrWhiteSpace(config["OutboundQueue:RedisConnection"] ?? config["REDIS_URL"])
                ? null
                : ConnectionMultiplexer.Connect(config["OutboundQueue:RedisConnection"] ?? config["REDIS_URL"]);
        }
        catch
        {
            return null;
        }
    });

    public string ActiveProvider
    {
        get
        {
            if (_provider == "redis" && !string.IsNullOrWhiteSpace(_redisConn) && _redis.Value is not null) return "redis";
            if (_provider is "rabbitmq" or "sqs")
            {
                logger.LogWarning("Outbound queue provider {Provider} is not configured yet; falling back to memory.", _provider);
            }
            return "memory";
        }
    }

    public async ValueTask EnqueueAsync(OutboundMessageQueueItem item, CancellationToken ct = default)
    {
        if (ActiveProvider == "redis")
        {
            var db = _redis.Value!.GetDatabase();
            var payload = JsonSerializer.Serialize(item);
            await db.ListRightPushAsync(_redisKey, payload);
            return;
        }

        await _memory.Writer.WriteAsync(item, ct);
    }

    public async ValueTask<OutboundMessageQueueItem?> DequeueAsync(CancellationToken ct = default)
    {
        if (ActiveProvider == "redis")
        {
            var db = _redis.Value!.GetDatabase();
            while (!ct.IsCancellationRequested)
            {
                var popped = await db.ListLeftPopAsync(_redisKey);
                if (popped.HasValue)
                {
                    try { return JsonSerializer.Deserialize<OutboundMessageQueueItem>(popped!); } catch { return null; }
                }
                await Task.Delay(200, ct);
            }
            return null;
        }

        while (await _memory.Reader.WaitToReadAsync(ct))
        {
            if (_memory.Reader.TryRead(out var item)) return item;
        }

        return null;
    }
}

