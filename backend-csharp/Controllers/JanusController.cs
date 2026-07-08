using Kzys.Backend.Services;
using Microsoft.AspNetCore.Mvc;

namespace Kzys.Backend.Controllers;

[ApiController]
[Route("api/janus")]
public class JanusController : ControllerBase
{
    private readonly IRoomStore _rooms;

    public JanusController(IRoomStore rooms) => _rooms = rooms;

    [HttpGet("config")]
    public async Task<IActionResult> GetConfig(
        [FromQuery] string roomId,
        [FromQuery] string joinKey,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(roomId) || string.IsNullOrWhiteSpace(joinKey))
            return BadRequest(new { error = "roomId and joinKey are required." });

        var (valid, room, error) = await _rooms.TryValidateAsync(roomId, joinKey, cancellationToken);
        if (!valid)
            return Unauthorized(new { error = error });

        var turnHost = Environment.GetEnvironmentVariable("TURN_HOST");
        if (string.IsNullOrWhiteSpace(turnHost))
            turnHost = Request.Host.Host;

        var turnPort = Environment.GetEnvironmentVariable("TURN_PORT") ?? "30478";
        var turnUser = Environment.GetEnvironmentVariable("TURN_USERNAME") ?? "kzys";
        var turnPass = Environment.GetEnvironmentVariable("TURN_PASSWORD") ?? "kzyspass123";

        var proto = Request.IsHttps ? "wss" : "ws";
        var janusServer = Environment.GetEnvironmentVariable("JANUS_PUBLIC_WS")
            ?? $"{proto}://{Request.Host}/janus-ws";

        return Ok(new
        {
            janusRoomId = JanusRoomService.ToJanusRoomId(roomId),
            server = janusServer,
            plugin = "janus.plugin.videoroom",
            iceServers = new object[]
            {
                new { urls = "stun:stun.l.google.com:19302" },
                new { urls = "stun:stun1.l.google.com:19302" },
                new
                {
                    urls = new[]
                    {
                        $"turn:{turnHost}:{turnPort}?transport=udp",
                        $"turn:{turnHost}:{turnPort}?transport=tcp",
                    },
                    username = turnUser,
                    credential = turnPass,
                },
            },
            roomId = room!.RoomId,
            maxParticipants = room.MaxParticipants,
        });
    }
}
