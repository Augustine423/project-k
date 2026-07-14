using System.Text.Json.Serialization;

namespace Kzys.Backend.Models;

public static class RoomModes
{
    public const string Interactive = "interactive";
    public const string Webinar = "webinar";
}

public static class ParticipantRoles
{
    public const string Host = "host";
    public const string CoHost = "cohost";
    public const string Participant = "participant";
}

public sealed class RoomRecord
{
    public required string Id { get; set; }
    public string Mode { get; set; } = RoomModes.Interactive;
    public required string JanusNodeId { get; set; }
    public required string JanusRoomId { get; set; }
    public int MaxParticipants { get; set; }
    public int MaxPublishers { get; set; }
    public int ActivePublishers { get; set; }
    public int ActiveListeners { get; set; }
    public bool Locked { get; set; }
    [JsonIgnore] public string Pin { get; set; } = "";
    [JsonIgnore] public string Secret { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public required string HostParticipantId { get; set; }
}

public sealed class ParticipantRecord
{
    public required string Id { get; set; }
    public required string RoomId { get; set; }
    public required string DisplayName { get; set; }
    public string Role { get; set; } = ParticipantRoles.Participant;
    public bool Approved { get; set; } = true;
    public DateTime JoinedAt { get; set; }
}

public sealed class TurnInfoDto
{
    public required string[] Urls { get; set; }
    public required string Username { get; set; }
    public required string Credential { get; set; }
}

public sealed class JoinTicketDto
{
    public required RoomRecord Room { get; set; }
    public required ParticipantRecord Participant { get; set; }
    public required string JanusWsUrl { get; set; }
    public required string ParticipantToken { get; set; }
    public string? JanusJoinPin { get; set; }
    public required TurnInfoDto Turn { get; set; }
}

public sealed class ParticipantClaims
{
    public required string RoomId { get; set; }
    public required string ParticipantId { get; set; }
    public required string Role { get; set; }
}

public sealed class MediaPresenceRecord
{
    public required string ParticipantId { get; set; }
    public bool Publishing { get; set; }
    public bool Audio { get; set; }
    public bool Video { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public sealed class RoomEvent
{
    public required string Type { get; set; }
    public object? Data { get; set; }
}
