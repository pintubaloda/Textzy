using System.Net;
using System.Net.Mail;

namespace Textzy.Api.Services;

public class EmailService(IConfiguration config)
{
    public async Task SendInviteAsync(string toEmail, string toName, string inviteUrl, CancellationToken ct = default)
    {
        var host = config["Smtp:Host"] ?? config["SMTP_HOST"];
        var portRaw = config["Smtp:Port"] ?? config["SMTP_PORT"];
        var username = config["Smtp:Username"] ?? config["SMTP_USERNAME"];
        var password = config["Smtp:Password"] ?? config["SMTP_PASSWORD"];
        var fromEmail = config["Smtp:FromEmail"] ?? config["SMTP_FROM_EMAIL"];
        var fromName = config["Smtp:FromName"] ?? config["SMTP_FROM_NAME"] ?? "Textzy";
        var enableSslRaw = config["Smtp:EnableSsl"] ?? config["SMTP_ENABLE_SSL"] ?? "true";

        if (string.IsNullOrWhiteSpace(host) || string.IsNullOrWhiteSpace(fromEmail))
            throw new InvalidOperationException("SMTP is not configured. Set SMTP_HOST and SMTP_FROM_EMAIL.");

        var msg = new MailMessage
        {
            From = new MailAddress(fromEmail, fromName),
            Subject = "You are invited to join Textzy project",
            Body = $"Hello {(string.IsNullOrWhiteSpace(toName) ? "there" : toName)},\n\nYou are invited to join a Textzy project.\n\nAccept invite: {inviteUrl}\n\nThis link expires in 7 days.\n",
            IsBodyHtml = false
        };
        msg.To.Add(new MailAddress(toEmail));

        using var client = new SmtpClient(host, int.TryParse(portRaw, out var p) ? p : 587)
        {
            EnableSsl = bool.TryParse(enableSslRaw, out var ssl) ? ssl : true,
            DeliveryMethod = SmtpDeliveryMethod.Network
        };

        if (!string.IsNullOrWhiteSpace(username))
            client.Credentials = new NetworkCredential(username, password ?? string.Empty);

        using var ctr = ct.Register(() => client.SendAsyncCancel());
        await client.SendMailAsync(msg);
    }

    public async Task SendVerificationOtpAsync(
        string toEmail,
        string displayName,
        string otp,
        string verificationCode,
        int expiryMinutes,
        string purpose,
        CancellationToken ct = default)
    {
        var host = config["Smtp:Host"] ?? config["SMTP_HOST"];
        var portRaw = config["Smtp:Port"] ?? config["SMTP_PORT"];
        var username = config["Smtp:Username"] ?? config["SMTP_USERNAME"];
        var password = config["Smtp:Password"] ?? config["SMTP_PASSWORD"];
        var fromEmail = config["Smtp:FromEmail"] ?? config["SMTP_FROM_EMAIL"];
        var fromName = config["Smtp:FromName"] ?? config["SMTP_FROM_NAME"] ?? "Textzy";
        var enableSslRaw = config["Smtp:EnableSsl"] ?? config["SMTP_ENABLE_SSL"] ?? "true";

        if (string.IsNullOrWhiteSpace(host) || string.IsNullOrWhiteSpace(fromEmail))
            throw new InvalidOperationException("SMTP is not configured. Set SMTP_HOST and SMTP_FROM_EMAIL.");

        var safeName = string.IsNullOrWhiteSpace(displayName) ? "there" : WebUtility.HtmlEncode(displayName);
        var safeOtp = WebUtility.HtmlEncode(otp);
        var safeCode = WebUtility.HtmlEncode(verificationCode);
        var safePurpose = WebUtility.HtmlEncode(purpose);
        var html = $"""
            <!doctype html>
            <html lang="en">
            <body style="margin:0;padding:0;background:#f7f7fb;font-family:Segoe UI,Arial,sans-serif;color:#111827;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
                <tr>
                  <td align="center">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 8px 30px rgba(17,24,39,.08);">
                      <tr>
                        <td style="background:#f97316;padding:18px 24px;color:#fff;font-weight:700;font-size:20px;">Textzy Verification</td>
                      </tr>
                      <tr>
                        <td style="padding:24px;">
                          <p style="margin:0 0 12px;">Hi {safeName},</p>
                          <p style="margin:0 0 16px;line-height:1.6;">Use this one-time password (OTP) to verify your email for <strong>{safePurpose}</strong>.</p>
                          <div style="text-align:center;margin:18px 0;">
                            <div style="display:inline-block;padding:12px 24px;border:1px dashed #f97316;border-radius:10px;font-size:30px;font-weight:800;letter-spacing:6px;color:#111827;">{safeOtp}</div>
                          </div>
                          <p style="margin:0 0 8px;color:#4b5563;">Verification code: <strong>{safeCode}</strong></p>
                          <p style="margin:0 0 8px;color:#4b5563;">This OTP expires in <strong>{expiryMinutes} minutes</strong>.</p>
                          <p style="margin:0;color:#dc2626;font-size:13px;">Do not share this OTP with anyone.</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:14px 24px;background:#f9fafb;color:#6b7280;font-size:12px;">
                          Powered by Moneyart Private Limited
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </body>
            </html>
            """;

        var plain = $"""
            Hi {(string.IsNullOrWhiteSpace(displayName) ? "there" : displayName)},

            Your Textzy OTP for {purpose}: {otp}
            Verification code: {verificationCode}
            Expires in {expiryMinutes} minutes.

            Do not share this OTP with anyone.
            """;

        var msg = new MailMessage
        {
            From = new MailAddress(fromEmail, fromName),
            Subject = $"Textzy OTP: {otp}",
            Body = html,
            IsBodyHtml = true
        };
        msg.To.Add(new MailAddress(toEmail));
        msg.AlternateViews.Add(AlternateView.CreateAlternateViewFromString(plain, null, "text/plain"));

        using var client = new SmtpClient(host, int.TryParse(portRaw, out var p) ? p : 587)
        {
            EnableSsl = bool.TryParse(enableSslRaw, out var ssl) ? ssl : true,
            DeliveryMethod = SmtpDeliveryMethod.Network
        };

        if (!string.IsNullOrWhiteSpace(username))
            client.Credentials = new NetworkCredential(username, password ?? string.Empty);

        using var ctr = ct.Register(() => client.SendAsyncCancel());
        await client.SendMailAsync(msg);
    }
}
