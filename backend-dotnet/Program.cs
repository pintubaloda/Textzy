using Microsoft.EntityFrameworkCore;
using Textzy.Api.Data;
using Textzy.Api.Middleware;
using Textzy.Api.Providers;
using Textzy.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddCors(options =>
{
    options.AddPolicy("frontend", policy =>
    {
        var origins = builder.Configuration["AllowedOrigins"]?
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (origins is { Length: > 0 }) policy.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod().AllowCredentials();
        else policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
    });
});

var controlConnection = builder.Configuration.GetConnectionString("Default")
    ?? builder.Configuration["DATABASE_URL"]
    ?? throw new InvalidOperationException("Connection string is missing. Set ConnectionStrings__Default or DATABASE_URL.");

builder.Services.AddDbContext<ControlDbContext>(opt => opt.UseNpgsql(controlConnection));
builder.Services.AddDbContext<TenantDbContext>((sp, opt) =>
{
    var tenancy = sp.GetRequiredService<TenancyContext>();
    var tenantConnection = string.IsNullOrWhiteSpace(tenancy.DataConnectionString)
        ? controlConnection
        : tenancy.DataConnectionString;
    opt.UseNpgsql(tenantConnection);
});

builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<TenancyContext>();
builder.Services.AddScoped<AuthContext>();
builder.Services.AddScoped<PasswordHasher>();
builder.Services.AddScoped<SessionService>();
builder.Services.AddScoped<RbacService>();
builder.Services.AddScoped<IMessageProvider, MockMessageProvider>();
builder.Services.AddScoped<MessagingService>();
builder.Services.Configure<WhatsAppOptions>(builder.Configuration.GetSection("WhatsApp"));
builder.Services.AddHttpClient();
builder.Services.AddSignalR();
builder.Services.AddScoped<WhatsAppCloudService>();
builder.Services.AddScoped<TenantProvisioningService>();
builder.Services.AddSingleton<BroadcastQueueService>();
builder.Services.AddHostedService<BroadcastWorker>();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var controlDb = scope.ServiceProvider.GetRequiredService<ControlDbContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("Startup");
    controlDb.Database.EnsureCreated();
    SeedData.InitializeControl(controlDb, controlConnection);

    var tenants = controlDb.Tenants.ToList();
    foreach (var tenant in tenants)
    {
        try
        {
            var tenantConn = string.IsNullOrWhiteSpace(tenant.DataConnectionString) ? controlConnection : tenant.DataConnectionString;
            using var tenantDb = SeedData.CreateTenantDbContext(tenantConn);
            tenantDb.Database.EnsureCreated();
            SeedData.InitializeTenant(tenantDb, tenant.Id);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Skipping tenant seed for {TenantSlug} due to DB connectivity/config issue.", tenant.Slug);
        }
    }
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseCors("frontend");
app.UseMiddleware<TenantMiddleware>();
app.UseMiddleware<AuthMiddleware>();
app.MapControllers();
app.MapHub<Textzy.Api.Services.InboxHub>("/hubs/inbox");
app.Run();
