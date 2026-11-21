using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Kzys.Backend.Models;
using Kzys.Backend.Services;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace Kzys.Backend.Tests;

public class JwtTokenServiceTests
{
    private readonly JwtTokenService _jwt = new("test-secret");

    [Theory]
    [InlineData(ParticipantRoles.Host)]
    [InlineData(ParticipantRoles.CoHost)]
    [InlineData(ParticipantRoles.Participant)]
    public void Role_round_trips(string role)
    {
        var claims = _jwt.Verify(_jwt.Issue("r1", "p1", role));
        Assert.Equal(role, claims.Role);
        Assert.Equal("r1", claims.RoomId);
        Assert.Equal("p1", claims.ParticipantId);
    }

    [Theory]
    [InlineData("HOST")]
    [InlineData("Host ")]
    [InlineData("admin")]
    [InlineData("")]
    public void Unknown_or_miscased_role_is_never_host(string role)
    {
        Assert.Equal(ParticipantRoles.Participant, _jwt.Verify(_jwt.Issue("r1", "p1", role)).Role);
    }

    [Fact]
    public void Missing_role_claim_defaults_to_participant()
    {
        var key = new SymmetricSecurityKey(SHA256.HashData(Encoding.UTF8.GetBytes("test-secret")));
        var token = new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(
            claims: [new Claim("roomId", "r1"), new Claim("participantId", "p1")],
            expires: DateTime.UtcNow.AddMinutes(5),
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256)));
        Assert.Equal(ParticipantRoles.Participant, _jwt.Verify(token).Role);
    }

    [Fact]
    public void Token_signed_with_other_secret_is_rejected()
    {
        var forged = new JwtTokenService("other-secret").Issue("r1", "p1", ParticipantRoles.Host);
        Assert.ThrowsAny<Exception>(() => _jwt.Verify(forged));
    }

    [Fact]
    public void Unsigned_token_is_rejected()
    {
        var header = Convert.ToBase64String("""{"alg":"none","typ":"JWT"}"""u8.ToArray()).TrimEnd('=');
        var body = Convert.ToBase64String("""{"roomId":"r1","participantId":"p1","role":"host","exp":9999999999}"""u8.ToArray()).TrimEnd('=');
        Assert.ThrowsAny<Exception>(() => _jwt.Verify($"{header}.{body}."));
    }
}

public class TierLimitTests
{
    [Theory]
    [InlineData(50, 50, 50)]
    [InlineData(100, 100, 100)]
    [InlineData(300, 100, 300)]
    [InlineData(1000, 50, 500)]
    [InlineData(10000, 50, 500)]
    public void Tier_limits(int max, int publishers, int interactive)
    {
        Assert.Equal((publishers, interactive), RoomPlanManager.GetTierLimits(max));
    }
}
