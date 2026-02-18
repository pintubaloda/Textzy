namespace Textzy.Api.Models;

public class TenantWabaConfig
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string WabaId { get; set; } = string.Empty;
    public string PhoneNumberId { get; set; } = string.Empty;
    public string BusinessAccountName { get; set; } = string.Empty;
    public string DisplayPhoneNumber { get; set; } = string.Empty;
    public string AccessToken { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public DateTime ConnectedAtUtc { get; set; } = DateTime.UtcNow;
}
