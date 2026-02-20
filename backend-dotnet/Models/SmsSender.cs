namespace Textzy.Api.Models;

public class SmsSender
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string SenderId { get; set; } = string.Empty;
    public string EntityId { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
