using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;

namespace Kzys.Backend.Hubs
{
    public class MeetingHub : Hub
    {
        // Thread-safe mappings: RoomId -> Set of ConnectionIds
        private static readonly ConcurrentDictionary<string, ConcurrentDictionary<string, string>> Rooms = new();
        
        // Mapping: ConnectionId -> UserInfo (UserId, RoomId)
        private static readonly ConcurrentDictionary<string, UserSession> Connections = new();

        public record UserSession(string UserId, string RoomId, string ConnectionId);

        public async Task JoinRoom(string roomId, string userId)
        {
            var connectionId = Context.ConnectionId;
            var session = new UserSession(userId, roomId, connectionId);

            // Store connection info
            Connections[connectionId] = session;

            // Add to room structure
            var roomConnections = Rooms.GetOrAdd(roomId, _ => new ConcurrentDictionary<string, string>());
            roomConnections[connectionId] = userId;

            // Join SignalR group
            await Groups.AddToGroupAsync(connectionId, roomId);

            // Notify others in the room
            await Clients.OthersInGroup(roomId).SendAsync("PeerJoined", userId, connectionId);

            // Send list of existing users in this room back to the joiner
            var peerList = roomConnections
                .Where(kvp => kvp.Key != connectionId)
                .Select(kvp => new { UserId = kvp.Value, ConnectionId = kvp.Key })
                .ToList();

            await Clients.Caller.SendAsync("RoomJoined", roomId, peerList);
        }

        public async Task SendSignal(string targetConnectionId, string signalData)
        {
            var connectionId = Context.ConnectionId;
            if (Connections.TryGetValue(connectionId, out var session))
            {
                // Send signal details directly to the target connection ID
                await Clients.Client(targetConnectionId).SendAsync("ReceiveSignal", session.UserId, connectionId, signalData);
            }
        }

        public async Task SendChat(string message)
        {
            var connectionId = Context.ConnectionId;
            if (Connections.TryGetValue(connectionId, out var session))
            {
                var timestamp = DateTime.UtcNow.ToString("o");
                await Clients.Group(session.RoomId).SendAsync("ReceiveChat", session.UserId, message, timestamp);
            }
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            var connectionId = Context.ConnectionId;
            if (Connections.TryRemove(connectionId, out var session))
            {
                if (Rooms.TryGetValue(session.RoomId, out var roomConnections))
                {
                    roomConnections.TryRemove(connectionId, out _);
                    if (roomConnections.IsEmpty)
                    {
                        Rooms.TryRemove(session.RoomId, out _);
                    }
                }

                await Groups.RemoveFromGroupAsync(connectionId, session.RoomId);
                await Clients.OthersInGroup(session.RoomId).SendAsync("PeerLeft", session.UserId, connectionId);
            }

            await base.OnDisconnectedAsync(exception);
        }
    }
}
