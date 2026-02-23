using System.Text.Json;
using System.Threading.Channels;
using Amazon;
using Amazon.Runtime;
using Amazon.SQS;
using Amazon.SQS.Model;
using RabbitMQ.Client;
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
    private readonly string _rabbitConn = config["WebhookQueue:RabbitMq:ConnectionString"] ?? config["RABBITMQ_URL"] ?? string.Empty;
    private readonly string _rabbitQueue = config["WebhookQueue:RabbitMq:QueueName"] ?? "textzy.webhook.queue";
    private readonly string _sqsQueueUrl = config["WebhookQueue:Sqs:QueueUrl"] ?? config["AWS_SQS_WEBHOOK_QUEUE_URL"] ?? string.Empty;
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
    private readonly Lazy<IConnection?> _rabbitConnLazy = new(() =>
    {
        try
        {
            if (string.IsNullOrWhiteSpace(config["WebhookQueue:RabbitMq:ConnectionString"] ?? config["RABBITMQ_URL"])) return null;
            var factory = new ConnectionFactory
            {
                Uri = new Uri(config["WebhookQueue:RabbitMq:ConnectionString"] ?? config["RABBITMQ_URL"]),
                DispatchConsumersAsync = false
            };
            return factory.CreateConnection();
        }
        catch
        {
            return null;
        }
    });
    private readonly Lazy<IAmazonSQS?> _sqs = new(() =>
    {
        try
        {
            if (string.IsNullOrWhiteSpace(config["WebhookQueue:Sqs:QueueUrl"] ?? config["AWS_SQS_WEBHOOK_QUEUE_URL"])) return null;
            var sqsConfig = new AmazonSQSConfig();
            if (!string.IsNullOrWhiteSpace(config["WebhookQueue:Sqs:ServiceUrl"] ?? config["AWS_SQS_SERVICE_URL"]))
            {
                sqsConfig.ServiceURL = config["WebhookQueue:Sqs:ServiceUrl"] ?? config["AWS_SQS_SERVICE_URL"];
            }
            else if (!string.IsNullOrWhiteSpace(config["WebhookQueue:Sqs:Region"] ?? config["AWS_REGION"]))
            {
                sqsConfig.RegionEndpoint = RegionEndpoint.GetBySystemName(config["WebhookQueue:Sqs:Region"] ?? config["AWS_REGION"]);
            }

            var access = config["WebhookQueue:Sqs:AccessKey"] ?? config["AWS_ACCESS_KEY_ID"];
            var secret = config["WebhookQueue:Sqs:SecretKey"] ?? config["AWS_SECRET_ACCESS_KEY"];
            if (!string.IsNullOrWhiteSpace(access) && !string.IsNullOrWhiteSpace(secret))
            {
                return new AmazonSQSClient(new BasicAWSCredentials(access, secret), sqsConfig);
            }
            return new AmazonSQSClient(sqsConfig);
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
            if (_provider == "rabbitmq" && !string.IsNullOrWhiteSpace(_rabbitConn) && _rabbitConnLazy.Value is not null) return "rabbitmq";
            if (_provider == "sqs" && !string.IsNullOrWhiteSpace(_sqsQueueUrl) && _sqs.Value is not null) return "sqs";
            if (_provider is "rabbitmq" or "sqs") logger.LogWarning("Webhook queue provider {Provider} unavailable; falling back to memory.", _provider);
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
        if (ActiveProvider == "rabbitmq")
        {
            using var ch = _rabbitConnLazy.Value!.CreateModel();
            ch.QueueDeclare(_rabbitQueue, durable: true, exclusive: false, autoDelete: false);
            var payload = JsonSerializer.Serialize(item);
            var bytes = System.Text.Encoding.UTF8.GetBytes(payload);
            var props = ch.CreateBasicProperties();
            props.Persistent = true;
            ch.BasicPublish("", _rabbitQueue, props, bytes);
            return;
        }
        if (ActiveProvider == "sqs")
        {
            await _sqs.Value!.SendMessageAsync(new SendMessageRequest
            {
                QueueUrl = _sqsQueueUrl,
                MessageBody = JsonSerializer.Serialize(item)
            }, ct);
            return;
        }
        Interlocked.Increment(ref _memoryDepth);
        await _channel.Writer.WriteAsync(item, ct);
    }

    public IAsyncEnumerable<WabaWebhookQueueItem> ReadAllAsync(CancellationToken ct)
    {
        if (ActiveProvider == "redis")
            return ReadRedisAsync(ct);
        if (ActiveProvider == "rabbitmq")
            return ReadRabbitAsync(ct);
        if (ActiveProvider == "sqs")
            return ReadSqsAsync(ct);
        return ReadMemoryAsync(ct);
    }

    public async Task<long> GetDepthAsync(CancellationToken ct = default)
    {
        if (ActiveProvider == "redis")
        {
            var db = _redis.Value!.GetDatabase();
            return await db.ListLengthAsync(_redisKey);
        }
        if (ActiveProvider == "rabbitmq")
        {
            using var ch = _rabbitConnLazy.Value!.CreateModel();
            ch.QueueDeclare(_rabbitQueue, durable: true, exclusive: false, autoDelete: false);
            return ch.MessageCount(_rabbitQueue);
        }
        if (ActiveProvider == "sqs")
        {
            var attrs = await _sqs.Value!.GetQueueAttributesAsync(new GetQueueAttributesRequest
            {
                QueueUrl = _sqsQueueUrl,
                AttributeNames = new List<string> { "ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible" }
            }, ct);
            var visible = attrs.ApproximateNumberOfMessages;
            var inFlight = attrs.ApproximateNumberOfMessagesNotVisible;
            return visible + inFlight;
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

    private async IAsyncEnumerable<WabaWebhookQueueItem> ReadRabbitAsync([System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct)
    {
        using var ch = _rabbitConnLazy.Value!.CreateModel();
        ch.QueueDeclare(_rabbitQueue, durable: true, exclusive: false, autoDelete: false);
        while (!ct.IsCancellationRequested)
        {
            var result = ch.BasicGet(_rabbitQueue, autoAck: true);
            if (result is not null)
            {
                WabaWebhookQueueItem? item = null;
                try
                {
                    var payload = System.Text.Encoding.UTF8.GetString(result.Body.ToArray());
                    item = JsonSerializer.Deserialize<WabaWebhookQueueItem>(payload);
                }
                catch { }
                if (item is not null) yield return item;
            }
            else
            {
                await Task.Delay(200, ct);
            }
        }
    }

    private async IAsyncEnumerable<WabaWebhookQueueItem> ReadSqsAsync([System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            var received = await _sqs.Value!.ReceiveMessageAsync(new ReceiveMessageRequest
            {
                QueueUrl = _sqsQueueUrl,
                MaxNumberOfMessages = 1,
                WaitTimeSeconds = 5,
                VisibilityTimeout = 30
            }, ct);
            var msg = received.Messages.FirstOrDefault();
            if (msg is null)
            {
                await Task.Delay(200, ct);
                continue;
            }

            WabaWebhookQueueItem? item = null;
            try { item = JsonSerializer.Deserialize<WabaWebhookQueueItem>(msg.Body); } catch { }
            await _sqs.Value.DeleteMessageAsync(_sqsQueueUrl, msg.ReceiptHandle, ct);
            if (item is not null) yield return item;
        }
    }
}
