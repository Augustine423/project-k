using Livekit.Server.Sdk.Dotnet;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace Kzys.Backend.Controllers
{
    [ApiController]
    [Route("api/livekit")]
    public class LiveKitController : ControllerBase
    {
        private static readonly HttpClient _http = new();

        [HttpGet("token")]
        [EnableRateLimiting("token-policy")]
        public async Task<IActionResult> GetToken([FromQuery] string roomId, [FromQuery] string userId)
        {
            if (string.IsNullOrWhiteSpace(roomId) || string.IsNullOrWhiteSpace(userId))
                return BadRequest("roomId and userId are required.");

            if (roomId.Length > 64 || userId.Length > 64)
                return BadRequest("roomId and userId must be 64 characters or fewer.");

            var apiKey    = Environment.GetEnvironmentVariable("LIVEKIT_API_KEY")    ?? "devkey";
            var apiSecret = Environment.GetEnvironmentVariable("LIVEKIT_API_SECRET") ?? "devsecret-devsecret-devsecret-12";
            var livekitUrl = Environment.GetEnvironmentVariable("LIVEKIT_URL")       ?? "http://livekit-sfu:7880";
            var maxParticipants = int.TryParse(
                Environment.GetEnvironmentVariable("MAX_PARTICIPANTS_PER_ROOM"), out var mp) ? mp : 50;

            // Ensure the room exists with a participant cap before issuing a token
            await EnsureRoomAsync(livekitUrl, apiKey, apiSecret, roomId, maxParticipants);

            var token = new AccessToken(apiKey, apiSecret)
                .WithIdentity(userId)
                .WithName(userId)
                .WithTtl(TimeSpan.FromHours(1))
                .WithGrants(new VideoGrants
                {
                    RoomJoin     = true,
                    Room         = roomId,
                    CanPublish   = true,
                    CanSubscribe = true,
                });

            return Ok(new { token = token.ToJwt() });
        }

        // Creates the LiveKit room with a participant cap if it doesn't already exist.
        // LiveKit's CreateRoom is idempotent — calling it on an existing room is a no-op.
        private static async Task EnsureRoomAsync(
            string livekitUrl, string apiKey, string apiSecret,
            string roomId, int maxParticipants)
        {
            try
            {
                // Build a short-lived admin token for the Room Service call
                var adminToken = new AccessToken(apiKey, apiSecret)
                    .WithIdentity("server")
                    .WithTtl(TimeSpan.FromSeconds(30))
                    .WithGrants(new VideoGrants { RoomCreate = true, RoomAdmin = true });

                var payload = JsonSerializer.Serialize(new
                {
                    name = roomId,
                    max_participants = maxParticipants,
                    empty_timeout = 300  // auto-close room 5 min after last participant leaves
                });

                var request = new HttpRequestMessage(
                    HttpMethod.Post,
                    $"{livekitUrl.TrimEnd('/')}/twirp/livekit.RoomService/CreateRoom")
                {
                    Content = new StringContent(payload, Encoding.UTF8, "application/json")
                };
                request.Headers.Authorization =
                    new AuthenticationHeaderValue("Bearer", adminToken.ToJwt());

                await _http.SendAsync(request);
            }
            catch
            {
                // Non-fatal — if LiveKit is unavailable the token will still be issued;
                // the SFU will create the room on first join without the participant cap.
            }
        }
    }
}
