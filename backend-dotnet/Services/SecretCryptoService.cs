using System.Security.Cryptography;
using System.Text;

namespace Textzy.Api.Services;

public class SecretCryptoService(IConfiguration config)
{
    private readonly byte[] _key = SHA256.HashData(Encoding.UTF8.GetBytes(config["Secrets:MasterKey"] ?? "textzy-dev-master-key-change-in-prod"));

    public string Encrypt(string plain)
    {
        if (string.IsNullOrWhiteSpace(plain)) return string.Empty;
        using var aes = Aes.Create();
        aes.Key = _key;
        aes.GenerateIV();
        using var encryptor = aes.CreateEncryptor(aes.Key, aes.IV);
        var bytes = Encoding.UTF8.GetBytes(plain);
        var encrypted = encryptor.TransformFinalBlock(bytes, 0, bytes.Length);
        return $"{Convert.ToBase64String(aes.IV)}:{Convert.ToBase64String(encrypted)}";
    }

    public string Decrypt(string payload)
    {
        if (string.IsNullOrWhiteSpace(payload)) return string.Empty;
        var parts = payload.Split(':', 2);
        if (parts.Length != 2) return string.Empty;
        var iv = Convert.FromBase64String(parts[0]);
        var cipher = Convert.FromBase64String(parts[1]);
        using var aes = Aes.Create();
        aes.Key = _key;
        using var decryptor = aes.CreateDecryptor(aes.Key, iv);
        var plainBytes = decryptor.TransformFinalBlock(cipher, 0, cipher.Length);
        return Encoding.UTF8.GetString(plainBytes);
    }
}
