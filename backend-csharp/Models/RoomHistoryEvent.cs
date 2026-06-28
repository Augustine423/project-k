namespace Kzys.Backend.Models;

public record RoomHistoryEvent(
    string RoomId,
    string EventType,
    string? UserId,
    DateTime TimestampUtc,
    string? Detail = null);
