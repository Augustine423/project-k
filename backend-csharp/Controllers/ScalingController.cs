using Kzys.Backend.Services;
using Microsoft.AspNetCore.Mvc;

namespace Kzys.Backend.Controllers;

[ApiController]
[Route("api/rooms/scaling")]
public class ScalingController : ControllerBase
{
    private readonly IRoomStore _rooms;

    public ScalingController(IRoomStore rooms) => _rooms = rooms;

    /// <summary>KEDA metrics-api trigger — includes warm standby pool.</summary>
    [HttpGet("metrics")]
    public async Task<IActionResult> Metrics(CancellationToken cancellationToken)
    {
        var m = await _rooms.GetScalingMetricsAsync(cancellationToken);
        return Ok(new
        {
            activeRooms = m.ActiveRooms,
            desiredSfuPods = m.DesiredSfuPods,
            standbyPool = m.StandbyPool,
            roomCreatedEvents = m.RoomCreatedEvents,
        });
    }
}
