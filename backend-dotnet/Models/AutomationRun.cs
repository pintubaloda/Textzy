namespace Textzy.Api.Models;

public class AutomationRun
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid FlowId { get; set; }
    public string TriggerPayloadJson { get; set; } = string.Empty;
    public string Status { get; set; } = "Started";
    public string Log { get; set; } = string.Empty;
    public DateTime StartedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? CompletedAtUtc { get; set; }
}
