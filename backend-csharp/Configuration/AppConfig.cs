namespace Kzys.Backend.Configuration;

public sealed class AppConfig
{
    public string Port { get; init; } = "4000";
    public string RedisUrl { get; init; } = "redis://redis:6379";
    public string JwtSigningSecret { get; init; } = "dev-jwt-signing-secret";
    public string CorsOrigin { get; init; } = "*";
    public int MaxRoomParticipants { get; init; } = 10000;
    public int WebinarEnterListeners { get; init; } = 45;
    public double WebinarEnterRatio { get; init; } = 2.0;
    public int WebinarExitListeners { get; init; } = 20;
    public int InteractiveMaxPublishers { get; init; } = 50;
    public int WebinarMaxPublishers { get; init; } = 16;
    /// <summary>Above this count, WS uses count-only events instead of per-join fanout.</summary>
    public int LargeRoomEventThreshold { get; init; } = 200;
    /// <summary>Default page size for GET /participants.</summary>
    public int ParticipantsPageSizeDefault { get; init; } = 50;
    /// <summary>Max participants returned by search scan (large rooms).</summary>
    public int ParticipantsSearchScanCap { get; init; } = 3000;
    public string TurnSharedSecret { get; init; } = "dev-turn-shared-secret";
    public string TurnHost { get; init; } = "localhost";
    public int TurnPort { get; init; } = 3478;
    public int TurnTlsPort { get; init; } = 5349;
    public bool TurnUseTls { get; init; }
    public string ServiceName { get; init; } = "kzys-control-plane";
    public string LiveKitApiKey { get; init; } = "devkey";
    public string LiveKitApiSecret { get; init; } = "dev-livekit-local-secret-32chars-min";
    // Browser-facing LiveKit WS URL (rewritten per client host at join time).
    public string LiveKitPublicUrl { get; init; } = "ws://localhost:7880";

    public static AppConfig Load()
    {
        return new AppConfig
        {
            Port = Env("PORT", "4000"),
            RedisUrl = Env("REDIS_URL", "redis://redis:6379"),
            JwtSigningSecret = Env("JWT_SIGNING_SECRET", "dev-jwt-signing-secret"),
            CorsOrigin = Env("CORS_ORIGIN", "*"),
            MaxRoomParticipants = int.TryParse(Env("MAX_ROOM_PARTICIPANTS", "10000"), out var max) ? max : 10000,
            WebinarEnterListeners = int.TryParse(Env("WEBINAR_ENTER_LISTENERS", "45"), out var wel) ? wel : 45,
            WebinarEnterRatio = double.TryParse(Env("WEBINAR_ENTER_RATIO", "2.0"), out var wer) ? wer : 2.0,
            WebinarExitListeners = int.TryParse(Env("WEBINAR_EXIT_LISTENERS", "20"), out var wex) ? wex : 20,
            InteractiveMaxPublishers = int.TryParse(Env("INTERACTIVE_MAX_PUBLISHERS", "50"), out var imp) ? imp : 50,
            WebinarMaxPublishers = int.TryParse(Env("WEBINAR_MAX_PUBLISHERS", "16"), out var wmp) ? wmp : 16,
            LargeRoomEventThreshold = int.TryParse(Env("LARGE_ROOM_EVENT_THRESHOLD", "200"), out var lrt) ? lrt : 200,
            ParticipantsPageSizeDefault = int.TryParse(Env("PARTICIPANTS_PAGE_SIZE", "50"), out var pps) ? pps : 50,
            ParticipantsSearchScanCap = int.TryParse(Env("PARTICIPANTS_SEARCH_SCAN_CAP", "3000"), out var psc) ? psc : 3000,
            TurnSharedSecret = Env("TURN_SHARED_SECRET", "dev-turn-shared-secret"),
            TurnHost = Env("TURN_HOST", "localhost"),
            TurnPort = int.TryParse(Env("TURN_PORT", "3478"), out var tp) ? tp : 3478,
            TurnTlsPort = int.TryParse(Env("TURN_TLS_PORT", "5349"), out var ttp) ? ttp : 5349,
            TurnUseTls = bool.TryParse(Env("TURN_USE_TLS", "false"), out var tls) && tls,
            ServiceName = Env("SERVICE_NAME", "kzys-control-plane"),
            LiveKitApiKey = Env("LIVEKIT_API_KEY", "devkey"),
            LiveKitApiSecret = Env("LIVEKIT_API_SECRET", "dev-livekit-local-secret-32chars-min"),
            LiveKitPublicUrl = Env("LIVEKIT_PUBLIC_URL", "ws://localhost:7880"),
        };
    }

    private static string Env(string key, string fallback)
    {
        var value = Environment.GetEnvironmentVariable(key);
        return string.IsNullOrWhiteSpace(value) ? fallback : value;
    }
}
