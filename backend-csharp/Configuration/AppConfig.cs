namespace Kzys.Backend.Configuration;

public sealed class AppConfig
{
    public string Port { get; init; } = "4000";
    public string RedisUrl { get; init; } = "redis://redis:6379";
    public string JwtSigningSecret { get; init; } = "dev-jwt-signing-secret";
    public string CorsOrigin { get; init; } = "*";
    public int MaxRoomParticipants { get; init; } = 10000;
    public int WebinarEnterListeners { get; init; } = 10000;
    public double WebinarEnterRatio { get; init; } = 8.0;
    public int WebinarExitListeners { get; init; } = 50;
    public int InteractiveMaxPublishers { get; init; } = 10000;
    public int WebinarMaxPublishers { get; init; } = 50;
    /// <summary>Above this count, WS uses count-only events instead of per-join fanout.</summary>
    public int LargeRoomEventThreshold { get; init; } = 500;
    /// <summary>Default page size for GET /participants.</summary>
    public int ParticipantsPageSizeDefault { get; init; } = 50;
    /// <summary>Max participants returned by search scan (large rooms).</summary>
    public int ParticipantsSearchScanCap { get; init; } = 10000;
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
    /// <summary>Server-to-server LiveKit API base (permission updates). Defaults to the public URL with http(s).</summary>
    public string LiveKitApiUrl { get; init; } = "";
    /// <summary>Rooms larger than this start view-only: attendees need a host promotion to publish.</summary>
    public int ViewOnlyDefaultThreshold { get; init; } = 100;
    /// <summary>Joins beyond this count are refused (or sent to HLS) to protect the single-node SFU.</summary>
    public int MaxWebRtcParticipants { get; init; } = 1500;
    /// <summary>When set, attendees past MaxWebRtcParticipants get an HLS playback URL under this base.</summary>
    public string HlsBaseUrl { get; init; } = "";
    public int CreateRateLimitPerMinute { get; init; } = 10;
    public int JoinRateLimitPerMinute { get; init; } = 600;
    public int JoinRoomRateLimitPerMinute { get; init; } = 3000;
    public int PromoteRoomRateLimitPerMinute { get; init; } = 300;
    public int PromoteRateLimitPerMinute { get; init; } = 60;
    public int MediaRateLimitPerMinute { get; init; } = 120;
    /// <summary>Honour X-Forwarded-For (only enable behind a trusted ingress).</summary>
    public bool TrustForwardedHeaders { get; init; }

    public static AppConfig Load()
    {
        return new AppConfig
        {
            Port = Env("PORT", "4000"),
            RedisUrl = Env("REDIS_URL", "redis://redis:6379"),
            JwtSigningSecret = Env("JWT_SIGNING_SECRET", "dev-jwt-signing-secret"),
            CorsOrigin = Env("CORS_ORIGIN", "*"),
            MaxRoomParticipants = int.TryParse(Env("MAX_ROOM_PARTICIPANTS", "10000"), out var max) ? max : 10000,
            WebinarEnterListeners = int.TryParse(Env("WEBINAR_ENTER_LISTENERS", "10000"), out var wel) ? wel : 10000,
            WebinarEnterRatio = double.TryParse(Env("WEBINAR_ENTER_RATIO", "8.0"), out var wer) ? wer : 8.0,
            WebinarExitListeners = int.TryParse(Env("WEBINAR_EXIT_LISTENERS", "50"), out var wex) ? wex : 50,
            InteractiveMaxPublishers = int.TryParse(Env("INTERACTIVE_MAX_PUBLISHERS", "10000"), out var imp) ? imp : 10000,
            WebinarMaxPublishers = int.TryParse(Env("WEBINAR_MAX_PUBLISHERS", "50"), out var wmp) ? wmp : 50,
            LargeRoomEventThreshold = int.TryParse(Env("LARGE_ROOM_EVENT_THRESHOLD", "500"), out var lrt) ? lrt : 500,
            ParticipantsPageSizeDefault = int.TryParse(Env("PARTICIPANTS_PAGE_SIZE", "50"), out var pps) ? pps : 50,
            ParticipantsSearchScanCap = int.TryParse(Env("PARTICIPANTS_SEARCH_SCAN_CAP", "10000"), out var psc) ? psc : 10000,
            TurnSharedSecret = Env("TURN_SHARED_SECRET", "dev-turn-shared-secret"),
            TurnHost = Env("TURN_HOST", "localhost"),
            TurnPort = int.TryParse(Env("TURN_PORT", "3478"), out var tp) ? tp : 3478,
            TurnTlsPort = int.TryParse(Env("TURN_TLS_PORT", "5349"), out var ttp) ? ttp : 5349,
            TurnUseTls = bool.TryParse(Env("TURN_USE_TLS", "false"), out var tls) && tls,
            ServiceName = Env("SERVICE_NAME", "kzys-control-plane"),
            LiveKitApiKey = Env("LIVEKIT_API_KEY", "devkey"),
            LiveKitApiSecret = Env("LIVEKIT_API_SECRET", "dev-livekit-local-secret-32chars-min"),
            LiveKitPublicUrl = Env("LIVEKIT_PUBLIC_URL", "ws://localhost:7880"),
            LiveKitApiUrl = Env("LIVEKIT_API_URL", ""),
            ViewOnlyDefaultThreshold = IntEnv("VIEW_ONLY_DEFAULT_THRESHOLD", 100),
            MaxWebRtcParticipants = IntEnv("MAX_WEBRTC_PARTICIPANTS", 1500),
            HlsBaseUrl = Env("HLS_BASE_URL", ""),
            CreateRateLimitPerMinute = IntEnv("RATE_LIMIT_CREATE_PER_MIN", 10),
            JoinRateLimitPerMinute = IntEnv("RATE_LIMIT_JOIN_PER_MIN", 600),
            JoinRoomRateLimitPerMinute = IntEnv("RATE_LIMIT_JOIN_ROOM_PER_MIN", 3000),
            PromoteRoomRateLimitPerMinute = IntEnv("RATE_LIMIT_PROMOTE_ROOM_PER_MIN", 300),
            PromoteRateLimitPerMinute = IntEnv("RATE_LIMIT_PROMOTE_PER_MIN", 60),
            MediaRateLimitPerMinute = IntEnv("RATE_LIMIT_MEDIA_PER_MIN", 120),
            TrustForwardedHeaders = bool.TryParse(Env("TRUST_FORWARDED_HEADERS", "false"), out var tfh) && tfh,
        };
    }

    private static int IntEnv(string key, int fallback)
        => int.TryParse(Env(key, fallback.ToString()), out var v) && v > 0 ? v : fallback;

    private static string Env(string key, string fallback)
    {
        var value = Environment.GetEnvironmentVariable(key);
        return string.IsNullOrWhiteSpace(value) ? fallback : value;
    }
}
