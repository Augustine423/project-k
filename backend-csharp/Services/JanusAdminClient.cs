using System.Net.Http.Json;
using System.Text.Json;

namespace Kzys.Backend.Services;

public sealed class JanusAdminException : Exception
{
    public int Code { get; }
    public JanusAdminException(int code, string reason) : base($"janus admin error {code}: {reason}")
    {
        Code = code;
    }
}

public sealed class JanusAdminClient
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(15) };
    private readonly string _adminUrl;
    private readonly string _secret;

    public JanusAdminClient(string adminUrl, string secret)
    {
        _adminUrl = adminUrl;
        _secret = secret;
    }

    public async Task CreateVideoRoomAsync(
        string roomId,
        string secret,
        string pin,
        string description,
        int maxPublishers,
        int bitrateKbps,
        string adminKey,
        CancellationToken ct = default)
    {
        var request = new Dictionary<string, object?>
        {
            ["request"] = "create",
            ["room"] = roomId,
            ["admin_key"] = adminKey,
            ["secret"] = secret,
            ["description"] = description,
            ["publishers"] = maxPublishers,
            ["bitrate"] = bitrateKbps * 1000,
            ["bitrate_cap"] = false,
            ["fir_freq"] = 10,
            ["videocodec"] = "vp9,vp8,h264",
            ["require_pvtid"] = true,
            ["notify_joining"] = true,
        };
        if (!string.IsNullOrEmpty(pin)) request["pin"] = pin;

        try
        {
            await MessagePluginAsync("janus.plugin.videoroom", request, ct);
        }
        catch (JanusAdminException ex) when (ex.Code == 427)
        {
            // room already exists
        }
    }

    public Task DestroyVideoRoomAsync(string roomId, string secret, CancellationToken ct = default)
        => MessagePluginAsync("janus.plugin.videoroom", new Dictionary<string, object?>
        {
            ["request"] = "destroy",
            ["room"] = roomId,
            ["secret"] = secret,
        }, ct);

    public Task KickParticipantAsync(string roomId, string secret, string publisherId, CancellationToken ct = default)
        => MessagePluginAsync("janus.plugin.videoroom", new Dictionary<string, object?>
        {
            ["request"] = "kick",
            ["room"] = roomId,
            ["secret"] = secret,
            ["id"] = publisherId,
        }, ct);

    public Task EditRoomAsync(string roomId, string secret, bool locked, CancellationToken ct = default)
        => MessagePluginAsync("janus.plugin.videoroom", new Dictionary<string, object?>
        {
            ["request"] = "edit",
            ["room"] = roomId,
            ["secret"] = secret,
            ["new_is_private"] = locked,
        }, ct);

    public Task EditRoomPublishersAsync(
        string roomId,
        string secret,
        int maxPublishers,
        string mode,
        CancellationToken ct = default)
        => MessagePluginAsync("janus.plugin.videoroom", new Dictionary<string, object?>
        {
            ["request"] = "edit",
            ["room"] = roomId,
            ["secret"] = secret,
            ["new_publishers"] = maxPublishers,
            ["description"] = $"KZYS {roomId} [{mode}]",
        }, ct);

    private async Task<JsonElement> MessagePluginAsync(
        string plugin,
        Dictionary<string, object?> request,
        CancellationToken ct)
    {
        var payload = new
        {
            janus = "message_plugin",
            transaction = Guid.NewGuid().ToString("N"),
            secret = _secret,
            plugin,
            request,
        };

        using var response = await Http.PostAsJsonAsync(_adminUrl, payload, ct);
        var body = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException($"Janus admin HTTP {(int)response.StatusCode}: {body}");

        using var doc = JsonDocument.Parse(body);
        var root = doc.RootElement;

        if (root.TryGetProperty("janus", out var janus) && janus.GetString() == "error")
        {
            var code = root.GetProperty("error").GetProperty("code").GetInt32();
            var reason = root.GetProperty("error").GetProperty("reason").GetString() ?? "unknown";
            throw new JanusAdminException(code, reason);
        }

        if (!root.TryGetProperty("plugindata", out var pluginDataEl)
            || !pluginDataEl.TryGetProperty("data", out var data))
        {
            if (root.TryGetProperty("response", out var responseEl))
                return responseEl.Clone();
            throw new InvalidOperationException($"unexpected janus admin response: {body}");
        }

        if (data.TryGetProperty("error_code", out var errorCode))
        {
            var code = errorCode.GetInt32();
            var reason = data.TryGetProperty("error", out var err) ? err.GetString() ?? "unknown" : "unknown";
            throw new JanusAdminException(code, reason);
        }

        return data.Clone();
    }
}

public sealed class JanusNodeRouter
{
    private readonly Dictionary<string, Configuration.JanusNodeConfig> _nodes;
    private readonly ControlPlaneStore _store;

    public JanusNodeRouter(IEnumerable<Configuration.JanusNodeConfig> nodes, ControlPlaneStore store)
    {
        _nodes = nodes.ToDictionary(n => n.Id);
        _store = store;
    }

    public async Task<Configuration.JanusNodeConfig> PickLeastLoadedAsync(CancellationToken ct = default)
    {
        if (_nodes.Count == 0)
            throw new InvalidOperationException("no janus nodes configured");

        Configuration.JanusNodeConfig? best = null;
        long bestLoad = long.MaxValue;
        foreach (var node in _nodes.Values)
        {
            var load = await _store.GetNodeLoadAsync(node.Id, ct);
            if (load < bestLoad)
            {
                bestLoad = load;
                best = node;
            }
        }
        return best!;
    }

    public bool TryGetNode(string id, out Configuration.JanusNodeConfig node) => _nodes.TryGetValue(id, out node!);
}
