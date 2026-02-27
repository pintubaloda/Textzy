using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Textzy.Api.Data;

namespace Textzy.Api.Services;

public class TenantSchemaGuardService(IMemoryCache cache, ILogger<TenantSchemaGuardService> logger)
{
    private static string CacheKey(Guid tenantId) => $"tenant_schema_guard:{tenantId:N}";

    public async Task EnsureContactEncryptionColumnsAsync(Guid tenantId, string tenantConnectionString, CancellationToken ct = default)
    {
        if (tenantId == Guid.Empty || string.IsNullOrWhiteSpace(tenantConnectionString)) return;
        if (cache.TryGetValue(CacheKey(tenantId), out _)) return;

        using var db = SeedData.CreateTenantDbContext(tenantConnectionString);
        // Contact/PII compatibility
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "SegmentId" uuid NULL;""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "Email" text NOT NULL DEFAULT '';""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "TagsCsv" text NOT NULL DEFAULT '';""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "NameEncrypted" text NOT NULL DEFAULT '';""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "EmailEncrypted" text NOT NULL DEFAULT '';""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "PhoneEncrypted" text NOT NULL DEFAULT '';""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "PhoneHash" text NOT NULL DEFAULT '';""", ct);
        await db.Database.ExecuteSqlRawAsync("""CREATE INDEX IF NOT EXISTS "IX_Contacts_Tenant_PhoneHash" ON "Contacts" ("TenantId","PhoneHash");""", ct);

        // WABA config compatibility for older tenant DBs
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "TenantWabaConfigs" (
                "Id" uuid PRIMARY KEY,
                "TenantId" uuid NOT NULL,
                "WabaId" text NOT NULL,
                "PhoneNumberId" text NOT NULL,
                "DisplayPhoneNumber" text NOT NULL,
                "BusinessAccountName" text NOT NULL,
                "AccessToken" text NOT NULL,
                "ConnectedAtUtc" timestamp with time zone NOT NULL,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "IsActive" boolean NOT NULL
            );
            """, ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "OnboardingState" text NOT NULL DEFAULT 'requested';""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "OnboardingStartedAtUtc" timestamp with time zone NULL;""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "CodeReceivedAtUtc" timestamp with time zone NULL;""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "ExchangedAtUtc" timestamp with time zone NULL;""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "AssetsLinkedAtUtc" timestamp with time zone NULL;""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "WebhookSubscribedAtUtc" timestamp with time zone NULL;""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "WebhookVerifiedAtUtc" timestamp with time zone NULL;""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "LastError" text NOT NULL DEFAULT '';""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "LastGraphError" text NOT NULL DEFAULT '';""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "BusinessVerificationStatus" text NOT NULL DEFAULT '';""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "PhoneQualityRating" text NOT NULL DEFAULT '';""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "PhoneNameStatus" text NOT NULL DEFAULT '';""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "MessagingLimitTier" text NOT NULL DEFAULT '';""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "AccountHealth" text NOT NULL DEFAULT '';""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "PermissionAuditPassed" boolean NOT NULL DEFAULT false;""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "BusinessManagerId" text NOT NULL DEFAULT '';""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "SystemUserId" text NOT NULL DEFAULT '';""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "SystemUserName" text NOT NULL DEFAULT '';""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "SystemUserCreatedAtUtc" timestamp with time zone NULL;""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "AssetsAssignedAtUtc" timestamp with time zone NULL;""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "PermanentTokenIssuedAtUtc" timestamp with time zone NULL;""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "PermanentTokenExpiresAtUtc" timestamp with time zone NULL;""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "TokenSource" text NOT NULL DEFAULT 'embedded_exchange';""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "TemplatesSyncedAtUtc" timestamp with time zone NULL;""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "TemplatesSyncStatus" text NOT NULL DEFAULT '';""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "TemplatesSyncFailCount" integer NOT NULL DEFAULT 0;""", ct);
        await db.Database.ExecuteSqlRawAsync("""CREATE INDEX IF NOT EXISTS "IX_TenantWabaConfigs_TenantId" ON "TenantWabaConfigs" ("TenantId");""", ct);

        cache.Set(CacheKey(tenantId), true, TimeSpan.FromMinutes(30));
        logger.LogInformation("Tenant schema guard applied for tenantId={TenantId}", tenantId);
    }
}
