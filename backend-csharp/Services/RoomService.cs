using Kzys.Backend.Configuration;
using Kzys.Backend.Models;
using Kzys.Backend.Realtime;
using Kzys.Backend.Services.Media;

namespace Kzys.Backend.Services;

public sealed class RoomService
{
    private readonly ControlPlaneStore _store;
    private readonly JwtTokenService _jwt;
    private readonly TurnCredentialService _turn;
    private readonly IMediaTokenService _media;
    private readonly RoomModeService _modes;
    private readonly RoomEventHub _hub;
    private readonly AppConfig _config;
    private readonly ILogger<RoomService> _log;

    public RoomService(
        ControlPlaneStore store,
        JwtTokenService jwt,
        TurnCredentialService turn,
        IMediaTokenService media,
        RoomModeService modes,
        RoomEventHub hub,
        AppConfig config,
        ILogger<RoomService> log)
    {
        _store = store;
        _jwt = jwt;
        _turn = turn;
        _media = media;
        _modes = modes;
        _hub = hub;
        _config = config;
        _log = log;
    }

    public async Task<JoinTicketDto> CreateRoomAsync(
        string displayName,
        string pin,
        int maxUsers,
        string mediaHost,
        DeviceBandwidthHintDto? deviceHint = null,
        CancellationToken ct = default)
    {
        var max = maxUsers <= 0 || maxUsers > _config.MaxRoomParticipants
            ? _config.MaxRoomParticipants
            : maxUsers;

        var tier = RoomPlanManager.GetTierLimits(max);
        var roomId = RandomId("room");
        var hostId = RandomId("p");
        var room = new RoomRecord
        {
            Id = roomId,
            Mode = RoomModes.Interactive,
            Secret = "",
            Pin = pin ?? "",
            MaxParticipants = max,
            MaxPublishers = tier.MaxPublishers,
            MaxInteractive = tier.MaxInteractive,
            ViewOnlyDefault = max > _config.ViewOnlyDefaultThreshold,
            CreatedAt = DateTime.UtcNow,
            HostParticipantId = hostId,
        };
        await _store.SaveRoomAsync(room, ct);
        await _store.IncrementRoomCreatedAsync(ct);
        await _store.RefreshScalingMetricsAsync(ct);

        var host = new ParticipantRecord
        {
            Id = hostId,
            RoomId = roomId,
            DisplayName = displayName,
            Role = ParticipantRoles.Host,
            Approved = true,
            JoinedAt = DateTime.UtcNow,
        };
        await _store.AddParticipantAsync(host, ct);
        return BuildTicket(room, host, mediaHost, activePublishers: 0, deviceHint);
    }

    public async Task<(JoinTicketDto Ticket, IReadOnlyList<string> ReplacedParticipantIds)> JoinRoomAsync(
        string roomId,
        string displayName,
        string pin,
        string mediaHost,
        DeviceBandwidthHintDto? deviceHint = null,
        CancellationToken ct = default)
    {
        var room = await _store.GetRoomAsync(roomId, ct)
            ?? throw new RoomServiceException(RoomError.NotFound, "room not found");
        if (room.Locked)
            throw new RoomServiceException(RoomError.Locked, "room is locked");
        if (!string.IsNullOrEmpty(room.Pin) && room.Pin != (pin ?? ""))
            throw new RoomServiceException(RoomError.BadPin, "incorrect pin");

        var name = displayName.Trim();

        // Always mint a new guest seat. Never reclaim the host by display-name match —
        // that reused the host LiveKit identity, kicked the real host, and made the
        // joiner invisible as a second person. Host refresh uses EnsureParticipantSeatAsync
        // + the existing JWT / session ticket instead.

        // Re-join / second device with same guest name must not leave ghost seats in Redis.
        var replaced = await ReplaceGuestSessionsByNameAsync(roomId, name, ct);

        var participant = new ParticipantRecord
        {
            Id = RandomId("p"),
            RoomId = room.Id,
            DisplayName = name,
            Role = ParticipantRoles.Participant,
            Approved = true,
            JoinedAt = DateTime.UtcNow,
        };
        // Admission: the SFU hosts a room on one node, so cap WebRTC audience and divert the rest to HLS.
        var seated = await _store.GetParticipantCountAsync(roomId, ct);
        var overWebRtcCap = seated >= _config.MaxWebRtcParticipants;
        if (overWebRtcCap && string.IsNullOrWhiteSpace(_config.HlsBaseUrl))
            throw new RoomServiceException(RoomError.Full, "live capacity reached, please try again shortly");

        var (added, _) = await _store.TryAddParticipantAsync(participant, room.MaxParticipants, ct);
        if (!added)
            throw new RoomServiceException(RoomError.Full, "room is full");

        var stats = await _store.GetMediaStatsAsync(roomId, ct);
        var ticket = BuildTicket(room, participant, mediaHost, stats.Publishers, deviceHint);
        if (overWebRtcCap)
        {
            ticket.Delivery = "hls";
            ticket.HlsUrl = $"{_config.HlsBaseUrl.TrimEnd('/')}/{Uri.EscapeDataString(room.Id)}/index.m3u8";
            ticket.LiveKitToken = "";
        }
        return (ticket, replaced);
    }

