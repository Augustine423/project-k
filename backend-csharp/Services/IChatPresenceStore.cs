namespace Kzys.Backend.Services;

/// <summary>
/// Redis-backed SignalR chat presence — syncs across C# backend replicas.
/// </summary>
public interface IChatPresenceStore
{
    Task AddAsync(string roomId, string connectionId, string userId, CancellationToken cancellationToken = default);
    Task RemoveAsync(string roomId, string connectionId, CancellationToken cancellationToken = default);
    Task<int> CountAsync(string roomId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<(string ConnectionId, string UserId)>> ListAsync(
        string roomId, CancellationToken cancellationToken = default);
}
