using System.Net.Http.Json;
using Kzys.Backend.Configuration;
using Kzys.Backend.Services;

namespace Kzys.Backend.Services.Media;

/// <summary>LiveKit SFU adapter — HS256 room tokens compatible with livekit-client.</summary>
public sealed class LiveKitMediaTokenService : IMediaTokenService
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(5) };

    private readonly LiveKitTokenService _tokens;
    private readonly string _apiBase;
    private readonly ILogger<LiveKitMediaTokenService> _log;

    public LiveKitMediaTokenService(AppConfig config, ILogger<LiveKitMediaTokenService> log)
    {
        _tokens = new LiveKitTokenService(config.LiveKitApiKey, config.LiveKitApiSecret);
        _log = log;
        var baseUrl = string.IsNullOrWhiteSpace(config.LiveKitApiUrl) ? config.LiveKitPublicUrl : config.LiveKitApiUrl;
        _apiBase = baseUrl
            .Replace("wss://", "https://", StringComparison.OrdinalIgnoreCase)
            .Replace("ws://", "http://", StringComparison.OrdinalIgnoreCase)
            .TrimEnd('/');
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

    public async Task SetPublishPermissionAsync(
        string roomName,
        string identity,
        bool canPublish,
        CancellationToken ct = default)
    {
        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            _apiBase + "/twirp/livekit.RoomService/UpdateParticipant")
        {
            Content = JsonContent.Create(new
            {
                room = roomName,
                identity,
                permission = new
                {
                    can_subscribe = true,
                    can_publish = canPublish,
                    can_publish_data = true,
                },
            }),
        };
        request.Headers.Authorization = new("Bearer", _tokens.CreateAdminToken(roomName));

        HttpResponseMessage response;
        try
        {
            response = await Http.SendAsync(request, ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            _log.LogWarning(ex, "LiveKit UpdateParticipant unreachable room={Room}", roomName);
            throw new RoomServiceException(RoomError.MediaUnavailable, "media server unreachable");
        }

        using (response)
        if (!response.IsSuccessStatusCode)
        {
            _log.LogWarning(
                "LiveKit UpdateParticipant failed room={Room} identity={Identity} status={Status}",
                roomName, identity, (int)response.StatusCode);
            throw new RoomServiceException(RoomError.MediaUnavailable, "media server rejected the permission change");
        }
    }
}
