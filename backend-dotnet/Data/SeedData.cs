using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using Textzy.Api.Models;
using Textzy.Api.Services;

namespace Textzy.Api.Data;

public static class SeedData
{
    public static void InitializeControl(ControlDbContext db, string defaultTenantConnection)
    {
        var tenantA = db.Tenants.FirstOrDefault(t => t.Slug == "demo-retail");
        if (tenantA is null)
        {
            tenantA = new Tenant
            {
                Id = Guid.NewGuid(),
                Name = "Demo Retail",
                Slug = "demo-retail",
                DataConnectionString = defaultTenantConnection
            };
            db.Tenants.Add(tenantA);
        }

        var tenantB = db.Tenants.FirstOrDefault(t => t.Slug == "demo-d2c");
        if (tenantB is null)
        {
            tenantB = new Tenant
            {
                Id = Guid.NewGuid(),
                Name = "Demo D2C",
                Slug = "demo-d2c",
                DataConnectionString = defaultTenantConnection
            };
            db.Tenants.Add(tenantB);
        }

        var hasher = new PasswordHasher();
        var (hash, salt) = hasher.HashPassword("ChangeMe@123");
        var (ownerHash, ownerSalt) = hasher.HashPassword("Owner@123");

        var user = db.Users.FirstOrDefault(u => u.Email == "admin@textzy.local");
        if (user is null)
        {
            user = new User
            {
                Id = Guid.NewGuid(),
                Email = "admin@textzy.local",
                FullName = "Textzy Admin",
                PasswordHash = hash,
                PasswordSalt = salt,
                IsActive = true,
                IsSuperAdmin = false
            };
            db.Users.Add(user);
        }
        else
        {
            // Keep demo login deterministic across environments.
            user.PasswordHash = hash;
            user.PasswordSalt = salt;
            user.IsActive = true;
            user.IsSuperAdmin = false;
        }

        var mappings = new (Guid TenantId, string Role)[]
        {
            (tenantA.Id, "owner"),
            (tenantB.Id, "admin"),
            (tenantA.Id, "manager")
        };

        foreach (var m in mappings)
        {
            var exists = db.TenantUsers.Any(tu => tu.UserId == user.Id && tu.TenantId == m.TenantId && tu.Role == m.Role);
            if (!exists)
            {
                db.TenantUsers.Add(new TenantUser
                {
                    Id = Guid.NewGuid(),
                    TenantId = m.TenantId,
                    UserId = user.Id,
                    Role = m.Role
                });
            }
        }

        var platformOwner = db.Users.FirstOrDefault(u => u.Email == "owner@textzy.local");
        if (platformOwner is null)
        {
            platformOwner = new User
            {
                Id = Guid.NewGuid(),
                Email = "owner@textzy.local",
                FullName = "Platform Owner",
                PasswordHash = ownerHash,
                PasswordSalt = ownerSalt,
                IsActive = true,
                IsSuperAdmin = true
            };
            db.Users.Add(platformOwner);
        }
        else
        {
            platformOwner.PasswordHash = ownerHash;
            platformOwner.PasswordSalt = ownerSalt;
            platformOwner.IsActive = true;
            platformOwner.IsSuperAdmin = true;
        }

        db.SaveChanges();

        EnsureBillingSeeds(db, tenantA.Id, tenantB.Id);
        db.SaveChanges();
    }