    /// <summary>Host/co-host grants publish permission to a view-only attendee (bounded by presenter cap).</summary>
    public async Task PromoteParticipantAsync(string roomId, string participantId, CancellationToken ct = default)
    {
        var room = await MustRoomAsync(roomId, ct);
        var participant = await _store.GetParticipantAsync(roomId, participantId, ct)
            ?? throw new RoomServiceException(RoomError.NotFound, "participant not found");
        if (participant.Role is ParticipantRoles.Host or ParticipantRoles.CoHost) return;

        var limit = Math.Min(room.MaxPublishers, room.MaxInteractive > 0 ? room.MaxInteractive : room.MaxPublishers);
        if (!await _store.TryPromoteAsync(roomId, participantId, limit, ct))
            throw new RoomServiceException(RoomError.PublisherLimit, "presenter limit reached");

        try
        {
            await _media.SetPublishPermissionAsync(roomId, participantId, true, ct);
        }
        catch
        {
            await _store.DemoteAsync(roomId, participantId, ct);
            throw;
        }

        await _store.LowerHandAsync(roomId, participantId, ct);
        _hub.Broadcast(roomId, new RoomEvent
        {
            Type = "participant.promoted",
            Data = new { participantId, canPublish = true },
        });
        await RoomWebSocketHandler.BroadcastRaisedHandsAsync(_hub, _store, roomId, ct);
    }

    public async Task DemoteParticipantAsync(string roomId, string participantId, CancellationToken ct = default)
    {
        await MustRoomAsync(roomId, ct);
        await _store.DemoteAsync(roomId, participantId, ct);
        await _store.RemoveMediaPresenceAsync(roomId, participantId, ct);
        await _media.SetPublishPermissionAsync(roomId, participantId, false, ct);
        _hub.Broadcast(roomId, new RoomEvent
        {
            Type = "participant.promoted",
            Data = new { participantId, canPublish = false },
        });
    }

    public Task<RoomRecord?> GetRoomAsync(string roomId, CancellationToken ct = default)
        => _store.GetRoomAsync(roomId, ct);

    public Task<List<ParticipantRecord>> ListParticipantsAsync(string roomId, CancellationToken ct = default)
        => _store.ListParticipantsAsync(roomId, ct);

    public async Task LeaveRoomAsync(string roomId, string participantId, CancellationToken ct = default)
    {
        if (await _store.GetRoomAsync(roomId, ct) is null) return;
        await _store.RemoveMediaPresenceAsync(roomId, participantId, ct);
        await _store.RemoveParticipantAsync(roomId, participantId, ct);
        await RoomWebSocketHandler.BroadcastRaisedHandsAsync(_hub, _store, roomId, ct);
    }

    /// <summary>
    /// Drop prior guest sessions with the same display name so refresh/re-join
    /// does not inflate the room headcount with ghost participants.
    /// Never removes the room host.
    /// </summary>
    public async Task<IReadOnlyList<string>> ReplaceGuestSessionsByNameAsync(
        string roomId,
        string displayName,
        CancellationToken ct = default)
    {
        var name = displayName.Trim();
        if (string.IsNullOrEmpty(name)) return [];

        var existing = await _store.ListParticipantsAsync(roomId, ct);
        var removed = new List<string>();
        foreach (var p in existing)
        {
            if (p.Role == ParticipantRoles.Host) continue;
            if (!string.Equals(p.DisplayName.Trim(), name, StringComparison.OrdinalIgnoreCase))
                continue;
            await _store.RemoveMediaPresenceAsync(roomId, p.Id, ct);
            await _store.RemoveParticipantAsync(roomId, p.Id, ct);
            removed.Add(p.Id);
        }

        if (removed.Count > 0)
            await RoomWebSocketHandler.BroadcastRaisedHandsAsync(_hub, _store, roomId, ct);

        return removed;
    }

    public async Task KickParticipantAsync(string roomId, string participantId, CancellationToken ct = default)
    {
        await MustRoomAsync(roomId, ct);
        await _store.RemoveMediaPresenceAsync(roomId, participantId, ct);
        await _store.RemoveParticipantAsync(roomId, participantId, ct);
        await RoomWebSocketHandler.BroadcastRaisedHandsAsync(_hub, _store, roomId, ct);
    }

