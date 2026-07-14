namespace Kzys.Backend.Services;

public sealed record ScalingMetrics(
    int ActiveRooms,
    int DesiredSfuPods,
    int StandbyPool,
    long RoomCreatedEvents);
