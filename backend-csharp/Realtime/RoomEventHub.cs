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
    private readonly string _instanceId = Guid.NewGuid().ToString("N");

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
                if (doc.RootElement.TryGetProperty("origin", out var originEl)
                    && originEl.GetString() == _instanceId)
                    return;

                var roomId = doc.RootElement.GetProperty("roomId").GetString();
                if (string.IsNullOrEmpty(roomId)) return;
                var payload = doc.RootElement.GetProperty("payload").GetRawText();

                HashSet<string>? targets = null;
                if (doc.RootElement.TryGetProperty("targetParticipantIds", out var targetsEl)
                    && targetsEl.ValueKind == JsonValueKind.Array
                    && targetsEl.GetArrayLength() > 0)
                {
                    targets = new HashSet<string>(StringComparer.Ordinal);
                    foreach (var item in targetsEl.EnumerateArray())
                    {
                        var id = item.GetString();
                        if (!string.IsNullOrEmpty(id)) targets.Add(id);
                    }
                }

                DeliverToLocalClients(roomId, payload, targets);
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
        DeliverToLocalClients(roomId, payloadJson, targetParticipantIds: null);

        var envelope = JsonSerializer.Serialize(new
        {
            origin = _instanceId,
            roomId,
            payload = evt,
            targetParticipantIds = (string[]?)null,
        }, EventJson);

        _ = _redis.GetSubscriber().PublishAsync(RedisChannel.Literal(BroadcastChannel), envelope);
    }

    /// <summary>Deliver an event only to the listed participants (local + cross-node via Redis).</summary>
    public void SendToParticipants(string roomId, IReadOnlyCollection<string> participantIds, RoomEvent evt)
    {
        if (participantIds.Count == 0) return;
        var targets = participantIds.Distinct(StringComparer.Ordinal).ToArray();
        var payloadJson = JsonSerializer.Serialize(evt, EventJson);
        DeliverToLocalClients(roomId, payloadJson, targets);

        var envelope = JsonSerializer.Serialize(new
        {
            origin = _instanceId,
            roomId,
            payload = evt,
            targetParticipantIds = targets,
        }, EventJson);

        _ = _redis.GetSubscriber().PublishAsync(RedisChannel.Literal(BroadcastChannel), envelope);
    }

    private void DeliverToLocalClients(
        string roomId,
        string payloadJson,
        IReadOnlyCollection<string>? targetParticipantIds)
    {
        if (!_rooms.TryGetValue(roomId, out var room)) return;
        var payload = System.Text.Encoding.UTF8.GetBytes(payloadJson);
        var filter = targetParticipantIds is { Count: > 0 }
            ? new HashSet<string>(targetParticipantIds, StringComparer.Ordinal)
            : null;

        foreach (var client in room.Values)
        {
            if (filter is not null && !filter.Contains(client.ParticipantId))
                continue;
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
        ControlPlaneStore store,
        string roomId,
        string participantId,
        byte[] payload,
        ILogger logger)
    {
        _ = HandleClientMessageAsync(hub, store, roomId, participantId, payload, logger);
    }

    private static async Task HandleClientMessageAsync(
        RoomEventHub hub,
        ControlPlaneStore store,
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

            switch (type)
            {
                case "chat.send":
                    HandleChatSend(hub, roomId, participantId, doc.RootElement);
                    break;
                case "chat.dm":
                    await HandleChatDmAsync(hub, store, roomId, participantId, doc.RootElement);
                    break;
                case "hand.raise":
                case "hand.lower":
                case "hand.sync":
                    await HandleHandAsync(hub, store, roomId, participantId, type!);
                    break;
            }
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "ignored ws client message");
        }
    }

    private static void HandleChatSend(
        RoomEventHub hub,
        string roomId,
        string participantId,
        JsonElement root)
    {
        if (!root.TryGetProperty("data", out var data))
            return;
        var message = data.GetProperty("message").GetString();
        if (string.IsNullOrWhiteSpace(message)) return;
        if (message.Length > 500) message = message[..500];
        var displayName = data.TryGetProperty("displayName", out var dn) ? dn.GetString() : null;
        if (string.IsNullOrWhiteSpace(displayName)) displayName = "Guest";

        var at = DateTime.UtcNow.ToString("O");
        hub.Broadcast(roomId, new RoomEvent
        {
            Type = "chat.message",
            Data = new
            {
                id = Guid.NewGuid().ToString("N"),
                participantId,
                displayName,
                message,
                at,
            },
        });
    }

    private static async Task HandleChatDmAsync(
        RoomEventHub hub,
        ControlPlaneStore store,
        string roomId,
        string participantId,
        JsonElement root)
    {
        if (!root.TryGetProperty("data", out var data))
            return;

        var toParticipantId = data.TryGetProperty("toParticipantId", out var toEl)
            ? toEl.GetString()
            : null;
        if (string.IsNullOrWhiteSpace(toParticipantId)) return;
        if (string.Equals(toParticipantId, participantId, StringComparison.Ordinal)) return;

        var message = data.TryGetProperty("message", out var msgEl) ? msgEl.GetString() : null;
        if (string.IsNullOrWhiteSpace(message)) return;
        if (message.Length > 500) message = message[..500];

        var recipient = await store.GetParticipantAsync(roomId, toParticipantId);
        if (recipient is null) return;

        var sender = await store.GetParticipantAsync(roomId, participantId);
        var displayName = data.TryGetProperty("displayName", out var dn) ? dn.GetString() : null;
        if (string.IsNullOrWhiteSpace(displayName))
            displayName = sender?.DisplayName ?? "Guest";

        var at = DateTime.UtcNow.ToString("O");
        hub.SendToParticipants(
            roomId,
            [participantId, toParticipantId],
            new RoomEvent
            {
                Type = "chat.dm",
                Data = new
                {
                    id = Guid.NewGuid().ToString("N"),
                    participantId,
                    displayName,
                    message,
                    toParticipantId,
                    toDisplayName = recipient.DisplayName,
                    at,
                },
            });
    }

    private static async Task HandleHandAsync(
        RoomEventHub hub,
        ControlPlaneStore store,
        string roomId,
        string participantId,
        string type)
    {
        var room = await store.GetRoomAsync(roomId);
        if (room is null) return;

        // Raise/lower apply in webinar and view-only large rooms; sync still returns the current list.
        if (type is "hand.raise" or "hand.lower")
        {
            if (!string.Equals(room.Mode, RoomModes.Webinar, StringComparison.Ordinal) && !room.ViewOnlyDefault)
                return;

            var participant = await store.GetParticipantAsync(roomId, participantId);
            if (participant is null) return;

            if (type == "hand.raise")
                await store.RaiseHandAsync(roomId, participantId);
            else
                await store.LowerHandAsync(roomId, participantId);
        }

        await BroadcastRaisedHandsAsync(hub, store, roomId);
    }

    public static async Task BroadcastRaisedHandsAsync(
        RoomEventHub hub,
        ControlPlaneStore store,
        string roomId,
        CancellationToken ct = default)
    {
        var raised = await store.ListRaisedHandsAsync(roomId, ct);
        hub.Broadcast(roomId, new RoomEvent
        {
            Type = "hand.updated",
            Data = new
            {
                raised = raised.Select(h => new
                {
                    participantId = h.ParticipantId,
                    displayName = h.DisplayName,
                    at = h.At,
                }),
            },
        });
    }
}