    /// <summary>
    /// Rehydrate a participant seat after an accidental refresh leave (token still valid).
    /// Keeps the original participant id/role from the JWT so LiveKit identity stays stable.
    /// </summary>
    public async Task<ParticipantRecord> EnsureParticipantSeatAsync(
        string roomId,
        string participantId,
        string role,
        string? displayNameFallback,
        CancellationToken ct = default)
    {
        var existing = await _store.GetParticipantAsync(roomId, participantId, ct);
        if (existing is not null) return existing;

        await MustRoomAsync(roomId, ct);

        var restored = new ParticipantRecord
        {
            Id = participantId,
            RoomId = roomId,
            DisplayName = string.IsNullOrWhiteSpace(displayNameFallback)
                ? (role is ParticipantRoles.Host or ParticipantRoles.CoHost ? "Host" : "Guest")
                : displayNameFallback.Trim(),
            Role = string.IsNullOrWhiteSpace(role) ? ParticipantRoles.Participant : role,
            Approved = true,
            JoinedAt = DateTime.UtcNow,
        };

        // Force-write by id (capacity check skipped — seat reclaim after refresh).
        await _store.AddParticipantAsync(restored, ct);
        _log.LogInformation(
            "restored participant seat room={RoomId} participant={ParticipantId} role={Role}",
            roomId, participantId, restored.Role);
        return restored;
    }

    public async Task SetLockedAsync(string roomId, bool locked, CancellationToken ct = default)
    {
        var room = await MustRoomAsync(roomId, ct);
        room.Locked = locked;
        await _store.SaveRoomAsync(room, ct);
    }

    public async Task EndRoomAsync(string roomId, CancellationToken ct = default)
    {
        await MustRoomAsync(roomId, ct);
        await _store.DeleteRoomAsync(roomId, ct);
    }

    /// <summary>
    /// Fresh LiveKit grant for an existing seat. Re-reads promoted state so a reconnecting
    /// or refreshed presenter does not fall back to the view-only grant in the original ticket.
    /// </summary>
    public async Task<JoinTicketDto> ReissueTicketAsync(
        string roomId,
        string participantId,
        string role,
        string mediaHost,
        CancellationToken ct = default)
    {
        var participant = await EnsureParticipantSeatAsync(roomId, participantId, role, null, ct);
        var room = await MustRoomAsync(roomId, ct);
        var promoted = await _store.IsPromotedAsync(roomId, participantId, ct);
        var stats = await _store.GetMediaStatsAsync(roomId, ct);
        return BuildTicket(room, participant, mediaHost, stats.Publishers, null, promoted);
    }

    private JoinTicketDto BuildTicket(
        RoomRecord room,
        ParticipantRecord participant,
        string mediaHost,
        int activePublishers = 0,
        DeviceBandwidthHintDto? deviceHint = null,
        bool promoted = false)
    {
        var token = _jwt.Issue(room.Id, participant.Id, participant.Role);
        var turn = _turn.BuildTurnInfo(participant.Id, mediaHost)
            ?? new TurnInfoDto { Urls = [], Username = "", Credential = "" };

        var caps = _modes.GetPublishCapabilities(room, participant, activePublishers, isCurrentlyPublishing: false, promoted);
        IReadOnlyList<string>? publishSources = null;
        if (caps.CanPublishAudio && !caps.CanPublishVideo)
            publishSources = ["microphone"];

        var signalingUrl = MediaHostHelper.RewriteUrlHost(_config.LiveKitPublicUrl, mediaHost);
        var grant = _media.CreateJoinGrant(new MediaJoinRequest(
            room.Id,
            participant.Id,
            participant.DisplayName,
            signalingUrl,
            caps.CanPublishAnything,
            true,
            publishSources,
            deviceHint));

        return new JoinTicketDto
        {
            Room = room,
            Participant = participant,
            LiveKitUrl = grant.Url,
            LiveKitToken = grant.Token,
            MediaProvider = grant.Provider,
            ParticipantToken = token,
            DeviceHint = deviceHint,
            Turn = new TurnInfoDto
            {
                Urls = turn.Urls.Select(u => MediaHostHelper.RewriteUrlHost(u, mediaHost)).ToArray(),
                Username = turn.Username,
                Credential = turn.Credential,
            },
        };
    }

    private async Task<RoomRecord> MustRoomAsync(string roomId, CancellationToken ct)
    {
        return await _store.GetRoomAsync(roomId, ct)
            ?? throw new RoomServiceException(RoomError.NotFound, "room not found");
    }

    private static string RandomId(string prefix)
    {
        Span<byte> bytes = stackalloc byte[6];
        System.Security.Cryptography.RandomNumberGenerator.Fill(bytes);
        return prefix + "-" + Convert.ToHexString(bytes).ToLowerInvariant();
    }
}

public enum RoomError
{
    NotFound,
    Locked,
    BadPin,
    Full,
    InvalidMode,
    PublisherLimit,
    MediaUnavailable,
}

public sealed class RoomServiceException : Exception
{
    public RoomError Error { get; }
    public RoomServiceException(RoomError error, string message) : base(message) => Error = error;
}
