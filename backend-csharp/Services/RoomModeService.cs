using Kzys.Backend.Configuration;
using Kzys.Backend.Models;
using Kzys.Backend.Realtime;

namespace Kzys.Backend.Services;

/// <summary>
/// Tracks publisher vs listener counts and switches rooms between interactive and webinar modes.
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
            room.ModePinned,
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
                : InteractivePublisherCap(room);

            _log.LogInformation(
                "room {RoomId} mode {OldMode} → {NewMode} (pub={Pub} listen={Listen})",
                roomId, previous, nextMode, stats.Publishers, stats.Listeners);

            await _store.EnqueueModeApplyAsync(roomId, ct);

            // Raised hands are webinar-only; clear when leaving webinar.
            if (string.Equals(previous, RoomModes.Webinar, StringComparison.Ordinal)
                && !string.Equals(nextMode, RoomModes.Webinar, StringComparison.Ordinal))
            {
                await _store.ClearRaisedHandsAsync(roomId, ct);
                _hub.Broadcast(roomId, new RoomEvent
                {
                    Type = "hand.updated",
                    Data = new { raised = Array.Empty<object>() },
                });
            }
        }

        await _store.SaveRoomAsync(room, ct);
        await _store.RefreshScalingMetricsAsync(ct);

        if (modeChanged)
        {
            _hub.Broadcast(roomId, new RoomEvent
            {
                Type = "room.mode_changed",
                Data = new { mode = room.Mode, maxPublishers = room.MaxPublishers, modePinned = room.ModePinned },
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

        var nextMode = EvaluateMode(room.Mode, room.ModePinned, stats.TotalParticipants, stats.Publishers, stats.Listeners);
        if (string.Equals(nextMode, room.Mode, StringComparison.Ordinal))
        {
            await _store.SaveRoomAsync(room, ct);
            return;
        }

        var previous = room.Mode;
        room.Mode = nextMode;
        room.MaxPublishers = nextMode == RoomModes.Webinar
            ? _config.WebinarMaxPublishers
            : InteractivePublisherCap(room);

        await _store.SaveRoomAsync(room, ct);
        await _store.EnqueueModeApplyAsync(roomId, ct);
        await _store.RefreshScalingMetricsAsync(ct);

        if (string.Equals(previous, RoomModes.Webinar, StringComparison.Ordinal)
            && !string.Equals(nextMode, RoomModes.Webinar, StringComparison.Ordinal))
        {
            await _store.ClearRaisedHandsAsync(roomId, ct);
            _hub.Broadcast(roomId, new RoomEvent
            {
                Type = "hand.updated",
                Data = new { raised = Array.Empty<object>() },
            });
        }

        _hub.Broadcast(roomId, new RoomEvent
        {
            Type = "room.mode_changed",
            Data = new { mode = room.Mode, maxPublishers = room.MaxPublishers, modePinned = room.ModePinned },
        });
    }

    private int InteractivePublisherCap(RoomRecord room)
        => Math.Min(RoomPlanManager.GetTierLimits(room.MaxParticipants).MaxPublishers, _config.InteractiveMaxPublishers);

    public string EvaluateMode(
        string currentMode,
        bool modePinned,
        int totalParticipants,
        int publishers,
        int listeners)
    {
        if (modePinned)
            return currentMode;

        if (string.Equals(currentMode, RoomModes.Interactive, StringComparison.Ordinal))
        {
            if (totalParticipants >= _config.WebinarEnterListeners)
                return RoomModes.Webinar;

            if (publishers > 0
                && listeners / (double)Math.Max(1, publishers) >= _config.WebinarEnterRatio)
            {
                return RoomModes.Webinar;
            }
        }

        if (string.Equals(currentMode, RoomModes.Webinar, StringComparison.Ordinal)
            && totalParticipants <= _config.WebinarExitListeners)
        {
            return RoomModes.Interactive;
        }

        return currentMode;
    }

    /// <summary>Host/co-host sets room mode. Pin prevents automatic webinar/interactive switching.</summary>
    public async Task<RoomRecord> SetRoomModeAsync(
        string roomId,
        string mode,
        bool pin,
        CancellationToken ct = default)
    {
        if (mode is not (RoomModes.Interactive or RoomModes.Webinar))
            throw new RoomServiceException(RoomError.InvalidMode, "invalid room mode");

        var room = await _store.GetRoomAsync(roomId, ct)
            ?? throw new RoomServiceException(RoomError.NotFound, "room not found");

        room.Mode = mode;
        room.ModePinned = pin;
        room.MaxPublishers = mode == RoomModes.Webinar
            ? _config.WebinarMaxPublishers
            : InteractivePublisherCap(room);

        var stats = await _store.GetMediaStatsAsync(roomId, ct);
        room.ActivePublishers = stats.Publishers;
        room.ActiveListeners = stats.Listeners;

        await _store.SaveRoomAsync(room, ct);
        await _store.EnqueueModeApplyAsync(roomId, ct);
        await _store.RefreshScalingMetricsAsync(ct);

        if (mode == RoomModes.Interactive)
        {
            await _store.ClearRaisedHandsAsync(roomId, ct);
            _hub.Broadcast(roomId, new RoomEvent
            {
                Type = "hand.updated",
                Data = new { raised = Array.Empty<object>() },
            });
        }

        _hub.Broadcast(roomId, new RoomEvent
        {
            Type = "room.mode_changed",
            Data = new { mode = room.Mode, maxPublishers = room.MaxPublishers, modePinned = room.ModePinned },
        });

        _log.LogInformation("room {RoomId} mode set to {Mode} pinned={Pinned}", roomId, mode, pin);
        return room;
    }

    /// <summary>
    /// Webinar attendees may publish audio freely; video/screen stay host/co-host only.
    /// Interactive rooms still cap publishers via maxPublishers.
    /// </summary>
    public PublishCapabilities GetPublishCapabilities(
        RoomRecord room,
        ParticipantRecord participant,
        int activePublishers,
        bool isCurrentlyPublishing = false,
        bool promoted = false)
    {
        if (participant.Role is ParticipantRoles.Host or ParticipantRoles.CoHost)
            return PublishCapabilities.Full;

        if (promoted)
            return PublishCapabilities.Full;

        // Large rooms: attendees stay subscribe-only until a host promotes them.
        if (room.ViewOnlyDefault)
            return PublishCapabilities.None;

        if (string.Equals(room.Mode, RoomModes.Webinar, StringComparison.Ordinal))
            return PublishCapabilities.AudioOnly;

        if (activePublishers >= room.MaxPublishers && !isCurrentlyPublishing)
            return PublishCapabilities.None;

        return PublishCapabilities.Full;
    }

    /// <summary>True when the participant cannot publish audio or video (interactive capacity only).</summary>
    public bool IsListenerOnly(
        RoomRecord room,
        ParticipantRecord participant,
        int activePublishers,
        bool isCurrentlyPublishing = false,
        bool promoted = false)
    {
        var caps = GetPublishCapabilities(room, participant, activePublishers, isCurrentlyPublishing, promoted);
        return !caps.CanPublishAudio && !caps.CanPublishVideo;
    }

    public bool ShouldJoinAsListener(RoomRecord room, ParticipantRecord participant)
        => IsListenerOnly(room, participant, room.ActivePublishers, isCurrentlyPublishing: false);
}

public sealed record PublishCapabilities(bool CanPublishAudio, bool CanPublishVideo)
{
    public static PublishCapabilities Full { get; } = new(true, true);
    public static PublishCapabilities AudioOnly { get; } = new(true, false);
    public static PublishCapabilities None { get; } = new(false, false);

    public bool CanPublishAnything => CanPublishAudio || CanPublishVideo;
}

public sealed record MediaStats(int TotalParticipants, int Publishers, int Listeners);
