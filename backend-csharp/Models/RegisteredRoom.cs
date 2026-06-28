using Kzys.Backend.Models;

namespace Kzys.Backend.Services;

public record RegisteredRoom(
    string RoomId,
    string JoinKey,
    string? HostName,
    string? UserId,
    string PlanId,
    string PlanName,
    int MaxParticipants,
    BillingMode BillingMode,
    DateTime CreatedAt,
    DateTime ExpiresAt);
