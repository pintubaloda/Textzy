# Textzy Enterprise Roadmap (Control + Tenant DB Split)

## Current Achieved Milestone

### 1) Control Plane DB
`ControlDbContext` stores:
- Tenants (with `DataConnectionString` registry)
- Users
- TenantUsers (roles)
- SessionTokens

### 2) Tenant Plane DB
`TenantDbContext` stores tenant domain data:
- Campaigns
- Messages
- Templates
- Contacts + Groups
- Chatbot Config
- SMS Flows + Input Fields

### 3) Dynamic Tenant DB Routing
- `TenantMiddleware` resolves tenant by `X-Tenant-Slug` from control DB.
- `TenancyContext` stores `TenantId`, `TenantSlug`, `DataConnectionString`.
- `TenantDbContext` uses resolved tenant connection string per request.

This is the key architectural step toward full **DB-per-tenant** isolation.

## Next Required Milestones
1. Replace direct connection string in tenant table with encrypted secret reference.
2. Add tenant provisioning pipeline (create DB, run migrations, seed defaults).
3. Add background job worker for campaign queue + webhook processing.
4. Add WhatsApp provider adapters + signature verification.
5. Add billing/metering and super-admin controls.
