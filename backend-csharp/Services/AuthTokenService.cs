using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace Kzys.Backend.Services;

public sealed class AuthTokenService
{
    private readonly byte[] _secret;
    private readonly TimeSpan _ttl = TimeSpan.FromDays(30);

    public AuthTokenService(string secret)
    {
        _secret = SHA256.HashData(Encoding.UTF8.GetBytes(secret + ":user-auth"));
    }

    public string Issue(string userId, string email)
    {
        var claims = new[]
        {
            new Claim("typ", "user"),
            new Claim("userId", userId),
            new Claim("email", email),
        };
        var token = new JwtSecurityToken(
            claims: claims,
            expires: DateTime.UtcNow.Add(_ttl),
            signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(_secret),
                SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public UserAuthClaims Verify(string token)
    {
        var handler = new JwtSecurityTokenHandler();
        var principal = handler.ValidateToken(token, new TokenValidationParameters
        {
            ValidateIssuer = false,
            ValidateAudience = false,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(_secret),
            ClockSkew = TimeSpan.FromMinutes(1),
        }, out _);

        var typ = principal.FindFirst("typ")?.Value;
        var userId = principal.FindFirst("userId")?.Value;
        var email = principal.FindFirst("email")?.Value;
        if (typ != "user" || string.IsNullOrEmpty(userId) || string.IsNullOrEmpty(email))
            throw new SecurityTokenException("invalid user token");

        return new UserAuthClaims { UserId = userId, Email = email };
    }
}

public sealed class UserAuthClaims
{
    public required string UserId { get; init; }
    public required string Email { get; init; }
}