    private static void EnsureBillingSeeds(ControlDbContext db, Guid tenantAId, Guid tenantBId)
    {
        var starter = db.BillingPlans.FirstOrDefault(x => x.Code == "starter");
        if (starter is null)
        {
            starter = new BillingPlan
            {
                Id = Guid.NewGuid(),
                Code = "starter",
                Name = "Starter",
                PriceMonthly = 2999,
                PriceYearly = 29990,
                Currency = "INR",
                IsActive = true,
                SortOrder = 1,
                FeaturesJson = JsonSerializer.Serialize(new[] { "1,000 WhatsApp messages/month", "5,000 SMS credits", "2 Team members", "Basic analytics" }),
                LimitsJson = JsonSerializer.Serialize(new Dictionary<string, int>
                {
                    ["whatsappMessages"] = 1000,
                    ["smsCredits"] = 5000,
                    ["contacts"] = 5000,
                    ["teamMembers"] = 2,
                    ["chatbots"] = 1,
                    ["flows"] = 3
                })
            };
            db.BillingPlans.Add(starter);
        }

        var growth = db.BillingPlans.FirstOrDefault(x => x.Code == "growth");
        if (growth is null)
        {
            growth = new BillingPlan
            {
                Id = Guid.NewGuid(),
                Code = "growth",
                Name = "Growth",
                PriceMonthly = 9999,
                PriceYearly = 99990,
                Currency = "INR",
                IsActive = true,
                SortOrder = 2,
                FeaturesJson = JsonSerializer.Serialize(new[] { "10,000 WhatsApp messages/month", "50,000 SMS credits", "10 Team members", "Automation builder" }),
                LimitsJson = JsonSerializer.Serialize(new Dictionary<string, int>
                {
                    ["whatsappMessages"] = 10000,
                    ["smsCredits"] = 50000,
                    ["contacts"] = 50000,
                    ["teamMembers"] = 10,
                    ["chatbots"] = 5,
                    ["flows"] = 50
                })
            };
            db.BillingPlans.Add(growth);
        }

        var enterprise = db.BillingPlans.FirstOrDefault(x => x.Code == "enterprise");
        if (enterprise is null)
        {
            enterprise = new BillingPlan
            {
                Id = Guid.NewGuid(),
                Code = "enterprise",
                Name = "Enterprise",
                PriceMonthly = 49999,
                PriceYearly = 499990,
                Currency = "INR",
                IsActive = true,
                SortOrder = 3,
                FeaturesJson = JsonSerializer.Serialize(new[] { "Unlimited messages", "Unlimited team members", "Dedicated support", "Custom integrations" }),
                LimitsJson = JsonSerializer.Serialize(new Dictionary<string, int>
                {
                    ["whatsappMessages"] = 99999999,
                    ["smsCredits"] = 99999999,
                    ["contacts"] = 99999999,
                    ["teamMembers"] = 9999,
                    ["chatbots"] = 999,
                    ["flows"] = 9999
                })
            };
            db.BillingPlans.Add(enterprise);
        }

        var monthKey = DateTime.UtcNow.ToString("yyyy-MM");
        EnsureTenantBilling(db, tenantAId, growth.Id, monthKey);
        EnsureTenantBilling(db, tenantBId, starter.Id, monthKey);
    }

    private static void EnsureTenantBilling(ControlDbContext db, Guid tenantId, Guid planId, string monthKey)
    {
        if (!db.TenantSubscriptions.Any(x => x.TenantId == tenantId))
        {
            db.TenantSubscriptions.Add(new TenantSubscription
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                PlanId = planId,
                Status = "active",
                BillingCycle = "monthly",
                StartedAtUtc = DateTime.UtcNow.AddMonths(-2),
                RenewAtUtc = DateTime.UtcNow.AddMonths(1)
            });
        }

