using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Kzys.Backend.Models;
using StackExchange.Redis;

namespace Kzys.Backend.Services;

public sealed class ControlPlaneStore
{
    private static readonly TimeSpan RoomTtl = TimeSpan.FromHours(24);

    private readonly IDatabase _db;

    public ControlPlaneStore(IConnectionMultiplexer redis)
    {
        _db = redis.GetDatabase();
    }

    public async Task PingAsync(CancellationToken ct = default)
    {
        await _db.PingAsync();
    }

    private static string RoomKey(string id) => "room:" + id;
    private static string ParticipantsKey(string id) => "room:" + id + ":participants";
    private static string MediaKey(string id) => "room:" + id + ":media";
    private static string RoomSecretKey(string id) => "room:" + id + ":secret";
    private static string RoomPinKey(string id) => "room:" + id + ":pin";
    private static string ActiveRoomsKey => "kzys:active_rooms";
    private const string ModeQueueKey = "kzys:mode:apply_queue";
    public const string RoomCreatedCounterKey = "kzys:scaling:room-created-total";

    public async Task SaveRoomAsync(RoomRecord room, CancellationToken ct = default)
    {
        var json = JsonSerializer.Serialize(room);
        await _db.StringSetAsync(RoomKey(room.Id), json, RoomTtl);
        if (!string.IsNullOrEmpty(room.Secret))
            await _db.StringSetAsync(RoomSecretKey(room.Id), room.Secret, RoomTtl);
        if (!string.IsNullOrEmpty(room.Pin))
            await _db.StringSetAsync(RoomPinKey(room.Id), room.Pin, RoomTtl);
        else
            await _db.KeyDeleteAsync(RoomPinKey(room.Id));
        await _db.SetAddAsync(ActiveRoomsKey, room.Id);
        await _db.KeyExpireAsync(ActiveRoomsKey, RoomTtl);
    }

    public async Task<RoomRecord?> GetRoomAsync(string id, CancellationToken ct = default)
    {
        var value = await _db.StringGetAsync(RoomKey(id));
        if (value.IsNullOrEmpty) return null;
        var room = JsonSerializer.Deserialize<RoomRecord>((string)value!);
        if (room is null) return null;

        var pin = await _db.StringGetAsync(RoomPinKey(id));
        if (!pin.IsNullOrEmpty)
            room.Pin = (string)pin!;

        return room;
    }

    public async Task DeleteRoomAsync(string roomId, CancellationToken ct = default)
    {
        await _db.KeyDeleteAsync([
            RoomKey(roomId), ParticipantsKey(roomId), MediaKey(roomId),
            RoomSecretKey(roomId), RoomPinKey(roomId),
        ]);
        await _db.SetRemoveAsync(ActiveRoomsKey, roomId);
        await RefreshScalingMetricsAsync(ct);
    }

    public async Task AddParticipantAsync(ParticipantRecord participant, CancellationToken ct = default)
    {
        var json = JsonSerializer.Serialize(participant);
        var key = ParticipantsKey(participant.RoomId);
        await _db.HashSetAsync(key, participant.Id, json);
        await _db.KeyExpireAsync(key, RoomTtl);
    }

    public async Task<(bool Added, bool AlreadyPresent)> TryAddParticipantAsync(
        ParticipantRecord participant,
        int max,
        CancellationToken ct = default)
    {
        if (max <= 0) max = 10;
        var key = ParticipantsKey(participant.RoomId);
        var json = JsonSerializer.Serialize(participant);
        var ttlSeconds = (int)RoomTtl.TotalSeconds;

        const string script = """
local key = KEYS[1]
local id = ARGV[1]
local payload = ARGV[2]
local max = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])
if redis.call('HEXISTS', key, id) == 1 then
  redis.call('HSET', key, id, payload)
  redis.call('EXPIRE', key, ttl)
  return 2
end
local n = redis.call('HLEN', key)
if n >= max then
  return 0
end
redis.call('HSET', key, id, payload)
redis.call('EXPIRE', key, ttl)
return 1
""";

        var result = (int)await _db.ScriptEvaluateAsync(
            script,
            [key],
            [participant.Id, json, max.ToString(), ttlSeconds.ToString()]);

        return result switch
        {
            0 => (false, false),
            2 => (true, true),
            _ => (true, false),
        };
    }

    public async Task RemoveParticipantAsync(string roomId, string participantId, CancellationToken ct = default)
    {
        await _db.HashDeleteAsync(ParticipantsKey(roomId), participantId);
    }

