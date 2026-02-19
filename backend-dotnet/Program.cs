using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.HttpOverrides;
using Npgsql;
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

var rawControlConnection = builder.Configuration.GetConnectionString("Default")
    ?? builder.Configuration["DATABASE_URL"]
    ?? throw new InvalidOperationException("Connection string is missing. Set ConnectionStrings__Default or DATABASE_URL.");

var controlConnection = NormalizeConnectionString(rawControlConnection);

if (builder.Environment.IsProduction() &&
    (controlConnection.Contains("Host=localhost", StringComparison.OrdinalIgnoreCase) ||
     controlConnection.Contains("127.0.0.1", StringComparison.OrdinalIgnoreCase)))
{
    throw new InvalidOperationException("Production DB connection is pointing to localhost. Set ConnectionStrings__Default or DATABASE_URL to external Postgres.");
}

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

var forwardedHeadersOptions = new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
};
forwardedHeadersOptions.KnownNetworks.Clear();
forwardedHeadersOptions.KnownProxies.Clear();
app.UseForwardedHeaders(forwardedHeadersOptions);

using (var scope = app.Services.CreateScope())
{
    var controlDb = scope.ServiceProvider.GetRequiredService<ControlDbContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("Startup");
    EnsureControlAuthSchema(controlDb);
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
            EnsureTenantWabaSchema(tenantDb);
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

if (!app.Environment.IsProduction())
{
    app.UseHttpsRedirection();
}
app.UseCors("frontend");
app.UseMiddleware<TenantMiddleware>();
app.UseMiddleware<AuthMiddleware>();
app.MapControllers();
app.MapHub<Textzy.Api.Services.InboxHub>("/hubs/inbox");
app.Run();

static void EnsureControlAuthSchema(ControlDbContext db)
{
    db.Database.ExecuteSqlRaw("""
        CREATE TABLE IF NOT EXISTS "Tenants" (
            "Id" uuid PRIMARY KEY,
            "Name" text NOT NULL,
            "Slug" text NOT NULL,
            "DataConnectionString" text NOT NULL,
            "CreatedAtUtc" timestamp with time zone NOT NULL
        );
        """);

    db.Database.ExecuteSqlRaw("""CREATE UNIQUE INDEX IF NOT EXISTS "IX_Tenants_Slug" ON "Tenants" ("Slug");""");

    db.Database.ExecuteSqlRaw("""
        CREATE TABLE IF NOT EXISTS "Users" (
            "Id" uuid PRIMARY KEY,
            "Email" text NOT NULL,
            "FullName" text NOT NULL,
            "PasswordHash" text NOT NULL,
            "PasswordSalt" text NOT NULL,
            "IsActive" boolean NOT NULL,
            "IsSuperAdmin" boolean NOT NULL,
            "CreatedAtUtc" timestamp with time zone NOT NULL
        );
        """);

    db.Database.ExecuteSqlRaw("""CREATE UNIQUE INDEX IF NOT EXISTS "IX_Users_Email" ON "Users" ("Email");""");

    db.Database.ExecuteSqlRaw("""
        CREATE TABLE IF NOT EXISTS "TenantUsers" (
            "Id" uuid PRIMARY KEY,
            "TenantId" uuid NOT NULL,
            "UserId" uuid NOT NULL,
            "Role" text NOT NULL,
            "CreatedAtUtc" timestamp with time zone NOT NULL
        );
        """);

    db.Database.ExecuteSqlRaw("""CREATE INDEX IF NOT EXISTS "IX_TenantUsers_UserId" ON "TenantUsers" ("UserId");""");
    db.Database.ExecuteSqlRaw("""CREATE INDEX IF NOT EXISTS "IX_TenantUsers_TenantId" ON "TenantUsers" ("TenantId");""");

    db.Database.ExecuteSqlRaw("""
        CREATE TABLE IF NOT EXISTS "SessionTokens" (
            "Id" uuid PRIMARY KEY,
            "UserId" uuid NOT NULL,
            "TenantId" uuid NOT NULL,
            "TokenHash" text NOT NULL,
            "ExpiresAtUtc" timestamp with time zone NOT NULL,
            "CreatedAtUtc" timestamp with time zone NOT NULL,
            "RevokedAtUtc" timestamp with time zone NULL
        );
        """);

    db.Database.ExecuteSqlRaw("""CREATE INDEX IF NOT EXISTS "IX_SessionTokens_TokenHash" ON "SessionTokens" ("TokenHash");""");
}

static string NormalizeConnectionString(string raw)
{
    var value = (raw ?? string.Empty).Trim().Trim('"', '\'');
    if (string.IsNullOrWhiteSpace(value))
        throw new InvalidOperationException("Database connection string is empty.");

    // Defensive cleanup in case env was pasted as a labeled line.
    if (value.StartsWith("External Database URL", StringComparison.OrdinalIgnoreCase) ||
        value.StartsWith("Internal Database URL", StringComparison.OrdinalIgnoreCase))
    {
        var idx = value.IndexOf("://", StringComparison.Ordinal);
        if (idx > 0)
        {
            var schemeStart = value.LastIndexOf(' ', idx);
            value = value[(schemeStart >= 0 ? schemeStart + 1 : 0)..].Trim();
        }
    }

    if (value.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) ||
        value.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
    {
        try
        {
            return new NpgsqlConnectionStringBuilder(value).ConnectionString;
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException("Invalid Postgres URL in ConnectionStrings__Default/DATABASE_URL.", ex);
        }
    }

    try
    {
        return new NpgsqlConnectionStringBuilder(value).ConnectionString;
    }
    catch (Exception ex)
    {
        throw new InvalidOperationException("Invalid key/value Postgres connection string in ConnectionStrings__Default/DATABASE_URL.", ex);
    }
}

static void EnsureTenantWabaSchema(TenantDbContext db)
{
    db.Database.ExecuteSqlRaw("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "OnboardingState" text NOT NULL DEFAULT 'requested';""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "OnboardingStartedAtUtc" timestamp with time zone NULL;""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "CodeReceivedAtUtc" timestamp with time zone NULL;""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "ExchangedAtUtc" timestamp with time zone NULL;""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "AssetsLinkedAtUtc" timestamp with time zone NULL;""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "WebhookSubscribedAtUtc" timestamp with time zone NULL;""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "WebhookVerifiedAtUtc" timestamp with time zone NULL;""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "LastError" text NOT NULL DEFAULT '';""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "LastGraphError" text NOT NULL DEFAULT '';""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "BusinessVerificationStatus" text NOT NULL DEFAULT '';""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "PhoneQualityRating" text NOT NULL DEFAULT '';""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "PhoneNameStatus" text NOT NULL DEFAULT '';""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "PermissionAuditPassed" boolean NOT NULL DEFAULT false;""");
}
