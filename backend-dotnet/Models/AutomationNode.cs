namespace Textzy.Api.Models;

public class AutomationNode
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid FlowId { get; set; }
    public string NodeType { get; set; } = string.Empty; // condition/delay/api/send/handoff
    public string ConfigJson { get; set; } = string.Empty;
    public int Sequence { get; set; }
}
