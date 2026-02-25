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
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "SegmentId" uuid NULL;""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "Email" text NOT NULL DEFAULT '';""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "TagsCsv" text NOT NULL DEFAULT '';""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "NameEncrypted" text NOT NULL DEFAULT '';""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "EmailEncrypted" text NOT NULL DEFAULT '';""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "PhoneEncrypted" text NOT NULL DEFAULT '';""", ct);
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "PhoneHash" text NOT NULL DEFAULT '';""", ct);
        await db.Database.ExecuteSqlRawAsync("""CREATE INDEX IF NOT EXISTS "IX_Contacts_Tenant_PhoneHash" ON "Contacts" ("TenantId","PhoneHash");""", ct);

        cache.Set(CacheKey(tenantId), true, TimeSpan.FromMinutes(30));
        logger.LogInformation("Tenant schema guard applied for tenantId={TenantId}", tenantId);
    }
}