    public async Task<List<ParticipantRecord>> ListParticipantsAsync(string roomId, CancellationToken ct = default)
    {
        var entries = await _db.HashGetAllAsync(ParticipantsKey(roomId));
        var list = new List<ParticipantRecord>(entries.Length);
        foreach (var entry in entries)
        {
            if (entry.Value.IsNullOrEmpty) continue;
            var participant = JsonSerializer.Deserialize<ParticipantRecord>((string)entry.Value!);
            if (participant is not null) list.Add(participant);
        }
        return list;
    }

    public async Task<long> IncrNodeLoadAsync(string nodeId, long delta, CancellationToken ct = default)
    {
        return await _db.StringIncrementAsync("nodeload:" + nodeId, delta);
    }

    public async Task<long> GetNodeLoadAsync(string nodeId, CancellationToken ct = default)
    {
        var value = await _db.StringGetAsync("nodeload:" + nodeId);
        return value.IsNullOrEmpty ? 0 : (long)value;
    }

    public async Task SetMediaPresenceAsync(string roomId, MediaPresenceRecord record, CancellationToken ct = default)
    {
        var json = JsonSerializer.Serialize(record);
        await _db.HashSetAsync(MediaKey(roomId), record.ParticipantId, json);
        await _db.KeyExpireAsync(MediaKey(roomId), RoomTtl);
    }

    public async Task RemoveMediaPresenceAsync(string roomId, string participantId, CancellationToken ct = default)
    {
        await _db.HashDeleteAsync(MediaKey(roomId), participantId);
    }

    public async Task<MediaStats> GetMediaStatsAsync(string roomId, CancellationToken ct = default)
    {
        var participants = await ListParticipantsAsync(roomId, ct);
        var mediaEntries = await _db.HashGetAllAsync(MediaKey(roomId));
        var publishing = new HashSet<string>(StringComparer.Ordinal);

        foreach (var entry in mediaEntries)
        {
            if (entry.Value.IsNullOrEmpty) continue;
            var presence = JsonSerializer.Deserialize<MediaPresenceRecord>((string)entry.Value!);
            if (presence?.Publishing == true) publishing.Add(presence.ParticipantId);
        }

        var total = participants.Count;
        var pubCount = publishing.Count;
        var listeners = Math.Max(0, total - pubCount);
        return new MediaStats(total, pubCount, listeners);
    }

    public async Task EnqueueModeApplyAsync(string roomId, CancellationToken ct = default)
    {
        await _db.ListLeftPushAsync(ModeQueueKey, roomId);
    }

    public async Task RefreshScalingMetricsAsync(CancellationToken ct = default)
    {
        var roomCount = await _db.SetLengthAsync(ActiveRoomsKey);
        await _db.StringSetAsync("kzys:room_count", roomCount);

        var webinarRooms = 0L;
        var totalLoad = 0L;
        var members = await _db.SetMembersAsync(ActiveRoomsKey);
        foreach (var member in members)
        {
            if (member.IsNullOrEmpty) continue;
            var roomId = (string)member!;
            var room = await GetRoomAsync(roomId, ct);
            if (room is null)
            {
                await _db.SetRemoveAsync(ActiveRoomsKey, roomId);
                continue;
            }

            var stats = await GetMediaStatsAsync(roomId, ct);
            totalLoad += Math.Max(1, stats.Publishers);
            totalLoad += stats.Listeners / 4;
            if (room.Mode == RoomModes.Webinar) webinarRooms++;
        }

        await _db.StringSetAsync("kzys:total_node_load", totalLoad);
        await _db.StringSetAsync("kzys:webinar_rooms", webinarRooms);
    }

    public async Task IncrementRoomCreatedAsync(CancellationToken ct = default)
    {
        await _db.StringIncrementAsync(RoomCreatedCounterKey);
    }

    public async Task<ScalingMetrics> GetScalingMetricsAsync(CancellationToken ct = default)
    {
        await RefreshScalingMetricsAsync(ct);
        var active = (int)await _db.SetLengthAsync(ActiveRoomsKey);
        var standby = ServerTimeoutOptions.SfuStandbyPool;
        var desired = Math.Max(standby, active);
        var created = (long)await _db.StringGetAsync(RoomCreatedCounterKey);
        if (created < 0) created = 0;
        return new ScalingMetrics(active, desired, standby, created);
    }
}
