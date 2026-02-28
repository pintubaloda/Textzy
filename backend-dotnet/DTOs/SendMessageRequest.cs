using Textzy.Api.Models;

namespace Textzy.Api.DTOs;

public class SendMessageRequest
{
    public string IdempotencyKey { get; set; } = string.Empty;
    public string Recipient { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public ChannelType Channel { get; set; }
    public Guid? CampaignId { get; set; }
    public bool UseTemplate { get; set; }
    public string TemplateName { get; set; } = string.Empty;
    public string TemplateLanguageCode { get; set; } = "en";
    public List<string> TemplateParameters { get; set; } = [];
    public bool IsMedia { get; set; }
    public string MediaType { get; set; } = string.Empty; // image | video | audio | document
    public string MediaId { get; set; } = string.Empty;
    public string MediaCaption { get; set; } = string.Empty;
    public bool IsInteractive { get; set; }
    public string InteractiveType { get; set; } = string.Empty; // button
    public List<string> InteractiveButtons { get; set; } = [];
}
