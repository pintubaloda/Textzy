using System.Text.Json;
using System.Threading.Channels;
using StackExchange.Redis;

namespace Textzy.Api.Services;

public sealed class WabaWebhookQueueItem
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public string Provider { get; init; } = "meta";
    public string EventKey { get; init; } = string.Empty;
    public string RawBody { get; init; } = string.Empty;
    public DateTime ReceivedAtUtc { get; init; } = DateTime.UtcNow;
    public int Attempt { get; init; } = 1;
    public int MaxAttempts { get; init; } = 3;
}

public class WabaWebhookQueueService(IConfiguration config, ILogger<WabaWebhookQueueService> logger)
{
    private readonly Channel<WabaWebhookQueueItem> _channel = Channel.CreateUnbounded<WabaWebhookQueueItem>();
    private int _memoryDepth = 0;
    private readonly string _provider = (config["WebhookQueue:Provider"] ?? "memory").Trim().ToLowerInvariant();
    private readonly string _redisConn = config["WebhookQueue:RedisConnection"] ?? config["REDIS_URL"] ?? string.Empty;
    private readonly string _redisKey = config["WebhookQueue:RedisListKey"] ?? "textzy:webhook:queue";
    private readonly Lazy<ConnectionMultiplexer?> _redis = new(() =>
    {
        try
        {
            return string.IsNullOrWhiteSpace(config["WebhookQueue:RedisConnection"] ?? config["REDIS_URL"])
                ? null
                : ConnectionMultiplexer.Connect(config["WebhookQueue:RedisConnection"] ?? config["REDIS_URL"]);
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
                logger.LogWarning("Webhook queue provider {Provider} is not configured yet; falling back to memory.", _provider);
            }
            return "memory";
        }
    }

    public async ValueTask EnqueueAsync(WabaWebhookQueueItem item, CancellationToken ct = default)
    {
        if (ActiveProvider == "redis")
        {
            var db = _redis.Value!.GetDatabase();
            var payload = JsonSerializer.Serialize(item);
            await db.ListRightPushAsync(_redisKey, payload);
            return;
        }
        Interlocked.Increment(ref _memoryDepth);
        await _channel.Writer.WriteAsync(item, ct);
    }

    public IAsyncEnumerable<WabaWebhookQueueItem> ReadAllAsync(CancellationToken ct)
    {
        if (ActiveProvider == "redis")
            return ReadRedisAsync(ct);
        return ReadMemoryAsync(ct);
    }

    public async Task<long> GetDepthAsync(CancellationToken ct = default)
    {
        if (ActiveProvider == "redis")
        {
            var db = _redis.Value!.GetDatabase();
            return await db.ListLengthAsync(_redisKey);
        }
        return Math.Max(0, Interlocked.CompareExchange(ref _memoryDepth, 0, 0));
    }

    private async IAsyncEnumerable<WabaWebhookQueueItem> ReadMemoryAsync([System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct)
    {
        await foreach (var item in _channel.Reader.ReadAllAsync(ct))
        {
            Interlocked.Decrement(ref _memoryDepth);
            yield return item;
        }
    }

    private async IAsyncEnumerable<WabaWebhookQueueItem> ReadRedisAsync([System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct)
    {
        var db = _redis.Value!.GetDatabase();
        while (!ct.IsCancellationRequested)
        {
            var popped = await db.ListLeftPopAsync(_redisKey);
            if (popped.HasValue)
            {
                WabaWebhookQueueItem? item = null;
                try { item = JsonSerializer.Deserialize<WabaWebhookQueueItem>(popped!); } catch { }
                if (item is not null) yield return item;
            }
            else
            {
                await Task.Delay(200, ct);
            }
        }
    }
}
