using Kzys.Backend.Configuration;
using Kzys.Backend.Models;
using Kzys.Backend.Realtime;

namespace Kzys.Backend.Services;

/// <summary>
/// Auto-switches interactive ↔ webinar based on publisher vs listener counts.
/// Janus media tuning is delegated to the C++ media-core sidecar via Redis.
/// </summary>
public sealed class RoomModeService
{
    private readonly ControlPlaneStore _store;
    private readonly AppConfig _config;
    private readonly RoomEventHub _hub;
    private readonly ILogger<RoomModeService> _log;

    public RoomModeService(
        ControlPlaneStore store,
        AppConfig config,
        RoomEventHub hub,
        ILogger<RoomModeService> log)
    {
        _store = store;
        _config = config;
        _hub = hub;
        _log = log;
    }

    public async Task<(RoomRecord Room, bool ModeChanged)> ReportMediaPresenceAsync(
        string roomId,
        string participantId,
        bool publishing,
        bool audio,
        bool video,
        CancellationToken ct = default)
    {
        var room = await _store.GetRoomAsync(roomId, ct)
            ?? throw new RoomServiceException(RoomError.NotFound, "room not found");

        await _store.SetMediaPresenceAsync(roomId, new MediaPresenceRecord
        {
            ParticipantId = participantId,
            Publishing = publishing,
            Audio = audio,
            Video = video,
            UpdatedAt = DateTime.UtcNow,
        }, ct);

        var stats = await _store.GetMediaStatsAsync(roomId, ct);
        room.ActivePublishers = stats.Publishers;
        room.ActiveListeners = stats.Listeners;

        var nextMode = EvaluateMode(
            room.Mode,
            stats.TotalParticipants,
            stats.Publishers,
            stats.Listeners);

        var modeChanged = !string.Equals(nextMode, room.Mode, StringComparison.Ordinal);
        if (modeChanged)
        {
            var previous = room.Mode;
            room.Mode = nextMode;
            room.MaxPublishers = nextMode == RoomModes.Webinar
                ? _config.WebinarMaxPublishers
                : Math.Min(room.MaxParticipants, _config.InteractiveMaxPublishers);

            _log.LogInformation(
                "room {RoomId} mode {OldMode} → {NewMode} (pub={Pub} listen={Listen})",
                roomId, previous, nextMode, stats.Publishers, stats.Listeners);

            await _store.EnqueueModeApplyAsync(roomId, ct);
        }

        await _store.SaveRoomAsync(room, ct);
        await _store.RefreshScalingMetricsAsync(ct);

        if (modeChanged)
        {
            _hub.Broadcast(roomId, new RoomEvent
            {
                Type = "room.mode_changed",
                Data = new { mode = room.Mode, maxPublishers = room.MaxPublishers },
            });
        }

        return (room, modeChanged);
    }

    public async Task ReconcileRoomAsync(string roomId, CancellationToken ct = default)
    {
        var room = await _store.GetRoomAsync(roomId, ct);
        if (room is null) return;

        var stats = await _store.GetMediaStatsAsync(roomId, ct);
        room.ActivePublishers = stats.Publishers;
        room.ActiveListeners = stats.Listeners;

        var nextMode = EvaluateMode(room.Mode, stats.TotalParticipants, stats.Publishers, stats.Listeners);
        if (string.Equals(nextMode, room.Mode, StringComparison.Ordinal))
        {
            await _store.SaveRoomAsync(room, ct);
            return;
        }

        room.Mode = nextMode;
        room.MaxPublishers = nextMode == RoomModes.Webinar
            ? _config.WebinarMaxPublishers
            : Math.Min(room.MaxParticipants, _config.InteractiveMaxPublishers);

        await _store.SaveRoomAsync(room, ct);
        await _store.EnqueueModeApplyAsync(roomId, ct);
        await _store.RefreshScalingMetricsAsync(ct);

        _hub.Broadcast(roomId, new RoomEvent
        {
            Type = "room.mode_changed",
            Data = new { mode = room.Mode, maxPublishers = room.MaxPublishers },
        });
    }

    public string EvaluateMode(string currentMode, int totalParticipants, int publishers, int listeners)
    {
        if (totalParticipants <= 0) return RoomModes.Interactive;

        var ratio = publishers > 0 ? (double)listeners / publishers : listeners;

        if (string.Equals(currentMode, RoomModes.Webinar, StringComparison.Ordinal))
        {
            if (totalParticipants < _config.WebinarExitListeners
                || listeners < _config.WebinarExitListeners
                || ratio < _config.WebinarEnterRatio * 0.75)
            {
                return RoomModes.Interactive;
            }
            return RoomModes.Webinar;
        }

        if (totalParticipants >= _config.WebinarEnterListeners
            && listeners >= _config.WebinarEnterListeners
            && ratio >= _config.WebinarEnterRatio)
        {
            return RoomModes.Webinar;
        }

        return RoomModes.Interactive;
    }

    public bool ShouldJoinAsListener(RoomRecord room, ParticipantRecord participant)
    {
        if (room.Mode != RoomModes.Webinar) return false;
        return participant.Role is not (ParticipantRoles.Host or ParticipantRoles.CoHost);
    }
}

public sealed record MediaStats(int TotalParticipants, int Publishers, int Listeners);
