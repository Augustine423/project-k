using Kzys.Backend.Models;

namespace Kzys.Backend.Services.Media;

/// <summary>
/// Issues SFU join credentials. LiveKit today; swap implementation without changing room logic.
/// </summary>
public interface IMediaTokenService
{
    string ProviderName { get; }

    MediaJoinGrant CreateJoinGrant(MediaJoinRequest request);

    /// <summary>Changes a connected participant's publish permission without forcing a reconnect.</summary>
    Task SetPublishPermissionAsync(string roomName, string identity, bool canPublish, CancellationToken ct = default);
}

public sealed record MediaJoinRequest(
    string RoomName,
    string Identity,
    string DisplayName,
    string SignalingUrl,
    bool CanPublish,
    bool CanSubscribe,
    IReadOnlyList<string>? CanPublishSources = null,
    DeviceBandwidthHintDto? DeviceHint = null);

public sealed record MediaJoinGrant(
    string Url,
    string Token,
    string Provider);

public static class MediaProviders
{
    public const string LiveKit = "livekit";
}
