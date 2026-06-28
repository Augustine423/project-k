using Livekit.Server.Sdk.Dotnet;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace Kzys.Backend.Services;

public static class LiveKitRoomService
{
    private static readonly HttpClient Http = CreateClient();

    private static HttpClient CreateClient()
    {
        var client = new HttpClient
        {
            Timeout = ServerTimeoutOptions.ReadTimeout,
        };
        return client;
    }

    public static (string Url, string ApiKey, string ApiSecret) GetConfig()
    {
        var apiKey = Environment.GetEnvironmentVariable("LIVEKIT_API_KEY")
            ?? throw new InvalidOperationException("LIVEKIT_API_KEY is required.");
        var apiSecret = Environment.GetEnvironmentVariable("LIVEKIT_API_SECRET")
            ?? throw new InvalidOperationException("LIVEKIT_API_SECRET is required.");
        return (
            Environment.GetEnvironmentVariable("LIVEKIT_URL") ?? "http://livekit-sfu:7880",
            apiKey,
            apiSecret);
    }

    public static async Task EnsureRoomAsync(string roomId, int maxParticipants)
    {
        var (livekitUrl, apiKey, apiSecret) = GetConfig();
        try
        {
            using var cts = new CancellationTokenSource(ServerTimeoutOptions.WriteTimeout);
            var adminToken = new AccessToken(apiKey, apiSecret)
                .WithIdentity("server")
                .WithTtl(TimeSpan.FromSeconds(30))
                .WithGrants(new VideoGrants { RoomCreate = true, RoomAdmin = true });

            var payload = JsonSerializer.Serialize(new
            {
                name = roomId,
                max_participants = maxParticipants,
                empty_timeout = 300,
            });

            var request = new HttpRequestMessage(
                HttpMethod.Post,
                $"{livekitUrl.TrimEnd('/')}/twirp/livekit.RoomService/CreateRoom")
            {
                Content = new StringContent(payload, Encoding.UTF8, "application/json"),
            };
            request.Headers.Authorization =
                new AuthenticationHeaderValue("Bearer", adminToken.ToJwt());

            await Http.SendAsync(request, cts.Token);
        }
        catch
        {
            // Non-fatal — SFU may create room on first join.
        }
    }

    public static async Task<(int Count, bool IdentityPresent)> GetParticipantInfoAsync(
        string roomId, string? identity = null)
    {
        var (livekitUrl, apiKey, apiSecret) = GetConfig();
        try
        {
            using var cts = new CancellationTokenSource(ServerTimeoutOptions.ReadTimeout);
            var adminToken = new AccessToken(apiKey, apiSecret)
                .WithIdentity("server")
                .WithTtl(TimeSpan.FromSeconds(30))
                .WithGrants(new VideoGrants { RoomAdmin = true });

            var payload = JsonSerializer.Serialize(new { room = roomId });
            var request = new HttpRequestMessage(
                HttpMethod.Post,
                $"{livekitUrl.TrimEnd('/')}/twirp/livekit.RoomService/ListParticipants")
            {
                Content = new StringContent(payload, Encoding.UTF8, "application/json"),
            };
            request.Headers.Authorization =
                new AuthenticationHeaderValue("Bearer", adminToken.ToJwt());

            var response = await Http.SendAsync(request, cts.Token);
            if (!response.IsSuccessStatusCode)
                return (0, false);

            await using var stream = await response.Content.ReadAsStreamAsync(cts.Token);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cts.Token);
            if (!doc.RootElement.TryGetProperty("participants", out var participants))
                return (0, false);

            var count = participants.GetArrayLength();
            var present = false;
            if (!string.IsNullOrWhiteSpace(identity))
            {
                foreach (var p in participants.EnumerateArray())
                {
                    if (p.TryGetProperty("identity", out var id) &&
                        string.Equals(id.GetString(), identity, StringComparison.Ordinal))
                    {
                        present = true;
                        break;
                    }
                }
            }

            return (count, present);
        }
        catch
        {
            return (0, false);
        }
    }
}
