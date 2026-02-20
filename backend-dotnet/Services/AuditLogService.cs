using Textzy.Api.Data;
using Textzy.Api.Models;

namespace Textzy.Api.Services;

public class AuditLogService(ControlDbContext db, TenancyContext tenancy, AuthContext auth)
{
    public async Task WriteAsync(string action, string details, CancellationToken ct = default)
    {
        if (!auth.IsAuthenticated) return;
        db.AuditLogs.Add(new AuditLog
        {
            Id = Guid.NewGuid(),
            TenantId = tenancy.IsSet ? tenancy.TenantId : null,
            ActorUserId = auth.UserId,
            Action = action,
            Details = details,
            CreatedAtUtc = DateTime.UtcNow
        });
        await db.SaveChangesAsync(ct);
    }
}
