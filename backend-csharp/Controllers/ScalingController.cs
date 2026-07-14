using Kzys.Backend.Services;
using Microsoft.AspNetCore.Mvc;

namespace Kzys.Backend.Controllers;

[ApiController]
[Route("api/rooms/scaling")]
public class ScalingController : ControllerBase
{
    private readonly ControlPlaneStore _store;

    public ScalingController(ControlPlaneStore store) => _store = store;

    /// <summary>KEDA metrics-api trigger — includes warm standby pool.</summary>
    [HttpGet("metrics")]
    public async Task<IActionResult> Metrics(CancellationToken cancellationToken)
    {
        var m = await _store.GetScalingMetricsAsync(cancellationToken);
        return Ok(new
        {
            activeRooms = m.ActiveRooms,
            desiredSfuPods = m.DesiredSfuPods,
            standbyPool = m.StandbyPool,
            roomCreatedEvents = m.RoomCreatedEvents,
        });
    }
}
