namespace Textzy.Api.DTOs;

public class CreateAutomationFlowRequest
{
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Channel { get; set; } = "waba";
    public string TriggerType { get; set; } = "keyword";
    public string TriggerConfigJson { get; set; } = "{}";
    public string DefinitionJson { get; set; } = "{}";
}

public class UpdateAutomationFlowRequest
{
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Channel { get; set; } = "waba";
    public string TriggerType { get; set; } = "keyword";
    public string TriggerConfigJson { get; set; } = "{}";
    public bool IsActive { get; set; } = true;
}

public class CreateFlowVersionRequest
{
    public string ChangeNote { get; set; } = string.Empty;
    public string? DefinitionJson { get; set; }
    public bool IsStagedRelease { get; set; }
}

public class PublishFlowVersionRequest
{
    public bool RequireApproval { get; set; }
}

public class RequestFlowApprovalRequest
{
    public Guid VersionId { get; set; }
}

public class DecideFlowApprovalRequest
{
    public string Decision { get; set; } = "approved";
    public string Comment { get; set; } = string.Empty;
}

public class SimulateAutomationRequest
{
    public Guid? VersionId { get; set; }
    public string TriggerType { get; set; } = string.Empty;
    public string TriggerPayloadJson { get; set; } = "{}";
}

public class UpsertAutomationNodeRequest
{
    public Guid? VersionId { get; set; }
    public string NodeKey { get; set; } = string.Empty;
    public string NodeType { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string ConfigJson { get; set; } = "{}";
    public string EdgesJson { get; set; } = "[]";
    public int Sequence { get; set; }
    public bool IsReusable { get; set; }
}

public class RunAutomationRequest
{
    public Guid? VersionId { get; set; }
    public string TriggerType { get; set; } = string.Empty;
    public string IdempotencyKey { get; set; } = string.Empty;
    public bool IsRetry { get; set; }
    public string TriggerPayloadJson { get; set; } = "{}";
}
