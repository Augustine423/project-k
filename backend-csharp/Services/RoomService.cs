using System.Security.Cryptography;
using Kzys.Backend.Configuration;
using Kzys.Backend.Models;

namespace Kzys.Backend.Services;

public sealed class RoomService
{
    private readonly ControlPlaneStore _store;
    private readonly JanusNodeRouter _router;
    private readonly Dictionary<string, JanusAdminClient> _janusAdmins;
    private readonly JwtTokenService _jwt;
    private readonly TurnCredentialService _turn;
    private readonly AppConfig _config;
    private readonly ILogger<RoomService> _log;

    public RoomService(
        ControlPlaneStore store,
        JanusNodeRouter router,
        Dictionary<string, JanusAdminClient> janusAdmins,
        JwtTokenService jwt,
        TurnCredentialService turn,
        AppConfig config,
        ILogger<RoomService> log)
    {
        _store = store;
        _router = router;
        _janusAdmins = janusAdmins;
        _jwt = jwt;
        _turn = turn;
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
        var node = await _router.PickLeastLoadedAsync(ct);
        if (!_janusAdmins.TryGetValue(node.Id, out var admin))
            throw new InvalidOperationException($"no admin client for node {node.Id}");

        var max = maxUsers <= 0 || maxUsers > _config.MaxRoomParticipants
            ? _config.MaxRoomParticipants
            : maxUsers;

        var roomId = RandomId("room");
        var secret = Guid.NewGuid().ToString("N");

        await admin.CreateVideoRoomAsync(
            roomId, secret, pin, roomId, max, bitrateKbps: 0, _config.JanusVideoRoomKey, ct);

        var hostId = RandomId("p");
        var room = new RoomRecord
        {
            Id = roomId,
            Mode = RoomModes.Interactive,
            JanusNodeId = node.Id,
            JanusRoomId = roomId,
            Secret = secret,
            Pin = pin ?? "",
            MaxParticipants = max,
            MaxPublishers = max,
            CreatedAt = DateTime.UtcNow,
            HostParticipantId = hostId,
        };
        await _store.SaveRoomAsync(room, ct);
        await _store.IncrementRoomCreatedAsync(ct);
        await _store.IncrNodeLoadAsync(node.Id, 1, ct);
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
        return BuildTicket(room, host, node, mediaHost);
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
        if (!_router.TryGetNode(room.JanusNodeId, out var node))
            throw new InvalidOperationException($"room's assigned node {room.JanusNodeId} is unavailable");

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

        return BuildTicket(room, participant, node, mediaHost);
    }

    public Task<RoomRecord?> GetRoomAsync(string roomId, CancellationToken ct = default)
        => _store.GetRoomAsync(roomId, ct);

    public Task<List<ParticipantRecord>> ListParticipantsAsync(string roomId, CancellationToken ct = default)
        => _store.ListParticipantsAsync(roomId, ct);

    public async Task LeaveRoomAsync(string roomId, string participantId, CancellationToken ct = default)
    {
        var room = await _store.GetRoomAsync(roomId, ct);
        if (room is null) return;
        await _store.RemoveMediaPresenceAsync(roomId, participantId, ct);
        await _store.RemoveParticipantAsync(roomId, participantId, ct);
    }

    public async Task KickParticipantAsync(string roomId, string participantId, CancellationToken ct = default)
    {
        var room = await MustRoomAsync(roomId, ct);
        if (_janusAdmins.TryGetValue(room.JanusNodeId, out var admin))
        {
            try
            {
                await admin.KickParticipantAsync(room.JanusRoomId, room.Secret, participantId, ct);
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "janus kick failed for {ParticipantId}", participantId);
            }
        }
        await _store.RemoveParticipantAsync(roomId, participantId, ct);
    }

    public async Task SetLockedAsync(string roomId, bool locked, CancellationToken ct = default)
    {
        var room = await MustRoomAsync(roomId, ct);
        if (_janusAdmins.TryGetValue(room.JanusNodeId, out var admin))
            await admin.EditRoomAsync(room.JanusRoomId, room.Secret, locked, ct);
        room.Locked = locked;
        await _store.SaveRoomAsync(room, ct);
    }

    public async Task EndRoomAsync(string roomId, CancellationToken ct = default)
    {
        var room = await MustRoomAsync(roomId, ct);
        if (_janusAdmins.TryGetValue(room.JanusNodeId, out var admin))
        {
            try
            {
                await admin.DestroyVideoRoomAsync(room.JanusRoomId, room.Secret, ct);
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "janus destroy room failed for {RoomId}", roomId);
            }
        }
        await _store.IncrNodeLoadAsync(room.JanusNodeId, -1, ct);
        await _store.DeleteRoomAsync(roomId, ct);
    }

    private JoinTicketDto BuildTicket(
        RoomRecord room,
        ParticipantRecord participant,
        JanusNodeConfig node,
        string mediaHost)
    {
        var token = _jwt.Issue(room.Id, participant.Id, participant.Role);
        var turn = _turn.BuildTurnInfo(participant.Id, mediaHost)
            ?? new TurnInfoDto { Urls = [], Username = "", Credential = "" };

        var ticket = new JoinTicketDto
        {
            Room = room,
            Participant = participant,
            JanusWsUrl = MediaHostHelper.RewriteUrlHost(node.PublicWsUrl, mediaHost),
            ParticipantToken = token,
            Turn = new TurnInfoDto
            {
                Urls = turn.Urls.Select(u => MediaHostHelper.RewriteUrlHost(u, mediaHost)).ToArray(),
                Username = turn.Username,
                Credential = turn.Credential,
            },
        };
        if (!string.IsNullOrEmpty(room.Pin))
            ticket.JanusJoinPin = room.Pin;
        return ticket;
    }

    private async Task<RoomRecord> MustRoomAsync(string roomId, CancellationToken ct)
    {
        return await _store.GetRoomAsync(roomId, ct)
            ?? throw new RoomServiceException(RoomError.NotFound, "room not found");
    }

    private static string RandomId(string prefix)
    {
        Span<byte> bytes = stackalloc byte[6];
        RandomNumberGenerator.Fill(bytes);
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
