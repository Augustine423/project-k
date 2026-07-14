namespace Kzys.Backend.Configuration;

public sealed class JanusNodeConfig
{
    public required string Id { get; init; }
    public required string AdminUrl { get; init; }
    public required string InternalWsUrl { get; init; }
    public required string PublicWsUrl { get; init; }
}

public sealed class AppConfig
{
    public string Port { get; init; } = "4000";
    public string RedisUrl { get; init; } = "redis://redis:6379";
    public string JwtSigningSecret { get; init; } = "dev-jwt-signing-secret";
    public string CorsOrigin { get; init; } = "*";
    public int MaxRoomParticipants { get; init; } = 10;
    public int WebinarEnterListeners { get; init; } = 12;
    public double WebinarEnterRatio { get; init; } = 2.0;
    public int WebinarExitListeners { get; init; } = 8;
    public int InteractiveMaxPublishers { get; init; } = 50;
    public int WebinarMaxPublishers { get; init; } = 8;
    public string MediaCoreUrl { get; init; } = "http://media-core:8090";
    public string TurnSharedSecret { get; init; } = "dev-turn-shared-secret";
    public string TurnHost { get; init; } = "localhost";
    public int TurnPort { get; init; } = 3478;
    public int TurnTlsPort { get; init; } = 5349;
    public bool TurnUseTls { get; init; }
    public string ServiceName { get; init; } = "kzys-control-plane";
    public string JanusAdminSecret { get; init; } = "dev-janus-admin-secret";
    public string JanusVideoRoomKey { get; init; } = "dev-videoroom-admin-key";
    public IReadOnlyList<JanusNodeConfig> JanusNodes { get; init; } = Array.Empty<JanusNodeConfig>();

    public static AppConfig Load()
    {
        return new AppConfig
        {
            Port = Env("PORT", "4000"),
            RedisUrl = Env("REDIS_URL", "redis://redis:6379"),
            JwtSigningSecret = Env("JWT_SIGNING_SECRET", "dev-jwt-signing-secret"),
            CorsOrigin = Env("CORS_ORIGIN", "*"),
            MaxRoomParticipants = int.TryParse(Env("MAX_ROOM_PARTICIPANTS", "10"), out var max) ? max : 10,
            WebinarEnterListeners = int.TryParse(Env("WEBINAR_ENTER_LISTENERS", "12"), out var wel) ? wel : 12,
            WebinarEnterRatio = double.TryParse(Env("WEBINAR_ENTER_RATIO", "2.0"), out var wer) ? wer : 2.0,
            WebinarExitListeners = int.TryParse(Env("WEBINAR_EXIT_LISTENERS", "8"), out var wex) ? wex : 8,
            InteractiveMaxPublishers = int.TryParse(Env("INTERACTIVE_MAX_PUBLISHERS", "50"), out var imp) ? imp : 50,
            WebinarMaxPublishers = int.TryParse(Env("WEBINAR_MAX_PUBLISHERS", "8"), out var wmp) ? wmp : 8,
            MediaCoreUrl = Env("MEDIA_CORE_URL", "http://media-core:8090"),
            TurnSharedSecret = Env("TURN_SHARED_SECRET", "dev-turn-shared-secret"),
            TurnHost = Env("TURN_HOST", "localhost"),
            TurnPort = int.TryParse(Env("TURN_PORT", "3478"), out var tp) ? tp : 3478,
            TurnTlsPort = int.TryParse(Env("TURN_TLS_PORT", "5349"), out var ttp) ? ttp : 5349,
            TurnUseTls = bool.TryParse(Env("TURN_USE_TLS", "false"), out var tls) && tls,
            ServiceName = Env("SERVICE_NAME", "kzys-control-plane"),
            JanusAdminSecret = Env("JANUS_ADMIN_SECRET", "dev-janus-admin-secret"),
            JanusVideoRoomKey = Env("JANUS_VIDEOROOM_ADMIN_KEY", "dev-videoroom-admin-key"),
            JanusNodes = ParseJanusNodes(Env("JANUS_NODES", "")),
        };
    }

    private static string Env(string key, string fallback)
    {
        var value = Environment.GetEnvironmentVariable(key);
        return string.IsNullOrWhiteSpace(value) ? fallback : value;
    }

    private static IReadOnlyList<JanusNodeConfig> ParseJanusNodes(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return Array.Empty<JanusNodeConfig>();
        var nodes = new List<JanusNodeConfig>();
        foreach (var entry in raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var parts = entry.Split('|', StringSplitOptions.TrimEntries);
            if (parts.Length < 4) continue;
            nodes.Add(new JanusNodeConfig
            {
                Id = parts[0],
                AdminUrl = parts[1],
                InternalWsUrl = parts[2],
                PublicWsUrl = parts[3],
            });
        }
        return nodes;
    }
}
