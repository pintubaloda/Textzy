using Microsoft.AspNetCore.Mvc;
using Textzy.Api.Services;

namespace Textzy.Api.Controllers;

[ApiController]
[Route("api/permissions")]
public class PermissionsController(AuthContext auth) : ControllerBase
{
    [HttpGet("catalog")]
    public IActionResult Catalog()
    {
        if (!auth.IsAuthenticated) return Unauthorized();
        return Ok(new
        {
            roles = new[]
            {
                RoleOwner,
                RoleAdmin,
                RoleManager,
                RoleSupport,
                RoleMarketing,
                RoleFinance,
                RoleSuperAdmin
            },
            permissions = All
        });
    }
}
