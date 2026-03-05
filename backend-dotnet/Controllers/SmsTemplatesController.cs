using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Textzy.Api.Data;
using Textzy.Api.Models;
using Textzy.Api.Services;
using static Textzy.Api.Services.PermissionCatalog;

namespace Textzy.Api.Controllers;

[ApiController]
[Route("api/sms/templates")]
public class SmsTemplatesController(TenantDbContext db, TenancyContext tenancy, RbacService rbac) : ControllerBase
{
    private static readonly HashSet<string> AllowedStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "draft", "submitted", "approved", "rejected", "expired"
    };

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string status = "", CancellationToken ct = default)
    {
        if (!rbac.HasPermission(TemplatesRead)) return Forbid();
        var q = db.Templates.AsNoTracking()
            .Where(x => x.TenantId == tenancy.TenantId && x.Channel == ChannelType.Sms);
        if (!string.IsNullOrWhiteSpace(status))
        {
            var s = status.Trim().ToLowerInvariant();
            q = q.Where(x => x.LifecycleStatus.ToLower() == s || x.Status.ToLower() == s);
        }
        var rows = await q.OrderByDescending(x => x.CreatedAtUtc).Take(500).ToListAsync(ct);
        return Ok(rows.Select(x => new
        {
            x.Id,
            x.Name,
            x.Category,
            x.Language,
            x.Body,
            x.SmsSenderId,
            x.DltEntityId,
            x.DltTemplateId,
            x.SmsOperator,
            x.Status,
            x.LifecycleStatus,
            x.RejectionReason,
            x.EffectiveFromUtc,
            x.EffectiveToUtc,
            x.CreatedAtUtc
        }));
    }

    public sealed class UpsertSmsTemplateRequest
    {
        public string Name { get; set; } = string.Empty;
        public string Category { get; set; } = "service";
        public string Language { get; set; } = "en";
        public string Body { get; set; } = string.Empty;
        public string SmsSenderId { get; set; } = string.Empty;
        public string DltEntityId { get; set; } = string.Empty;
        public string DltTemplateId { get; set; } = string.Empty;
        public string SmsOperator { get; set; } = "all";
        public DateTime? EffectiveFromUtc { get; set; }
        public DateTime? EffectiveToUtc { get; set; }
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] UpsertSmsTemplateRequest request, CancellationToken ct)
    {
        if (!rbac.HasPermission(TemplatesWrite)) return Forbid();
        var body = InputGuardService.RequireTrimmed(request.Body, "Template body", 2000);
        var name = InputGuardService.RequireTrimmed(request.Name, "Template name", 120);
        var senderId = InputGuardService.RequireTrimmed(request.SmsSenderId, "Sender ID", 20);
        var entityId = InputGuardService.RequireTrimmed(request.DltEntityId, "DLT Entity ID", 50);
        var templateId = InputGuardService.RequireTrimmed(request.DltTemplateId, "DLT Template ID", 80);
        var category = string.IsNullOrWhiteSpace(request.Category) ? "service" : request.Category.Trim().ToLowerInvariant();
        var language = string.IsNullOrWhiteSpace(request.Language) ? "en" : request.Language.Trim().ToLowerInvariant();
        var smsOperator = string.IsNullOrWhiteSpace(request.SmsOperator) ? "all" : request.SmsOperator.Trim().ToLowerInvariant();

        var row = new Template
        {
            Id = Guid.NewGuid(),
            TenantId = tenancy.TenantId,
            Channel = ChannelType.Sms,
            Name = name,
            Category = category,
            Language = language,
            Body = body,
            SmsSenderId = senderId,
            DltEntityId = entityId,
            DltTemplateId = templateId,
            SmsOperator = smsOperator,
            LifecycleStatus = "draft",
            Status = "Draft",
            EffectiveFromUtc = request.EffectiveFromUtc,
            EffectiveToUtc = request.EffectiveToUtc,
            CreatedAtUtc = DateTime.UtcNow
        };
        db.Templates.Add(row);
        await db.SaveChangesAsync(ct);
        return Ok(row);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpsertSmsTemplateRequest request, CancellationToken ct)
    {
        if (!rbac.HasPermission(TemplatesWrite)) return Forbid();
        var row = await db.Templates.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenancy.TenantId && x.Channel == ChannelType.Sms, ct);
        if (row is null) return NotFound();

        row.Name = InputGuardService.RequireTrimmed(request.Name, "Template name", 120);
        row.Category = string.IsNullOrWhiteSpace(request.Category) ? "service" : request.Category.Trim().ToLowerInvariant();
        row.Language = string.IsNullOrWhiteSpace(request.Language) ? "en" : request.Language.Trim().ToLowerInvariant();
        row.Body = InputGuardService.RequireTrimmed(request.Body, "Template body", 2000);
        row.SmsSenderId = InputGuardService.RequireTrimmed(request.SmsSenderId, "Sender ID", 20);
        row.DltEntityId = InputGuardService.RequireTrimmed(request.DltEntityId, "DLT Entity ID", 50);
        row.DltTemplateId = InputGuardService.RequireTrimmed(request.DltTemplateId, "DLT Template ID", 80);
        row.SmsOperator = string.IsNullOrWhiteSpace(request.SmsOperator) ? "all" : request.SmsOperator.Trim().ToLowerInvariant();
        row.EffectiveFromUtc = request.EffectiveFromUtc;
        row.EffectiveToUtc = request.EffectiveToUtc;
        await db.SaveChangesAsync(ct);
        return Ok(row);
    }

    public sealed class SmsTemplateStatusRequest
    {
        public string Status { get; set; } = string.Empty;
        public string Reason { get; set; } = string.Empty;
    }

    [HttpPost("{id:guid}/status")]
    public async Task<IActionResult> SetStatus(Guid id, [FromBody] SmsTemplateStatusRequest request, CancellationToken ct)
    {
        if (!rbac.HasPermission(TemplatesWrite)) return Forbid();
        var row = await db.Templates.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenancy.TenantId && x.Channel == ChannelType.Sms, ct);
        if (row is null) return NotFound();
        var status = (request.Status ?? string.Empty).Trim().ToLowerInvariant();
        if (!AllowedStatuses.Contains(status))
            return BadRequest("Status must be draft/submitted/approved/rejected/expired.");

        row.LifecycleStatus = status;
        row.Status = status switch
        {
            "approved" => "Approved",
            "submitted" => "InReview",
            "rejected" => "Rejected",
            "expired" => "Expired",
            _ => "Draft"
        };
        row.RejectionReason = status == "rejected" ? (request.Reason ?? string.Empty).Trim() : string.Empty;
        await db.SaveChangesAsync(ct);
        return Ok(new { ok = true, row.Id, row.Status, row.LifecycleStatus, row.RejectionReason });
    }
}

