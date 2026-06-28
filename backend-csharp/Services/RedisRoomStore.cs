using System.Security.Cryptography;
using System.Text.Json;
using Kzys.Backend.Models;
using StackExchange.Redis;

namespace Kzys.Backend.Services;

/// <summary>
/// Durable room registry + history in Redis — survives node scale-down/termination.
/// </summary>
public sealed class RedisRoomStore : IRoomStore, IAsyncDisposable
{
    public const string ActiveRoomsSetKey = "kzys:rooms:active";
    public const string RoomCreatedCounterKey = "kzys:scaling:room-created-total";

    private static string RoomKey(string roomId) => $"kzys:room:{roomId}";
    private static string HistoryKey(string roomId) => $"kzys:room:{roomId}:history";

    private readonly IConnectionMultiplexer _redis;
    private readonly IDatabase _db;

    public RedisRoomStore(IConnectionMultiplexer redis)
    {
        _redis = redis;
        _db = redis.GetDatabase();
    }

    public async Task<RegisteredRoom> CreateAsync(
        RoomPlan plan,
        string? hostName = null,
        string? userId = null,
        BillingMode billingMode = BillingMode.PerRoom,
        int ttlHours = RoomPlanManager.DefaultRoomDurationHours,
        CancellationToken cancellationToken = default)
    {
        var roomId = $"room-{Guid.NewGuid():N}"[..13];
        var joinKey = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
        var now = DateTime.UtcNow;
        var room = new RegisteredRoom(
            roomId, joinKey, hostName, userId,
            plan.PlanId, plan.Name, plan.MaxParticipants,
            billingMode, now, now.AddHours(ttlHours));

        var json = JsonSerializer.Serialize(room);
        var ttl = room.ExpiresAt - now;

        await _db.StringSetAsync(RoomKey(roomId), json, ttl);
        await _db.SetAddAsync(ActiveRoomsSetKey, roomId);
        await _db.StringIncrementAsync(RoomCreatedCounterKey);
        await _redis.GetSubscriber().PublishAsync(
            RedisChannel.Literal("kzys:events:room-created"), roomId);

        await AppendHistoryAsync(roomId, "room_created", userId,
            $"plan={plan.PlanId};max={plan.MaxParticipants}", cancellationToken);

        return room;
    }

    public async Task<RegisteredRoom?> GetAsync(string roomId, CancellationToken cancellationToken = default)
    {
        var json = await _db.StringGetAsync(RoomKey(roomId));
        if (json.IsNullOrEmpty)
        {
            await _db.SetRemoveAsync(ActiveRoomsSetKey, roomId);
            return null;
        }

        var room = JsonSerializer.Deserialize<RegisteredRoom>(json!);
        if (room is null || DateTime.UtcNow > room.ExpiresAt)
        {
            await RemoveRoomAsync(roomId);
            return null;
        }

        return room;
    }

    public async Task<(bool Valid, RegisteredRoom? Room, string? Error)> TryValidateAsync(
        string roomId,
        string joinKey,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(roomId) || string.IsNullOrWhiteSpace(joinKey))
            return (false, null, "roomId and joinKey are required.");

        var room = await GetAsync(roomId, cancellationToken);
        if (room is null)
            return (false, null, "Room not found. Ask the host for a new invite link.");

        if (!string.Equals(room.JoinKey, joinKey, StringComparison.Ordinal))
            return (false, null, "Invalid invite key. Use the full link from the room host.");

        return (true, room, null);
    }

    public async Task<int> GetActiveRoomCountAsync(CancellationToken cancellationToken = default)
    {
        var members = await _db.SetMembersAsync(ActiveRoomsSetKey);
        var count = 0;

        foreach (var member in members)
        {
            var roomId = member.ToString();
            if (string.IsNullOrEmpty(roomId))
                continue;

            if (await GetAsync(roomId, cancellationToken) is not null)
                count++;
        }

        return count;
    }

    public async Task<ScalingMetrics> GetScalingMetricsAsync(CancellationToken cancellationToken = default)
    {
        var active = await GetActiveRoomCountAsync(cancellationToken);
        var standby = ServerTimeoutOptions.SfuStandbyPool;
        var desired = Math.Max(standby, active);
        var created = (long)await _db.StringGetAsync(RoomCreatedCounterKey);
        if (created < 0) created = 0;

        return new ScalingMetrics(active, desired, standby, created);
    }

    public async Task AppendHistoryAsync(
        string roomId,
        string eventType,
        string? userId = null,
        string? detail = null,
        CancellationToken cancellationToken = default)
    {
        var entry = new RoomHistoryEvent(roomId, eventType, userId, DateTime.UtcNow, detail);
        var json = JsonSerializer.Serialize(entry);
        await _db.ListLeftPushAsync(HistoryKey(roomId), json);
        await _db.ListTrimAsync(HistoryKey(roomId), 0, 499);
    }

    public async Task<IReadOnlyList<RoomHistoryEvent>> GetHistoryAsync(
        string roomId,
        int limit = 50,
        CancellationToken cancellationToken = default)
    {
        var items = await _db.ListRangeAsync(HistoryKey(roomId), 0, limit - 1);
        var events = new List<RoomHistoryEvent>();
        foreach (var item in items)
        {
            if (item.IsNullOrEmpty) continue;
            var ev = JsonSerializer.Deserialize<RoomHistoryEvent>(item!);
            if (ev is not null) events.Add(ev);
        }
        return events;
    }

    private async Task RemoveRoomAsync(string roomId)
    {
        await _db.KeyDeleteAsync(RoomKey(roomId));
        await _db.SetRemoveAsync(ActiveRoomsSetKey, roomId);
    }

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}
