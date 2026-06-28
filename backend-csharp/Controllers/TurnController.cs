using Microsoft.AspNetCore.Mvc;

namespace Kzys.Backend.Controllers;

[ApiController]
[Route("api/v1/turn")]
[Route("v1/turn")]
public class TurnController : ControllerBase
{
    public record TurnCredentialsResponse(string[] Urls, string Username, string Credential);

    [HttpGet("credentials")]
    public IActionResult GetCredentials()
    {
        var turnHost = Environment.GetEnvironmentVariable("TURN_HOST");
        if (string.IsNullOrWhiteSpace(turnHost))
            turnHost = Request.Host.Host;

        var turnPort = Environment.GetEnvironmentVariable("TURN_PORT") ?? "3478";
        var username = Environment.GetEnvironmentVariable("TURN_USERNAME");
        var password = Environment.GetEnvironmentVariable("TURN_PASSWORD");

        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
            return StatusCode(503, new { error = "TURN credentials not configured." });

        return Ok(new TurnCredentialsResponse(
            Urls:
            [
                $"turn:{turnHost}:{turnPort}?transport=udp",
                $"turn:{turnHost}:{turnPort}?transport=tcp",
            ],
            Username: username,
            Credential: password));
    }
}