        if (!db.TenantUsages.Any(x => x.TenantId == tenantId && x.MonthKey == monthKey))
        {
            db.TenantUsages.Add(new TenantUsage
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                MonthKey = monthKey,
                WhatsappMessagesUsed = 7234,
                SmsCreditsUsed = 32100,
                ContactsUsed = 8456,
                TeamMembersUsed = 6,
                ChatbotsUsed = 2,
                FlowsUsed = 12,
                ApiCallsUsed = 15500
            });
        }

        if (!db.BillingInvoices.Any(x => x.TenantId == tenantId))
        {
            var monthStartUtc = new DateTime(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1, 0, 0, 0, DateTimeKind.Utc);
            db.BillingInvoices.Add(new BillingInvoice
            {
                Id = Guid.NewGuid(),
                InvoiceNo = $"INV-{DateTime.UtcNow:yyyy}-001",
                TenantId = tenantId,
                PeriodStartUtc = monthStartUtc.AddMonths(-1),
                PeriodEndUtc = monthStartUtc.AddDays(-1),
                Subtotal = 9999,
                TaxAmount = 1800,
                Total = 11799,
                Status = "paid",
                PaidAtUtc = DateTime.UtcNow.AddDays(-10),
                PdfUrl = string.Empty
            });
        }
    }

    public static void InitializeTenant(TenantDbContext db, Guid tenantId)
    {
        // Ensure WABA config table exists for older/shared tenant DBs before seeding.
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
        db.Database.ExecuteSqlRaw("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "BusinessManagerId" text NOT NULL DEFAULT '';""");
        db.Database.ExecuteSqlRaw("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "SystemUserId" text NOT NULL DEFAULT '';""");
        db.Database.ExecuteSqlRaw("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "SystemUserName" text NOT NULL DEFAULT '';""");
        db.Database.ExecuteSqlRaw("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "SystemUserCreatedAtUtc" timestamp with time zone NULL;""");
        db.Database.ExecuteSqlRaw("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "AssetsAssignedAtUtc" timestamp with time zone NULL;""");
        db.Database.ExecuteSqlRaw("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "PermanentTokenIssuedAtUtc" timestamp with time zone NULL;""");
        db.Database.ExecuteSqlRaw("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "PermanentTokenExpiresAtUtc" timestamp with time zone NULL;""");
        db.Database.ExecuteSqlRaw("""ALTER TABLE "TenantWabaConfigs" ADD COLUMN IF NOT EXISTS "TokenSource" text NOT NULL DEFAULT 'embedded_exchange';""");
        db.Database.ExecuteSqlRaw("""ALTER TABLE "Messages" ADD COLUMN IF NOT EXISTS "IdempotencyKey" text NOT NULL DEFAULT '';""");
        db.Database.ExecuteSqlRaw("""ALTER TABLE "Messages" ADD COLUMN IF NOT EXISTS "RetryCount" integer NOT NULL DEFAULT 0;""");
        db.Database.ExecuteSqlRaw("""ALTER TABLE "Messages" ADD COLUMN IF NOT EXISTS "NextRetryAtUtc" timestamp with time zone NULL;""");
        db.Database.ExecuteSqlRaw("""ALTER TABLE "Messages" ADD COLUMN IF NOT EXISTS "LastError" text NOT NULL DEFAULT '';""");
        db.Database.ExecuteSqlRaw("""ALTER TABLE "Messages" ADD COLUMN IF NOT EXISTS "QueueProvider" text NOT NULL DEFAULT 'memory';""");
        db.Database.ExecuteSqlRaw("""CREATE INDEX IF NOT EXISTS "IX_Messages_Tenant_IdempotencyKey" ON "Messages" ("TenantId","IdempotencyKey");""");

        if (db.Campaigns.Any(c => c.TenantId == tenantId)) return;

        db.Campaigns.Add(new Campaign
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Name = "Welcome WhatsApp Flow",
            Channel = ChannelType.WhatsApp,
            TemplateText = "Hi {{name}}, welcome to Demo Retail"
        });

        db.Templates.AddRange(
            new Template { Id = Guid.NewGuid(), TenantId = tenantId, Name = "welcome_customer", Channel = ChannelType.WhatsApp, Category = "UTILITY", Language = "en", Body = "Welcome to Textzy" },
            new Template { Id = Guid.NewGuid(), TenantId = tenantId, Name = "payment_reminder", Channel = ChannelType.Sms, Category = "MARKETING", Language = "en", Body = "Payment reminder" }
        );

        var g1 = new ContactGroup { Id = Guid.NewGuid(), TenantId = tenantId, Name = "High Intent Leads" };
        var g2 = new ContactGroup { Id = Guid.NewGuid(), TenantId = tenantId, Name = "Returning Customers" };
        db.ContactGroups.AddRange(g1, g2);

        db.Contacts.AddRange(
            new Contact { Id = Guid.NewGuid(), TenantId = tenantId, GroupId = g1.Id, Name = "Aarav Singh", Phone = "+91 9876543210" },
            new Contact { Id = Guid.NewGuid(), TenantId = tenantId, GroupId = g2.Id, Name = "Ira Mehta", Phone = "+91 9988776655" }
        );

        db.ChatbotConfigs.Add(new ChatbotConfig
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Greeting = "Hi! Welcome to Moneyart. How can we help?",
            Fallback = "Our agent will connect with you shortly.",
            HandoffEnabled = true
        });

        db.SmsFlows.AddRange(
            new SmsFlow { Id = Guid.NewGuid(), TenantId = tenantId, Name = "Welcome Series", Status = "Active", SentCount = 1230 },
            new SmsFlow { Id = Guid.NewGuid(), TenantId = tenantId, Name = "Abandoned Cart", Status = "Active", SentCount = 876 }
        );

        db.SmsInputFields.AddRange(
            new SmsInputField { Id = Guid.NewGuid(), TenantId = tenantId, Name = "first_name", Type = "text" },
            new SmsInputField { Id = Guid.NewGuid(), TenantId = tenantId, Name = "due_amount", Type = "number" }
        );

        db.TenantWabaConfigs.Add(new TenantWabaConfig
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            IsActive = false,
            OnboardingState = "requested",
            OnboardingStartedAtUtc = DateTime.UtcNow,
            BusinessAccountName = "Pending",
            DisplayPhoneNumber = "Pending"
        });

        db.SaveChanges();
    }

    public static TenantDbContext CreateTenantDbContext(string connectionString)
    {
        var options = new DbContextOptionsBuilder<TenantDbContext>()
            .UseNpgsql(connectionString)
            .Options;
        return new TenantDbContext(options);
    }
}
