using Kzys.Backend.Models;
using Kzys.Backend.Services;
using Microsoft.AspNetCore.Mvc;

namespace Kzys.Backend.Controllers
{
    [ApiController]
    [Route("api/rooms")]
    public class RoomsController : ControllerBase
    {
        private readonly RoomPlanManager _plans;
        private readonly IRoomStore _rooms;

        public RoomsController(RoomPlanManager plans, IRoomStore rooms)
        {
            _plans = plans;
            _rooms = rooms;
        }

        public record CreateRoomRequest(string? HostName, string? UserId);

        [HttpPost("create")]
        public async Task<IActionResult> Create(
            [FromBody] CreateRoomRequest? request,
            CancellationToken cancellationToken = default)
        {
            var userId = (request?.UserId ?? request?.HostName)?.Trim();
            if (string.IsNullOrWhiteSpace(userId))
                return BadRequest(new { error = "Display name is required." });

            if (!_plans.TryGetPlan("free", out var plan))
                return StatusCode(500, new { error = "Free plan is not configured." });

            RegisteredRoom room;
            try
            {
                room = await _rooms.CreateAsync(
                    plan,
                    request?.HostName?.Trim(),
                    userId,
                    BillingMode.PerRoom,
                    RoomPlanManager.DefaultRoomDurationHours,
                    cancellationToken);
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { error = ex.Message });
            }

            await JanusRoomService.EnsureVideoRoomAsync(room.RoomId, room.MaxParticipants, cancellationToken);

            return Ok(new
            {
                roomId = room.RoomId,
                joinKey = room.JoinKey,
                planId = room.PlanId,
                planName = room.PlanName,
                maxParticipants = room.MaxParticipants,
            });
        }

        [HttpGet("validate")]
        public async Task<IActionResult> Validate(
            [FromQuery] string roomId,
            [FromQuery] string joinKey,
            CancellationToken cancellationToken)
        {
            var (valid, room, error) = await _rooms.TryValidateAsync(roomId, joinKey, cancellationToken);
            if (!valid)
                return NotFound(new { valid = false, error });

            return Ok(new
            {
                valid = true,
                roomId = room!.RoomId,
                planId = room.PlanId,
                planName = room.PlanName,
                maxParticipants = room.MaxParticipants,
            });
        }

        [HttpGet("status")]
        public async Task<IActionResult> Status(
            [FromQuery] string roomId,
            [FromQuery] string joinKey,
            CancellationToken cancellationToken)
        {
            var (valid, room, error) = await _rooms.TryValidateAsync(roomId, joinKey, cancellationToken);
            if (!valid)
                return NotFound(new { error });

            var chatCount = await _presence.CountAsync(roomId);

            return Ok(new
            {
                roomId = room!.RoomId,
                planId = room.PlanId,
                planName = room.PlanName,
                maxParticipants = room.MaxParticipants,
                participantCount = chatCount,
                seatsRemaining = Math.Max(0, room.MaxParticipants - chatCount),
                isFull = chatCount >= room.MaxParticipants,
            });
        }
    }
}
