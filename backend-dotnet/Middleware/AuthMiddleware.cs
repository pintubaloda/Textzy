using Textzy.Api.Data;
using Textzy.Api.Services;
using System.Security.Cryptography;
using System.Text;

namespace Textzy.Api.Middleware;

public class AuthMiddleware(RequestDelegate next)
{
    private readonly RequestDelegate _next = next;

    public async Task Invoke(
        HttpContext context,
        SessionService sessions,
        ControlDbContext db,
        TenancyContext tenancy,
        AuthContext auth,
        AuthCookieService authCookie,
        IConfiguration config,
        IHostEnvironment env)
    {
        if (HttpMethods.IsOptions(context.Request.Method))
        {
            await _next(context);
            return;
        }

        var path = context.Request.Path.Value ?? string.Empty;
        var isAuthPath = path.StartsWith("/api/auth/login", StringComparison.OrdinalIgnoreCase)
            || path.StartsWith("/api/auth/accept-invite", StringComparison.OrdinalIgnoreCase);
        var isAuthRefreshPath = path.StartsWith("/api/auth/refresh", StringComparison.OrdinalIgnoreCase);
        var isProjectPath = path.StartsWith("/api/auth/projects", StringComparison.OrdinalIgnoreCase)
            || path.StartsWith("/api/auth/switch-project", StringComparison.OrdinalIgnoreCase);
        var isPublicTenantPath = path.StartsWith("/api/tenants", StringComparison.OrdinalIgnoreCase)
            || path.StartsWith("/api/public", StringComparison.OrdinalIgnoreCase);
        var isSwaggerPath = path.StartsWith("/swagger", StringComparison.OrdinalIgnoreCase);
        var isHubPath = path.StartsWith("/hubs/", StringComparison.OrdinalIgnoreCase);
        var isWabaWebhookPath = path.StartsWith("/api/waba/webhook", StringComparison.OrdinalIgnoreCase);
        var isPaymentWebhookPath = path.StartsWith("/api/payments/webhook", StringComparison.OrdinalIgnoreCase);
        var isCsrfExemptPath = isAuthPath || isAuthRefreshPath || isPublicTenantPath || isSwaggerPath || isHubPath || isWabaWebhookPath || isPaymentWebhookPath;

        if (isAuthPath || isPublicTenantPath || isSwaggerPath || isWabaWebhookPath || isPaymentWebhookPath)
        {
            await _next(context);
            return;
        }

        if (env.IsProduction() && IsUnsafeMethod(context.Request.Method))
        {
            var origin = context.Request.Headers.Origin.ToString().Trim().TrimEnd('/');
            var referer = context.Request.Headers.Referer.ToString();
            // Native/mobile clients typically do not send Origin/Referer.
            // Enforce origin checks only when request looks browser-initiated.
            var hasBrowserOriginContext = !string.IsNullOrWhiteSpace(origin) || !string.IsNullOrWhiteSpace(referer);
            if (hasBrowserOriginContext && !IsTrustedOrigin(origin, referer, config))
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                await context.Response.WriteAsync("Untrusted origin.");
                return;
            }
        }
        if (IsUnsafeMethod(context.Request.Method) && !isCsrfExemptPath)
        {
            if (!HasValidDoubleSubmitCsrf(context, authCookie))
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                await context.Response.WriteAsync("Invalid CSRF token.");
                return;
            }
        }

        var header = context.Request.Headers.Authorization.ToString();
        var opaqueToken = string.Empty;
        if (header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            opaqueToken = header["Bearer ".Length..].Trim();
        }
        else
        {
            opaqueToken = authCookie.ReadToken(context) ?? string.Empty;
        }

        if (string.IsNullOrWhiteSpace(opaqueToken) && isHubPath)
        {
            opaqueToken = context.Request.Query["access_token"].FirstOrDefault()?.Trim() ?? string.Empty;
        }

        if (string.IsNullOrWhiteSpace(opaqueToken))
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await context.Response.WriteAsync("Missing bearer token.");
            return;
        }
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
            auth.Set(user.Id, session.TenantId, user.Email, user.IsSuperAdmin ? RolePermissionCatalog.SuperAdmin : "owner", null, user.FullName);
            await _next(context);
            return;
        }

        if (user.IsSuperAdmin)
        {
            auth.Set(user.Id, session.TenantId, user.Email, RolePermissionCatalog.SuperAdmin, null, user.FullName);
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

        auth.Set(user.Id, session.TenantId, user.Email, tenantUser.Role, effective.ToList(), user.FullName);
        await _next(context);
    }

    private static bool IsUnsafeMethod(string method) =>
        HttpMethods.IsPost(method) || HttpMethods.IsPut(method) || HttpMethods.IsPatch(method) || HttpMethods.IsDelete(method);

    private static bool HasValidDoubleSubmitCsrf(HttpContext context, AuthCookieService authCookie)
    {
        var cookieToken = authCookie.ReadCsrfToken(context);
        if (string.IsNullOrWhiteSpace(cookieToken)) return false;

        var headerToken = context.Request.Headers["X-CSRF-Token"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(headerToken))
            headerToken = context.Request.Headers["X-XSRF-Token"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(headerToken)) return false;

        var cookieBytes = Encoding.UTF8.GetBytes(cookieToken);
        var headerBytes = Encoding.UTF8.GetBytes(headerToken.Trim());
        return cookieBytes.Length == headerBytes.Length &&
               CryptographicOperations.FixedTimeEquals(cookieBytes, headerBytes);
    }

    private static bool IsTrustedOrigin(string origin, string referer, IConfiguration config)
    {
        var allowed = ParseAllowedOrigins(config);

        if (allowed.Count == 0) return false;
        if (!string.IsNullOrWhiteSpace(origin) && allowed.Contains(origin)) return true;

        if (!string.IsNullOrWhiteSpace(referer))
        {
            foreach (var a in allowed)
            {
                if (referer.StartsWith(a, StringComparison.OrdinalIgnoreCase)) return true;
            }
        }

        return false;
    }

    private static HashSet<string> ParseAllowedOrigins(IConfiguration config)
    {
        var raw = config["AllowedOrigins"] ?? string.Empty;
        var parsed = raw
            .Split(new[] { ',', ';', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(x => x.Trim().TrimEnd('/'))
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        if (parsed.Count == 0)
        {
            parsed.Add("https://textzy-frontend-production.up.railway.app");
            parsed.Add("https://textzy-backend-production.up.railway.app");
            parsed.Add("http://localhost:3000");
            parsed.Add("http://localhost:5173");
        }

        return parsed;
    }
}
