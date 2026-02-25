namespace Textzy.Api.Models;

public class TemplateLibraryItem
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Category { get; set; } = "UTILITY";
    public string Language { get; set; } = "en";
    public string HeaderType { get; set; } = "none";
    public string HeaderText { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public string FooterText { get; set; } = string.Empty;
    public string ButtonsJson { get; set; } = string.Empty;
    public string Source { get; set; } = "meta_sync";
    public string SourceTenantSlug { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}
