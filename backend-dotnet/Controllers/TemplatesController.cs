using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using System.Text.RegularExpressions;
using Textzy.Api.Data;
using Textzy.Api.DTOs;
using Textzy.Api.Models;
using Textzy.Api.Services;
using static Textzy.Api.Services.PermissionCatalog;

namespace Textzy.Api.Controllers;

[ApiController]
[Route("api/templates")]
public class TemplatesController(
    TenantDbContext db,
    ControlDbContext controlDb,
    TenancyContext tenancy,
    RbacService rbac,
    WhatsAppCloudService whatsapp,
    TemplateVariableResolverService templateVariables) : ControllerBase
{
    private static readonly HashSet<string> AllowedCategories = new(StringComparer.OrdinalIgnoreCase)
    {
        "MARKETING", "UTILITY", "AUTHENTICATION"
    };

    private static readonly HashSet<string> AllowedHeaderTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "none", "text", "image", "video", "document"
    };

    private static readonly HashSet<string> AllowedButtonTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "quick_reply", "quickreply", "url", "cta_url", "phone", "phone_number", "call"
    };

    private static readonly Regex WhatsAppTemplateNameRegex = new("^[a-z0-9_]+$", RegexOptions.Compiled);

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

        if (request.Channel == ChannelType.WhatsApp)
        {
            var normalizedName = request.Name.Trim();
            if (normalizedName.Length > 512) return "WhatsApp template name is too long.";
            if (!WhatsAppTemplateNameRegex.IsMatch(normalizedName))
                return "WhatsApp template name must contain only lowercase letters, numbers, and underscore.";

            var headerType = (request.HeaderType ?? "none").Trim().ToLowerInvariant();
            if (headerType == "text")
            {
                if (string.IsNullOrWhiteSpace(request.HeaderText)) return "Header text is required when header type is text.";
                if (request.HeaderText.Trim().Length > 60) return "WhatsApp header text cannot exceed 60 characters.";
            }
            else if (headerType is "image" or "video" or "document")
            {
                if (!string.IsNullOrWhiteSpace(request.HeaderText))
                    return "Header text must be empty for media header types.";
                if (string.IsNullOrWhiteSpace(request.HeaderMediaId))
                    return "Header media id is required for media header types.";
            }
            else if (headerType == "none" && !string.IsNullOrWhiteSpace(request.HeaderText))
            {
                return "Header text is allowed only when header type is text.";
            }

            if (!string.IsNullOrWhiteSpace(request.FooterText) && request.FooterText.Trim().Length > 60)
                return "WhatsApp footer text cannot exceed 60 characters.";

            var buttonError = ValidateButtonsJson(request.ButtonsJson);
            if (buttonError is not null) return buttonError;
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

    private static string? ValidateButtonsJson(string? buttonsJson)
    {
        if (string.IsNullOrWhiteSpace(buttonsJson)) return null;
        try
        {
            using var doc = JsonDocument.Parse(buttonsJson);
            if (doc.RootElement.ValueKind != JsonValueKind.Array) return "Buttons JSON must be an array.";

            var total = 0;
            var quickReplies = 0;
            var ctaButtons = 0;
            foreach (var row in doc.RootElement.EnumerateArray())
            {
                total++;
                if (total > 10) return "WhatsApp supports up to 10 buttons.";

                var type = row.TryGetProperty("type", out var typeNode) ? (typeNode.GetString() ?? string.Empty).Trim().ToLowerInvariant() : string.Empty;
                var text = row.TryGetProperty("text", out var textNode) ? (textNode.GetString() ?? string.Empty).Trim() : string.Empty;
                if (string.IsNullOrWhiteSpace(type) || !AllowedButtonTypes.Contains(type))
                    return "Invalid button type. Use quick_reply, url, or phone_number.";
                if (string.IsNullOrWhiteSpace(text) || text.Length > 25)
                    return "Button text is required and must be <= 25 characters.";

                if (type is "quick_reply" or "quickreply")
                {
                    quickReplies++;
                    continue;
                }

                ctaButtons++;
                if (ctaButtons > 2) return "WhatsApp supports up to 2 CTA buttons (URL/phone).";

                if (type is "url" or "cta_url")
                {
                    var url = row.TryGetProperty("url", out var urlNode) ? (urlNode.GetString() ?? string.Empty).Trim() : string.Empty;
                    if (!Uri.TryCreate(url, UriKind.Absolute, out var parsed) || (parsed.Scheme != Uri.UriSchemeHttp && parsed.Scheme != Uri.UriSchemeHttps))
                        return "CTA URL button requires a valid http/https URL.";
                }
                else
                {
                    var phone = row.TryGetProperty("phone_number", out var phoneNode) ? (phoneNode.GetString() ?? string.Empty).Trim() : string.Empty;
                    if (!Regex.IsMatch(phone, @"^\+?[0-9]{7,15}$"))
                        return "Phone button requires valid E.164 style number.";
                }
            }

            if (quickReplies > 10) return "WhatsApp supports up to 10 quick-reply buttons.";
            return null;
        }
        catch
        {
            return "Buttons JSON is invalid.";
        }
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
            Name = request.Name.Trim(),
            Channel = request.Channel,
            Category = request.Category.ToUpperInvariant(),
            Language = request.Language,
            Body = request.Body,
            LifecycleStatus = request.Channel == ChannelType.WhatsApp ? "draft" : "approved",
            DltEntityId = request.DltEntityId ?? string.Empty,
            DltTemplateId = request.DltTemplateId ?? string.Empty,
            SmsSenderId = request.SmsSenderId ?? string.Empty,
            HeaderType = request.HeaderType ?? "none",
            HeaderText = request.HeaderText ?? string.Empty,
            HeaderMediaId = request.HeaderMediaId ?? string.Empty,
            HeaderMediaName = request.HeaderMediaName ?? string.Empty,
            FooterText = request.FooterText ?? string.Empty,
            ButtonsJson = request.ButtonsJson ?? string.Empty,
            Status = request.Channel == ChannelType.WhatsApp ? "Draft" : "Approved"
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
        item.Name = request.Name.Trim();
        item.Channel = request.Channel;
        item.Category = request.Category.ToUpperInvariant();
        item.Language = request.Language;
        item.Body = request.Body;
        item.DltEntityId = request.DltEntityId ?? string.Empty;
        item.DltTemplateId = request.DltTemplateId ?? string.Empty;
        item.SmsSenderId = request.SmsSenderId ?? string.Empty;
        item.HeaderType = request.HeaderType ?? "none";
        item.HeaderText = request.HeaderText ?? string.Empty;
        item.HeaderMediaId = request.HeaderMediaId ?? string.Empty;
        item.HeaderMediaName = request.HeaderMediaName ?? string.Empty;
        item.FooterText = request.FooterText ?? string.Empty;
        item.ButtonsJson = request.ButtonsJson ?? string.Empty;
        if (item.Channel == ChannelType.WhatsApp && !string.Equals(item.LifecycleStatus, "approved", StringComparison.OrdinalIgnoreCase))
        {
            item.LifecycleStatus = "draft";
            item.Status = "Draft";
        }
        await db.SaveChangesAsync(ct);
        return Ok(item);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        if (!rbac.HasPermission(TemplatesWrite)) return Forbid();
        var item = db.Templates.FirstOrDefault(x => x.Id == id && x.TenantId == tenancy.TenantId);
        if (item is null) return NotFound();

        if (item.Channel == ChannelType.WhatsApp)
        {
            try
            {
                var result = await whatsapp.DeleteTemplateFromMetaAndDbAsync(id, ct);
                return Ok(result);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(ex.Message);
            }
        }

        db.Templates.Remove(item);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpGet("{id:guid}/presets")]
    public async Task<IActionResult> Presets(Guid id, [FromQuery] string recipient, CancellationToken ct)
    {
        if (!rbac.HasPermission(TemplatesRead)) return Forbid();
        var template = await db.Templates.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenancy.TenantId, ct);
        if (template is null) return NotFound();
        if (template.Channel != ChannelType.WhatsApp) return BadRequest("Presets are supported only for WhatsApp templates.");

        var to = (recipient ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(to)) return BadRequest("Recipient is required.");

        var indexes = Regex.Matches(template.Body ?? string.Empty, @"\{\{(\d+)\}\}")
            .Select(m => int.TryParse(m.Groups[1].Value, out var n) ? n : 0)
            .Where(n => n > 0)
            .Distinct()
            .OrderBy(n => n)
            .ToArray();

        var (tokenValues, suggestedValues) = await templateVariables.BuildAsync(to, ct);
        var suggestedByIndex = new Dictionary<string, string>();
        foreach (var idx in indexes)
        {
            if (suggestedValues.TryGetValue(idx, out var value) && !string.IsNullOrWhiteSpace(value))
                suggestedByIndex[idx.ToString()] = value;
        }

        var tokenList = tokenValues
            .Where(kv => !string.IsNullOrWhiteSpace(kv.Value))
            .OrderBy(kv => kv.Key)
            .Select(kv => new
            {
                key = kv.Key,
                label = kv.Key.Replace("_", " "),
                value = kv.Value
            })
            .ToList();

        return Ok(new
        {
            templateId = template.Id,
            templateName = template.Name,
            recipient = to,
            tokens = tokenList,
            suggestedByIndex
        });
    }

    [HttpGet("library")]
    public async Task<IActionResult> Library([FromQuery] string? category, [FromQuery] string? search, CancellationToken ct)
    {
        if (!rbac.HasPermission(TemplatesRead)) return Forbid();
        var q = controlDb.TemplateLibraryItems.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(category))
        {
            var c = category.Trim().ToUpperInvariant();
            q = q.Where(x => x.Category == c);
        }
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim().ToLowerInvariant();
            q = q.Where(x => x.Name.ToLower().Contains(s) || x.Body.ToLower().Contains(s));
        }

        var items = await q.OrderByDescending(x => x.UpdatedAtUtc).Take(400).ToListAsync(ct);
        return Ok(items);
    }

    [HttpPost("library/sync")]
    public async Task<IActionResult> SyncLibrary(CancellationToken ct)
    {
        if (!rbac.HasPermission(TemplatesWrite)) return Forbid();

        await whatsapp.SyncMessageTemplatesAsync(ct);

        var tenant = await controlDb.Tenants.AsNoTracking().FirstOrDefaultAsync(x => x.Id == tenancy.TenantId, ct);
        var tenantSlug = tenant?.Slug ?? string.Empty;
        var templates = await db.Templates
            .Where(x => x.TenantId == tenancy.TenantId && x.Channel == ChannelType.WhatsApp)
            .OrderByDescending(x => x.CreatedAtUtc)
            .ToListAsync(ct);

        var upserted = 0;
        foreach (var t in templates)
        {
            var existing = await controlDb.TemplateLibraryItems
                .FirstOrDefaultAsync(x => x.Name == t.Name && x.Language == t.Language, ct);
            if (existing is null)
            {
                controlDb.TemplateLibraryItems.Add(new TemplateLibraryItem
                {
                    Id = Guid.NewGuid(),
                    Name = t.Name,
                    Category = (t.Category ?? "UTILITY").ToUpperInvariant(),
                    Language = t.Language ?? "en",
                    HeaderType = t.HeaderType ?? "none",
                    HeaderText = t.HeaderText ?? string.Empty,
                    Body = t.Body ?? string.Empty,
                    FooterText = t.FooterText ?? string.Empty,
                    ButtonsJson = t.ButtonsJson ?? string.Empty,
                    Source = "meta_sync",
                    SourceTenantSlug = tenantSlug,
                    CreatedAtUtc = DateTime.UtcNow,
                    UpdatedAtUtc = DateTime.UtcNow
                });
                upserted++;
            }
            else
            {
                existing.Category = (t.Category ?? "UTILITY").ToUpperInvariant();
                existing.HeaderType = t.HeaderType ?? "none";
                existing.HeaderText = t.HeaderText ?? string.Empty;
                existing.Body = t.Body ?? string.Empty;
                existing.FooterText = t.FooterText ?? string.Empty;
                existing.ButtonsJson = t.ButtonsJson ?? string.Empty;
                existing.Source = "meta_sync";
                existing.SourceTenantSlug = tenantSlug;
                existing.UpdatedAtUtc = DateTime.UtcNow;
                upserted++;
            }
        }

        await controlDb.SaveChangesAsync(ct);
        return Ok(new { synced = true, upserted });
    }
}
