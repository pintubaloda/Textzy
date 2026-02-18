namespace Textzy.Api.DTOs;

public class CreateAutomationFlowRequest
{
    public string Name { get; set; } = string.Empty;
    public string TriggerType { get; set; } = string.Empty;
}

public class UpsertAutomationNodeRequest
{
    public string NodeType { get; set; } = string.Empty;
    public string ConfigJson { get; set; } = "{}";
    public int Sequence { get; set; }
}

public class RunAutomationRequest
{
    public string TriggerPayloadJson { get; set; } = "{}";
}
