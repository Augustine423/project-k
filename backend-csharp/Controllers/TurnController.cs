using Microsoft.AspNetCore.Mvc;

namespace Kzys.Backend.Controllers
{
    [ApiController]
    [Route("api/v1/turn")]
    [Route("v1/turn")]
    public class TurnController : ControllerBase
    {
        public record TurnCredentialsResponse(string[] Urls, string Username, string Credential);

        [HttpGet("credentials")]
        public IActionResult GetCredentials()
        {
            // Simulate dynamic coturn credentials generation
            return Ok(new TurnCredentialsResponse(
                Urls: new[] { "turn:turn.example.com:3478?transport=udp" },
                Username: "kzys-user-" + Guid.NewGuid().ToString().Substring(0, 8),
                Credential: "kzys-secure-credential-here"
            ));
        }
    }
}
