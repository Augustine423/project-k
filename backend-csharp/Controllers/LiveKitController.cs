using Livekit.Server.Sdk.Dotnet;
using Microsoft.AspNetCore.Mvc;

namespace Kzys.Backend.Controllers
{
    [ApiController]
    [Route("api/livekit")]
    public class LiveKitController : ControllerBase
    {
        [HttpGet("token")]
        public IActionResult GetToken([FromQuery] string roomId, [FromQuery] string userId)
        {
            if (string.IsNullOrWhiteSpace(roomId) || string.IsNullOrWhiteSpace(userId))
                return BadRequest("roomId and userId are required.");

            var apiKey    = Environment.GetEnvironmentVariable("LIVEKIT_API_KEY")    ?? "devkey";
            var apiSecret = Environment.GetEnvironmentVariable("LIVEKIT_API_SECRET") ?? "devsecret";

            var token = new AccessToken(apiKey, apiSecret)
                .WithIdentity(userId)
                .WithName(userId)
                .WithGrants(new VideoGrants
                {
                    RoomJoin     = true,
                    Room         = roomId,
                    CanPublish   = true,
                    CanSubscribe = true
                });

            return Ok(new { token = token.ToJwt() });
        }
    }
}
