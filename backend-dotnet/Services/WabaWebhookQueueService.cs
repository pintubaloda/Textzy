using System.Threading.Channels;

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

public class WabaWebhookQueueService
{
    private readonly Channel<WabaWebhookQueueItem> _channel = Channel.CreateUnbounded<WabaWebhookQueueItem>();

    public ValueTask EnqueueAsync(WabaWebhookQueueItem item, CancellationToken ct = default)
        => _channel.Writer.WriteAsync(item, ct);

    public IAsyncEnumerable<WabaWebhookQueueItem> ReadAllAsync(CancellationToken ct)
        => _channel.Reader.ReadAllAsync(ct);
}
