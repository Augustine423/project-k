using Kzys.Backend.Configuration;

namespace Kzys.Backend.Services.Media;

/// <summary>LiveKit SFU adapter — HS256 room tokens compatible with livekit-client.</summary>
public sealed class LiveKitMediaTokenService : IMediaTokenService
{
    private readonly LiveKitTokenService _tokens;

    public LiveKitMediaTokenService(AppConfig config)
    {
        _tokens = new LiveKitTokenService(config.LiveKitApiKey, config.LiveKitApiSecret);
    }

    public string ProviderName => MediaProviders.LiveKit;

    public MediaJoinGrant CreateJoinGrant(MediaJoinRequest request)
    {
        var token = _tokens.CreateJoinToken(
            request.RoomName,
            request.Identity,
            request.DisplayName,
            canPublish: request.CanPublish,
            canSubscribe: request.CanSubscribe,
            canPublishSources: request.CanPublishSources);

        return new MediaJoinGrant(request.SignalingUrl, token, ProviderName);
    }
}
