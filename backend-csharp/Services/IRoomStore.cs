using Kzys.Backend.Models;

namespace Kzys.Backend.Services;

public sealed record ScalingMetrics(
    int ActiveRooms,
    int DesiredSfuPods,
    int StandbyPool,
    long RoomCreatedEvents);

public interface IRoomStore
{
    Task<RegisteredRoom> CreateAsync(
        RoomPlan plan,
        string? hostName = null,
        string? userId = null,
        BillingMode billingMode = BillingMode.PerRoom,
        int ttlHours = RoomPlanManager.DefaultRoomDurationHours,
        CancellationToken cancellationToken = default);

    Task<RegisteredRoom?> GetAsync(string roomId, CancellationToken cancellationToken = default);

    Task<(bool Valid, RegisteredRoom? Room, string? Error)> TryValidateAsync(
        string roomId,
        string joinKey,
        CancellationToken cancellationToken = default);

    Task<int> GetActiveRoomCountAsync(CancellationToken cancellationToken = default);

    Task<ScalingMetrics> GetScalingMetricsAsync(CancellationToken cancellationToken = default);

    Task AppendHistoryAsync(
        string roomId,
        string eventType,
        string? userId = null,
        string? detail = null,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<RoomHistoryEvent>> GetHistoryAsync(
        string roomId,
        int limit = 50,
        CancellationToken cancellationToken = default);
}
