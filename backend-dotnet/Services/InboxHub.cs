using Microsoft.AspNetCore.SignalR;

namespace Textzy.Api.Services;

public class InboxHub : Hub
{
    public async Task JoinTenantRoom(string tenantSlug)
        => await Groups.AddToGroupAsync(Context.ConnectionId, $"tenant:{tenantSlug}");

    public async Task LeaveTenantRoom(string tenantSlug)
        => await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"tenant:{tenantSlug}");
}
