-- One-time demo login seed/reset script (idempotent)
-- Credentials after run:
--   owner@textzy.local / Owner@123
--   admin@textzy.local / ChangeMe@123
--
-- Notes:
-- - Uses fixed PBKDF2(SHA256, 100000) hashes compatible with PasswordHasher.cs.
-- - Ensures users are active.
-- - Ensures at least one tenant exists so owner login can resolve a tenant.
-- - Ensures admin is mapped to one tenant.

BEGIN;

-- 1) Ensure at least one tenant exists.
INSERT INTO "Tenants" ("Id", "Name", "Slug", "OwnerGroupId", "DataConnectionString", "CreatedAtUtc")
SELECT gen_random_uuid(), 'Default Project', 'default-project', NULL, '', now()
WHERE NOT EXISTS (SELECT 1 FROM "Tenants");

-- 2) Upsert platform owner.
INSERT INTO "Users"
("Id", "Email", "FullName", "PasswordHash", "PasswordSalt", "IsActive", "IsSuperAdmin", "CreatedAtUtc")
VALUES
(gen_random_uuid(),
 'owner@textzy.local',
 'Platform Owner',
 'macFwhgbK2puL0LLflKPQbxc7Z1Xre9WV6Qx4EsOjNg=',
 'AAAAAAAAAAAAAAAAAAAAAA==',
 true,
 true,
 now())
ON CONFLICT ("Email") DO UPDATE SET
  "FullName" = EXCLUDED."FullName",
  "PasswordHash" = EXCLUDED."PasswordHash",
  "PasswordSalt" = EXCLUDED."PasswordSalt",
  "IsActive" = true,
  "IsSuperAdmin" = true;

-- 3) Upsert admin user.
INSERT INTO "Users"
("Id", "Email", "FullName", "PasswordHash", "PasswordSalt", "IsActive", "IsSuperAdmin", "CreatedAtUtc")
VALUES
(gen_random_uuid(),
 'admin@textzy.local',
 'Textzy Admin',
 '8HkfWmsuv8SNoNDOZGd8RW02CWWPI5zdg0E6hUi4AR4=',
 'AAAAAAAAAAAAAAAAAAAAAA==',
 true,
 false,
 now())
ON CONFLICT ("Email") DO UPDATE SET
  "FullName" = EXCLUDED."FullName",
  "PasswordHash" = EXCLUDED."PasswordHash",
  "PasswordSalt" = EXCLUDED."PasswordSalt",
  "IsActive" = true,
  "IsSuperAdmin" = false;

-- 4) Ensure admin has at least one tenant membership.
WITH first_tenant AS (
  SELECT "Id" FROM "Tenants" ORDER BY "CreatedAtUtc" ASC LIMIT 1
),
admin_user AS (
  SELECT "Id" AS "UserId" FROM "Users" WHERE "Email" = 'admin@textzy.local' LIMIT 1
)
INSERT INTO "TenantUsers" ("Id", "TenantId", "UserId", "Role", "CreatedAtUtc")
SELECT gen_random_uuid(), t."Id", a."UserId", 'owner', now()
FROM first_tenant t
CROSS JOIN admin_user a
WHERE NOT EXISTS (
  SELECT 1
  FROM "TenantUsers" tu
  WHERE tu."TenantId" = t."Id" AND tu."UserId" = a."UserId"
);

COMMIT;

