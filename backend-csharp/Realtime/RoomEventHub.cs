using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text.Json;
using Kzys.Backend.Models;
using Kzys.Backend.Services;
using StackExchange.Redis;

namespace Kzys.Backend.Realtime;

public sealed class RoomEventHub : IHostedService
{
    private const string BroadcastChannel = "kzys:room:events";
    private const int MaxMessageBytes = 65536;

    private static readonly JsonSerializerOptions EventJson = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, RoomSocket>> _rooms = new();
    private readonly IConnectionMultiplexer _redis;
    private readonly RoomWsPresenceStore _wsPresence;
    private readonly ILogger<RoomEventHub> _log;
    private ISubscriber? _subscriber;

    public RoomEventHub(
        IConnectionMultiplexer redis,
        RoomWsPresenceStore wsPresence,
        ILogger<RoomEventHub> log)
    {
        _redis = redis;
        _wsPresence = wsPresence;
        _log = log;
    }

    public event Action<string, string, byte[]>? ClientMessage;
    public event Action<string, string>? ClientDisconnected;

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _subscriber = _redis.GetSubscriber();
        _subscriber.Subscribe(RedisChannel.Literal(BroadcastChannel), (_, message) =>
        {
            if (message.IsNullOrEmpty) return;
            try
            {
                using var doc = JsonDocument.Parse((string)message!);
                var roomId = doc.RootElement.GetProperty("roomId").GetString();
                if (string.IsNullOrEmpty(roomId)) return;
                var payload = doc.RootElement.GetProperty("payload").GetRawText();
                DeliverToLocalClients(roomId, payload);
            }
            catch (Exception ex)
            {
                _log.LogDebug(ex, "ignored redis room event");
            }
        });
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        if (_subscriber is not null)
            _subscriber.Unsubscribe(RedisChannel.Literal(BroadcastChannel));
        return Task.CompletedTask;
    }

    public async Task HandleConnectionAsync(
        WebSocket socket,
        string roomId,
        string participantId,
        CancellationToken ct)
    {
        await _wsPresence.MarkAliveAsync(roomId, participantId, ct);

        var client = new RoomSocket(socket, roomId, participantId);
        var room = _rooms.GetOrAdd(roomId, _ => new ConcurrentDictionary<string, RoomSocket>());
        room[client.Key] = client;

        using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var refreshTask = RefreshPresenceAsync(roomId, participantId, linked.Token);

        var sendTask = PumpSendAsync(client, linked.Token);
        var receiveTask = PumpReceiveAsync(client, linked.Token);
        await Task.WhenAny(sendTask, receiveTask);

        linked.Cancel();
        try { await refreshTask; } catch (OperationCanceledException) { /* expected */ }

        room.TryRemove(client.Key, out _);
        if (room.IsEmpty) _rooms.TryRemove(roomId, out _);

        await _wsPresence.MarkGraceAsync(roomId, participantId, CancellationToken.None);
        ClientDisconnected?.Invoke(roomId, participantId);
    }

    public bool HasLocalConnection(string roomId, string participantId)
    {
        if (!_rooms.TryGetValue(roomId, out var room)) return false;
        return room.Values.Any(c => c.ParticipantId == participantId);
    }

    public void Broadcast(string roomId, RoomEvent evt)
    {
        var payloadJson = JsonSerializer.Serialize(evt, EventJson);
        DeliverToLocalClients(roomId, payloadJson);

        var envelope = JsonSerializer.Serialize(new
        {
            roomId,
            payload = evt,
        }, EventJson);

        _ = _redis.GetSubscriber().PublishAsync(RedisChannel.Literal(BroadcastChannel), envelope);
    }

    private void DeliverToLocalClients(string roomId, string payloadJson)
    {
        if (!_rooms.TryGetValue(roomId, out var room)) return;
        var payload = System.Text.Encoding.UTF8.GetBytes(payloadJson);
        foreach (var client in room.Values)
        {
            if (!client.Outgoing.Writer.TryWrite(payload))
                _log.LogWarning("dropping slow ws client room={Room} participant={Participant}", roomId, client.ParticipantId);
        }
    }

    private async Task RefreshPresenceAsync(string roomId, string participantId, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            await _wsPresence.MarkAliveAsync(roomId, participantId, ct);
            await Task.Delay(_wsPresence.AliveRefreshInterval, ct);
        }
    }

    private async Task PumpSendAsync(RoomSocket client, CancellationToken ct)
    {
        await foreach (var payload in client.Outgoing.Reader.ReadAllAsync(ct))
        {
            if (client.Socket.State != WebSocketState.Open) break;
            await client.Socket.SendAsync(payload, WebSocketMessageType.Text, true, ct);
        }
    }

    private async Task PumpReceiveAsync(RoomSocket client, CancellationToken ct)
    {
        var buffer = new byte[8192];
        using var ms = new System.IO.MemoryStream();
        while (client.Socket.State == WebSocketState.Open && !ct.IsCancellationRequested)
        {
            var result = await client.Socket.ReceiveAsync(buffer, ct);
            if (result.MessageType == WebSocketMessageType.Close) break;

            ms.Write(buffer, 0, result.Count);
            if (ms.Length > MaxMessageBytes)
            {
                _log.LogWarning("dropping oversized ws message room={Room} participant={Participant}", client.RoomId, client.ParticipantId);
                ms.SetLength(0);
                continue;
            }
            if (!result.EndOfMessage) continue;

            if (result.MessageType == WebSocketMessageType.Text)
            {
                var payload = ms.ToArray();
                ClientMessage?.Invoke(client.RoomId, client.ParticipantId, payload);
            }
            ms.SetLength(0);
        }
        if (client.Socket.State is WebSocketState.Open or WebSocketState.CloseReceived)
        {
            try { await client.Socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "done", ct); } catch { /* ignore */ }
        }
    }

    private sealed class RoomSocket
    {
        public RoomSocket(WebSocket socket, string roomId, string participantId)
        {
            Socket = socket;
            RoomId = roomId;
            ParticipantId = participantId;
            Key = Guid.NewGuid().ToString("N");
        }

        public string Key { get; }
        public WebSocket Socket { get; }
        public string RoomId { get; }
        public string ParticipantId { get; }
        public System.Threading.Channels.Channel<byte[]> Outgoing { get; } =
            System.Threading.Channels.Channel.CreateBounded<byte[]>(new System.Threading.Channels.BoundedChannelOptions(64)
            {
                FullMode = System.Threading.Channels.BoundedChannelFullMode.DropOldest,
            });
    }
}

