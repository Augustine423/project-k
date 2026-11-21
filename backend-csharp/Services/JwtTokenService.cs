using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Kzys.Backend.Models;
using Microsoft.IdentityModel.Tokens;

namespace Kzys.Backend.Services;

public sealed class JwtTokenService
{
    private readonly byte[] _secret;
    private readonly TimeSpan _ttl = TimeSpan.FromHours(12);

    public JwtTokenService(string secret)
    {
        // Match Go's permissive HS256 secret length by deriving a 256-bit key.
        _secret = SHA256.HashData(Encoding.UTF8.GetBytes(secret));
    }

    public string Issue(string roomId, string participantId, string role)
    {
        var claims = new[]
        {
            new Claim("roomId", roomId),
            new Claim("participantId", participantId),
            new Claim("role", role),
        };
        var token = new JwtSecurityToken(
            claims: claims,
            expires: DateTime.UtcNow.Add(_ttl),
            signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(_secret),
                SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public ParticipantClaims Verify(string token)
    {
        var handler = new JwtSecurityTokenHandler { MapInboundClaims = false };
        var principal = handler.ValidateToken(token, new TokenValidationParameters
        {
            ValidateIssuer = false,
            ValidateAudience = false,
            ValidateIssuerSigningKey = true,
            ValidateLifetime = true,
            RequireExpirationTime = true,
            ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
            IssuerSigningKey = new SymmetricSecurityKey(_secret),
            ClockSkew = TimeSpan.FromMinutes(1),
        }, out _);

        var roomId = principal.FindFirst("roomId")?.Value;
        var participantId = principal.FindFirst("participantId")?.Value;
        // Only exact, known role values are honoured; anything else is a plain participant.
        var claimedRole = principal.FindFirst("role")?.Value;
        var role = claimedRole is ParticipantRoles.Host or ParticipantRoles.CoHost
            ? claimedRole
            : ParticipantRoles.Participant;
        if (string.IsNullOrEmpty(roomId) || string.IsNullOrEmpty(participantId))
            throw new SecurityTokenException("invalid token claims");

        return new ParticipantClaims
        {
            RoomId = roomId,
            ParticipantId = participantId,
            Role = role,
        };
    }
}
