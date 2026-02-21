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
}
