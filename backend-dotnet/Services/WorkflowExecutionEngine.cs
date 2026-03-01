using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Textzy.Api.Data;
using Textzy.Api.DTOs;
using Textzy.Api.Models;

namespace Textzy.Api.Services;

public class WorkflowExecutionEngine(
    ControlDbContext controlDb,
    TenantDbContext tenantDb,
    MessagingService messaging,
    SensitiveDataRedactor redactor,
    IOptions<WorkflowRuntimeOptions> runtimeOptions)
{
    private sealed class FlowNode
    {
        public string Id { get; init; } = string.Empty;
        public string Type { get; init; } = string.Empty;
        public string Next { get; set; } = string.Empty;
        public string OnTrue { get; set; } = string.Empty;
        public string OnFalse { get; set; } = string.Empty;
        public string OnSuccess { get; init; } = string.Empty;
        public string OnFailure { get; init; } = string.Empty;
        public Dictionary<string, string> OptionRoutes { get; init; } = new(StringComparer.OrdinalIgnoreCase);
        public Dictionary<string, object?> Config { get; init; } = new(StringComparer.OrdinalIgnoreCase);
    }

    public sealed class ExecuteRequest
    {
        public required Guid TenantId { get; init; }
        public required Guid FlowId { get; init; }
        public required string PhoneNumberId { get; init; }
        public required string InboundMessageId { get; init; }
        public required string InboundRecipient { get; init; }
        public required string InboundMessageText { get; init; }
        public required string DefinitionJson { get; init; }
        public required AutomationRun Run { get; init; }
        public required Dictionary<string, object?> Payload { get; init; }
        public bool IsInteractiveResume { get; init; }
        public string ResumeSourceNodeId { get; init; } = string.Empty;
    }

    public async Task ExecuteAsync(ExecuteRequest req, CancellationToken ct)
    {
        var (nodes, startNodeId) = ParseFlowDefinition(req.DefinitionJson);
        var trace = new List<object>();
        var log = new List<string>();
        var cursor = ResolveResumeNodeId(nodes, startNodeId, req.IsInteractiveResume, req.ResumeSourceNodeId, req.InboundMessageText);
        var guard = 0;
        try
        {
            while (!string.IsNullOrWhiteSpace(cursor) && guard < 250)
            {
                guard++;
                if (!nodes.TryGetValue(cursor, out var node))
                {
                    log.Add($"missing-node:{cursor}");
                    break;
                }

                var nodeType = (node.Type ?? string.Empty).Trim().ToLowerInvariant().Replace("-", "_");
                await TryWriteExecutionStateAsync(req, cursor, "running", string.Empty, ct);
                await TryWriteExecutionLogAsync(req, node, "started", 0, "{}", "{}", string.Empty, ct);

                controlDb.AuditLogs.Add(new AuditLog
                {
                    Id = Guid.NewGuid(),
                    TenantId = req.TenantId,
                    ActorUserId = Guid.Empty,
                    Action = "waba.workflow.node_exec",
                    Details = $"phoneNumberId={req.PhoneNumberId}; inboundMessageId={req.InboundMessageId}; flowId={req.FlowId}; nodeId={node.Id}; nodeType={nodeType}",
                    CreatedAtUtc = DateTime.UtcNow
                });
                await controlDb.SaveChangesAsync(ct);

                var next = node.Next;
                if (nodeType is "start")
                {
                    next = node.Next;
                }
                else if (nodeType is "text" or "text_message" or "textmessage" or "send_text" or "message" or "ask_question" or "capture_input" or "bot_reply" or "botreply" or "buttons" or "list" or "cta_url" or "media")
                {
                    var recipient = ResolveValue(node.Config, req.Payload, "recipient");
                    if (string.IsNullOrWhiteSpace(recipient)) recipient = req.InboundRecipient;

                    var body = string.Empty;
                    var interactiveButtons = new List<string>();
                    try
                    {
                        body = ResolveNodeReplyText(nodeType, node.Config, req.Payload);
                    }
                    catch
                    {
                        body = ResolveValue(node.Config, req.Payload, "simpleText", "body", "message", "question", "prompt");
                    }

                    if (nodeType is "buttons")
                    {
                        if (node.Config.TryGetValue("buttons", out var btns))
                            interactiveButtons = ReadStringOptions(btns, 3);
                        body = ResolveValue(node.Config, req.Payload, "body", "message", "question", "prompt");
                    }
                    else if (nodeType is "bot_reply" or "botreply")
                    {
                        var replyMode = ResolveValue(node.Config, req.Payload, "replyMode");
                        var advancedType = ResolveValue(node.Config, req.Payload, "advancedType");
                        if (string.Equals(replyMode, "advanced", StringComparison.OrdinalIgnoreCase) &&
                            string.Equals(advancedType, "quick_reply", StringComparison.OrdinalIgnoreCase) &&
                            node.Config.TryGetValue("buttons", out var btns))
                        {
                            interactiveButtons = ReadStringOptions(btns, 3);
                            body = ResolveValue(node.Config, req.Payload, "simpleText", "body", "message", "question", "prompt");
                        }
                    }

                    if (!string.IsNullOrWhiteSpace(recipient) && !string.IsNullOrWhiteSpace(body))
                    {
                        try
                        {
                            var messageReq = new SendMessageRequest
                            {
                                Recipient = recipient,
                                Body = Interpolate(body, req.Payload),
                                Channel = ChannelType.WhatsApp,
                                IdempotencyKey = $"auto-msg:{req.FlowId}:{req.InboundMessageId}:{node.Id}"
                            };
                            if (interactiveButtons.Count > 0)
                            {
                                messageReq.IsInteractive = true;
                                messageReq.InteractiveType = "button";
                                messageReq.InteractiveButtons = interactiveButtons.Select(x => Interpolate(x, req.Payload)).ToList();
                            }
                            var msg = await messaging.EnqueueAsync(messageReq, ct);
                            controlDb.AuditLogs.Add(new AuditLog
                            {
                                Id = Guid.NewGuid(),
                                TenantId = req.TenantId,
                                ActorUserId = Guid.Empty,
                                Action = "waba.workflow.enqueued",
                                Details = $"phoneNumberId={req.PhoneNumberId}; inboundMessageId={req.InboundMessageId}; flowId={req.FlowId}; nodeId={node.Id}; messageId={msg.Id}; recipient={recipient}",
                                CreatedAtUtc = DateTime.UtcNow
                            });
                            await controlDb.SaveChangesAsync(ct);
                        }
                        catch (Exception ex)
                        {
                            controlDb.AuditLogs.Add(new AuditLog
                            {
                                Id = Guid.NewGuid(),
                                TenantId = req.TenantId,
                                ActorUserId = Guid.Empty,
                                Action = "waba.workflow.enqueue_failed",
                                Details = $"phoneNumberId={req.PhoneNumberId}; inboundMessageId={req.InboundMessageId}; flowId={req.FlowId}; nodeId={node.Id}; error={redactor.RedactText(ex.Message)}",
                                CreatedAtUtc = DateTime.UtcNow
                            });
                            await controlDb.SaveChangesAsync(ct);
                            throw;
                        }
                    }
                    else
                    {
                        controlDb.AuditLogs.Add(new AuditLog
                        {
                            Id = Guid.NewGuid(),
                            TenantId = req.TenantId,
                            ActorUserId = Guid.Empty,
                            Action = "waba.workflow.send_skipped",
                            Details = $"phoneNumberId={req.PhoneNumberId}; inboundMessageId={req.InboundMessageId}; flowId={req.FlowId}; nodeId={node.Id}; nodeType={nodeType}; reason=empty_recipient_or_body",
                            CreatedAtUtc = DateTime.UtcNow
                        });
                        await controlDb.SaveChangesAsync(ct);
                    }
                    next = node.OnSuccess ?? node.Next;
                }
                else if (nodeType == "template")
                {
                    var recipient = ResolveValue(node.Config, req.Payload, "recipient");
                    var templateName = ResolveValue(node.Config, req.Payload, "templateName", "template_name");
                    var languageCode = ResolveValue(node.Config, req.Payload, "languageCode", "language");
                    var body = ResolveValue(node.Config, req.Payload, "body", "message");
                    var paramValues = new List<string>();
                    if (node.Config.TryGetValue("parameters", out var p))
                    {
                        if (p is IEnumerable<object?> arr)
                        {
                            foreach (var item in arr)
                                paramValues.Add(Interpolate(item?.ToString() ?? string.Empty, req.Payload));
                        }
                        else if (p is JsonElement pElem && pElem.ValueKind == JsonValueKind.Array)
                        {
                            foreach (var item in pElem.EnumerateArray())
                                paramValues.Add(Interpolate(item.ToString(), req.Payload));
                        }
                    }
                    if (!string.IsNullOrWhiteSpace(recipient) && !string.IsNullOrWhiteSpace(templateName))
                    {
                        var msg = await messaging.EnqueueAsync(new SendMessageRequest
                        {
                            Recipient = recipient,
                            Body = body,
                            Channel = ChannelType.WhatsApp,
                            UseTemplate = true,
                            TemplateName = templateName,
                            TemplateLanguageCode = string.IsNullOrWhiteSpace(languageCode) ? "en" : languageCode,
                            TemplateParameters = paramValues,
                            IdempotencyKey = $"auto-tpl:{req.FlowId}:{req.InboundMessageId}:{node.Id}"
                        }, ct);
                        controlDb.AuditLogs.Add(new AuditLog
                        {
                            Id = Guid.NewGuid(),
                            TenantId = req.TenantId,
                            ActorUserId = Guid.Empty,
                            Action = "waba.workflow.enqueued",
                            Details = $"phoneNumberId={req.PhoneNumberId}; inboundMessageId={req.InboundMessageId}; flowId={req.FlowId}; nodeId={node.Id}; messageId={msg.Id}; recipient={recipient}; template={templateName}",
                            CreatedAtUtc = DateTime.UtcNow
                        });
                        await controlDb.SaveChangesAsync(ct);
                    }
                    next = node.OnSuccess ?? node.Next;
                }
                else if (nodeType is "condition" or "split")
                {
                    var ok = EvaluateCondition(node.Config, req.Payload);
                    next = ok ? (node.OnTrue ?? node.OnSuccess ?? node.Next) : (node.OnFalse ?? node.OnFailure ?? node.Next);
                }
                else if (nodeType == "end")
                {
                    trace.Add(new { nodeId = node.Id, nodeType, nextNodeId = "", status = "ok" });
                    await TryWriteExecutionLogAsync(req, node, "completed", 0, "{}", "{}", string.Empty, ct);
                    break;
                }
                else
                {
                    next = node.OnSuccess ?? node.Next;
                }

                trace.Add(new { nodeId = node.Id, nodeType, nextNodeId = next, status = "ok" });
                log.Add($"{nodeType}:{node.Id}->{next}");
                await TryWriteExecutionLogAsync(req, node, "completed", 0, "{}", "{}", string.Empty, ct);
                if (string.IsNullOrWhiteSpace(next)) break;
                cursor = next;
            }

            req.Run.Status = "completed";
            req.Run.Log = string.Join('\n', log);
            req.Run.TraceJson = JsonSerializer.Serialize(trace);
            req.Run.CompletedAtUtc = DateTime.UtcNow;
            await TryWriteExecutionStateAsync(req, cursor, "completed", string.Empty, ct);
        }
        catch (Exception ex)
        {
            req.Run.Status = "failed";
            req.Run.FailureReason = ex.Message;
            req.Run.Log = string.Join('\n', log);
            req.Run.TraceJson = JsonSerializer.Serialize(trace);
            req.Run.CompletedAtUtc = DateTime.UtcNow;
            await TryWriteExecutionStateAsync(req, cursor, "failed", ex.Message, ct);
            controlDb.AuditLogs.Add(new AuditLog
            {
                Id = Guid.NewGuid(),
                TenantId = req.TenantId,
                ActorUserId = Guid.Empty,
                Action = "waba.workflow.execution_failed",
                Details = $"phoneNumberId={req.PhoneNumberId}; inboundMessageId={req.InboundMessageId}; flowId={req.FlowId}; error={redactor.RedactText(ex.Message)}",
                CreatedAtUtc = DateTime.UtcNow
            });
            await controlDb.SaveChangesAsync(ct);
        }
    }

    private async Task TryWriteExecutionStateAsync(ExecuteRequest req, string currentNodeId, string status, string errorMessage, CancellationToken ct)
    {
        if (!runtimeOptions.Value.EnableExecutionState) return;
        try
        {
            await tenantDb.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO "WorkflowExecutionStates"
                ("Id","TenantId","FlowId","ConversationId","CurrentNodeId","ExecutionData","Status","StartedAtUtc","LastUpdatedAtUtc","CompletedAtUtc","ExecutionTrace","ErrorMessage")
                VALUES
                ({req.Run.Id},{req.TenantId},{req.FlowId},{(Guid?)null},{currentNodeId ?? string.Empty},{JsonSerializer.Serialize(req.Payload)},{status},{req.Run.StartedAtUtc},{DateTime.UtcNow},{(status == "completed" || status == "failed" ? DateTime.UtcNow : (DateTime?)null)},"[]",{errorMessage ?? string.Empty})
                ON CONFLICT ("Id") DO UPDATE SET
                    "CurrentNodeId" = EXCLUDED."CurrentNodeId",
                    "Status" = EXCLUDED."Status",
                    "LastUpdatedAtUtc" = EXCLUDED."LastUpdatedAtUtc",
                    "CompletedAtUtc" = EXCLUDED."CompletedAtUtc",
                    "ErrorMessage" = EXCLUDED."ErrorMessage"
                """, ct);
        }
        catch
        {
            // keep execution safe even when state table is missing in old tenant schema
        }
    }

    private async Task TryWriteExecutionLogAsync(ExecuteRequest req, FlowNode node, string status, int durationMs, string inputData, string outputData, string errorMessage, CancellationToken ct)
    {
        if (!runtimeOptions.Value.EnableExecutionState) return;
        try
        {
            await tenantDb.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO "WorkflowExecutionLogs"
                ("Id","TenantId","ExecutionStateId","NodeId","NodeType","NodeName","ExecutedAtUtc","Status","DurationMs","InputData","OutputData","ErrorMessage")
                VALUES
                ({Guid.NewGuid()},{req.TenantId},{req.Run.Id},{node.Id},{node.Type ?? string.Empty},{ResolveValue(node.Config, req.Payload, "title", "name")},{DateTime.UtcNow},{status},{durationMs},{inputData},{outputData},{errorMessage ?? string.Empty})
                """, ct);
        }
        catch
        {
            // keep execution safe even when log table is missing in old tenant schema
        }
    }

    private static string ResolveResumeNodeId(
        IReadOnlyDictionary<string, FlowNode> nodes,
        string startNodeId,
        bool isInteractiveReply,
        string resumeSourceNodeId,
        string inboundText)
    {
        if (!isInteractiveReply) return startNodeId;
        var normalizedInbound = NormalizeMatchKey(inboundText);
        if (!string.IsNullOrWhiteSpace(resumeSourceNodeId) &&
            nodes.TryGetValue(resumeSourceNodeId, out var sourceNode))
        {
            if (!string.IsNullOrWhiteSpace(normalizedInbound) &&
                sourceNode.OptionRoutes.TryGetValue(normalizedInbound, out var directNext) &&
                !string.IsNullOrWhiteSpace(directNext))
            {
                return directNext;
            }
            if (!string.IsNullOrWhiteSpace(sourceNode.Next)) return sourceNode.Next;
        }

        if (string.IsNullOrWhiteSpace(startNodeId) || !nodes.ContainsKey(startNodeId)) return startNodeId;
        var cursor = startNodeId;
        var guard = 0;
        while (!string.IsNullOrWhiteSpace(cursor) && guard < 64)
        {
            guard++;
            if (!nodes.TryGetValue(cursor, out var node)) break;
            var nodeType = (node.Type ?? string.Empty).Trim().ToLowerInvariant().Replace("-", "_");
            if (nodeType is "condition" or "split") return node.Id;
            if (string.IsNullOrWhiteSpace(node.Next)) break;
            cursor = node.Next;
        }
        return startNodeId;
    }

    private static string NormalizeMatchKey(string? input)
    {
        var value = NormalizeInboundMessageText(input);
        var chars = value.Where(c => char.IsLetterOrDigit(c) || char.IsWhiteSpace(c)).ToArray();
        return new string(chars).Trim().ToLowerInvariant();
    }

    private static string NormalizeInboundMessageText(string? input)
    {
        var value = (input ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(value)) return string.Empty;
        if (value.StartsWith("Button reply:", StringComparison.OrdinalIgnoreCase))
            return value["Button reply:".Length..].Trim();
        if (value.StartsWith("Interactive reply:", StringComparison.OrdinalIgnoreCase))
            return value["Interactive reply:".Length..].Trim();
        return value;
    }

    private static (Dictionary<string, FlowNode> nodes, string startNodeId) ParseFlowDefinition(string definitionJson)
    {
        var nodes = new Dictionary<string, FlowNode>(StringComparer.OrdinalIgnoreCase);
        var startNodeId = string.Empty;
        using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(definitionJson) ? "{}" : definitionJson);
        var root = doc.RootElement;
        if (root.TryGetProperty("startNodeId", out var startNode)) startNodeId = startNode.ToString();
        if (!root.TryGetProperty("nodes", out var nodesNode) || nodesNode.ValueKind != JsonValueKind.Array)
            return (nodes, startNodeId);

        foreach (var item in nodesNode.EnumerateArray())
        {
            var id = item.TryGetProperty("id", out var idNode) ? idNode.ToString() : Guid.NewGuid().ToString("N");
            var type = item.TryGetProperty("type", out var typeNode) ? typeNode.ToString() : "text";
            var node = new FlowNode
            {
                Id = id,
                Type = type,
                Next = item.TryGetProperty("next", out var nextNode) ? nextNode.ToString() : string.Empty,
                OnTrue = item.TryGetProperty("onTrue", out var onTrueNode) ? onTrueNode.ToString() : string.Empty,
                OnFalse = item.TryGetProperty("onFalse", out var onFalseNode) ? onFalseNode.ToString() : string.Empty,
                OnSuccess = item.TryGetProperty("onSuccess", out var onSuccessNode) ? onSuccessNode.ToString() : string.Empty,
                OnFailure = item.TryGetProperty("onFailure", out var onFailureNode) ? onFailureNode.ToString() : string.Empty,
                Config = item.TryGetProperty("config", out var cfgNode) && cfgNode.ValueKind == JsonValueKind.Object
                    ? cfgNode.EnumerateObject().ToDictionary(x => x.Name, x => ToClrValue(x.Value), StringComparer.OrdinalIgnoreCase)
                    : new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
            };
            nodes[id] = node;
            if (string.IsNullOrWhiteSpace(startNodeId) && string.Equals(type, "start", StringComparison.OrdinalIgnoreCase))
                startNodeId = id;
        }

        if (root.TryGetProperty("edges", out var edgesNode) && edgesNode.ValueKind == JsonValueKind.Array)
        {
            foreach (var edge in edgesNode.EnumerateArray())
            {
                var from = edge.TryGetProperty("from", out var fromNode) ? fromNode.ToString() : string.Empty;
                var to = edge.TryGetProperty("to", out var toNode) ? toNode.ToString() : string.Empty;
                if (string.IsNullOrWhiteSpace(from) || string.IsNullOrWhiteSpace(to)) continue;
                if (!nodes.TryGetValue(from, out var source)) continue;
                var label = edge.TryGetProperty("label", out var labelNode)
                    ? (labelNode.ToString() ?? string.Empty).Trim()
                    : string.Empty;
                var normalizedLabel = NormalizeMatchKey(label);
                if (normalizedLabel == "true")
                {
                    if (string.IsNullOrWhiteSpace(source.OnTrue)) source.OnTrue = to;
                    continue;
                }
                if (normalizedLabel == "false")
                {
                    if (string.IsNullOrWhiteSpace(source.OnFalse)) source.OnFalse = to;
                    continue;
                }
                if (!string.IsNullOrWhiteSpace(normalizedLabel))
                {
                    source.OptionRoutes[normalizedLabel] = to;
                    if (string.IsNullOrWhiteSpace(source.Next)) source.Next = to;
                    continue;
                }
                if (string.IsNullOrWhiteSpace(source.Next)) source.Next = to;
            }
        }

        if (string.IsNullOrWhiteSpace(startNodeId) && nodes.Count > 0) startNodeId = nodes.Keys.First();
        return (nodes, startNodeId);
    }

    private static object? ToClrValue(JsonElement element)
    {
        return element.ValueKind switch
        {
            JsonValueKind.Object => element.EnumerateObject()
                .ToDictionary(x => x.Name, x => ToClrValue(x.Value), StringComparer.OrdinalIgnoreCase),
            JsonValueKind.Array => element.EnumerateArray().Select(ToClrValue).ToList(),
            JsonValueKind.String => element.GetString(),
            JsonValueKind.Number => element.TryGetInt64(out var l) ? l :
                                    element.TryGetDecimal(out var d) ? d :
                                    element.GetDouble(),
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.Null => null,
            _ => element.ToString()
        };
    }

    private static bool EvaluateCondition(Dictionary<string, object?> config, Dictionary<string, object?> payload)
    {
        var field = config.TryGetValue("field", out var f) ? f?.ToString() ?? string.Empty : string.Empty;
        var @operator = config.TryGetValue("operator", out var op) ? op?.ToString()?.ToLowerInvariant() ?? "equals" : "equals";
        var expected = config.TryGetValue("value", out var v) ? v?.ToString() ?? string.Empty : string.Empty;
        var actual = payload.TryGetValue(field, out var a) ? a?.ToString() ?? string.Empty : string.Empty;
        var normalizedActual = string.Equals(field, "message", StringComparison.OrdinalIgnoreCase)
            ? NormalizeInboundMessageText(actual)
            : actual;

        return @operator switch
        {
            "contains" => normalizedActual.Contains(expected, StringComparison.OrdinalIgnoreCase),
            "starts_with" => normalizedActual.StartsWith(expected, StringComparison.OrdinalIgnoreCase),
            "ends_with" => normalizedActual.EndsWith(expected, StringComparison.OrdinalIgnoreCase),
            "not_equals" => !string.Equals(normalizedActual, expected, StringComparison.OrdinalIgnoreCase),
            "regex" => System.Text.RegularExpressions.Regex.IsMatch(normalizedActual, expected),
            _ => string.Equals(normalizedActual, expected, StringComparison.OrdinalIgnoreCase)
        };
    }

    private static string Interpolate(string text, Dictionary<string, object?> payload)
    {
        var output = text ?? string.Empty;
        foreach (var pair in payload)
        {
            output = output.Replace($"{{{{{pair.Key}}}}}", pair.Value?.ToString() ?? string.Empty, StringComparison.OrdinalIgnoreCase);
        }
        return output;
    }

    private static string ResolveValue(Dictionary<string, object?> config, Dictionary<string, object?> payload, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (config.TryGetValue(key, out var raw))
            {
                var val = raw?.ToString() ?? string.Empty;
                if (!string.IsNullOrWhiteSpace(val)) return Interpolate(val, payload);
            }
            if (payload.TryGetValue(key, out var fromPayload))
            {
                var val = fromPayload?.ToString() ?? string.Empty;
                if (!string.IsNullOrWhiteSpace(val)) return val;
            }
        }
        return string.Empty;
    }

    private static string ResolveNodeReplyText(string nodeType, Dictionary<string, object?> config, Dictionary<string, object?> payload)
    {
        static List<string> normalizeOptions(object? raw)
        {
            if (raw is null) return [];
            if (raw is IEnumerable<object?> objList)
            {
                var list = new List<string>();
                foreach (var item in objList)
                {
                    try
                    {
                        if (item is IDictionary<string, object?> map)
                        {
                            var title = map.TryGetValue("title", out var t) ? t?.ToString() : null;
                            var subtitle = map.TryGetValue("subtitle", out var s) ? s?.ToString() : null;
                            var merged = string.IsNullOrWhiteSpace(subtitle) ? title : $"{title} - {subtitle}";
                            if (!string.IsNullOrWhiteSpace(merged)) list.Add(merged.Trim());
                            continue;
                        }
                        var v = item?.ToString()?.Trim() ?? string.Empty;
                        if (!string.IsNullOrWhiteSpace(v)) list.Add(v);
                    }
                    catch
                    {
                        // skip malformed option item
                    }
                }
                return list;
            }
            if (raw is JsonElement j)
            {
                try
                {
                    if (j.ValueKind == JsonValueKind.Array)
                    {
                        var list = new List<string>();
                        foreach (var it in j.EnumerateArray())
                        {
                            var v = (it.ValueKind == JsonValueKind.Object && it.TryGetProperty("title", out var title))
                                ? title.ToString()
                                : it.ToString();
                            if (!string.IsNullOrWhiteSpace(v)) list.Add(v.Trim());
                        }
                        return list;
                    }
                }
                catch
                {
                    return [];
                }
            }
            return [];
        }

        static string appendOptions(string baseText, IReadOnlyList<string> options)
        {
            if (options.Count == 0) return baseText;
            var lines = string.Join("\n", options.Select((x, i) => $"{i + 1}. {x}"));
            return string.IsNullOrWhiteSpace(baseText) ? lines : $"{baseText}\n\n{lines}";
        }

        if (nodeType == "bot_reply")
        {
            var replyMode = ResolveValue(config, payload, "replyMode");
            if (string.Equals(replyMode, "media", StringComparison.OrdinalIgnoreCase))
            {
                var mediaText = ResolveValue(config, payload, "mediaText", "body", "message");
                if (!string.IsNullOrWhiteSpace(mediaText)) return mediaText;
            }
            var simpleText = ResolveValue(config, payload, "simpleText", "body", "message", "question", "prompt");
            if (!string.IsNullOrWhiteSpace(simpleText))
            {
                var advancedType = ResolveValue(config, payload, "advancedType");
                var options = new List<string>();
                if (string.Equals(replyMode, "advanced", StringComparison.OrdinalIgnoreCase))
                {
                    if (string.Equals(advancedType, "list", StringComparison.OrdinalIgnoreCase)
                        && config.TryGetValue("listItems", out var listItems))
                    {
                        options = normalizeOptions(listItems);
                    }
                    else if (config.TryGetValue("buttons", out var buttons))
                    {
                        options = normalizeOptions(buttons);
                    }
                }
                return appendOptions(simpleText, options);
            }
        }

        if (nodeType is "buttons" or "list" or "cta_url" or "media")
        {
            var body = ResolveValue(config, payload, "body", "message", "question", "prompt");
            if (!string.IsNullOrWhiteSpace(body))
            {
                if (nodeType is "buttons" && config.TryGetValue("buttons", out var buttons))
                    return appendOptions(body, normalizeOptions(buttons));
                if (nodeType is "list" && config.TryGetValue("listItems", out var listItems))
                    return appendOptions(body, normalizeOptions(listItems));
                return body;
            }
        }

        return ResolveValue(config, payload, "body", "message", "question", "prompt");
    }

    private static List<string> ReadStringOptions(object? raw, int max = 3)
    {
        var result = new List<string>();
        if (raw is null) return result;
        if (raw is IEnumerable<object?> objList)
        {
            foreach (var item in objList)
            {
                if (result.Count >= max) break;
                try
                {
                    if (item is IDictionary<string, object?> map)
                    {
                        var title = map.TryGetValue("title", out var t) ? t?.ToString() : null;
                        var subtitle = map.TryGetValue("subtitle", out var s) ? s?.ToString() : null;
                        var merged = string.IsNullOrWhiteSpace(subtitle) ? title : $"{title} - {subtitle}";
                        if (!string.IsNullOrWhiteSpace(merged)) result.Add(merged.Trim());
                        continue;
                    }
                    var v = item?.ToString()?.Trim() ?? string.Empty;
                    if (!string.IsNullOrWhiteSpace(v)) result.Add(v);
                }
                catch
                {
                    // skip malformed option item
                }
            }
            return result.Distinct(StringComparer.OrdinalIgnoreCase).Take(max).ToList();
        }
        if (raw is JsonElement j)
        {
            try
            {
                if (j.ValueKind == JsonValueKind.Array)
                {
                    foreach (var it in j.EnumerateArray())
                    {
                        if (result.Count >= max) break;
                        var v = (it.ValueKind == JsonValueKind.Object && it.TryGetProperty("title", out var title))
                            ? title.ToString()
                            : it.ToString();
                        if (!string.IsNullOrWhiteSpace(v)) result.Add(v.Trim());
                    }
                    return result.Distinct(StringComparer.OrdinalIgnoreCase).Take(max).ToList();
                }
            }
            catch
            {
                return result;
            }
        }
        return result;
    }
}
