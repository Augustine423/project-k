using Kzys.Backend.Services;
using Microsoft.AspNetCore.Mvc;

namespace Kzys.Backend.Controllers;

[ApiController]
[Route("api/rooms")]
public class RoomHistoryController : ControllerBase
{
    private readonly IRoomStore _rooms;

    public RoomHistoryController(IRoomStore rooms) => _rooms = rooms;

    [HttpGet("{roomId}/history")]
    public async Task<IActionResult> History(
        string roomId,
        [FromQuery] string joinKey,
        [FromQuery] int limit = 50,
        CancellationToken cancellationToken = default)
    {
        var (valid, _, error) = await _rooms.TryValidateAsync(roomId, joinKey, cancellationToken);
        if (!valid)
            return NotFound(new { error });

        var history = await _rooms.GetHistoryAsync(roomId, limit, cancellationToken);
        return Ok(new { roomId, history });
    }
}
