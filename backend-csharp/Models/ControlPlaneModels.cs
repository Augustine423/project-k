using System.Text.Json.Serialization;
using Kzys.Backend.Services.Media;

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
    public int MaxParticipants { get; set; }
    public int MaxPublishers { get; set; }
    /// <summary>Upper bound of participants that may be promoted to interactive (publish-capable) seats.</summary>
    public int MaxInteractive { get; set; }
    /// <summary>Attendees join subscribe-only until a host promotes them.</summary>
    public bool ViewOnlyDefault { get; set; }
    public int ActivePublishers { get; set; }
    public int ActiveListeners { get; set; }
    public bool Locked { get; set; }
    /// <summary>When true, host pinned mode — auto webinar/interactive flip is disabled.</summary>
    public bool ModePinned { get; set; }
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

public sealed class DeviceBandwidthHintDto
{
    public uint UplinkKbps { get; set; }
    public uint DownlinkKbps { get; set; }
    public bool BatterySaver { get; set; }
    public bool IsMobile { get; set; }
    public bool IsPortrait { get; set; }
}

public sealed class JoinTicketDto
{
    public required RoomRecord Room { get; set; }
    public required ParticipantRecord Participant { get; set; }
    public required string LiveKitUrl { get; set; }
    public required string LiveKitToken { get; set; }
    /// <summary>SFU vendor — today "livekit"; clients may also read liveKitUrl/liveKitToken.</summary>
    public string MediaProvider { get; set; } = MediaProviders.LiveKit;
    public required string ParticipantToken { get; set; }
    public required TurnInfoDto Turn { get; set; }
    public DeviceBandwidthHintDto? DeviceHint { get; set; }
    /// <summary>"webrtc" (default) or "hls" when the WebRTC audience cap is reached.</summary>
    public string Delivery { get; set; } = "webrtc";
    public string? HlsUrl { get; set; }
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

public sealed record RaisedHandRecord(string ParticipantId, string DisplayName, DateTime At);

public sealed class RoomEvent
{
    public required string Type { get; set; }
    public object? Data { get; set; }
}
