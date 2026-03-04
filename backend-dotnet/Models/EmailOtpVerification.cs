namespace Textzy.Api.Models;

public class EmailOtpVerification
{
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string Purpose { get; set; } = "login";
    public string OtpHash { get; set; } = string.Empty;
    public string VerificationCode { get; set; } = string.Empty;
    public bool IsVerified { get; set; }
    public int AttemptCount { get; set; }
    public int MaxAttempts { get; set; } = 5;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAtUtc { get; set; }
    public DateTime? VerifiedAtUtc { get; set; }
    public DateTime? ConsumedAtUtc { get; set; }
    public DateTime LastSentAtUtc { get; set; } = DateTime.UtcNow;
}
