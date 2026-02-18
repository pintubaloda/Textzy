namespace Textzy.Api.Models;

public class Template
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string Name { get; set; } = string.Empty;
    public ChannelType Channel { get; set; }
    public string Category { get; set; } = "UTILITY";
    public string Language { get; set; } = "en";
    public string Body { get; set; } = string.Empty;
    public string LifecycleStatus { get; set; } = "draft";
    public int Version { get; set; } = 1;
    public string VariantGroup { get; set; } = string.Empty;
    public string Status { get; set; } = "Approved";
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
