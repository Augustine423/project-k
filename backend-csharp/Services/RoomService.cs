using Kzys.Backend.Configuration;
using Kzys.Backend.Models;
using Kzys.Backend.Realtime;

namespace Kzys.Backend.Services;

public sealed class RoomService
{
    private readonly ControlPlaneStore _store;
    private readonly JwtTokenService _jwt;
    private readonly TurnCredentialService _turn;
    private readonly LiveKitTokenService _liveKit;
    private readonly RoomModeService _modes;
    private readonly RoomEventHub _hub;
    private readonly AppConfig _config;
    private readonly ILogger<RoomService> _log;

    public RoomService(
        ControlPlaneStore store,
        JwtTokenService jwt,
        TurnCredentialService turn,
        LiveKitTokenService liveKit,
        RoomModeService modes,
        RoomEventHub hub,
        AppConfig config,
        ILogger<RoomService> log)
    {
        _store = store;
        _jwt = jwt;
        _turn = turn;
        _liveKit = liveKit;
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
        CancellationToken ct = default)
    {
        var max = maxUsers <= 0 || maxUsers > _config.MaxRoomParticipants
            ? _config.MaxRoomParticipants
            : maxUsers;

        var roomId = RandomId("room");
        var hostId = RandomId("p");
        var room = new RoomRecord
        {
            Id = roomId,
            Mode = RoomModes.Interactive,
            Secret = "",
            Pin = pin ?? "",
            MaxParticipants = max,
            MaxPublishers = Math.Min(max, _config.InteractiveMaxPublishers),
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
        return BuildTicket(room, host, mediaHost, activePublishers: 0);
    }

    public async Task<JoinTicketDto> JoinRoomAsync(
        string roomId,
        string displayName,
        string pin,
        string mediaHost,
        CancellationToken ct = default)
    {
        var room = await _store.GetRoomAsync(roomId, ct)
            ?? throw new RoomServiceException(RoomError.NotFound, "room not found");
        if (room.Locked)
            throw new RoomServiceException(RoomError.Locked, "room is locked");
        if (!string.IsNullOrEmpty(room.Pin) && room.Pin != (pin ?? ""))
            throw new RoomServiceException(RoomError.BadPin, "incorrect pin");

        var participant = new ParticipantRecord
        {
            Id = RandomId("p"),
            RoomId = room.Id,
            DisplayName = displayName,
            Role = ParticipantRoles.Participant,
            Approved = true,
            JoinedAt = DateTime.UtcNow,
        };
        var (added, _) = await _store.TryAddParticipantAsync(participant, room.MaxParticipants, ct);
        if (!added)
            throw new RoomServiceException(RoomError.Full, "room is full");

        var stats = await _store.GetMediaStatsAsync(roomId, ct);
        return BuildTicket(room, participant, mediaHost, stats.Publishers);
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

    public async Task KickParticipantAsync(string roomId, string participantId, CancellationToken ct = default)
    {
        await MustRoomAsync(roomId, ct);
        await _store.RemoveMediaPresenceAsync(roomId, participantId, ct);
        await _store.RemoveParticipantAsync(roomId, participantId, ct);
        await RoomWebSocketHandler.BroadcastRaisedHandsAsync(_hub, _store, roomId, ct);
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

    private JoinTicketDto BuildTicket(
        RoomRecord room,
        ParticipantRecord participant,
        string mediaHost,
        int activePublishers = 0)
    {
        var token = _jwt.Issue(room.Id, participant.Id, participant.Role);
        var turn = _turn.BuildTurnInfo(participant.Id, mediaHost)
            ?? new TurnInfoDto { Urls = [], Username = "", Credential = "" };

        var caps = _modes.GetPublishCapabilities(room, participant, activePublishers, isCurrentlyPublishing: false);
        IReadOnlyList<string>? publishSources = null;
        if (caps.CanPublishAudio && !caps.CanPublishVideo)
            publishSources = ["microphone"];

        return new JoinTicketDto
        {
            Room = room,
            Participant = participant,
            LiveKitUrl = MediaHostHelper.RewriteUrlHost(_config.LiveKitPublicUrl, mediaHost),
            LiveKitToken = _liveKit.CreateJoinToken(
                room.Id,
                participant.Id,
                participant.DisplayName,
                canPublish: caps.CanPublishAnything,
                canSubscribe: true,
                canPublishSources: publishSources),
            ParticipantToken = token,
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
}

public sealed class RoomServiceException : Exception
{
    public RoomError Error { get; }
    public RoomServiceException(RoomError error, string message) : base(message) => Error = error;
}
