using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Kzys.Backend.Services;

/// <summary>
/// Creates Janus VideoRoom rooms via the Admin API (same plugin as janus-gateway/html/demos/videoroom.js).
/// </summary>
public sealed class JanusRoomService
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(15) };

    public static long ToJanusRoomId(string roomId)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(roomId));
        var n = BitConverter.ToUInt32(hash, 0) % 900_000_000u;
        return n + 100_000_000L;
    }

    public static string AdminUrl =>
        Environment.GetEnvironmentVariable("JANUS_ADMIN_URL") ?? "http://janus:7088/admin";

    public static string AdminSecret =>
        Environment.GetEnvironmentVariable("JANUS_ADMIN_SECRET") ?? "janusoverlord";

    public static async Task EnsureVideoRoomAsync(string roomId, int maxPublishers, CancellationToken ct = default)
    {
        var janusRoomId = ToJanusRoomId(roomId);
        var payload = new
        {
            janus = "message_plugin",
            transaction = Guid.NewGuid().ToString("N"),
            secret = AdminSecret,
            plugin = "janus.plugin.videoroom",
            request = new
            {
                request = "create",
                room = janusRoomId,
                admin_key = Environment.GetEnvironmentVariable("JANUS_VIDEOROOM_ADMIN_KEY") ?? "kzysjanusadmin",
                description = $"KZYS {roomId}",
                publishers = Math.Clamp(maxPublishers, 1, 50),
                bitrate = 512_000,
                fir_freq = 10,
                record = false,
            },
        };

        using var res = await Http.PostAsJsonAsync(AdminUrl, payload, ct);
        var body = await res.Content.ReadAsStringAsync(ct);

        if (!res.IsSuccessStatusCode)
            throw new InvalidOperationException($"Janus admin HTTP {(int)res.StatusCode}: {body}");

        using var doc = JsonDocument.Parse(body);
        if (doc.RootElement.TryGetProperty("janus", out var janus) && janus.GetString() == "success")
            return;

        var plugindata = doc.RootElement.GetProperty("plugindata").GetProperty("data");
        if (plugindata.TryGetProperty("error_code", out var code) && code.GetInt32() == 427)
            return; // room already exists

        if (plugindata.TryGetProperty("videoroom", out var vr) && vr.GetString() == "created")
            return;

        var err = plugindata.TryGetProperty("error", out var e) ? e.GetString() : body;
        throw new InvalidOperationException($"Janus create room failed: {err}");
    }
}
