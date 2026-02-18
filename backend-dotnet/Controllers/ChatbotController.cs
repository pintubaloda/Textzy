using Microsoft.AspNetCore.Mvc;
using Textzy.Api.Data;
using Textzy.Api.Models;
using Textzy.Api.Services;
using static Textzy.Api.Services.PermissionCatalog;

namespace Textzy.Api.Controllers;

[ApiController]
[Route("api/chatbot-config")]
public class ChatbotController(TenantDbContext db, TenancyContext tenancy, RbacService rbac) : ControllerBase
{
    [HttpGet]
    public IActionResult Get()
    {
        if (!rbac.HasPermission(AutomationRead)) return Forbid();
        var cfg = db.ChatbotConfigs.FirstOrDefault(x => x.TenantId == tenancy.TenantId)
                  ?? new ChatbotConfig { Id = Guid.NewGuid(), TenantId = tenancy.TenantId };
        return Ok(cfg);
    }

    [HttpPut]
    public async Task<IActionResult> Upsert([FromBody] ChatbotConfig request, CancellationToken ct)
    {
        if (!rbac.HasPermission(AutomationWrite)) return Forbid();
        var cfg = db.ChatbotConfigs.FirstOrDefault(x => x.TenantId == tenancy.TenantId);
        if (cfg is null)
        {
            cfg = new ChatbotConfig { Id = Guid.NewGuid(), TenantId = tenancy.TenantId };
            db.ChatbotConfigs.Add(cfg);
        }
        cfg.Greeting = request.Greeting;
        cfg.Fallback = request.Fallback;
        cfg.HandoffEnabled = request.HandoffEnabled;
        cfg.UpdatedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return Ok(cfg);
    }
}
