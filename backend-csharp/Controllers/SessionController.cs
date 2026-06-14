using Microsoft.AspNetCore.Mvc;

namespace Kzys.Backend.Controllers
{
    [ApiController]
    [Route("api/v1/session")]
    [Route("v1/session")]
    public class SessionController : ControllerBase
    {
        public record PrepareSessionRequest(string RoomId, string UserId, string SdpOffer);
        public record PrepareSessionResponse(string SdpAnswer, string MediaServerEndpoint);

        [HttpPost("prepare")]
        public IActionResult Prepare([FromBody] PrepareSessionRequest request)
        {
            if (string.IsNullOrEmpty(request.RoomId) || string.IsNullOrEmpty(request.UserId))
            {
                return BadRequest("RoomId and UserId are required.");
            }

            // Simulate Janus Gateway plugin / SFU interaction
            // In a full WebRTC integration with Janus, the backend would call Janus API
            // to prepare a session or return WebRTC coordinates.
            // For general WebRTC mesh fallback or simple proxy setup, we return a mock answer.
            return Ok(new PrepareSessionResponse(
                SdpAnswer: "v=0\r\no=- 0 0 IN IP4 127.0.0.1",
                MediaServerEndpoint: "udp://0.0.0.0:5000"
            ));
        }
    }
}
