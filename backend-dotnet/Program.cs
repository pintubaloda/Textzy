using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.HttpOverrides;
using Npgsql;
using System.Text.RegularExpressions;
using Textzy.Api.Data;
using Textzy.Api.Middleware;
using Textzy.Api.Providers;
using Textzy.Api.Services;

var builder = WebApplication.CreateBuilder(args);

if (builder.Environment.IsProduction())
{
    builder.Logging.ClearProviders();
    builder.Logging.AddConsole();
    builder.Logging.AddFilter("Default", LogLevel.Warning);
    builder.Logging.AddFilter("Microsoft", LogLevel.Warning);
    builder.Logging.AddFilter("Microsoft.AspNetCore", LogLevel.Warning);
    builder.Logging.AddFilter("Microsoft.AspNetCore.Hosting.Diagnostics", LogLevel.Warning);
    builder.Logging.AddFilter("Microsoft.EntityFrameworkCore", LogLevel.Warning);
    builder.Logging.AddFilter("Microsoft.EntityFrameworkCore.Database.Command", LogLevel.Error);
    builder.Logging.AddFilter("System", LogLevel.Warning);
}

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddCors(options =>
{
    options.AddPolicy("frontend", policy =>
    {
        var origins = builder.Configuration["AllowedOrigins"]?
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var normalized = origins?
            .Select(o => (o ?? string.Empty).Trim().TrimEnd('/'))
            .Where(o => !string.IsNullOrWhiteSpace(o))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        if (normalized is { Length: > 0 }) policy.WithOrigins(normalized).AllowAnyHeader().AllowAnyMethod().AllowCredentials();
        else policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
    });
});

var rawControlConnection = (builder.Environment.IsProduction()
        ? FirstNonEmpty(
            builder.Configuration["DATABASE_URL"],
            builder.Configuration["DATABASE_PUBLIC_URL"],
            builder.Configuration["POSTGRES_URL"],
            builder.Configuration.GetConnectionString("Default"))
        : FirstNonEmpty(
            builder.Configuration.GetConnectionString("Default"),
            builder.Configuration["DATABASE_URL"],
            builder.Configuration["DATABASE_PUBLIC_URL"],
            builder.Configuration["POSTGRES_URL"]));

string controlConnection;
if (string.IsNullOrWhiteSpace(rawControlConnection))
{
    controlConnection = BuildFromPgEnvironment()
        ?? throw new InvalidOperationException("Connection string is missing. Set ConnectionStrings__Default, DATABASE_URL, or PG* variables.");
}
else
{
    try
    {
        controlConnection = NormalizeConnectionString(rawControlConnection);
    }
    catch when (builder.Environment.IsProduction())
    {
        controlConnection = BuildFromPgEnvironment()
            ?? throw new InvalidOperationException("Invalid Postgres URL in ConnectionStrings__Default/DATABASE_URL and PG* fallback values are missing or invalid.");
    }
}

