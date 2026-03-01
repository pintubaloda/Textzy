namespace Textzy.Api.Services;

public class AuthCookieService(IConfiguration config)
{
    public const string CookieName = "textzy_session";
    public const string CsrfCookieName = "textzy_csrf";

    public string? ReadToken(HttpContext http)
    {
        return http.Request.Cookies.TryGetValue(CookieName, out var token) ? token : null;
    }

    public string? ReadCsrfToken(HttpContext http)
    {
        return http.Request.Cookies.TryGetValue(CsrfCookieName, out var token) ? token : null;
    }

    public void SetToken(HttpContext http, string token, bool remember = false)
    {
        var secure = !string.Equals(config["ASPNETCORE_ENVIRONMENT"], "Development", StringComparison.OrdinalIgnoreCase);
        http.Response.Cookies.Append(CookieName, token, new CookieOptions
        {
            HttpOnly = true,
            Secure = secure,
            IsEssential = true,
            SameSite = SameSiteMode.None,
            Path = "/",
            Expires = DateTimeOffset.UtcNow.Add(remember ? TimeSpan.FromDays(14) : TimeSpan.FromHours(12))
        });
    }

    public string EnsureCsrfToken(HttpContext http)
    {
        var existing = ReadCsrfToken(http);
        if (!string.IsNullOrWhiteSpace(existing))
            return existing;

        var token = GenerateOpaqueToken();
        var secure = !string.Equals(config["ASPNETCORE_ENVIRONMENT"], "Development", StringComparison.OrdinalIgnoreCase);
        http.Response.Cookies.Append(CsrfCookieName, token, new CookieOptions
        {
            HttpOnly = false, // double-submit token must be readable by frontend JS
            Secure = secure,
            IsEssential = true,
            SameSite = SameSiteMode.None,
            Path = "/",
            Expires = DateTimeOffset.UtcNow.AddDays(14)
        });
        return token;
    }

    public void Clear(HttpContext http)
    {
        var secure = !string.Equals(config["ASPNETCORE_ENVIRONMENT"], "Development", StringComparison.OrdinalIgnoreCase);
        http.Response.Cookies.Delete(CookieName, new CookieOptions
        {
            HttpOnly = true,
            Secure = secure,
            IsEssential = true,
            SameSite = SameSiteMode.None,
            Path = "/"
        });
        http.Response.Cookies.Delete(CsrfCookieName, new CookieOptions
        {
            HttpOnly = false,
            Secure = secure,
            IsEssential = true,
            SameSite = SameSiteMode.None,
            Path = "/"
        });
    }

    private static string GenerateOpaqueToken()
    {
        var bytes = System.Security.Cryptography.RandomNumberGenerator.GetBytes(32);
        return Convert.ToBase64String(bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=');
    }
}