public sealed class RoomPresenceService
{
    private readonly ConcurrentDictionary<string, CancellationTokenSource> _pending = new();
    private readonly RoomEventHub _hub;
    private readonly RoomPresenceBroadcaster _presenceBroadcast;
    private readonly RoomWsPresenceStore _wsPresence;
    private readonly RoomService _rooms;
    private readonly RoomModeService _modes;
    private readonly ILogger<RoomPresenceService> _log;

    public RoomPresenceService(
        RoomEventHub hub,
        RoomPresenceBroadcaster presenceBroadcast,
        RoomWsPresenceStore wsPresence,
        RoomService rooms,
        RoomModeService modes,
        ILogger<RoomPresenceService> log)
    {
        _hub = hub;
        _presenceBroadcast = presenceBroadcast;
        _wsPresence = wsPresence;
        _rooms = rooms;
        _modes = modes;
        _log = log;
        _hub.ClientDisconnected += ScheduleLeave;
    }

    public void CancelPendingLeave(string roomId, string participantId)
    {
        var key = LeaveKey(roomId, participantId);
        if (_pending.TryRemove(key, out var cts))
            cts.Cancel();
        _ = _wsPresence.MarkAliveAsync(roomId, participantId);
    }

    private void ScheduleLeave(string roomId, string participantId)
    {
        var key = LeaveKey(roomId, participantId);
        if (_pending.TryGetValue(key, out var existing))
            existing.Cancel();

        var cts = new CancellationTokenSource();
        _pending[key] = cts;
        _ = FinishLeaveAfterGraceAsync(roomId, participantId, cts.Token);
    }

    private async Task FinishLeaveAfterGraceAsync(string roomId, string participantId, CancellationToken ct)
    {
        try
        {
            await Task.Delay(_wsPresence.GraceDuration, ct);
        }
        catch (TaskCanceledException)
        {
            return;
        }

        _pending.TryRemove(LeaveKey(roomId, participantId), out _);
        if (_hub.HasLocalConnection(roomId, participantId)) return;
        if (await _wsPresence.IsAliveAsync(roomId, participantId, ct)) return;

        try
        {
            await _rooms.LeaveRoomAsync(roomId, participantId);
            await _modes.ReconcileRoomAsync(roomId);
            await _presenceBroadcast.BroadcastLeftAsync(roomId, participantId, ct);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "scheduled leave failed room={Room} participant={Participant}", roomId, participantId);
        }
    }

    private static string LeaveKey(string roomId, string participantId) => roomId + "\0" + participantId;
}

public static class RoomWebSocketHandler
{
    public static void HandleClientMessage(
        RoomEventHub hub,
        string roomId,
        string participantId,
        byte[] payload,
        ILogger logger)
    {
        try
        {
            using var doc = JsonDocument.Parse(payload);
            if (!doc.RootElement.TryGetProperty("type", out var typeEl))
                return;
            var type = typeEl.GetString();
            if (type != "chat.send") return;

            if (!doc.RootElement.TryGetProperty("data", out var data))
                return;
            var message = data.GetProperty("message").GetString();
            if (string.IsNullOrWhiteSpace(message)) return;
            var displayName = data.TryGetProperty("displayName", out var dn) ? dn.GetString() : null;
            if (string.IsNullOrWhiteSpace(displayName)) displayName = "Guest";

            hub.Broadcast(roomId, new RoomEvent
            {
                Type = "chat.message",
                Data = new
                {
                    participantId,
                    displayName,
                    message,
                    at = DateTime.UtcNow,
                },
            });
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "ignored ws client message");
        }
    }
}
