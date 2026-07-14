using StackExchange.Redis;

namespace Kzys.Backend.Services;

/// <summary>
/// Tracks WebSocket presence in Redis so any control-plane pod can scale without sticky sessions.
/// </summary>
public sealed class RoomWsPresenceStore
{
    private const string Alive = "alive";
    private const string Grace = "grace";
    private static readonly TimeSpan AliveTtl = TimeSpan.FromSeconds(20);
    private static readonly TimeSpan GraceTtl = TimeSpan.FromSeconds(8);

    private readonly IDatabase _db;

    public RoomWsPresenceStore(IConnectionMultiplexer redis) => _db = redis.GetDatabase();

    private static string Key(string roomId, string participantId) => $"kzys:ws:{roomId}:{participantId}";

    public Task MarkAliveAsync(string roomId, string participantId, CancellationToken ct = default)
        => _db.StringSetAsync(Key(roomId, participantId), Alive, AliveTtl);

    public Task MarkGraceAsync(string roomId, string participantId, CancellationToken ct = default)
        => _db.StringSetAsync(Key(roomId, participantId), Grace, GraceTtl);

    public async Task<bool> IsAliveAsync(string roomId, string participantId, CancellationToken ct = default)
    {
        var value = await _db.StringGetAsync(Key(roomId, participantId));
        return value == Alive;
    }

    public TimeSpan AliveRefreshInterval => TimeSpan.FromSeconds(5);
    public TimeSpan GraceDuration => GraceTtl;
}
