using Textzy.Api.Models;

namespace Textzy.Api.Providers;

public interface IMessageProvider
{
    Task<string> SendAsync(ChannelType channel, string recipient, string body, CancellationToken ct = default);
}
