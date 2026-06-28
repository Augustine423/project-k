using StackExchange.Redis;

namespace Kzys.Backend.Services;

public sealed class RedisChatPresenceStore : IChatPresenceStore
{
    private static string Key(string roomId) => $"kzys:chat:presence:{roomId}";
    private readonly IDatabase _db;

    public RedisChatPresenceStore(IConnectionMultiplexer redis) => _db = redis.GetDatabase();

    public Task AddAsync(string roomId, string connectionId, string userId, CancellationToken cancellationToken = default)
        => _db.HashSetAsync(Key(roomId), connectionId, userId);

    public Task RemoveAsync(string roomId, string connectionId, CancellationToken cancellationToken = default)
        => _db.HashDeleteAsync(Key(roomId), connectionId);

    public async Task<int> CountAsync(string roomId, CancellationToken cancellationToken = default)
    {
        var len = await _db.HashLengthAsync(Key(roomId));
        return (int)len;
    }

    public async Task<IReadOnlyList<(string ConnectionId, string UserId)>> ListAsync(
        string roomId, CancellationToken cancellationToken = default)
    {
        var entries = await _db.HashGetAllAsync(Key(roomId));
        return entries
            .Select(e => (e.Name.ToString(), e.Value.ToString()))
            .Where(x => !string.IsNullOrEmpty(x.Item1))
            .ToList()!;
    }
}
