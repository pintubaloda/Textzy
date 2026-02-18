using Textzy.Api.Models;

namespace Textzy.Api.DTOs;

public class SendMessageRequest
{
    public string Recipient { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public ChannelType Channel { get; set; }
    public Guid? CampaignId { get; set; }
    public bool UseTemplate { get; set; }
    public string TemplateName { get; set; } = string.Empty;
    public string TemplateLanguageCode { get; set; } = "en";
    public List<string> TemplateParameters { get; set; } = [];
}
