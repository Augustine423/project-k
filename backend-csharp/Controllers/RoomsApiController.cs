using Kzys.Backend.Configuration;
using Kzys.Backend.Models;
using Kzys.Backend.Realtime;
using Kzys.Backend.Services;
using Microsoft.AspNetCore.Mvc;

namespace Kzys.Backend.Controllers;

[ApiController]
[Route("api/rooms")]
public sealed class RoomsApiController : ControllerBase
{
    private readonly RoomService _rooms;
    private readonly ControlPlaneStore _store;
    private readonly RoomEventHub _hub;
    private readonly RoomPresenceService _presence;
    private readonly RoomModeService _modes;
    private readonly RoomPresenceBroadcaster _presenceBroadcast;
    private readonly TurnCredentialService _turn;
    private readonly AppConfig _config;

    public RoomsApiController(
        RoomService rooms,
        ControlPlaneStore store,
        RoomEventHub hub,
        RoomPresenceService presence,
        RoomModeService modes,
        RoomPresenceBroadcaster presenceBroadcast,
        TurnCredentialService turn,
        AppConfig config)
    {
        _rooms = rooms;
        _store = store;
        _hub = hub;
        _presence = presence;
        _modes = modes;
        _presenceBroadcast = presenceBroadcast;
        _turn = turn;
        _config = config;
    }

    public sealed record CreateRoomBody(string DisplayName, int MaxUsers = 0, string? Pin = null);
    public sealed record JoinRoomBody(string DisplayName, string? Pin = null);
    public sealed record LockBody(bool Locked);
    public sealed record SetModeBody(string Mode, bool Pin = true);
    public sealed record MediaPresenceBody(bool Publishing, bool Audio, bool Video);

    [HttpPost]
    public async Task<ActionResult<JoinTicketDto>> Create([FromBody] CreateRoomBody body, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(body.DisplayName))
            return BadRequest(new { error = "displayName is required" });

