using Microsoft.EntityFrameworkCore;
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
                IsSuperAdmin = true
            };
            db.Users.Add(user);
        }
        else
        {
            // Keep demo login deterministic across environments.
            user.PasswordHash = hash;
            user.PasswordSalt = salt;
            user.IsActive = true;
            user.IsSuperAdmin = true;
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

        db.SaveChanges();
    }

    public static void InitializeTenant(TenantDbContext db, Guid tenantId)
    {
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
