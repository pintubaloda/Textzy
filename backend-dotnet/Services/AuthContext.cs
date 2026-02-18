namespace Textzy.Api.Services;

public class AuthContext
{
    public Guid UserId { get; private set; }
    public Guid TenantId { get; private set; }
    public string Email { get; private set; } = string.Empty;
    public string Role { get; private set; } = string.Empty;
    public IReadOnlyList<string> Permissions { get; private set; } = [];
    public bool IsAuthenticated => UserId != Guid.Empty;

    public void Set(Guid userId, Guid tenantId, string email, string role)
    {
        UserId = userId;
        TenantId = tenantId;
        Email = email;
        Role = role;
        Permissions = RolePermissionCatalog.GetPermissions(role);
    }
}
