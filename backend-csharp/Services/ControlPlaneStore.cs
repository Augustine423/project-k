using System.Globalization;
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
    private static string ParticipantIndexKey(string id) => "room:" + id + ":participant_index";
    private static string MediaKey(string id) => "room:" + id + ":media";
    private static string RaisedHandsKey(string id) => "room:" + id + ":raised_hands";
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
            RoomKey(roomId), ParticipantsKey(roomId), ParticipantIndexKey(roomId), MediaKey(roomId),
            RaisedHandsKey(roomId), RoomSecretKey(roomId), RoomPinKey(roomId),
        ]);
        await _db.SetRemoveAsync(ActiveRoomsKey, roomId);
        await RefreshScalingMetricsAsync(ct);
    }

    public async Task AddParticipantAsync(ParticipantRecord participant, CancellationToken ct = default)
    {
        var json = JsonSerializer.Serialize(participant);
        var key = ParticipantsKey(participant.RoomId);
        var indexKey = ParticipantIndexKey(participant.RoomId);
        var score = JoinScore(participant.JoinedAt);
        await _db.HashSetAsync(key, participant.Id, json);
        await _db.SortedSetAddAsync(indexKey, participant.Id, score);
        await _db.KeyExpireAsync(key, RoomTtl);
        await _db.KeyExpireAsync(indexKey, RoomTtl);
    }

    public async Task<(bool Added, bool AlreadyPresent)> TryAddParticipantAsync(
        ParticipantRecord participant,
        int max,
        CancellationToken ct = default)
    {
        if (max <= 0) max = 10;
        var key = ParticipantsKey(participant.RoomId);
        var indexKey = ParticipantIndexKey(participant.RoomId);
        var json = JsonSerializer.Serialize(participant);
        var ttlSeconds = (int)RoomTtl.TotalSeconds;
        var score = JoinScore(participant.JoinedAt).ToString(CultureInfo.InvariantCulture);

        const string script = """
local key = KEYS[1]
local indexKey = KEYS[2]
local id = ARGV[1]
local payload = ARGV[2]
local max = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])
local score = tonumber(ARGV[5])
if redis.call('HEXISTS', key, id) == 1 then
  redis.call('HSET', key, id, payload)
  redis.call('EXPIRE', key, ttl)
  redis.call('EXPIRE', indexKey, ttl)
  return 2
end
local n = redis.call('HLEN', key)
if n >= max then
  return 0
end
redis.call('HSET', key, id, payload)
redis.call('ZADD', indexKey, score, id)
redis.call('EXPIRE', key, ttl)
redis.call('EXPIRE', indexKey, ttl)
return 1
""";

        var result = (int)await _db.ScriptEvaluateAsync(
            script,
            [key, indexKey],
            [participant.Id, json, max.ToString(), ttlSeconds.ToString(), score]);

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
        await _db.SortedSetRemoveAsync(ParticipantIndexKey(roomId), participantId);
        await _db.SortedSetRemoveAsync(RaisedHandsKey(roomId), participantId);
    }

    public async Task RaiseHandAsync(string roomId, string participantId, CancellationToken ct = default)
    {
        var score = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        await _db.SortedSetAddAsync(RaisedHandsKey(roomId), participantId, score);
        await _db.KeyExpireAsync(RaisedHandsKey(roomId), RoomTtl);
    }

    public Task LowerHandAsync(string roomId, string participantId, CancellationToken ct = default)
        => _db.SortedSetRemoveAsync(RaisedHandsKey(roomId), participantId);

    public Task ClearRaisedHandsAsync(string roomId, CancellationToken ct = default)
        => _db.KeyDeleteAsync(RaisedHandsKey(roomId));

    public async Task<IReadOnlyList<RaisedHandRecord>> ListRaisedHandsAsync(
        string roomId,
        CancellationToken ct = default)
    {
        var entries = await _db.SortedSetRangeByRankWithScoresAsync(RaisedHandsKey(roomId));
        if (entries.Length == 0) return [];

        var result = new List<RaisedHandRecord>(entries.Length);
        foreach (var entry in entries)
        {
            var participantId = (string)entry.Element!;
            if (string.IsNullOrEmpty(participantId)) continue;
            var participant = await GetParticipantAsync(roomId, participantId, ct);
            if (participant is null)
            {
                await _db.SortedSetRemoveAsync(RaisedHandsKey(roomId), participantId);
                continue;
            }

            var raisedAt = DateTime.UnixEpoch.AddMilliseconds(entry.Score);
            result.Add(new RaisedHandRecord(participant.Id, participant.DisplayName, raisedAt));
        }

        return result;
    }

    public Task<long> GetParticipantCountAsync(string roomId, CancellationToken ct = default)
        => _db.HashLengthAsync(ParticipantsKey(roomId));

    public async Task<ParticipantRecord?> GetParticipantAsync(
        string roomId,
        string participantId,
        CancellationToken ct = default)
    {
        var value = await _db.HashGetAsync(ParticipantsKey(roomId), participantId);
        if (value.IsNullOrEmpty) return null;
        return JsonSerializer.Deserialize<ParticipantRecord>((string)value!);
    }

    public async Task<List<ParticipantRecord>> ListParticipantsAsync(string roomId, CancellationToken ct = default)
    {
        var page = await ListParticipantsPageAsync(roomId, 0, int.MaxValue, ct);
        return page.Items;
    }

    public async Task<ParticipantsPageDto> ListParticipantsPageAsync(
        string roomId,
        int offset,
        int limit,
        CancellationToken ct = default)
    {
        offset = Math.Max(0, offset);
        limit = Math.Clamp(limit, 1, 200);

        var indexKey = ParticipantIndexKey(roomId);
        var hashKey = ParticipantsKey(roomId);
        var total = (int)await _db.HashLengthAsync(hashKey);

        if (total == 0)
            return EmptyPage(offset, limit);

        var ids = await _db.SortedSetRangeByRankAsync(indexKey, offset, offset + limit - 1);
        if (ids.Length == 0)
            return new ParticipantsPageDto
            {
                Items = [],
                Total = total,
                Offset = offset,
                Limit = limit,
                HasMore = offset + limit < total,
            };

        var fields = ids.Select(id => (RedisValue)id!).ToArray();
        var values = await _db.HashGetAsync(hashKey, fields);
        var items = new List<ParticipantRecord>(values.Length);
        foreach (var value in values)
        {
            if (value.IsNullOrEmpty) continue;
            var participant = JsonSerializer.Deserialize<ParticipantRecord>((string)value!);
            if (participant is not null) items.Add(participant);
        }

        items.Sort(CompareParticipants);

        return new ParticipantsPageDto
        {
            Items = items,
            Total = total,
            Offset = offset,
            Limit = limit,
            HasMore = offset + limit < total,
        };
    }

    public async Task<ParticipantsPageDto> SearchParticipantsAsync(
        string roomId,
        string query,
        int limit,
        int scanCap,
        CancellationToken ct = default)
    {
        limit = Math.Clamp(limit, 1, 100);
        scanCap = Math.Clamp(scanCap, 100, 10_000);
        var q = query.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(q))
            return await ListParticipantsPageAsync(roomId, 0, limit, ct);

        var hashKey = ParticipantsKey(roomId);
        var total = (int)await _db.HashLengthAsync(hashKey);
        var matches = new List<ParticipantRecord>();
        var scanned = 0;

        foreach (var entry in _db.HashScan(hashKey, pageSize: 128))
        {
            ct.ThrowIfCancellationRequested();
            scanned++;
            if (entry.Value.IsNullOrEmpty) continue;
            var participant = JsonSerializer.Deserialize<ParticipantRecord>((string)entry.Value!);
            if (participant is null) continue;
            if (participant.DisplayName.Contains(q, StringComparison.OrdinalIgnoreCase))
                matches.Add(participant);
            if (matches.Count >= limit || scanned >= scanCap) break;
        }

        matches.Sort(CompareParticipants);

        return new ParticipantsPageDto
        {
            Items = matches,
            Total = total,
            Offset = 0,
            Limit = limit,
            HasMore = matches.Count >= limit && scanned >= scanCap,
        };
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
        var total = (int)await _db.HashLengthAsync(ParticipantsKey(roomId));
        var mediaEntries = await _db.HashGetAllAsync(MediaKey(roomId));
        var publishing = 0;

        foreach (var entry in mediaEntries)
        {
            if (entry.Value.IsNullOrEmpty) continue;
            var presence = JsonSerializer.Deserialize<MediaPresenceRecord>((string)entry.Value!);
            if (presence?.Publishing == true) publishing++;
        }

        var listeners = Math.Max(0, total - publishing);
        return new MediaStats(total, publishing, listeners);
    }

    public async Task EnqueueModeApplyAsync(string roomId, CancellationToken ct = default)
    {
        await _db.ListLeftPushAsync(ModeQueueKey, roomId);
    }

    public async Task<string?> DequeueModeApplyAsync(CancellationToken ct = default)
    {
        var value = await _db.ListRightPopAsync(ModeQueueKey);
        return value.IsNullOrEmpty ? null : (string)value!;
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
        var totalLoad = (long)await _db.StringGetAsync("kzys:total_node_load");
        if (totalLoad < 0) totalLoad = 0;

        var perNode = ServerTimeoutOptions.SfuPublishersPerNode;
        var loadBased = (int)Math.Ceiling(totalLoad / (double)Math.Max(1, perNode));
        var desired = Math.Max(standby, Math.Max(active, loadBased));

        var created = (long)await _db.StringGetAsync(RoomCreatedCounterKey);
        if (created < 0) created = 0;
        return new ScalingMetrics(active, desired, standby, created);
    }

    private static double JoinScore(DateTime joinedAt)
        => joinedAt.ToUniversalTime().Subtract(DateTime.UnixEpoch).TotalMilliseconds;

    private static int CompareParticipants(ParticipantRecord a, ParticipantRecord b)
    {
        var role = RoleRank(a.Role) - RoleRank(b.Role);
        if (role != 0) return role;
        return string.Compare(a.DisplayName, b.DisplayName, StringComparison.OrdinalIgnoreCase);
    }

    private static int RoleRank(string role) => role switch
    {
        ParticipantRoles.Host => 0,
        ParticipantRoles.CoHost => 1,
        _ => 2,
    };

    private static ParticipantsPageDto EmptyPage(int offset, int limit) => new()
    {
        Items = [],
        Total = 0,
        Offset = offset,
        Limit = limit,
        HasMore = false,
    };
}
