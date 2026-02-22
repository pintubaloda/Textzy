using Microsoft.EntityFrameworkCore;
using Textzy.Api.Models;

namespace Textzy.Api.Data;

public class ControlDbContext(DbContextOptions<ControlDbContext> options) : DbContext(options)
{
    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<User> Users => Set<User>();
    public DbSet<TenantUser> TenantUsers => Set<TenantUser>();
    public DbSet<SessionToken> SessionTokens => Set<SessionToken>();
    public DbSet<PlatformSetting> PlatformSettings => Set<PlatformSetting>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<TeamInvitation> TeamInvitations => Set<TeamInvitation>();
    public DbSet<TenantUserPermissionOverride> TenantUserPermissionOverrides => Set<TenantUserPermissionOverride>();
    public DbSet<BillingPlan> BillingPlans => Set<BillingPlan>();
    public DbSet<TenantSubscription> TenantSubscriptions => Set<TenantSubscription>();
    public DbSet<TenantUsage> TenantUsages => Set<TenantUsage>();
    public DbSet<BillingInvoice> BillingInvoices => Set<BillingInvoice>();
    public DbSet<WebhookEvent> WebhookEvents => Set<WebhookEvent>();
}
