using Textzy.Api.Data;
using Textzy.Api.Services;

namespace Textzy.Api.Middleware;

public class AuthMiddleware(RequestDelegate next)
{
    private readonly RequestDelegate _next = next;

    public async Task Invoke(HttpContext context, SessionService sessions, ControlDbContext db, TenancyContext tenancy, AuthContext auth)
    {
        var path = context.Request.Path.Value ?? string.Empty;
        var isAuthPath = path.StartsWith("/api/auth/login", StringComparison.OrdinalIgnoreCase)
            || path.StartsWith("/api/auth/accept-invite", StringComparison.OrdinalIgnoreCase);
        var isProjectPath = path.StartsWith("/api/auth/projects", StringComparison.OrdinalIgnoreCase)
            || path.StartsWith("/api/auth/switch-project", StringComparison.OrdinalIgnoreCase);
        var isPublicTenantPath = path.StartsWith("/api/tenants", StringComparison.OrdinalIgnoreCase);
        var isSwaggerPath = path.StartsWith("/swagger", StringComparison.OrdinalIgnoreCase);
        var isWabaWebhookPath = path.StartsWith("/api/waba/webhook", StringComparison.OrdinalIgnoreCase);
        var isPaymentWebhookPath = path.StartsWith("/api/payments/webhook", StringComparison.OrdinalIgnoreCase);

        if (isAuthPath || isPublicTenantPath || isSwaggerPath || isWabaWebhookPath || isPaymentWebhookPath)
        {
            await _next(context);
            return;
        }

        var header = context.Request.Headers.Authorization.ToString();
        if (!header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await context.Response.WriteAsync("Missing bearer token.");
            return;
        }

        var opaqueToken = header["Bearer ".Length..].Trim();
        var session = sessions.Validate(opaqueToken);
        if (session is null)
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await context.Response.WriteAsync("Invalid or expired session.");
            return;
        }

        if (!tenancy.IsSet)
        {
            var sessionTenant = db.Tenants.FirstOrDefault(t => t.Id == session.TenantId);
            if (sessionTenant is null)
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                await context.Response.WriteAsync("Session tenant not found.");
                return;
            }
            tenancy.SetTenant(sessionTenant.Id, sessionTenant.Slug, sessionTenant.DataConnectionString);
        }
        else if (session.TenantId != tenancy.TenantId)
        {
            var sessionTenant = db.Tenants.FirstOrDefault(t => t.Id == session.TenantId);
            if (sessionTenant is null)
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                await context.Response.WriteAsync("Session tenant not found.");
                return;
            }
            tenancy.SetTenant(sessionTenant.Id, sessionTenant.Slug, sessionTenant.DataConnectionString);
        }

        var user = db.Users.FirstOrDefault(u => u.Id == session.UserId && u.IsActive);
        if (user is null)
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            await context.Response.WriteAsync("User not active.");
            return;
        }

        if (isProjectPath)
        {
            auth.Set(user.Id, session.TenantId, user.Email, user.IsSuperAdmin ? RolePermissionCatalog.SuperAdmin : "owner");
            await _next(context);
            return;
        }

        if (user.IsSuperAdmin)
        {
            auth.Set(user.Id, session.TenantId, user.Email, RolePermissionCatalog.SuperAdmin);
            await _next(context);
            return;
        }

        var tenantUser = db.TenantUsers.FirstOrDefault(tu => tu.UserId == session.UserId && tu.TenantId == session.TenantId);
        if (tenantUser is null)
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            await context.Response.WriteAsync("User is not assigned to tenant.");
            return;
        }

        var effective = RolePermissionCatalog.GetPermissions(tenantUser.Role).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var overrides = db.TenantUserPermissionOverrides
            .Where(x => x.TenantId == session.TenantId && x.UserId == session.UserId)
            .ToList();
        foreach (var ov in overrides)
        {
            if (ov.IsAllowed) effective.Add(ov.Permission);
            else effective.Remove(ov.Permission);
        }

        auth.Set(user.Id, session.TenantId, user.Email, tenantUser.Role, effective.ToList());
        await _next(context);
    }
}
