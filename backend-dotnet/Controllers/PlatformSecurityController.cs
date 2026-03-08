using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text;
using Textzy.Api.Data;
using Textzy.Api.Services;
using static Textzy.Api.Services.PermissionCatalog;

namespace Textzy.Api.Controllers;

[ApiController]
[Route("api/platform/security")]
public class PlatformSecurityController(
    ControlDbContext db,
    AuthContext auth,
    RbacService rbac,
    SecurityControlService controls,
    OutboundMessageQueueService outboundQueue,
    WabaWebhookQueueService webhookQueue,
    AuditLogService audit) : ControllerBase
{
    [HttpGet("report")]
    public async Task<IActionResult> Report(
        [FromQuery] Guid? tenantId = null,
        [FromQuery] Guid? userId = null,
        [FromQuery] string actionContains = "",
        [FromQuery] string sessionStatus = "all",
        [FromQuery] DateTime? fromUtc = null,
        [FromQuery] DateTime? toUtc = null,
        [FromQuery] int limit = 200,
        CancellationToken ct = default)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        if (!rbac.HasPermission(PlatformSettingsRead)) return Forbid();
        limit = Math.Clamp(limit, 20, 1000);

        var tenants = db.Tenants.AsNoTracking();
        var users = db.Users.AsNoTracking();
        var tenantUsers = db.TenantUsers.AsNoTracking();

        var sessionQuery = db.SessionTokens.AsNoTracking().AsQueryable();
        if (tenantId.HasValue && tenantId.Value != Guid.Empty)
            sessionQuery = sessionQuery.Where(x => x.TenantId == tenantId.Value);
        if (userId.HasValue && userId.Value != Guid.Empty)
            sessionQuery = sessionQuery.Where(x => x.UserId == userId.Value);
        if (fromUtc.HasValue)
            sessionQuery = sessionQuery.Where(x => x.CreatedAtUtc >= fromUtc.Value);
        if (toUtc.HasValue)
            sessionQuery = sessionQuery.Where(x => x.CreatedAtUtc <= toUtc.Value);
        if (!string.IsNullOrWhiteSpace(sessionStatus) && !string.Equals(sessionStatus, "all", StringComparison.OrdinalIgnoreCase))
        {
            var normalized = sessionStatus.Trim().ToLowerInvariant();
            sessionQuery = normalized switch
            {
                "active" => sessionQuery.Where(x => x.RevokedAtUtc == null && x.ExpiresAtUtc > DateTime.UtcNow),
                "revoked" => sessionQuery.Where(x => x.RevokedAtUtc != null),
                "expired" => sessionQuery.Where(x => x.RevokedAtUtc == null && x.ExpiresAtUtc <= DateTime.UtcNow),
                _ => sessionQuery
            };
        }

        var loginHistory = await (
            from s in sessionQuery
            join u in users on s.UserId equals u.Id
            join t in tenants on s.TenantId equals t.Id
            join tu in tenantUsers on new { s.UserId, s.TenantId } equals new { tu.UserId, tu.TenantId } into tuGroup
            from membership in tuGroup.DefaultIfEmpty()
            orderby s.CreatedAtUtc descending
            select new
            {
                sessionId = s.Id,
                userId = u.Id,
                userEmail = u.Email,
                userName = u.FullName,
                tenantId = t.Id,
                tenantName = t.Name,
                tenantSlug = t.Slug,
                role = membership != null ? membership.Role : (u.IsSuperAdmin ? "super_admin" : string.Empty),
                createdAtUtc = s.CreatedAtUtc,
                lastSeenAtUtc = s.LastSeenAtUtc,
                expiresAtUtc = s.ExpiresAtUtc,
                revokedAtUtc = s.RevokedAtUtc,
                ipAddress = s.CreatedIpAddress,
                lastSeenIpAddress = s.LastSeenIpAddress,
                deviceLabel = s.DeviceLabel,
                userAgent = s.UserAgent,
                twoFactorVerifiedAtUtc = s.TwoFactorVerifiedAtUtc,
                stepUpVerifiedAtUtc = s.StepUpVerifiedAtUtc
            })
            .Take(limit)
            .ToListAsync(ct);

        var auditQuery = db.AuditLogs.AsNoTracking().AsQueryable();
        if (tenantId.HasValue && tenantId.Value != Guid.Empty)
            auditQuery = auditQuery.Where(x => x.TenantId == tenantId.Value);
        if (userId.HasValue && userId.Value != Guid.Empty)
            auditQuery = auditQuery.Where(x => x.ActorUserId == userId.Value);
        if (fromUtc.HasValue)
            auditQuery = auditQuery.Where(x => x.CreatedAtUtc >= fromUtc.Value);
        if (toUtc.HasValue)
            auditQuery = auditQuery.Where(x => x.CreatedAtUtc <= toUtc.Value);
        if (!string.IsNullOrWhiteSpace(actionContains))
        {
            var filter = actionContains.Trim().ToLowerInvariant();
            auditQuery = auditQuery.Where(x => x.Action.ToLower().Contains(filter) || x.Details.ToLower().Contains(filter));
        }

        var auditEvents = await (
            from a in auditQuery
            join u in users on a.ActorUserId equals u.Id into uGroup
            from actor in uGroup.DefaultIfEmpty()
            join t in tenants on a.TenantId equals t.Id into tGroup
            from tenant in tGroup.DefaultIfEmpty()
            orderby a.CreatedAtUtc descending
            select new
            {
                id = a.Id,
                action = a.Action,
                details = a.Details,
                createdAtUtc = a.CreatedAtUtc,
                actorUserId = a.ActorUserId,
                actorEmail = actor != null ? actor.Email : string.Empty,
                actorName = actor != null ? actor.FullName : string.Empty,
                tenantId = a.TenantId,
                tenantName = tenant != null ? tenant.Name : string.Empty,
                tenantSlug = tenant != null ? tenant.Slug : string.Empty,
                ipAddress = a.IpAddress,
                userAgent = a.UserAgent,
                deviceLabel = a.DeviceLabel
            })
            .Take(limit)
            .ToListAsync(ct);

        var sessionsByUser = loginHistory
            .GroupBy(x => new { x.userId, x.userEmail, x.userName })
            .Select(g => new
            {
                userId = g.Key.userId,
                userEmail = g.Key.userEmail,
                userName = g.Key.userName,
                sessionCount = g.Count(),
                activeSessions = g.Count(x => x.revokedAtUtc == null && x.expiresAtUtc > DateTime.UtcNow),
                lastSeenAtUtc = g.Max(x => x.lastSeenAtUtc ?? x.createdAtUtc),
                lastTenantName = g.OrderByDescending(x => x.lastSeenAtUtc ?? x.createdAtUtc).Select(x => x.tenantName).FirstOrDefault() ?? string.Empty,
                lastDeviceLabel = g.OrderByDescending(x => x.lastSeenAtUtc ?? x.createdAtUtc).Select(x => x.deviceLabel).FirstOrDefault() ?? string.Empty,
                lastIpAddress = g.OrderByDescending(x => x.lastSeenAtUtc ?? x.createdAtUtc).Select(x => x.lastSeenIpAddress ?? x.ipAddress).FirstOrDefault() ?? string.Empty
            })
            .OrderByDescending(x => x.lastSeenAtUtc)
            .Take(limit)
            .ToList();

        var now = DateTime.UtcNow;
        return Ok(new
        {
            generatedAtUtc = now,
            filters = new
            {
                tenantId,
                userId,
                actionContains = actionContains ?? string.Empty,
                sessionStatus = sessionStatus ?? "all",
                fromUtc,
                toUtc,
                limit
            },
            summary = new
            {
                loginCount = loginHistory.Count,
                activeSessions = loginHistory.Count(x => x.revokedAtUtc == null && x.expiresAtUtc > now),
                revokedSessions = loginHistory.Count(x => x.revokedAtUtc != null),
                uniqueUsers = loginHistory.Select(x => x.userId).Distinct().Count(),
                auditEvents = auditEvents.Count
            },
            notes = new
            {
                location = "IP address, user agent, and derived device label are captured. Lat/long is not collected."
            },
            loginHistory,
            sessionsByUser,
            auditEvents
        });
    }

    [HttpGet("report/export")]
    public async Task<IActionResult> ExportReport(
        [FromQuery] Guid? tenantId = null,
        [FromQuery] Guid? userId = null,
        [FromQuery] string actionContains = "",
        [FromQuery] string sessionStatus = "all",
        [FromQuery] DateTime? fromUtc = null,
        [FromQuery] DateTime? toUtc = null,
        [FromQuery] int limit = 1000,
        CancellationToken ct = default)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        if (!rbac.HasPermission(PlatformSettingsRead)) return Forbid();
        limit = Math.Clamp(limit, 20, 5000);

        var reportResult = await Report(tenantId, userId, actionContains, sessionStatus, fromUtc, toUtc, limit, ct) as OkObjectResult;
        if (reportResult?.Value is null) return BadRequest("Could not generate report.");

        var payload = reportResult.Value;
        var loginRows = (IEnumerable<object>)payload.GetType().GetProperty("loginHistory")!.GetValue(payload)!;
        var sessionRows = (IEnumerable<object>)payload.GetType().GetProperty("sessionsByUser")!.GetValue(payload)!;
        var auditRows = (IEnumerable<object>)payload.GetType().GetProperty("auditEvents")!.GetValue(payload)!;

        var csv = new StringBuilder();
        csv.AppendLine("section,tenantSlug,tenantName,userEmail,userName,action,details,sessionId,ipAddress,lastSeenIpAddress,deviceLabel,userAgent,createdAtUtc,lastSeenAtUtc,expiresAtUtc,revokedAtUtc,twoFactorVerifiedAtUtc,stepUpVerifiedAtUtc,sessionCount,activeSessions");

        foreach (var row in loginRows)
        {
            csv.AppendLine(string.Join(",",
                Csv("login_history"),
                Csv(GetProp(row, "tenantSlug")),
                Csv(GetProp(row, "tenantName")),
                Csv(GetProp(row, "userEmail")),
                Csv(GetProp(row, "userName")),
                Csv(""),
                Csv(""),
                Csv(GetProp(row, "sessionId")),
                Csv(GetProp(row, "ipAddress")),
                Csv(GetProp(row, "lastSeenIpAddress")),
                Csv(GetProp(row, "deviceLabel")),
                Csv(GetProp(row, "userAgent")),
                Csv(GetProp(row, "createdAtUtc")),
                Csv(GetProp(row, "lastSeenAtUtc")),
                Csv(GetProp(row, "expiresAtUtc")),
                Csv(GetProp(row, "revokedAtUtc")),
                Csv(GetProp(row, "twoFactorVerifiedAtUtc")),
                Csv(GetProp(row, "stepUpVerifiedAtUtc")),
                Csv(""),
                Csv("")));
        }

        foreach (var row in sessionRows)
        {
            csv.AppendLine(string.Join(",",
                Csv("sessions_by_user"),
                Csv(""),
                Csv(GetProp(row, "lastTenantName")),
                Csv(GetProp(row, "userEmail")),
                Csv(GetProp(row, "userName")),
                Csv(""),
                Csv(""),
                Csv(""),
                Csv(GetProp(row, "lastIpAddress")),
                Csv(""),
                Csv(GetProp(row, "lastDeviceLabel")),
                Csv(""),
                Csv(""),
                Csv(GetProp(row, "lastSeenAtUtc")),
                Csv(""),
                Csv(""),
                Csv(""),
                Csv(""),
                Csv(GetProp(row, "sessionCount")),
                Csv(GetProp(row, "activeSessions"))));
        }

        foreach (var row in auditRows)
        {
            csv.AppendLine(string.Join(",",
                Csv("audit_event"),
                Csv(GetProp(row, "tenantSlug")),
                Csv(GetProp(row, "tenantName")),
                Csv(GetProp(row, "actorEmail")),
                Csv(GetProp(row, "actorName")),
                Csv(GetProp(row, "action")),
                Csv(GetProp(row, "details")),
                Csv(""),
                Csv(GetProp(row, "ipAddress")),
                Csv(""),
                Csv(GetProp(row, "deviceLabel")),
                Csv(GetProp(row, "userAgent")),
                Csv(GetProp(row, "createdAtUtc")),
                Csv(""),
                Csv(""),
                Csv(""),
                Csv(""),
                Csv(""),
                Csv(""),
                Csv("")));
        }

        var fileName = $"platform-security-report-{DateTime.UtcNow:yyyyMMddHHmmss}.csv";
        return File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", fileName);
    }

    [HttpGet("signals")]
    public async Task<IActionResult> Signals([FromQuery] string status = "open", [FromQuery] int limit = 100, CancellationToken ct = default)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        if (!rbac.HasPermission(PlatformSettingsRead)) return Forbid();
        limit = Math.Clamp(limit, 1, 500);

        var q = db.SecuritySignals.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(status) && !string.Equals(status, "all", StringComparison.OrdinalIgnoreCase))
            q = q.Where(x => x.Status == status);

        var rows = await q
            .OrderByDescending(x => x.CreatedAtUtc)
            .Take(limit)
            .ToListAsync(ct);
        return Ok(rows);
    }

    [HttpPost("signals/{id:guid}/resolve")]
    public async Task<IActionResult> ResolveSignal(Guid id, CancellationToken ct = default)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        if (!rbac.HasPermission(PlatformSettingsWrite)) return Forbid();
        var row = await db.SecuritySignals.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (row is null) return NotFound();
        row.Status = "resolved";
        row.ResolvedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return Ok(new { ok = true });
    }

    [HttpGet("controls")]
    public async Task<IActionResult> Controls([FromQuery] Guid tenantId, CancellationToken ct = default)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        if (!rbac.HasPermission(PlatformSettingsRead)) return Forbid();
        if (tenantId == Guid.Empty) return BadRequest("tenantId is required.");
        var row = await controls.GetTenantControlAsync(tenantId, ct);
        if (row is null)
            return Ok(new { tenantId, circuitBreakerEnabled = false, ratePerMinuteOverride = 0, reason = "" });

        return Ok(new
        {
            tenantId = row.TenantId,
            circuitBreakerEnabled = row.CircuitBreakerEnabled,
            ratePerMinuteOverride = row.RatePerMinuteOverride,
            reason = row.Reason ?? string.Empty
        });
    }

    [HttpPut("controls")]
    public async Task<IActionResult> UpsertControls([FromBody] ControlRequest request, CancellationToken ct = default)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        if (!rbac.HasPermission(PlatformSettingsWrite)) return Forbid();
        if (request.TenantId == Guid.Empty) return BadRequest("tenantId is required.");
        await controls.UpsertControlAsync(request.TenantId, request.CircuitBreakerEnabled, request.RatePerMinuteOverride, auth.UserId, request.Reason ?? string.Empty, ct);
        await audit.WriteAsync("platform.security.controls.updated", $"tenantId={request.TenantId}; circuit={request.CircuitBreakerEnabled}; rpm={request.RatePerMinuteOverride}", ct);
        return Ok(new { ok = true });
    }

    [HttpPost("queue/purge")]
    public async Task<IActionResult> PurgeQueue([FromBody] PurgeQueueRequest request, CancellationToken ct = default)
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        if (!rbac.HasPermission(PlatformSettingsWrite)) return Forbid();
        var target = (request.Queue ?? string.Empty).Trim().ToLowerInvariant();
        if (target == "outbound")
            await outboundQueue.PurgeAsync(ct);
        else if (target == "webhook")
            await webhookQueue.PurgeAsync(ct);
        else
            return BadRequest("queue must be outbound or webhook.");

        await audit.WriteAsync("platform.security.queue.purged", $"queue={target}", ct);
        return Ok(new { ok = true, queue = target });
    }

    public sealed class ControlRequest
    {
        public Guid TenantId { get; set; }
        public bool? CircuitBreakerEnabled { get; set; }
        public int? RatePerMinuteOverride { get; set; }
        public string? Reason { get; set; }
    }

    public sealed class PurgeQueueRequest
    {
        public string Queue { get; set; } = string.Empty;
    }

    private static string GetProp(object row, string name)
    {
        var value = row.GetType().GetProperty(name)?.GetValue(row);
        return value?.ToString() ?? string.Empty;
    }

    private static string Csv(string value)
    {
        var safe = (value ?? string.Empty).Replace("\"", "\"\"");
        return $"\"{safe}\"";
    }
}
