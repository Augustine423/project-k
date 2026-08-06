using Kzys.Backend.Configuration;
using Kzys.Backend.Models;
using Kzys.Backend.Realtime;

namespace Kzys.Backend.Services;

/// <summary>Consumes deferred room mode apply jobs from Redis (multi-replica safe).</summary>
public sealed class RoomModeApplyWorker : BackgroundService
{
    private readonly ControlPlaneStore _store;
    private readonly RoomModeService _modes;
    private readonly ILogger<RoomModeApplyWorker> _log;

    public RoomModeApplyWorker(
        ControlPlaneStore store,
        RoomModeService modes,
        ILogger<RoomModeApplyWorker> log)
    {
        _store = store;
        _modes = modes;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var roomId = await _store.DequeueModeApplyAsync(stoppingToken);
                if (roomId is null)
                {
                    await Task.Delay(250, stoppingToken);
                    continue;
                }

                await _modes.ReconcileRoomAsync(roomId, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "mode apply worker iteration failed");
                await Task.Delay(1000, stoppingToken);
            }
        }
    }
}

/// <summary>Broadcasts lightweight presence events for large rooms.</summary>
public sealed class RoomPresenceBroadcaster
{
    private readonly RoomEventHub _hub;
    private readonly ControlPlaneStore _store;
    private readonly AppConfig _config;

    public RoomPresenceBroadcaster(RoomEventHub hub, ControlPlaneStore store, AppConfig config)
    {
        _hub = hub;
        _store = store;
        _config = config;
    }

    public async Task BroadcastJoinedAsync(string roomId, ParticipantRecord participant, CancellationToken ct = default)
    {
        var count = (int)await _store.GetParticipantCountAsync(roomId, ct);
        // Always publish authoritative headcount so clients never ±1 into drift.
        _hub.Broadcast(roomId, new RoomEvent
        {
            Type = "room.participant_count",
            Data = new { count },
        });

        if (count > _config.LargeRoomEventThreshold)
            return;

        _hub.Broadcast(roomId, new RoomEvent { Type = "participant.joined", Data = participant });
    }

    public async Task BroadcastLeftAsync(string roomId, string participantId, CancellationToken ct = default)
    {
        var count = (int)await _store.GetParticipantCountAsync(roomId, ct);
        _hub.Broadcast(roomId, new RoomEvent
        {
            Type = "room.participant_count",
            Data = new { count },
        });

        if (count > _config.LargeRoomEventThreshold)
            return;

        _hub.Broadcast(roomId, new RoomEvent
        {
            Type = "participant.left",
            Data = new { participantId },
        });
    }
}
