using Textzy.Api.Data;
using Textzy.Api.Services;

namespace Textzy.Api.Middleware;

public class TenantMiddleware(RequestDelegate next)
{
    private readonly RequestDelegate _next = next;

    public async Task Invoke(HttpContext context, ControlDbContext db, TenancyContext tenancy)
    {
        if (HttpMethods.IsOptions(context.Request.Method))
        {
            await _next(context);
            return;
        }

        var path = context.Request.Path.Value ?? string.Empty;
        var isSwaggerPath = path.StartsWith("/swagger", StringComparison.OrdinalIgnoreCase);
        var isWabaWebhook = path.StartsWith("/api/waba/webhook", StringComparison.OrdinalIgnoreCase);
        if (isSwaggerPath || isWabaWebhook)
        {
            await _next(context);
            return;
        }

        if (!context.Request.Headers.TryGetValue("X-Tenant-Slug", out var tenantSlug))
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            await context.Response.WriteAsync("Missing X-Tenant-Slug header.");
            return;
        }

        var tenant = db.Tenants.FirstOrDefault(t => t.Slug == tenantSlug.ToString());
        if (tenant is null)
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            await context.Response.WriteAsync("Tenant not found.");
            return;
        }

        tenancy.SetTenant(tenant.Id, tenant.Slug, tenant.DataConnectionString);
        await _next(context);
    }
}
