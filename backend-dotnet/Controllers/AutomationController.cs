using System.Text.Json;
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
public class AutomationController(
    TenantDbContext db,
    TenancyContext tenancy,
    AuthContext auth,
    RbacService rbac,
    MessagingService messaging) : ControllerBase
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    [HttpGet("catalogs/node-types")]
    public IActionResult NodeTypes()
    {
        if (!rbac.HasPermission(AutomationRead)) return Forbid();
        return Ok(new[]
        {
            new { type = "start", category = "trigger", reusable = false },
            new { type = "text", category = "message", reusable = true },
            new { type = "media", category = "message", reusable = true },
            new { type = "template", category = "message", reusable = true },
            new { type = "buttons", category = "message", reusable = true },
            new { type = "list", category = "message", reusable = true },
            new { type = "condition", category = "logic", reusable = true },
            new { type = "split", category = "logic", reusable = true },
            new { type = "delay", category = "logic", reusable = true },
            new { type = "api_call", category = "integration", reusable = true },
            new { type = "db_query", category = "integration", reusable = true },
            new { type = "function", category = "compute", reusable = true },
            new { type = "webhook", category = "integration", reusable = true },
            new { type = "handoff", category = "operator", reusable = true },
            new { type = "subflow", category = "flow", reusable = true },
            new { type = "end", category = "flow", reusable = false }
        });
    }

    [HttpGet("limits")]
    public IActionResult Limits()
    {
        if (!rbac.HasPermission(AutomationRead)) return Forbid();
        var limits = GetLimits();
        var usage = GetOrCreateUsageCounter();
        return Ok(new
        {
            limits,
            usage = new
            {
                runsToday = usage.RunCount,
                apiCallsToday = usage.ApiCallCount,
                activeFlows = db.AutomationFlows.Count(x => x.TenantId == tenancy.TenantId && x.IsActive),
                bucketDateUtc = usage.BucketDateUtc
            }
        });
    }

    [HttpPost("flows")]
    public async Task<IActionResult> CreateFlow([FromBody] CreateAutomationFlowRequest req, CancellationToken ct)
    {
        if (!rbac.HasPermission(AutomationWrite)) return Forbid();
        if (string.IsNullOrWhiteSpace(req.Name)) return BadRequest("Flow name is required.");

        var flow = new AutomationFlow
        {
            Id = Guid.NewGuid(),
            TenantId = tenancy.TenantId,
            Name = req.Name.Trim(),
            Description = req.Description.Trim(),
            Channel = NormalizeChannel(req.Channel),
            TriggerType = NormalizeTrigger(req.TriggerType),
            TriggerConfigJson = NormalizeJson(req.TriggerConfigJson, "{}"),
            LifecycleStatus = "draft",
            IsActive = true
        };

        var version = new AutomationFlowVersion
        {
            Id = Guid.NewGuid(),
            TenantId = tenancy.TenantId,
            FlowId = flow.Id,
            VersionNumber = 1,
            Status = "draft",
            DefinitionJson = NormalizeJson(req.DefinitionJson, BuildDefaultDefinition(flow.TriggerType)),
            ChangeNote = "Initial draft"
        };
        flow.CurrentVersionId = version.Id;

        db.AutomationFlows.Add(flow);
        db.AutomationFlowVersions.Add(version);
        await db.SaveChangesAsync(ct);
        return Ok(new { flow, version });
    }

    [HttpGet("flows")]
    public async Task<IActionResult> ListFlows(CancellationToken ct)
    {
        if (!rbac.HasPermission(AutomationRead)) return Forbid();

        var flows = await db.AutomationFlows
            .Where(x => x.TenantId == tenancy.TenantId)
            .OrderByDescending(x => x.UpdatedAtUtc)
            .ToListAsync(ct);

        var flowIds = flows.Select(x => x.Id).ToList();
        var versions = await db.AutomationFlowVersions
            .Where(x => x.TenantId == tenancy.TenantId && flowIds.Contains(x.FlowId))
            .GroupBy(x => x.FlowId)
            .Select(g => new
            {
                flowId = g.Key,
                totalVersions = g.Count(),
                latestVersion = g.Max(x => x.VersionNumber)
            })
            .ToListAsync(ct);

        var runs = await db.AutomationRuns
            .Where(x => x.TenantId == tenancy.TenantId && flowIds.Contains(x.FlowId))
            .GroupBy(x => x.FlowId)
            .Select(g => new
            {
                flowId = g.Key,
                runs = g.Count(),
                failed = g.Count(x => x.Status == "failed"),
                lastRunAtUtc = g.Max(x => x.StartedAtUtc)
            })
            .ToListAsync(ct);

        return Ok(flows.Select(flow =>
        {
            var v = versions.FirstOrDefault(x => x.flowId == flow.Id);
            var r = runs.FirstOrDefault(x => x.flowId == flow.Id);
            var successRate = r is null || r.runs == 0 ? 100 : Math.Round(((double)(r.runs - r.failed) / r.runs) * 100, 2);
            return new
            {
                flow.Id,
                flow.Name,
                flow.Description,
                flow.Channel,
                flow.TriggerType,
                flow.IsActive,
                flow.LifecycleStatus,
                flow.CurrentVersionId,
                flow.PublishedVersionId,
                flow.LastPublishedAtUtc,
                flow.UpdatedAtUtc,
                flow.CreatedAtUtc,
                versionCount = v?.totalVersions ?? 0,
                latestVersion = v?.latestVersion ?? 0,
                runs = r?.runs ?? 0,
                successRate,
                lastRunAtUtc = r?.lastRunAtUtc
            };
        }));
    }

    [HttpGet("flows/{flowId:guid}")]
    public async Task<IActionResult> GetFlow(Guid flowId, CancellationToken ct)
    {
        if (!rbac.HasPermission(AutomationRead)) return Forbid();
        var flow = await db.AutomationFlows.FirstOrDefaultAsync(x => x.TenantId == tenancy.TenantId && x.Id == flowId, ct);
        if (flow is null) return NotFound();

        var versions = await db.AutomationFlowVersions
            .Where(x => x.TenantId == tenancy.TenantId && x.FlowId == flowId)
            .OrderByDescending(x => x.VersionNumber)
            .ToListAsync(ct);

        return Ok(new { flow, versions });
    }

    [HttpPut("flows/{flowId:guid}")]
    public async Task<IActionResult> UpdateFlow(Guid flowId, [FromBody] UpdateAutomationFlowRequest req, CancellationToken ct)
    {
        if (!rbac.HasPermission(AutomationWrite)) return Forbid();
        var flow = await db.AutomationFlows.FirstOrDefaultAsync(x => x.TenantId == tenancy.TenantId && x.Id == flowId, ct);
        if (flow is null) return NotFound();

        flow.Name = string.IsNullOrWhiteSpace(req.Name) ? flow.Name : req.Name.Trim();
        flow.Description = req.Description?.Trim() ?? string.Empty;
        flow.Channel = NormalizeChannel(req.Channel);
        flow.TriggerType = NormalizeTrigger(req.TriggerType);
        flow.TriggerConfigJson = NormalizeJson(req.TriggerConfigJson, "{}");
        flow.IsActive = req.IsActive;
        flow.UpdatedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return Ok(flow);
    }

    [HttpGet("flows/{flowId:guid}/versions")]
    public async Task<IActionResult> ListVersions(Guid flowId, CancellationToken ct)
    {
        if (!rbac.HasPermission(AutomationRead)) return Forbid();
        var versions = await db.AutomationFlowVersions
            .Where(x => x.TenantId == tenancy.TenantId && x.FlowId == flowId)
            .OrderByDescending(x => x.VersionNumber)
            .ToListAsync(ct);
        return Ok(versions);
    }

    [HttpPost("flows/{flowId:guid}/versions")]
    public async Task<IActionResult> CreateVersion(Guid flowId, [FromBody] CreateFlowVersionRequest req, CancellationToken ct)
    {
        if (!rbac.HasPermission(AutomationWrite)) return Forbid();
        var flow = await db.AutomationFlows.FirstOrDefaultAsync(x => x.TenantId == tenancy.TenantId && x.Id == flowId, ct);
        if (flow is null) return NotFound();

        var latest = await db.AutomationFlowVersions
            .Where(x => x.TenantId == tenancy.TenantId && x.FlowId == flowId)
            .OrderByDescending(x => x.VersionNumber)
            .FirstOrDefaultAsync(ct);

        var definition = req.DefinitionJson;
        if (string.IsNullOrWhiteSpace(definition))
        {
            definition = latest?.DefinitionJson;
            if (string.IsNullOrWhiteSpace(definition))
            {
                var nodes = await db.AutomationNodes
                    .Where(x => x.TenantId == tenancy.TenantId && x.FlowId == flowId)
                    .OrderBy(x => x.Sequence)
                    .Select(x => new { id = string.IsNullOrWhiteSpace(x.NodeKey) ? x.Id.ToString() : x.NodeKey, type = x.NodeType, name = x.Name, config = x.ConfigJson, x.Sequence, edges = x.EdgesJson })
                    .ToListAsync(ct);
                definition = JsonSerializer.Serialize(new { nodes, edges = Array.Empty<object>() }, JsonOptions);
            }
        }

        var version = new AutomationFlowVersion
        {
            Id = Guid.NewGuid(),
            TenantId = tenancy.TenantId,
            FlowId = flowId,
            VersionNumber = (latest?.VersionNumber ?? 0) + 1,
            Status = "draft",
            DefinitionJson = NormalizeJson(definition!, BuildDefaultDefinition(flow.TriggerType)),
            ChangeNote = req.ChangeNote?.Trim() ?? string.Empty,
            IsStagedRelease = req.IsStagedRelease
        };

        flow.CurrentVersionId = version.Id;
        flow.LifecycleStatus = "draft";
        flow.UpdatedAtUtc = DateTime.UtcNow;
        db.AutomationFlowVersions.Add(version);
        await db.SaveChangesAsync(ct);
        return Ok(version);
    }

    [HttpPost("flows/{flowId:guid}/versions/{versionId:guid}/publish")]
    public async Task<IActionResult> PublishVersion(Guid flowId, Guid versionId, [FromBody] PublishFlowVersionRequest req, CancellationToken ct)
    {
        if (!rbac.HasPermission(AutomationWrite)) return Forbid();
        var flow = await db.AutomationFlows.FirstOrDefaultAsync(x => x.TenantId == tenancy.TenantId && x.Id == flowId, ct);
        if (flow is null) return NotFound();
        var version = await db.AutomationFlowVersions.FirstOrDefaultAsync(x => x.TenantId == tenancy.TenantId && x.FlowId == flowId && x.Id == versionId, ct);
        if (version is null) return NotFound();

        if (req.RequireApproval && !rbac.HasAnyRole("owner", "admin", "super_admin"))
        {
            return BadRequest("Approval required from owner/admin/super_admin.");
        }

        var oldPublished = await db.AutomationFlowVersions
            .Where(x => x.TenantId == tenancy.TenantId && x.FlowId == flowId && x.Status == "published")
            .ToListAsync(ct);
        foreach (var item in oldPublished) item.Status = "archived";

        version.Status = "published";
        version.PublishedAtUtc = DateTime.UtcNow;
        flow.CurrentVersionId = version.Id;
        flow.PublishedVersionId = version.Id;
        flow.LifecycleStatus = "published";
        flow.LastPublishedAtUtc = DateTime.UtcNow;
        flow.UpdatedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return Ok(new { flowId, versionId, status = "published" });
    }

    [HttpPost("flows/{flowId:guid}/versions/{versionId:guid}/rollback")]
    public async Task<IActionResult> Rollback(Guid flowId, Guid versionId, CancellationToken ct)
    {
        if (!rbac.HasPermission(AutomationWrite)) return Forbid();
        if (!rbac.HasAnyRole("owner", "admin", "super_admin")) return Forbid();

        var flow = await db.AutomationFlows.FirstOrDefaultAsync(x => x.TenantId == tenancy.TenantId && x.Id == flowId, ct);
        if (flow is null) return NotFound();
        var version = await db.AutomationFlowVersions.FirstOrDefaultAsync(x => x.TenantId == tenancy.TenantId && x.FlowId == flowId && x.Id == versionId, ct);
        if (version is null) return NotFound();

        var oldPublished = await db.AutomationFlowVersions
            .Where(x => x.TenantId == tenancy.TenantId && x.FlowId == flowId && x.Status == "published")
            .ToListAsync(ct);
        foreach (var item in oldPublished) item.Status = "archived";

        version.Status = "published";
        version.PublishedAtUtc = DateTime.UtcNow;
        flow.CurrentVersionId = versionId;
        flow.PublishedVersionId = versionId;
        flow.LifecycleStatus = "published";
        flow.LastPublishedAtUtc = DateTime.UtcNow;
        flow.UpdatedAtUtc = DateTime.UtcNow;

        await db.SaveChangesAsync(ct);
        return Ok(new { status = "rolled_back", versionId });
    }

    [HttpPost("flows/{flowId:guid}/approvals/request")]
    public async Task<IActionResult> RequestApproval(Guid flowId, [FromBody] RequestFlowApprovalRequest req, CancellationToken ct)
    {
        if (!rbac.HasPermission(AutomationWrite)) return Forbid();
        var version = await db.AutomationFlowVersions
            .FirstOrDefaultAsync(x => x.TenantId == tenancy.TenantId && x.FlowId == flowId && x.Id == req.VersionId, ct);
        if (version is null) return NotFound();

        var pendingExists = await db.AutomationApprovals.AnyAsync(x =>
            x.TenantId == tenancy.TenantId && x.FlowId == flowId && x.VersionId == req.VersionId && x.Status == "pending", ct);
        if (pendingExists) return Ok(new { status = "already_pending" });

        var approval = new AutomationApproval
        {
            Id = Guid.NewGuid(),
            TenantId = tenancy.TenantId,
            FlowId = flowId,
            VersionId = req.VersionId,
            RequestedBy = auth.Email,
            RequestedByRole = auth.Role
        };
        db.AutomationApprovals.Add(approval);
        await db.SaveChangesAsync(ct);
        return Ok(approval);
    }

    [HttpPost("flows/{flowId:guid}/approvals/{approvalId:guid}/decide")]
    public async Task<IActionResult> DecideApproval(Guid flowId, Guid approvalId, [FromBody] DecideFlowApprovalRequest req, CancellationToken ct)
    {
        if (!rbac.HasAnyRole("owner", "admin", "super_admin")) return Forbid();
        var approval = await db.AutomationApprovals
            .FirstOrDefaultAsync(x => x.TenantId == tenancy.TenantId && x.FlowId == flowId && x.Id == approvalId, ct);
        if (approval is null) return NotFound();
        if (approval.Status != "pending") return BadRequest("Approval already decided.");

        var decision = (req.Decision ?? string.Empty).Trim().ToLowerInvariant();
        if (decision is not ("approved" or "rejected")) return BadRequest("Decision must be approved or rejected.");

        approval.Status = decision;
        approval.DecisionComment = req.Comment?.Trim() ?? string.Empty;
        approval.DecidedBy = auth.Email;
        approval.DecidedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return Ok(approval);
    }

    [HttpPost("flows/{flowId:guid}/nodes")]
    public async Task<IActionResult> AddNode(Guid flowId, [FromBody] UpsertAutomationNodeRequest req, CancellationToken ct)
    {
        if (!rbac.HasPermission(AutomationWrite)) return Forbid();
        var flow = await db.AutomationFlows.FirstOrDefaultAsync(x => x.TenantId == tenancy.TenantId && x.Id == flowId, ct);
        if (flow is null) return NotFound();

        var node = new AutomationNode
        {
            Id = Guid.NewGuid(),
            TenantId = tenancy.TenantId,
            FlowId = flowId,
            VersionId = req.VersionId,
            NodeKey = string.IsNullOrWhiteSpace(req.NodeKey) ? Guid.NewGuid().ToString("N") : req.NodeKey.Trim(),
            NodeType = req.NodeType.Trim().ToLowerInvariant(),
            Name = req.Name?.Trim() ?? string.Empty,
            ConfigJson = NormalizeJson(req.ConfigJson, "{}"),
            EdgesJson = NormalizeJson(req.EdgesJson, "[]"),
            Sequence = req.Sequence,
            IsReusable = req.IsReusable
        };
        db.AutomationNodes.Add(node);
        flow.UpdatedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return Ok(node);
    }

    [HttpPost("flows/{flowId:guid}/simulate")]
    public async Task<IActionResult> Simulate(Guid flowId, [FromBody] SimulateAutomationRequest req, CancellationToken ct)
    {
        if (!rbac.HasPermission(AutomationWrite)) return Forbid();
        var run = await Execute(flowId, req.VersionId, req.TriggerType, req.TriggerPayloadJson, "simulate", $"sim-{Guid.NewGuid():N}", false, ct);
        return Ok(run);
    }

    [HttpPost("flows/{flowId:guid}/run")]
    public async Task<IActionResult> Run(Guid flowId, [FromBody] RunAutomationRequest req, CancellationToken ct)
    {
        if (!rbac.HasPermission(AutomationWrite)) return Forbid();
        var idempotency = (req.IdempotencyKey ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(idempotency)) idempotency = $"run-{Guid.NewGuid():N}";

        var limitCheck = CheckRunLimits();
        if (limitCheck is not null) return StatusCode(429, limitCheck);

        var run = await Execute(flowId, req.VersionId, req.TriggerType, req.TriggerPayloadJson, "live", idempotency, req.IsRetry, ct);
        return Ok(run);
    }

    [HttpGet("runs")]
    public async Task<IActionResult> ListRuns([FromQuery] Guid? flowId, [FromQuery] int limit = 100, CancellationToken ct = default)
    {
        if (!rbac.HasPermission(AutomationRead)) return Forbid();
        limit = Math.Clamp(limit, 1, 200);

        var q = db.AutomationRuns.Where(x => x.TenantId == tenancy.TenantId);
        if (flowId.HasValue) q = q.Where(x => x.FlowId == flowId.Value);
        var items = await q.OrderByDescending(x => x.StartedAtUtc).Take(limit).ToListAsync(ct);
        return Ok(items);
    }

    [HttpGet("runs/{runId:guid}")]
    public async Task<IActionResult> GetRun(Guid runId, CancellationToken ct)
    {
        if (!rbac.HasPermission(AutomationRead)) return Forbid();
        var item = await db.AutomationRuns.FirstOrDefaultAsync(x => x.TenantId == tenancy.TenantId && x.Id == runId, ct);
        return item is null ? NotFound() : Ok(item);
    }

    private async Task<AutomationRun> Execute(
        Guid flowId,
        Guid? versionId,
        string triggerType,
        string triggerPayloadJson,
        string mode,
        string idempotencyKey,
        bool isRetry,
        CancellationToken ct)
    {
        var flow = await db.AutomationFlows.FirstOrDefaultAsync(x => x.TenantId == tenancy.TenantId && x.Id == flowId, ct)
            ?? throw new InvalidOperationException("Flow not found.");

        var existing = await db.AutomationRuns
            .Where(x => x.TenantId == tenancy.TenantId && x.FlowId == flowId && x.IdempotencyKey == idempotencyKey)
            .OrderByDescending(x => x.StartedAtUtc)
            .FirstOrDefaultAsync(ct);
        if (existing is not null && !isRetry) return existing;

        var version = await ResolveVersion(flow, versionId, ct)
            ?? throw new InvalidOperationException("Flow version not found.");
        var definitionJson = string.IsNullOrWhiteSpace(version.DefinitionJson)
            ? BuildDefaultDefinition(flow.TriggerType)
            : version.DefinitionJson;

        var run = new AutomationRun
        {
            Id = Guid.NewGuid(),
            TenantId = tenancy.TenantId,
            FlowId = flow.Id,
            VersionId = version.Id,
            Mode = mode,
            TriggerType = string.IsNullOrWhiteSpace(triggerType) ? flow.TriggerType : triggerType.Trim().ToLowerInvariant(),
            IdempotencyKey = idempotencyKey,
            TriggerPayloadJson = NormalizeJson(triggerPayloadJson, "{}"),
            Status = "running",
            RetryCount = isRetry ? 1 : 0
        };
        db.AutomationRuns.Add(run);
        await db.SaveChangesAsync(ct);

        var payload = ParseObject(run.TriggerPayloadJson);
        var trace = new List<object>();
        var logLines = new List<string>();

        try
        {
            var graph = ParseFlowDefinition(definitionJson);
            var cursor = graph.startNodeId;
            var visited = 0;

            while (!string.IsNullOrWhiteSpace(cursor) && visited < 300)
            {
                visited++;
                if (!graph.nodes.TryGetValue(cursor, out var node))
                {
                    logLines.Add($"[{DateTime.UtcNow:O}] Missing node {cursor}. Run stopped.");
                    break;
                }

                var started = DateTime.UtcNow;
                var next = await ExecuteNode(flow, node, payload, mode, ct);
                var elapsedMs = (int)(DateTime.UtcNow - started).TotalMilliseconds;
                trace.Add(new
                {
                    nodeId = node.id,
                    nodeType = node.type,
                    nextNodeId = next,
                    elapsedMs,
                    status = "ok"
                });
                logLines.Add($"[{DateTime.UtcNow:O}] {node.type}:{node.id} -> {next}");

                if (string.Equals(node.type, "end", StringComparison.OrdinalIgnoreCase)) break;
                if (string.IsNullOrWhiteSpace(next)) break;
                cursor = next;
            }

            run.Status = "completed";
            run.Log = string.Join('\n', logLines);
            run.TraceJson = JsonSerializer.Serialize(trace, JsonOptions);
            run.CompletedAtUtc = DateTime.UtcNow;
        }
        catch (Exception ex)
        {
            trace.Add(new { nodeId = "runtime", nodeType = "runtime", status = "failed", error = ex.Message });
            run.Status = "failed";
            run.FailureReason = ex.Message;
            run.Log = string.Join('\n', logLines.Append($"[{DateTime.UtcNow:O}] ERROR: {ex.Message}"));
            run.TraceJson = JsonSerializer.Serialize(trace, JsonOptions);
            run.CompletedAtUtc = DateTime.UtcNow;
        }

        UpsertUsageCounter(run);
        await db.SaveChangesAsync(ct);
        return run;
    }

    private async Task<string> ExecuteNode(AutomationFlow flow, FlowNode node, Dictionary<string, object?> payload, string mode, CancellationToken ct)
    {
        var config = node.config ?? new Dictionary<string, object?>();
        var nodeType = (node.type ?? string.Empty).Trim().ToLowerInvariant();

        if (nodeType is "text" or "send_text")
        {
            if (mode == "live")
            {
                var recipient = ResolveValue(config, payload, "recipient", "recipient");
                var body = ResolveValue(config, payload, "body", "message");
                if (!string.IsNullOrWhiteSpace(recipient) && !string.IsNullOrWhiteSpace(body))
                {
                    await messaging.SendAsync(new SendMessageRequest
                    {
                        Recipient = recipient,
                        Body = Interpolate(body, payload),
                        Channel = flow.Channel == "sms" ? ChannelType.Sms : ChannelType.WhatsApp
                    }, ct);
                }
            }
            return node.next ?? node.onSuccess;
        }

        if (nodeType == "template")
        {
            if (mode == "live")
            {
                var recipient = ResolveValue(config, payload, "recipient", "recipient");
                var templateName = ResolveValue(config, payload, "templateName", "template_name");
                var language = ResolveValue(config, payload, "languageCode", "language");
                if (!string.IsNullOrWhiteSpace(recipient) && !string.IsNullOrWhiteSpace(templateName))
                {
                    var paramValues = new List<string>();
                    if (config.TryGetValue("parameters", out var p) && p is JsonElement pElem && pElem.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var item in pElem.EnumerateArray()) paramValues.Add(Interpolate(item.ToString(), payload));
                    }
                    await messaging.SendAsync(new SendMessageRequest
                    {
                        Recipient = recipient,
                        Body = ResolveValue(config, payload, "body", "message"),
                        Channel = ChannelType.WhatsApp,
                        UseTemplate = true,
                        TemplateName = templateName,
                        TemplateLanguageCode = string.IsNullOrWhiteSpace(language) ? "en" : language,
                        TemplateParameters = paramValues
                    }, ct);
                }
            }
            return node.next ?? node.onSuccess;
        }

        if (nodeType is "delay" or "wait")
        {
            var ms = 0;
            if (config.TryGetValue("milliseconds", out var v) && int.TryParse(v?.ToString(), out var parsedMs)) ms = parsedMs;
            else if (config.TryGetValue("seconds", out var s) && int.TryParse(s?.ToString(), out var sec)) ms = sec * 1000;
            if (mode == "live" && ms > 0) await Task.Delay(Math.Min(ms, 120_000), ct);
            return node.next ?? node.onSuccess;
        }

        if (nodeType is "condition" or "split")
        {
            var ok = EvaluateCondition(config, payload);
            return ok ? (node.onTrue ?? node.onSuccess ?? node.next) : (node.onFalse ?? node.onFailure ?? node.next);
        }

        if (nodeType == "subflow")
        {
            var raw = ResolveValue(config, payload, "flowId", "subflowId");
            if (Guid.TryParse(raw, out var subFlowId))
            {
                await Execute(subFlowId, null, "subflow", JsonSerializer.Serialize(payload, JsonOptions), mode, $"sub-{Guid.NewGuid():N}", false, ct);
            }
            return node.next ?? node.onSuccess;
        }

        if (nodeType is "handoff" or "api_call" or "db_query" or "function" or "webhook" or "media" or "buttons" or "list")
        {
            return node.next ?? node.onSuccess;
        }

        return node.next ?? node.onSuccess;
    }

    private AutomationFlowVersion? ResolvePublished(AutomationFlow flow)
    {
        if (!flow.PublishedVersionId.HasValue) return null;
        return db.AutomationFlowVersions.FirstOrDefault(x =>
            x.TenantId == tenancy.TenantId && x.FlowId == flow.Id && x.Id == flow.PublishedVersionId.Value);
    }

    private async Task<AutomationFlowVersion?> ResolveVersion(AutomationFlow flow, Guid? versionId, CancellationToken ct)
    {
        if (versionId.HasValue)
        {
            return await db.AutomationFlowVersions.FirstOrDefaultAsync(x =>
                x.TenantId == tenancy.TenantId && x.FlowId == flow.Id && x.Id == versionId.Value, ct);
        }

        if (flow.PublishedVersionId.HasValue)
        {
            var published = await db.AutomationFlowVersions.FirstOrDefaultAsync(x =>
                x.TenantId == tenancy.TenantId && x.FlowId == flow.Id && x.Id == flow.PublishedVersionId.Value, ct);
            if (published is not null) return published;
        }

        if (flow.CurrentVersionId.HasValue)
        {
            var current = await db.AutomationFlowVersions.FirstOrDefaultAsync(x =>
                x.TenantId == tenancy.TenantId && x.FlowId == flow.Id && x.Id == flow.CurrentVersionId.Value, ct);
            if (current is not null) return current;
        }

        return await db.AutomationFlowVersions
            .Where(x => x.TenantId == tenancy.TenantId && x.FlowId == flow.Id)
            .OrderByDescending(x => x.VersionNumber)
            .FirstOrDefaultAsync(ct);
    }

    private object? CheckRunLimits()
    {
        var limits = GetLimits();
        var usage = GetOrCreateUsageCounter();
        if (usage.RunCount >= limits.runsPerDay)
        {
            return new
            {
                error = "daily_run_limit_reached",
                usage = usage.RunCount,
                limit = limits.runsPerDay
            };
        }
        if (usage.ApiCallCount >= limits.apiCallsPerDay)
        {
            return new
            {
                error = "daily_api_call_limit_reached",
                usage = usage.ApiCallCount,
                limit = limits.apiCallsPerDay
            };
        }
        return null;
    }

    private (int activeFlows, int runsPerDay, int apiCallsPerDay, int maxNodesPerFlow) GetLimits()
    {
        return (activeFlows: 50, runsPerDay: 25000, apiCallsPerDay: 50000, maxNodesPerFlow: 300);
    }

    private AutomationUsageCounter GetOrCreateUsageCounter()
    {
        var today = DateTime.UtcNow.Date;
        var usage = db.AutomationUsageCounters.FirstOrDefault(x => x.TenantId == tenancy.TenantId && x.BucketDateUtc == today);
        if (usage is not null) return usage;
        usage = new AutomationUsageCounter
        {
            Id = Guid.NewGuid(),
            TenantId = tenancy.TenantId,
            BucketDateUtc = today
        };
        db.AutomationUsageCounters.Add(usage);
        return usage;
    }

    private void UpsertUsageCounter(AutomationRun run)
    {
        var usage = GetOrCreateUsageCounter();
        usage.RunCount += 1;
        if (run.Log.Contains("api_call", StringComparison.OrdinalIgnoreCase)) usage.ApiCallCount += 1;
        usage.ActiveFlowCount = db.AutomationFlows.Count(x => x.TenantId == tenancy.TenantId && x.IsActive);
        usage.UpdatedAtUtc = DateTime.UtcNow;
    }

    private static string NormalizeTrigger(string value)
    {
        var v = (value ?? string.Empty).Trim().ToLowerInvariant();
        return v switch
        {
            "keyword" or "intent" or "webhook" or "schedule" or "tag" or "user_event" => v,
            _ => "keyword"
        };
    }

    private static string NormalizeChannel(string value)
    {
        var v = (value ?? string.Empty).Trim().ToLowerInvariant();
        return v switch
        {
            "waba" or "sms" => v,
            _ => "waba"
        };
    }

    private static string BuildDefaultDefinition(string triggerType)
    {
        var model = new
        {
            trigger = new { type = NormalizeTrigger(triggerType) },
            startNodeId = "start_1",
            nodes = new object[]
            {
                new { id = "start_1", type = "start", name = "Start", config = new { }, next = "text_1" },
                new { id = "text_1", type = "text", name = "Welcome Message", config = new { body = "Hello {{name}}", recipient = "{{recipient}}" }, next = "end_1" },
                new { id = "end_1", type = "end", name = "End", config = new { }, next = "" }
            },
            edges = Array.Empty<object>()
        };
        return JsonSerializer.Serialize(model, JsonOptions);
    }

    private static string NormalizeJson(string? value, string fallback)
    {
        if (string.IsNullOrWhiteSpace(value)) return fallback;
        try
        {
            using var _ = JsonDocument.Parse(value);
            return value;
        }
        catch
        {
            return fallback;
        }
    }

    private static Dictionary<string, object?> ParseObject(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(json) ? "{}" : json);
            if (doc.RootElement.ValueKind != JsonValueKind.Object) return new Dictionary<string, object?>();
            var output = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
            foreach (var item in doc.RootElement.EnumerateObject()) output[item.Name] = item.Value.ToString();
            return output;
        }
        catch
        {
            return new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        }
    }

    private static string ResolveValue(Dictionary<string, object?> config, Dictionary<string, object?> payload, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (config.TryGetValue(key, out var raw) && !string.IsNullOrWhiteSpace(raw?.ToString()))
                return Interpolate(raw!.ToString()!, payload);
            if (payload.TryGetValue(key, out var fromPayload) && !string.IsNullOrWhiteSpace(fromPayload?.ToString()))
                return fromPayload!.ToString()!;
        }
        return string.Empty;
    }

    private static bool EvaluateCondition(Dictionary<string, object?> config, Dictionary<string, object?> payload)
    {
        var field = config.TryGetValue("field", out var f) ? f?.ToString() ?? string.Empty : string.Empty;
        var @operator = config.TryGetValue("operator", out var op) ? op?.ToString()?.ToLowerInvariant() ?? "equals" : "equals";
        var expected = config.TryGetValue("value", out var v) ? v?.ToString() ?? string.Empty : string.Empty;
        var actual = payload.TryGetValue(field, out var a) ? a?.ToString() ?? string.Empty : string.Empty;

        return @operator switch
        {
            "contains" => actual.Contains(expected, StringComparison.OrdinalIgnoreCase),
            "starts_with" => actual.StartsWith(expected, StringComparison.OrdinalIgnoreCase),
            "ends_with" => actual.EndsWith(expected, StringComparison.OrdinalIgnoreCase),
            "not_equals" => !string.Equals(actual, expected, StringComparison.OrdinalIgnoreCase),
            "regex" => System.Text.RegularExpressions.Regex.IsMatch(actual, expected),
            _ => string.Equals(actual, expected, StringComparison.OrdinalIgnoreCase)
        };
    }

    private static string Interpolate(string text, Dictionary<string, object?> payload)
    {
        var output = text;
        foreach (var pair in payload)
        {
            output = output.Replace($"{{{{{pair.Key}}}}}", pair.Value?.ToString() ?? string.Empty, StringComparison.OrdinalIgnoreCase);
        }
        return output;
    }

    private static (Dictionary<string, FlowNode> nodes, string startNodeId) ParseFlowDefinition(string definitionJson)
    {
        var nodes = new Dictionary<string, FlowNode>(StringComparer.OrdinalIgnoreCase);
        var startNodeId = string.Empty;

        using var doc = JsonDocument.Parse(definitionJson);
        var root = doc.RootElement;
        if (root.TryGetProperty("startNodeId", out var start)) startNodeId = start.ToString();
        if (root.TryGetProperty("nodes", out var arr) && arr.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in arr.EnumerateArray())
            {
                var node = new FlowNode
                {
                    id = item.TryGetProperty("id", out var id) ? id.ToString() : Guid.NewGuid().ToString("N"),
                    type = item.TryGetProperty("type", out var type) ? type.ToString() : "text",
                    name = item.TryGetProperty("name", out var name) ? name.ToString() : string.Empty,
                    next = item.TryGetProperty("next", out var next) ? next.ToString() : string.Empty,
                    onTrue = item.TryGetProperty("onTrue", out var onTrue) ? onTrue.ToString() : string.Empty,
                    onFalse = item.TryGetProperty("onFalse", out var onFalse) ? onFalse.ToString() : string.Empty,
                    onSuccess = item.TryGetProperty("onSuccess", out var onSuccess) ? onSuccess.ToString() : string.Empty,
                    onFailure = item.TryGetProperty("onFailure", out var onFailure) ? onFailure.ToString() : string.Empty,
                    config = item.TryGetProperty("config", out var cfg) && cfg.ValueKind == JsonValueKind.Object
                        ? cfg.EnumerateObject().ToDictionary(x => x.Name, x => (object?)x.Value, StringComparer.OrdinalIgnoreCase)
                        : new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
                };
                nodes[node.id] = node;
                if (string.IsNullOrWhiteSpace(startNodeId) && node.type.Equals("start", StringComparison.OrdinalIgnoreCase))
                    startNodeId = node.id;
            }
        }

        if (string.IsNullOrWhiteSpace(startNodeId) && nodes.Count > 0) startNodeId = nodes.Keys.First();
        return (nodes, startNodeId);
    }

    private sealed class FlowNode
    {
        public string id { get; set; } = string.Empty;
        public string type { get; set; } = string.Empty;
        public string name { get; set; } = string.Empty;
        public string next { get; set; } = string.Empty;
        public string onTrue { get; set; } = string.Empty;
        public string onFalse { get; set; } = string.Empty;
        public string onSuccess { get; set; } = string.Empty;
        public string onFailure { get; set; } = string.Empty;
        public Dictionary<string, object?> config { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    }
}
