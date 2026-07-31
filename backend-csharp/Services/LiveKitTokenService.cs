using System.IdentityModel.Tokens.Jwt;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace Kzys.Backend.Services;

/// <summary>Issues LiveKit access tokens (HS256) for room join/publish/subscribe.</summary>
public sealed class LiveKitTokenService
{
    private readonly string _apiKey;
    private readonly string _apiSecret;
    private readonly TimeSpan _ttl;

    public LiveKitTokenService(string apiKey, string apiSecret, TimeSpan? ttl = null)
    {
        _apiKey = apiKey;
        _apiSecret = apiSecret;
        _ttl = ttl ?? TimeSpan.FromHours(6);
    }

    public string CreateJoinToken(
        string roomName,
        string identity,
        string displayName,
        bool canPublish = true,
        bool canSubscribe = true,
        IReadOnlyList<string>? canPublishSources = null)
    {
        var now = DateTimeOffset.UtcNow;
        var video = new Dictionary<string, object?>
        {
            ["roomJoin"] = true,
            ["room"] = roomName,
            ["canPublish"] = canPublish,
            ["canSubscribe"] = canSubscribe,
        };
        // Restrict publishable track kinds when set (e.g. webinar attendees → microphone only).
        if (canPublish && canPublishSources is { Count: > 0 })
            video["canPublishSources"] = canPublishSources.ToArray();

        var payload = new JwtPayload(
            issuer: _apiKey,
            audience: null,
            claims: null,
            notBefore: now.UtcDateTime,
            expires: now.Add(_ttl).UtcDateTime,
            issuedAt: now.UtcDateTime)
        {
            ["sub"] = identity,
            ["name"] = displayName,
            ["video"] = video,
        };

        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_apiSecret)),
            SecurityAlgorithms.HmacSha256);

        var header = new JwtHeader(credentials) { ["typ"] = "JWT" };
        var token = new JwtSecurityToken(header, payload);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