if (builder.Environment.IsProduction() &&
    (controlConnection.Contains("Host=localhost", StringComparison.OrdinalIgnoreCase) ||
     controlConnection.Contains("127.0.0.1", StringComparison.OrdinalIgnoreCase)))
{
    var pgFallback = BuildFromPgEnvironment();
    if (!string.IsNullOrWhiteSpace(pgFallback))
    {
        controlConnection = pgFallback;
    }
    else
    {
        throw new InvalidOperationException("Production DB connection is pointing to localhost. Set ConnectionStrings__Default or DATABASE_URL to external Postgres.");
    }
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
builder.Services.AddScoped<SecretCryptoService>();
builder.Services.AddScoped<AuditLogService>();
builder.Services.AddScoped<EmailService>();
builder.Services.AddScoped<BillingGuardService>();
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
            EnsureTenantCoreSchema(tenantDb);
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
    db.Database.ExecuteSqlRaw("""
        CREATE TABLE IF NOT EXISTS "PlatformSettings" (
            "Id" uuid PRIMARY KEY,
            "Scope" text NOT NULL,
            "Key" text NOT NULL,
            "ValueEncrypted" text NOT NULL,
            "UpdatedByUserId" uuid NOT NULL,
            "UpdatedAtUtc" timestamp with time zone NOT NULL
        );
        """);
    db.Database.ExecuteSqlRaw("""CREATE UNIQUE INDEX IF NOT EXISTS "IX_PlatformSettings_Scope_Key" ON "PlatformSettings" ("Scope","Key");""");
    db.Database.ExecuteSqlRaw("""
        CREATE TABLE IF NOT EXISTS "AuditLogs" (
            "Id" uuid PRIMARY KEY,
            "TenantId" uuid NULL,
            "ActorUserId" uuid NOT NULL,
            "Action" text NOT NULL,
            "Details" text NOT NULL,
            "CreatedAtUtc" timestamp with time zone NOT NULL
        );
        """);
    db.Database.ExecuteSqlRaw("""CREATE INDEX IF NOT EXISTS "IX_AuditLogs_CreatedAtUtc" ON "AuditLogs" ("CreatedAtUtc");""");

    db.Database.ExecuteSqlRaw("""
        CREATE TABLE IF NOT EXISTS "TeamInvitations" (
            "Id" uuid PRIMARY KEY,
            "TenantId" uuid NOT NULL,
            "Email" text NOT NULL,
            "Name" text NOT NULL,
            "Role" text NOT NULL,
            "TokenHash" text NOT NULL,
            "Status" text NOT NULL,
            "SendCount" integer NOT NULL,
            "SentAtUtc" timestamp with time zone NOT NULL,
            "ExpiresAtUtc" timestamp with time zone NOT NULL,
            "AcceptedAtUtc" timestamp with time zone NULL,
            "CreatedAtUtc" timestamp with time zone NOT NULL,
            "CreatedByUserId" uuid NOT NULL
        );
        """);
    db.Database.ExecuteSqlRaw("""CREATE INDEX IF NOT EXISTS "IX_TeamInvitations_Tenant_Email_Status" ON "TeamInvitations" ("TenantId","Email","Status");""");
    db.Database.ExecuteSqlRaw("""CREATE INDEX IF NOT EXISTS "IX_TeamInvitations_TokenHash" ON "TeamInvitations" ("TokenHash");""");

    db.Database.ExecuteSqlRaw("""
        CREATE TABLE IF NOT EXISTS "TenantUserPermissionOverrides" (
            "Id" uuid PRIMARY KEY,
            "TenantId" uuid NOT NULL,
            "UserId" uuid NOT NULL,
            "Permission" text NOT NULL,
            "IsAllowed" boolean NOT NULL,
            "CreatedAtUtc" timestamp with time zone NOT NULL
        );
        """);
    db.Database.ExecuteSqlRaw("""CREATE UNIQUE INDEX IF NOT EXISTS "IX_TenantUserPermissionOverrides_Tenant_User_Permission" ON "TenantUserPermissionOverrides" ("TenantId","UserId","Permission");""");

    db.Database.ExecuteSqlRaw("""
        CREATE TABLE IF NOT EXISTS "BillingPlans" (
            "Id" uuid PRIMARY KEY,
            "Code" text NOT NULL,
            "Name" text NOT NULL,
            "PriceMonthly" numeric(18,2) NOT NULL,
            "PriceYearly" numeric(18,2) NOT NULL,
            "Currency" text NOT NULL,
            "IsActive" boolean NOT NULL,
            "SortOrder" integer NOT NULL,
            "FeaturesJson" text NOT NULL,
            "LimitsJson" text NOT NULL,
            "CreatedAtUtc" timestamp with time zone NOT NULL,
            "UpdatedAtUtc" timestamp with time zone NOT NULL
        );
        """);
    db.Database.ExecuteSqlRaw("""CREATE UNIQUE INDEX IF NOT EXISTS "IX_BillingPlans_Code" ON "BillingPlans" ("Code");""");

    db.Database.ExecuteSqlRaw("""
        CREATE TABLE IF NOT EXISTS "TenantSubscriptions" (
            "Id" uuid PRIMARY KEY,
            "TenantId" uuid NOT NULL,
            "PlanId" uuid NOT NULL,
            "Status" text NOT NULL,
            "BillingCycle" text NOT NULL,
            "StartedAtUtc" timestamp with time zone NOT NULL,
            "RenewAtUtc" timestamp with time zone NOT NULL,
            "CancelledAtUtc" timestamp with time zone NULL,
            "CreatedAtUtc" timestamp with time zone NOT NULL,
            "UpdatedAtUtc" timestamp with time zone NOT NULL
        );
        """);
    db.Database.ExecuteSqlRaw("""CREATE INDEX IF NOT EXISTS "IX_TenantSubscriptions_TenantId" ON "TenantSubscriptions" ("TenantId");""");

    db.Database.ExecuteSqlRaw("""
        CREATE TABLE IF NOT EXISTS "TenantUsages" (
            "Id" uuid PRIMARY KEY,
            "TenantId" uuid NOT NULL,
            "MonthKey" text NOT NULL,
            "WhatsappMessagesUsed" integer NOT NULL,
            "SmsCreditsUsed" integer NOT NULL,
            "ContactsUsed" integer NOT NULL,
            "TeamMembersUsed" integer NOT NULL,
            "ChatbotsUsed" integer NOT NULL,
            "FlowsUsed" integer NOT NULL,
            "ApiCallsUsed" integer NOT NULL,
            "UpdatedAtUtc" timestamp with time zone NOT NULL
        );
        """);
    db.Database.ExecuteSqlRaw("""CREATE UNIQUE INDEX IF NOT EXISTS "IX_TenantUsages_Tenant_Month" ON "TenantUsages" ("TenantId","MonthKey");""");

    db.Database.ExecuteSqlRaw("""
        CREATE TABLE IF NOT EXISTS "BillingInvoices" (
            "Id" uuid PRIMARY KEY,
            "InvoiceNo" text NOT NULL,
            "TenantId" uuid NOT NULL,
            "PeriodStartUtc" timestamp with time zone NOT NULL,
            "PeriodEndUtc" timestamp with time zone NOT NULL,
            "Subtotal" numeric(18,2) NOT NULL,
            "TaxAmount" numeric(18,2) NOT NULL,
            "Total" numeric(18,2) NOT NULL,
            "Status" text NOT NULL,
            "PaidAtUtc" timestamp with time zone NULL,
            "PdfUrl" text NOT NULL,
            "CreatedAtUtc" timestamp with time zone NOT NULL
        );
        """);
    db.Database.ExecuteSqlRaw("""CREATE INDEX IF NOT EXISTS "IX_BillingInvoices_TenantId" ON "BillingInvoices" ("TenantId");""");
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

    // Remove hidden whitespace/newlines that can appear in env UI paste for URLs.
    var noWhitespace = Regex.Replace(value, @"\s+", string.Empty).Trim();

    // If the value has extra text, extract the first postgres URL segment.
    var urlMatch = Regex.Match(noWhitespace, @"(postgres(?:ql)?://\S+)", RegexOptions.IgnoreCase);
    if (urlMatch.Success)
    {
        value = urlMatch.Groups[1].Value.Trim().Trim('"', '\'');
    }
    else
    {
        value = value.Trim();
    }

    if (value.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) ||
        value.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
    {
        if (TryBuildFromUrl(value, out var urlConn))
        {
            return urlConn;
        }
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

static string? BuildFromPgEnvironment()
{
    var host = FirstNonEmpty(
        Environment.GetEnvironmentVariable("PGHOST"),
        Environment.GetEnvironmentVariable("POSTGRES_HOST"),
        Environment.GetEnvironmentVariable("DB_HOST"));
    var port = FirstNonEmpty(
        Environment.GetEnvironmentVariable("PGPORT"),
        Environment.GetEnvironmentVariable("POSTGRES_PORT"),
        Environment.GetEnvironmentVariable("DB_PORT"));
    var user = FirstNonEmpty(
        Environment.GetEnvironmentVariable("PGUSER"),
        Environment.GetEnvironmentVariable("POSTGRES_USER"),
        Environment.GetEnvironmentVariable("DB_USER"));
    var pass = FirstNonEmpty(
        Environment.GetEnvironmentVariable("PGPASSWORD"),
        Environment.GetEnvironmentVariable("POSTGRES_PASSWORD"),
        Environment.GetEnvironmentVariable("DB_PASSWORD"));
    var db = FirstNonEmpty(
        Environment.GetEnvironmentVariable("PGDATABASE"),
        Environment.GetEnvironmentVariable("POSTGRES_DB"),
        Environment.GetEnvironmentVariable("DB_NAME"));
    var sslMode = FirstNonEmpty(
        Environment.GetEnvironmentVariable("PGSSLMODE"),
        Environment.GetEnvironmentVariable("POSTGRES_SSLMODE"),
        Environment.GetEnvironmentVariable("DB_SSLMODE"));

    if (string.IsNullOrWhiteSpace(host) ||
        string.IsNullOrWhiteSpace(port) ||
        string.IsNullOrWhiteSpace(user) ||
        string.IsNullOrWhiteSpace(pass) ||
        string.IsNullOrWhiteSpace(db))
    {
        return null;
    }

    var builder = new NpgsqlConnectionStringBuilder
    {
        Host = host.Trim(),
        Port = int.TryParse(port, out var p) ? p : 5432,
        Username = user.Trim(),
        Password = pass,
        Database = db.Trim()
    };

    var ssl = (sslMode ?? string.Empty).Trim().ToLowerInvariant();
    if (ssl is "require" or "prefer" or "verify-ca" or "verify-full")
    {
        builder.SslMode = ssl switch
        {
            "require" => SslMode.Require,
            "prefer" => SslMode.Prefer,
            "verify-ca" => SslMode.VerifyCA,
            "verify-full" => SslMode.VerifyFull,
            _ => SslMode.Prefer
        };
        builder.TrustServerCertificate = ssl is "require" or "prefer";
    }
    else
    {
        builder.SslMode = SslMode.Require;
        builder.TrustServerCertificate = true;
    }

    return builder.ConnectionString;
}

static bool TryBuildFromUrl(string url, out string connectionString)
{
    connectionString = string.Empty;
    var cleaned = (url ?? string.Empty).Trim().Trim('"', '\'');
    if (!Uri.TryCreate(cleaned, UriKind.Absolute, out var uri))
    {
        return false;
    }

    if (!uri.Scheme.Equals("postgres", StringComparison.OrdinalIgnoreCase) &&
        !uri.Scheme.Equals("postgresql", StringComparison.OrdinalIgnoreCase))
    {
        return false;
    }

    var userInfo = uri.UserInfo.Split(':', 2);
    var username = userInfo.Length > 0 ? Uri.UnescapeDataString(userInfo[0]) : string.Empty;
    var password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : string.Empty;
    var database = uri.AbsolutePath.Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? string.Empty;
    var query = Microsoft.AspNetCore.WebUtilities.QueryHelpers.ParseQuery(uri.Query);
    var sslMode = query.TryGetValue("sslmode", out var ssl) ? ssl.ToString() : "require";

    var csb = new NpgsqlConnectionStringBuilder
    {
        Host = uri.Host,
        Port = uri.Port > 0 ? uri.Port : 5432,
        Username = username,
        Password = password,
        Database = database
    };

    csb.SslMode = sslMode.ToLowerInvariant() switch
    {
        "disable" => SslMode.Disable,
        "allow" => SslMode.Allow,
        "prefer" => SslMode.Prefer,
        "verify-ca" => SslMode.VerifyCA,
        "verify-full" => SslMode.VerifyFull,
        _ => SslMode.Require
    };
    csb.TrustServerCertificate = csb.SslMode is SslMode.Require or SslMode.Prefer;
    connectionString = csb.ConnectionString;
    return true;
}

static string? FirstNonEmpty(params string?[] values)
{
    foreach (var value in values)
    {
        if (!string.IsNullOrWhiteSpace(value))
        {
            return value;
        }
    }

    return null;
}

static void EnsureTenantWabaSchema(TenantDbContext db)
{
    db.Database.ExecuteSqlRaw("""
        CREATE TABLE IF NOT EXISTS "TenantWabaConfigs" (
            "Id" uuid PRIMARY KEY,
            "TenantId" uuid NOT NULL,
            "WabaId" text NOT NULL DEFAULT '',
            "PhoneNumberId" text NOT NULL DEFAULT '',
            "BusinessAccountName" text NOT NULL DEFAULT '',
            "DisplayPhoneNumber" text NOT NULL DEFAULT '',
            "AccessToken" text NOT NULL DEFAULT '',
            "IsActive" boolean NOT NULL DEFAULT false,
            "ConnectedAtUtc" timestamp with time zone NOT NULL DEFAULT now()
        );
        """);

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

static void EnsureTenantCoreSchema(TenantDbContext db)
{
    db.Database.ExecuteSqlRaw("""CREATE TABLE IF NOT EXISTS "Campaigns" ("Id" uuid PRIMARY KEY, "TenantId" uuid NOT NULL, "Name" text NOT NULL DEFAULT '', "Channel" integer NOT NULL DEFAULT 0, "TemplateText" text NOT NULL DEFAULT '', "CreatedAtUtc" timestamp with time zone NOT NULL DEFAULT now());""");
    db.Database.ExecuteSqlRaw("""CREATE TABLE IF NOT EXISTS "Messages" ("Id" uuid PRIMARY KEY, "TenantId" uuid NOT NULL, "CampaignId" uuid NULL, "Channel" integer NOT NULL DEFAULT 0, "Recipient" text NOT NULL DEFAULT '', "Body" text NOT NULL DEFAULT '', "MessageType" text NOT NULL DEFAULT 'session', "DeliveredAtUtc" timestamp with time zone NULL, "ReadAtUtc" timestamp with time zone NULL, "ProviderMessageId" text NOT NULL DEFAULT '', "Status" text NOT NULL DEFAULT 'Queued', "CreatedAtUtc" timestamp with time zone NOT NULL DEFAULT now());""");
    db.Database.ExecuteSqlRaw("""CREATE TABLE IF NOT EXISTS "Templates" ("Id" uuid PRIMARY KEY, "TenantId" uuid NOT NULL, "Name" text NOT NULL DEFAULT '', "Channel" integer NOT NULL DEFAULT 0, "Category" text NOT NULL DEFAULT 'UTILITY', "Language" text NOT NULL DEFAULT 'en', "Body" text NOT NULL DEFAULT '', "LifecycleStatus" text NOT NULL DEFAULT 'draft', "Version" integer NOT NULL DEFAULT 1, "VariantGroup" text NOT NULL DEFAULT '', "Status" text NOT NULL DEFAULT 'Approved', "CreatedAtUtc" timestamp with time zone NOT NULL DEFAULT now());""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "Templates" ADD COLUMN IF NOT EXISTS "DltEntityId" text NOT NULL DEFAULT '';""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "Templates" ADD COLUMN IF NOT EXISTS "DltTemplateId" text NOT NULL DEFAULT '';""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "Templates" ADD COLUMN IF NOT EXISTS "SmsSenderId" text NOT NULL DEFAULT '';""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "Templates" ADD COLUMN IF NOT EXISTS "HeaderType" text NOT NULL DEFAULT 'none';""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "Templates" ADD COLUMN IF NOT EXISTS "HeaderText" text NOT NULL DEFAULT '';""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "Templates" ADD COLUMN IF NOT EXISTS "FooterText" text NOT NULL DEFAULT '';""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "Templates" ADD COLUMN IF NOT EXISTS "ButtonsJson" text NOT NULL DEFAULT '';""");
    db.Database.ExecuteSqlRaw("""CREATE TABLE IF NOT EXISTS "ContactGroups" ("Id" uuid PRIMARY KEY, "TenantId" uuid NOT NULL, "Name" text NOT NULL DEFAULT '', "CreatedAtUtc" timestamp with time zone NOT NULL DEFAULT now());""");
    db.Database.ExecuteSqlRaw("""CREATE TABLE IF NOT EXISTS "Contacts" ("Id" uuid PRIMARY KEY, "TenantId" uuid NOT NULL, "GroupId" uuid NULL, "SegmentId" uuid NULL, "Name" text NOT NULL DEFAULT '', "Email" text NOT NULL DEFAULT '', "TagsCsv" text NOT NULL DEFAULT '', "Phone" text NOT NULL DEFAULT '', "OptInStatus" text NOT NULL DEFAULT 'unknown', "CreatedAtUtc" timestamp with time zone NOT NULL DEFAULT now());""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "SegmentId" uuid NULL;""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "Email" text NOT NULL DEFAULT '';""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "TagsCsv" text NOT NULL DEFAULT '';""");
    db.Database.ExecuteSqlRaw("""CREATE TABLE IF NOT EXISTS "ChatbotConfigs" ("Id" uuid PRIMARY KEY, "TenantId" uuid NOT NULL, "Greeting" text NOT NULL DEFAULT 'Hi! Welcome.', "Fallback" text NOT NULL DEFAULT 'Agent will join shortly.', "HandoffEnabled" boolean NOT NULL DEFAULT true, "UpdatedAtUtc" timestamp with time zone NOT NULL DEFAULT now());""");
    db.Database.ExecuteSqlRaw("""CREATE TABLE IF NOT EXISTS "SmsFlows" ("Id" uuid PRIMARY KEY, "TenantId" uuid NOT NULL, "Name" text NOT NULL DEFAULT '', "Status" text NOT NULL DEFAULT 'Active', "SentCount" integer NOT NULL DEFAULT 0, "CreatedAtUtc" timestamp with time zone NOT NULL DEFAULT now());""");
    db.Database.ExecuteSqlRaw("""CREATE TABLE IF NOT EXISTS "SmsInputFields" ("Id" uuid PRIMARY KEY, "TenantId" uuid NOT NULL, "Name" text NOT NULL DEFAULT '', "Type" text NOT NULL DEFAULT 'text', "CreatedAtUtc" timestamp with time zone NOT NULL DEFAULT now());""");
    db.Database.ExecuteSqlRaw("""CREATE TABLE IF NOT EXISTS "SmsSenders" ("Id" uuid PRIMARY KEY, "TenantId" uuid NOT NULL, "SenderId" text NOT NULL DEFAULT '', "EntityId" text NOT NULL DEFAULT '', "IsActive" boolean NOT NULL DEFAULT true, "CreatedAtUtc" timestamp with time zone NOT NULL DEFAULT now());""");
    db.Database.ExecuteSqlRaw("""CREATE TABLE IF NOT EXISTS "ConversationWindows" ("Id" uuid PRIMARY KEY, "TenantId" uuid NOT NULL, "Recipient" text NOT NULL DEFAULT '', "LastInboundAtUtc" timestamp with time zone NOT NULL DEFAULT now(), "UpdatedAtUtc" timestamp with time zone NOT NULL DEFAULT now());""");
    db.Database.ExecuteSqlRaw("""CREATE TABLE IF NOT EXISTS "Conversations" ("Id" uuid PRIMARY KEY, "TenantId" uuid NOT NULL, "CustomerPhone" text NOT NULL DEFAULT '', "CustomerName" text NOT NULL DEFAULT '', "Status" text NOT NULL DEFAULT 'Open', "AssignedUserId" text NOT NULL DEFAULT '', "AssignedUserName" text NOT NULL DEFAULT '', "LabelsCsv" text NOT NULL DEFAULT '', "LastMessageAtUtc" timestamp with time zone NOT NULL DEFAULT now(), "CreatedAtUtc" timestamp with time zone NOT NULL DEFAULT now());""");
    db.Database.ExecuteSqlRaw("""CREATE TABLE IF NOT EXISTS "ConversationNotes" ("Id" uuid PRIMARY KEY, "TenantId" uuid NOT NULL, "ConversationId" uuid NOT NULL, "Body" text NOT NULL DEFAULT '', "CreatedByUserId" uuid NOT NULL, "CreatedByName" text NOT NULL DEFAULT '', "CreatedAtUtc" timestamp with time zone NOT NULL DEFAULT now());""");
    db.Database.ExecuteSqlRaw("""CREATE TABLE IF NOT EXISTS "ContactCustomFields" ("Id" uuid PRIMARY KEY, "TenantId" uuid NOT NULL, "ContactId" uuid NOT NULL, "FieldKey" text NOT NULL DEFAULT '', "FieldValue" text NOT NULL DEFAULT '', "UpdatedAtUtc" timestamp with time zone NOT NULL DEFAULT now());""");
    db.Database.ExecuteSqlRaw("""CREATE TABLE IF NOT EXISTS "ContactSegments" ("Id" uuid PRIMARY KEY, "TenantId" uuid NOT NULL, "Name" text NOT NULL DEFAULT '', "RuleJson" text NOT NULL DEFAULT '', "CreatedAtUtc" timestamp with time zone NOT NULL DEFAULT now());""");
    db.Database.ExecuteSqlRaw("""CREATE TABLE IF NOT EXISTS "BroadcastJobs" ("Id" uuid PRIMARY KEY, "TenantId" uuid NOT NULL, "Name" text NOT NULL DEFAULT '', "Channel" integer NOT NULL DEFAULT 0, "MessageBody" text NOT NULL DEFAULT '', "RecipientCsv" text NOT NULL DEFAULT '', "Status" text NOT NULL DEFAULT 'Queued', "RetryCount" integer NOT NULL DEFAULT 0, "MaxRetries" integer NOT NULL DEFAULT 3, "SentCount" integer NOT NULL DEFAULT 0, "FailedCount" integer NOT NULL DEFAULT 0, "CreatedAtUtc" timestamp with time zone NOT NULL DEFAULT now(), "StartedAtUtc" timestamp with time zone NULL, "CompletedAtUtc" timestamp with time zone NULL);""");
    db.Database.ExecuteSqlRaw("""CREATE TABLE IF NOT EXISTS "AutomationFlows" ("Id" uuid PRIMARY KEY, "TenantId" uuid NOT NULL, "Name" text NOT NULL DEFAULT '', "Description" text NOT NULL DEFAULT '', "Channel" text NOT NULL DEFAULT 'waba', "TriggerType" text NOT NULL DEFAULT 'keyword', "TriggerConfigJson" text NOT NULL DEFAULT '{{}}', "IsActive" boolean NOT NULL DEFAULT true, "LifecycleStatus" text NOT NULL DEFAULT 'draft', "CurrentVersionId" uuid NULL, "PublishedVersionId" uuid NULL, "LastPublishedAtUtc" timestamp with time zone NULL, "UpdatedAtUtc" timestamp with time zone NOT NULL DEFAULT now(), "CreatedAtUtc" timestamp with time zone NOT NULL DEFAULT now());""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "AutomationFlows" ADD COLUMN IF NOT EXISTS "Description" text NOT NULL DEFAULT '';""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "AutomationFlows" ADD COLUMN IF NOT EXISTS "Channel" text NOT NULL DEFAULT 'waba';""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "AutomationFlows" ADD COLUMN IF NOT EXISTS "TriggerConfigJson" text NOT NULL DEFAULT '{{}}';""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "AutomationFlows" ADD COLUMN IF NOT EXISTS "LifecycleStatus" text NOT NULL DEFAULT 'draft';""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "AutomationFlows" ADD COLUMN IF NOT EXISTS "CurrentVersionId" uuid NULL;""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "AutomationFlows" ADD COLUMN IF NOT EXISTS "PublishedVersionId" uuid NULL;""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "AutomationFlows" ADD COLUMN IF NOT EXISTS "LastPublishedAtUtc" timestamp with time zone NULL;""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "AutomationFlows" ADD COLUMN IF NOT EXISTS "UpdatedAtUtc" timestamp with time zone NOT NULL DEFAULT now();""");

    db.Database.ExecuteSqlRaw("""CREATE TABLE IF NOT EXISTS "AutomationFlowVersions" ("Id" uuid PRIMARY KEY, "TenantId" uuid NOT NULL, "FlowId" uuid NOT NULL, "VersionNumber" integer NOT NULL DEFAULT 1, "Status" text NOT NULL DEFAULT 'draft', "DefinitionJson" text NOT NULL DEFAULT '{{}}', "ChangeNote" text NOT NULL DEFAULT '', "IsStagedRelease" boolean NOT NULL DEFAULT false, "CreatedAtUtc" timestamp with time zone NOT NULL DEFAULT now(), "PublishedAtUtc" timestamp with time zone NULL);""");
    db.Database.ExecuteSqlRaw("""CREATE INDEX IF NOT EXISTS "IX_AutomationFlowVersions_FlowId" ON "AutomationFlowVersions" ("FlowId");""");

    db.Database.ExecuteSqlRaw("""CREATE TABLE IF NOT EXISTS "AutomationNodes" ("Id" uuid PRIMARY KEY, "TenantId" uuid NOT NULL, "FlowId" uuid NOT NULL, "VersionId" uuid NULL, "NodeKey" text NOT NULL DEFAULT '', "NodeType" text NOT NULL DEFAULT '', "Name" text NOT NULL DEFAULT '', "ConfigJson" text NOT NULL DEFAULT '', "EdgesJson" text NOT NULL DEFAULT '[]', "Sequence" integer NOT NULL DEFAULT 0, "IsReusable" boolean NOT NULL DEFAULT false);""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "AutomationNodes" ADD COLUMN IF NOT EXISTS "VersionId" uuid NULL;""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "AutomationNodes" ADD COLUMN IF NOT EXISTS "NodeKey" text NOT NULL DEFAULT '';""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "AutomationNodes" ADD COLUMN IF NOT EXISTS "Name" text NOT NULL DEFAULT '';""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "AutomationNodes" ADD COLUMN IF NOT EXISTS "EdgesJson" text NOT NULL DEFAULT '[]';""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "AutomationNodes" ADD COLUMN IF NOT EXISTS "IsReusable" boolean NOT NULL DEFAULT false;""");

    db.Database.ExecuteSqlRaw("""CREATE TABLE IF NOT EXISTS "AutomationRuns" ("Id" uuid PRIMARY KEY, "TenantId" uuid NOT NULL, "FlowId" uuid NOT NULL, "VersionId" uuid NULL, "Mode" text NOT NULL DEFAULT 'live', "TriggerType" text NOT NULL DEFAULT '', "IdempotencyKey" text NOT NULL DEFAULT '', "TriggerPayloadJson" text NOT NULL DEFAULT '{{}}', "Status" text NOT NULL DEFAULT 'Started', "Log" text NOT NULL DEFAULT '', "TraceJson" text NOT NULL DEFAULT '[]', "FailureReason" text NOT NULL DEFAULT '', "RetryCount" integer NOT NULL DEFAULT 0, "StartedAtUtc" timestamp with time zone NOT NULL DEFAULT now(), "CompletedAtUtc" timestamp with time zone NULL);""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "AutomationRuns" ADD COLUMN IF NOT EXISTS "VersionId" uuid NULL;""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "AutomationRuns" ADD COLUMN IF NOT EXISTS "Mode" text NOT NULL DEFAULT 'live';""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "AutomationRuns" ADD COLUMN IF NOT EXISTS "TriggerType" text NOT NULL DEFAULT '';""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "AutomationRuns" ADD COLUMN IF NOT EXISTS "IdempotencyKey" text NOT NULL DEFAULT '';""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "AutomationRuns" ADD COLUMN IF NOT EXISTS "TraceJson" text NOT NULL DEFAULT '[]';""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "AutomationRuns" ADD COLUMN IF NOT EXISTS "FailureReason" text NOT NULL DEFAULT '';""");
    db.Database.ExecuteSqlRaw("""ALTER TABLE "AutomationRuns" ADD COLUMN IF NOT EXISTS "RetryCount" integer NOT NULL DEFAULT 0;""");
    db.Database.ExecuteSqlRaw("""CREATE INDEX IF NOT EXISTS "IX_AutomationRuns_IdempotencyKey" ON "AutomationRuns" ("IdempotencyKey");""");

    db.Database.ExecuteSqlRaw("""CREATE TABLE IF NOT EXISTS "AutomationApprovals" ("Id" uuid PRIMARY KEY, "TenantId" uuid NOT NULL, "FlowId" uuid NOT NULL, "VersionId" uuid NOT NULL, "RequestedBy" text NOT NULL DEFAULT '', "RequestedByRole" text NOT NULL DEFAULT '', "Status" text NOT NULL DEFAULT 'pending', "DecisionComment" text NOT NULL DEFAULT '', "DecidedBy" text NOT NULL DEFAULT '', "RequestedAtUtc" timestamp with time zone NOT NULL DEFAULT now(), "DecidedAtUtc" timestamp with time zone NULL);""");
    db.Database.ExecuteSqlRaw("""CREATE INDEX IF NOT EXISTS "IX_AutomationApprovals_FlowId" ON "AutomationApprovals" ("FlowId");""");

    db.Database.ExecuteSqlRaw("""CREATE TABLE IF NOT EXISTS "AutomationUsageCounters" ("Id" uuid PRIMARY KEY, "TenantId" uuid NOT NULL, "BucketDateUtc" timestamp with time zone NOT NULL DEFAULT now(), "RunCount" integer NOT NULL DEFAULT 0, "ApiCallCount" integer NOT NULL DEFAULT 0, "ActiveFlowCount" integer NOT NULL DEFAULT 0, "UpdatedAtUtc" timestamp with time zone NOT NULL DEFAULT now());""");
    db.Database.ExecuteSqlRaw("""CREATE INDEX IF NOT EXISTS "IX_AutomationUsageCounters_Tenant_Bucket" ON "AutomationUsageCounters" ("TenantId","BucketDateUtc");""");

    db.Database.ExecuteSqlRaw("""CREATE TABLE IF NOT EXISTS "FaqKnowledgeItems" ("Id" uuid PRIMARY KEY, "TenantId" uuid NOT NULL, "Question" text NOT NULL DEFAULT '', "Answer" text NOT NULL DEFAULT '', "Category" text NOT NULL DEFAULT '', "IsActive" boolean NOT NULL DEFAULT true, "CreatedAtUtc" timestamp with time zone NOT NULL DEFAULT now(), "UpdatedAtUtc" timestamp with time zone NOT NULL DEFAULT now());""");
    db.Database.ExecuteSqlRaw("""CREATE INDEX IF NOT EXISTS "IX_FaqKnowledgeItems_Tenant_Active" ON "FaqKnowledgeItems" ("TenantId","IsActive");""");
}