        var mediaHost = MediaHostHelper.FromRequest(Request, _config.TurnHost);
        var ticket = await _rooms.CreateRoomAsync(body.DisplayName.Trim(), body.Pin ?? "", body.MaxUsers, mediaHost, ct);
        return StatusCode(StatusCodes.Status201Created, ticket);
    }

    [HttpPost("{roomId}/join")]
    public async Task<ActionResult<JoinTicketDto>> Join(string roomId, [FromBody] JoinRoomBody body, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(body.DisplayName))
            return BadRequest(new { error = "displayName is required" });

        try
        {
            var mediaHost = MediaHostHelper.FromRequest(Request, _config.TurnHost);
            var (ticket, replacedIds) = await _rooms.JoinRoomAsync(roomId, body.DisplayName.Trim(), body.Pin ?? "", mediaHost, ct);
            foreach (var oldId in replacedIds)
            {
                _hub.Broadcast(roomId, new RoomEvent
                {
                    Type = "participant.left",
                    Data = new { participantId = oldId },
                });
            }
            await _presenceBroadcast.BroadcastJoinedAsync(roomId, ticket.Participant, ct);
            return Ok(ticket);
        }
        catch (RoomServiceException ex) when (ex.Error == RoomError.NotFound)
        {
            return NotFound(new { error = "room not found" });
        }
        catch (RoomServiceException ex) when (ex.Error == RoomError.Locked)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { error = "room is locked" });
        }
        catch (RoomServiceException ex) when (ex.Error == RoomError.BadPin)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { error = "incorrect pin" });
        }
        catch (RoomServiceException ex) when (ex.Error == RoomError.Full)
        {
            return Conflict(new { error = "room is full" });
        }
    }

    [HttpGet("{roomId}")]
    public async Task<ActionResult<RoomRecord>> Get(string roomId, CancellationToken ct)
    {
        var room = await _rooms.GetRoomAsync(roomId, ct);
        if (room is null) return NotFound(new { error = "room not found" });
        return Ok(room);
    }

    [HttpGet("{roomId}/participants/count")]
    public async Task<ActionResult<object>> ParticipantCount(string roomId, CancellationToken ct)
    {
        var room = await _rooms.GetRoomAsync(roomId, ct);
        if (room is null) return NotFound(new { error = "room not found" });
        var count = await _store.GetParticipantCountAsync(roomId, ct);
        return Ok(new { count });
    }

    [HttpGet("{roomId}/participants")]
    public async Task<ActionResult<ParticipantsPageDto>> ListParticipants(
        string roomId,
        [FromQuery] int offset = 0,
        [FromQuery] int limit = 0,
        [FromQuery] string? q = null,
        CancellationToken ct = default)
    {
        var room = await _rooms.GetRoomAsync(roomId, ct);
        if (room is null) return NotFound(new { error = "room not found" });

        var pageSize = limit <= 0 ? _config.ParticipantsPageSizeDefault : Math.Min(limit, 200);

        if (!string.IsNullOrWhiteSpace(q))
        {
            return Ok(await _store.SearchParticipantsAsync(
                roomId,
                q,
                pageSize,
                _config.ParticipantsSearchScanCap,
                ct));
        }

        return Ok(await _store.ListParticipantsPageAsync(roomId, offset, pageSize, ct));
    }

    [HttpPost("{roomId}/media")]
    public async Task<IActionResult> ReportMedia(string roomId, [FromBody] MediaPresenceBody body, CancellationToken ct)
    {
        var claims = RequireParticipant(roomId);
        if (claims is null) return Unauthorized(new { error = "invalid token" });

        try
        {
            var (room, _) = await _modes.ReportMediaPresenceAsync(
                roomId,
                claims.ParticipantId,
                body.Publishing,
                body.Audio,
                body.Video,
                ct);

            var participant = await _store.GetParticipantAsync(roomId, claims.ParticipantId, ct);

            var caps = participant is not null
                ? _modes.GetPublishCapabilities(room, participant, room.ActivePublishers, body.Publishing)
                : PublishCapabilities.None;

            return Ok(new
            {
                mode = room.Mode,
                maxPublishers = room.MaxPublishers,
                activePublishers = room.ActivePublishers,
                activeListeners = room.ActiveListeners,
                canPublishAudio = caps.CanPublishAudio,
                canPublishVideo = caps.CanPublishVideo,
                // Backward-compatible alias: true only when neither audio nor video may publish.
                listenerOnly = !caps.CanPublishAnything,
            });
        }
        catch (RoomServiceException ex) when (ex.Error == RoomError.NotFound)
        {
            return NotFound(new { error = "room not found" });
        }
    }

    [HttpGet("{roomId}/turn")]
    public async Task<ActionResult<TurnInfoDto>> RefreshTurn(string roomId, CancellationToken ct)
    {
        var claims = RequireParticipant(roomId);
        if (claims is null) return Unauthorized(new { error = "invalid token" });

        var room = await _rooms.GetRoomAsync(roomId, ct);
        if (room is null) return NotFound(new { error = "room not found" });

        var mediaHost = MediaHostHelper.FromRequest(Request, _config.TurnHost);
        var turn = _turn.BuildTurnInfo(claims.ParticipantId, mediaHost)
            ?? new TurnInfoDto { Urls = [], Username = "", Credential = "" };

        return Ok(new TurnInfoDto
        {
            Urls = turn.Urls.Select(u => MediaHostHelper.RewriteUrlHost(u, mediaHost)).ToArray(),
            Username = turn.Username,
            Credential = turn.Credential,
        });
    }

    [HttpPost("{roomId}/leave")]
    public async Task<IActionResult> Leave(string roomId, CancellationToken ct)
    {
        var claims = RequireParticipant(roomId);
        if (claims is null) return Unauthorized(new { error = "invalid token" });
        _presence.CancelPendingLeave(roomId, claims.ParticipantId);
        await _rooms.LeaveRoomAsync(roomId, claims.ParticipantId, ct);
        await _modes.ReconcileRoomAsync(roomId, ct);
        await _presenceBroadcast.BroadcastLeftAsync(roomId, claims.ParticipantId, ct);
        return Ok(new { ok = true });
    }

    [HttpPost("{roomId}/end")]
    public async Task<IActionResult> End(string roomId, CancellationToken ct)
    {
        var claims = RequireHost(roomId);
        if (claims is null) return Forbid();
        await _rooms.EndRoomAsync(roomId, ct);
        _hub.Broadcast(roomId, new RoomEvent { Type = "room.ended", Data = null });
        return Ok(new { ended = true });
    }

    [HttpPost("{roomId}/lock")]
    public async Task<IActionResult> Lock(string roomId, [FromBody] LockBody body, CancellationToken ct)
    {
        var claims = RequireHost(roomId);
        if (claims is null) return Forbid();
        await _rooms.SetLockedAsync(roomId, body.Locked, ct);
        _hub.Broadcast(roomId, new RoomEvent { Type = "room.locked", Data = body.Locked });
        return Ok(new { locked = body.Locked });
    }

    [HttpPost("{roomId}/mode")]
    public async Task<IActionResult> SetMode(string roomId, [FromBody] SetModeBody body, CancellationToken ct)
    {
        var claims = RequireHost(roomId);
        if (claims is null) return Forbid();

        if (body.Mode is not (RoomModes.Interactive or RoomModes.Webinar))
            return BadRequest(new { error = "mode must be interactive or webinar" });

        try
        {
            var room = await _modes.SetRoomModeAsync(roomId, body.Mode, body.Pin, ct);
            return Ok(new { mode = room.Mode, maxPublishers = room.MaxPublishers, modePinned = room.ModePinned });
        }
        catch (RoomServiceException ex) when (ex.Error == RoomError.NotFound)
        {
            return NotFound(new { error = "room not found" });
        }
    }

    [HttpPost("{roomId}/participants/{participantId}/kick")]
    public async Task<IActionResult> Kick(string roomId, string participantId, CancellationToken ct)
    {
        var claims = RequireHost(roomId);
        if (claims is null) return Forbid();
        await _rooms.KickParticipantAsync(roomId, participantId, ct);
        await _modes.ReconcileRoomAsync(roomId, ct);
        await _presenceBroadcast.BroadcastLeftAsync(roomId, participantId, ct);
        _hub.Broadcast(roomId, new RoomEvent { Type = "participant.kicked", Data = new { participantId } });
        return Ok(new { ok = true });
    }

    private ParticipantClaims? RequireParticipant(string roomId)
    {
        var claims = TryGetClaims();
        if (claims is null || claims.RoomId != roomId) return null;
        return claims;
    }

    private ParticipantClaims? RequireHost(string roomId)
    {
        var claims = RequireParticipant(roomId);
        if (claims is null) return null;
        if (claims.Role is not (ParticipantRoles.Host or ParticipantRoles.CoHost)) return null;
        return claims;
    }

    private ParticipantClaims? TryGetClaims()
    {
        var auth = Request.Headers.Authorization.ToString();
        if (!auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) return null;
        var token = auth["Bearer ".Length..].Trim();
        if (string.IsNullOrEmpty(token)) return null;
        try
        {
            return HttpContext.RequestServices.GetRequiredService<JwtTokenService>().Verify(token);
        }
        catch
        {
            return null;
        }
    }
}
