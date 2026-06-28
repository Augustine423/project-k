using Kzys.Backend.Services;
using Livekit.Server.Sdk.Dotnet;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Kzys.Backend.Controllers
{
    [ApiController]
    [Route("api/livekit")]
    public class LiveKitController : ControllerBase
    {
        private readonly IRoomStore _rooms;

        public LiveKitController(IRoomStore rooms) => _rooms = rooms;

        [HttpGet("token")]
        [EnableRateLimiting("token-policy")]
        public async Task<IActionResult> GetToken(
            [FromQuery] string roomId,
            [FromQuery] string userId,
            [FromQuery] string joinKey,
            CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(roomId) || string.IsNullOrWhiteSpace(userId))
                return BadRequest("roomId and userId are required.");

            if (string.IsNullOrWhiteSpace(joinKey))
                return BadRequest("joinKey is required. Use the invite link from the room host.");

            var (valid, room, roomError) = await _rooms.TryValidateAsync(roomId, joinKey, cancellationToken);
            if (!valid)
                return Unauthorized(new { error = roomError });

            if (roomId.Length > 64 || userId.Length > 64)
                return BadRequest("roomId and userId must be 64 characters or fewer.");

            var cfg = LiveKitRoomService.GetConfig();

            await LiveKitRoomService.EnsureRoomAsync(roomId, room!.MaxParticipants);

            var (participantCount, identityPresent) =
                await LiveKitRoomService.GetParticipantInfoAsync(roomId, userId);

            if (!identityPresent && participantCount >= room.MaxParticipants)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new
                {
                    error = $"Room is full ({room.MaxParticipants} participants). Upgrade your plan for more seats.",
                    planId = room.PlanId,
                    planName = room.PlanName,
                    maxParticipants = room.MaxParticipants,
                    participantCount,
                    requiresUpgrade = true,
                });
            }

            var token = new AccessToken(cfg.ApiKey, cfg.ApiSecret)
                .WithIdentity(userId)
                .WithName(userId)
                .WithTtl(TimeSpan.FromHours(1))
                .WithGrants(new VideoGrants
                {
                    RoomJoin = true,
                    Room = roomId,
                    CanPublish = true,
                    CanSubscribe = true,
                });

            return Ok(new
            {
                token = token.ToJwt(),
                planId = room.PlanId,
                planName = room.PlanName,
                maxParticipants = room.MaxParticipants,
            });
        }
    }
}
