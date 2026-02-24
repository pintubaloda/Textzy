namespace Textzy.Api.Services;

public class AuthCookieService(IConfiguration config)
{
    public const string CookieName = "textzy_session";

    public string? ReadToken(HttpContext http)
    {
        return http.Request.Cookies.TryGetValue(CookieName, out var token) ? token : null;
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
    }
}
