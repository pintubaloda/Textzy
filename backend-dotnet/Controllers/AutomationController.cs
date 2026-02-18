using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Textzy.Api.Data;
using Textzy.Api.DTOs;
using Textzy.Api.Models;
using Textzy.Api.Services;
using static Textzy.Api.Services.PermissionCatalog;

namespace Textzy.Api.Controllers;

[ApiController]
[Route("api/automation")]
public class AutomationController(TenantDbContext db, TenancyContext tenancy, RbacService rbac) : ControllerBase
{
    [HttpPost("flows")]
    public async Task<IActionResult> CreateFlow([FromBody] CreateAutomationFlowRequest req, CancellationToken ct)
    {
        if (!rbac.HasPermission(AutomationWrite)) return Forbid();
        var flow = new AutomationFlow { Id = Guid.NewGuid(), TenantId = tenancy.TenantId, Name = req.Name, TriggerType = req.TriggerType, IsActive = true };
        db.AutomationFlows.Add(flow);
        await db.SaveChangesAsync(ct);
        return Ok(flow);
    }

    [HttpGet("flows")]
    public IActionResult ListFlows()
    {
        if (!rbac.HasPermission(AutomationRead)) return Forbid();
        return Ok(db.AutomationFlows.Where(x => x.TenantId == tenancy.TenantId).OrderByDescending(x => x.CreatedAtUtc).ToList());
    }

    [HttpPost("flows/{flowId:guid}/nodes")]
    public async Task<IActionResult> AddNode(Guid flowId, [FromBody] UpsertAutomationNodeRequest req, CancellationToken ct)
    {
        if (!rbac.HasPermission(AutomationWrite)) return Forbid();
        var node = new AutomationNode
        {
            Id = Guid.NewGuid(),
            TenantId = tenancy.TenantId,
            FlowId = flowId,
            NodeType = req.NodeType,
            ConfigJson = req.ConfigJson,
            Sequence = req.Sequence
        };
        db.AutomationNodes.Add(node);
        await db.SaveChangesAsync(ct);
        return Ok(node);
    }

    [HttpPost("flows/{flowId:guid}/run")]
    public async Task<IActionResult> Run(Guid flowId, [FromBody] RunAutomationRequest req, CancellationToken ct)
    {
        if (!rbac.HasPermission(AutomationWrite)) return Forbid();

        var nodes = await db.AutomationNodes
            .Where(x => x.TenantId == tenancy.TenantId && x.FlowId == flowId)
            .OrderBy(x => x.Sequence)
            .ToListAsync(ct);

        var run = new AutomationRun
        {
            Id = Guid.NewGuid(),
            TenantId = tenancy.TenantId,
            FlowId = flowId,
            TriggerPayloadJson = req.TriggerPayloadJson,
            Status = "Running",
            Log = ""
        };

        foreach (var node in nodes)
        {
            run.Log += $"[{DateTime.UtcNow:O}] Node {node.Sequence}:{node.NodeType} executed\\n";
            if (node.NodeType.Equals("delay", StringComparison.OrdinalIgnoreCase))
            {
                await Task.Delay(200, ct);
            }
            if (node.NodeType.Equals("handoff", StringComparison.OrdinalIgnoreCase))
            {
                run.Log += "Agent handoff triggered\\n";
            }
        }

        run.Status = "Completed";
        run.CompletedAtUtc = DateTime.UtcNow;
        db.AutomationRuns.Add(run);
        await db.SaveChangesAsync(ct);
        return Ok(run);
    }
}
