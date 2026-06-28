using System.Collections.Concurrent;
using Kzys.Backend.Services;
using Microsoft.AspNetCore.SignalR;

namespace Kzys.Backend.Hubs;

public class MeetingHub : Hub
{
    private static readonly ConcurrentDictionary<string, UserSession> Connections = new();
    private readonly IRoomStore _roomStore;
    private readonly IChatPresenceStore _presence;

    public MeetingHub(IRoomStore roomStore, IChatPresenceStore presence)
    {
        _roomStore = roomStore;
        _presence = presence;
    }

    public record UserSession(string UserId, string RoomId, string ConnectionId);

    public async Task JoinRoom(string roomId, string userId, string joinKey)
    {
        var (valid, room, error) = await _roomStore.TryValidateAsync(roomId, joinKey);
        if (!valid)
            throw new HubException(error ?? "Invalid invite link.");

        var connectionId = Context.ConnectionId;
        var alreadyInChat = (await _presence.ListAsync(roomId))
            .Any(p => string.Equals(p.UserId, userId, StringComparison.Ordinal));

        if (!alreadyInChat)
        {
            var (lkCount, identityPresent) = await LiveKitRoomService.GetParticipantInfoAsync(roomId, userId);
            var chatCount = await _presence.CountAsync(roomId);
            var effectiveCount = Math.Max(lkCount, chatCount);
            if (!identityPresent && effectiveCount >= room!.MaxParticipants)
                throw new HubException(
                    $"Room is full ({room.MaxParticipants} seats on {room.PlanName} plan). Upgrade for more participants.");
        }

        var session = new UserSession(userId, roomId, connectionId);
        Connections[connectionId] = session;
        await _presence.AddAsync(roomId, connectionId, userId);
        await _roomStore.AppendHistoryAsync(roomId, "chat_joined", userId);

        await Groups.AddToGroupAsync(connectionId, roomId);
        await Clients.OthersInGroup(roomId).SendAsync("PeerJoined", userId, connectionId);

        var peerList = (await _presence.ListAsync(roomId))
            .Where(p => p.ConnectionId != connectionId)
            .Select(p => new { UserId = p.UserId, ConnectionId = p.ConnectionId })
            .ToList();

        await Clients.Caller.SendAsync("RoomJoined", roomId, peerList);
    }

    public async Task SendChat(string message)
    {
        var connectionId = Context.ConnectionId;
        if (!Connections.TryGetValue(connectionId, out var session))
            return;

        var timestamp = DateTime.UtcNow.ToString("o");
        await _roomStore.AppendHistoryAsync(session.RoomId, "chat_message", session.UserId, message);
        await Clients.Group(session.RoomId).SendAsync("ReceiveChat", session.UserId, message, timestamp);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var connectionId = Context.ConnectionId;
        if (Connections.TryRemove(connectionId, out var session))
        {
            await _presence.RemoveAsync(session.RoomId, connectionId);
            await _roomStore.AppendHistoryAsync(session.RoomId, "chat_left", session.UserId);
            await Groups.RemoveFromGroupAsync(connectionId, session.RoomId);
            await Clients.OthersInGroup(session.RoomId).SendAsync("PeerLeft", session.UserId, connectionId);
        }

        await base.OnDisconnectedAsync(exception);
    }
}
