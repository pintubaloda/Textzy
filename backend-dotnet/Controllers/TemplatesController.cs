using Microsoft.AspNetCore.Mvc;
using Textzy.Api.Data;
using Textzy.Api.DTOs;
using Textzy.Api.Models;
using Textzy.Api.Services;
using static Textzy.Api.Services.PermissionCatalog;

namespace Textzy.Api.Controllers;

[ApiController]
[Route("api/templates")]
public class TemplatesController(TenantDbContext db, TenancyContext tenancy, RbacService rbac) : ControllerBase
{
    private static readonly HashSet<string> AllowedCategories = new(StringComparer.OrdinalIgnoreCase)
    {
        "MARKETING", "UTILITY", "AUTHENTICATION"
    };

    private static readonly HashSet<string> AllowedHeaderTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "none", "text", "image", "video", "document"
    };

    private static string? ValidateRequest(UpsertTemplateRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name)) return "Template name is required.";
        if (string.IsNullOrWhiteSpace(request.Body)) return "Template body is required.";
        if (request.Body.Length > 1024 && request.Channel == ChannelType.WhatsApp) return "WhatsApp template body cannot exceed 1024 characters.";
        if (!AllowedCategories.Contains(request.Category ?? "")) return "Invalid category. Use MARKETING, UTILITY, AUTHENTICATION.";
        if (!AllowedHeaderTypes.Contains(request.HeaderType ?? "none")) return "Invalid header type.";

        var vars = System.Text.RegularExpressions.Regex.Matches(request.Body, @"\{\{(\d+)\}\}")
            .Select(m => int.Parse(m.Groups[1].Value))
            .Distinct()
            .OrderBy(x => x)
            .ToArray();

        for (var i = 0; i < vars.Length; i++)
        {
            if (vars[i] != i + 1) return "Template variables must be sequential: {{1}}, {{2}}, {{3}} ...";
        }

        if (request.Channel == ChannelType.Sms)
        {
            if (string.IsNullOrWhiteSpace(request.DltEntityId)) return "SMS template requires DLT Entity ID.";
            if (string.IsNullOrWhiteSpace(request.DltTemplateId)) return "SMS template requires DLT Template ID.";
            if (string.IsNullOrWhiteSpace(request.SmsSenderId)) return "SMS template requires Sender ID.";
            if (request.SmsSenderId.Trim().Length is < 3 or > 6) return "SMS Sender ID must be 3-6 characters.";
        }

        return null;
    }

    [HttpGet]
    public IActionResult List()
    {
        if (!rbac.HasPermission(TemplatesRead)) return Forbid();
        return Ok(db.Templates.Where(x => x.TenantId == tenancy.TenantId).OrderByDescending(x => x.CreatedAtUtc).ToList());
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] UpsertTemplateRequest request, CancellationToken ct)
    {
        if (!rbac.HasPermission(TemplatesWrite)) return Forbid();
        var error = ValidateRequest(request);
        if (error is not null) return BadRequest(error);
        var item = new Template
        {
            Id = Guid.NewGuid(),
            TenantId = tenancy.TenantId,
            Name = request.Name,
            Channel = request.Channel,
            Category = request.Category.ToUpperInvariant(),
            Language = request.Language,
            Body = request.Body,
            DltEntityId = request.DltEntityId ?? string.Empty,
            DltTemplateId = request.DltTemplateId ?? string.Empty,
            SmsSenderId = request.SmsSenderId ?? string.Empty,
            HeaderType = request.HeaderType ?? "none",
            HeaderText = request.HeaderText ?? string.Empty,
            FooterText = request.FooterText ?? string.Empty,
            ButtonsJson = request.ButtonsJson ?? string.Empty,
            Status = "Approved"
        };
        db.Templates.Add(item);
        await db.SaveChangesAsync(ct);
        return Ok(item);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpsertTemplateRequest request, CancellationToken ct)
    {
        if (!rbac.HasPermission(TemplatesWrite)) return Forbid();
        var error = ValidateRequest(request);
        if (error is not null) return BadRequest(error);
        var item = db.Templates.FirstOrDefault(x => x.Id == id && x.TenantId == tenancy.TenantId);
        if (item is null) return NotFound();
        item.Name = request.Name;
        item.Channel = request.Channel;
        item.Category = request.Category.ToUpperInvariant();
        item.Language = request.Language;
        item.Body = request.Body;
        item.DltEntityId = request.DltEntityId ?? string.Empty;
        item.DltTemplateId = request.DltTemplateId ?? string.Empty;
        item.SmsSenderId = request.SmsSenderId ?? string.Empty;
        item.HeaderType = request.HeaderType ?? "none";
        item.HeaderText = request.HeaderText ?? string.Empty;
        item.FooterText = request.FooterText ?? string.Empty;
        item.ButtonsJson = request.ButtonsJson ?? string.Empty;
        await db.SaveChangesAsync(ct);
        return Ok(item);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        if (!rbac.HasPermission(TemplatesWrite)) return Forbid();
        var item = db.Templates.FirstOrDefault(x => x.Id == id && x.TenantId == tenancy.TenantId);
        if (item is null) return NotFound();
        db.Templates.Remove(item);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}
