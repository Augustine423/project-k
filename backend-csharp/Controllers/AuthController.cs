using Kzys.Backend.Services;
using Microsoft.AspNetCore.Mvc;

namespace Kzys.Backend.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController : ControllerBase
{
    private readonly IAuthService _auth;
    private readonly AuthTokenService _tokens;

    public AuthController(IAuthService auth, AuthTokenService tokens)
    {
        _auth = auth;
        _tokens = tokens;
    }

    public sealed record SignUpBody(string Email, string Password, string? FullName = null, string? DisplayName = null);
    public sealed record SignInBody(string Email, string Password);
    public sealed record UsernameBody(string Username);
    public sealed record ResetPasswordBody(string Email, string NewPassword);
    public sealed record ExistsBody(string Email);

    [HttpPost("signup")]
    public async Task<ActionResult<AuthSessionDto>> SignUp([FromBody] SignUpBody body, CancellationToken ct)
    {
        try
        {
            var fullName = body.FullName ?? body.DisplayName;
            var session = await _auth.SignUpAsync(body.Email, body.Password, fullName, ct);
            return StatusCode(StatusCodes.Status201Created, session);
        }
        catch (AuthServiceException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthSessionDto>> Login([FromBody] SignInBody body, CancellationToken ct)
    {
        try
        {
            var session = await _auth.SignInAsync(body.Email, body.Password, ct);
            return Ok(session);
        }
        catch (AuthServiceException ex)
        {
            return Unauthorized(new { error = ex.Message });
        }
    }

    [HttpGet("me")]
    public async Task<ActionResult<AuthUserDto>> Me(CancellationToken ct)
    {
        var claims = TryGetUser();
        if (claims is null) return Unauthorized(new { error = "Not authenticated." });

        var user = await _auth.GetMeAsync(claims.UserId, ct);
        if (user is null) return Unauthorized(new { error = "Account not found." });
        return Ok(user);
    }

    [HttpPost("username")]
    public async Task<ActionResult<AuthUserDto>> SetUsername([FromBody] UsernameBody body, CancellationToken ct)
    {
        var claims = TryGetUser();
        if (claims is null) return Unauthorized(new { error = "Not authenticated." });

        try
        {
            var user = await _auth.SetUsernameAsync(claims.UserId, body.Username, ct);
            return Ok(user);
        }
        catch (AuthServiceException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("exists")]
    public async Task<ActionResult<object>> Exists([FromBody] ExistsBody body, CancellationToken ct)
    {
        var found = await _auth.AccountExistsAsync(body.Email, ct);
        return Ok(new { email = body.Email.Trim().ToLowerInvariant(), found });
    }

    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordBody body, CancellationToken ct)
    {
        try
        {
            await _auth.ResetPasswordAsync(body.Email, body.NewPassword, ct);
            return Ok(new { ok = true });
        }
        catch (AuthServiceException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    private UserAuthClaims? TryGetUser()
    {
        var header = Request.Headers.Authorization.ToString();
        if (string.IsNullOrWhiteSpace(header) || !header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            return null;
        try
        {
            return _tokens.Verify(header["Bearer ".Length..].Trim());
        }
        catch
        {
            return null;
        }
    }
}
