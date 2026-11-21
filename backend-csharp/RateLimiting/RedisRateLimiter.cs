using System.Security.Cryptography;
using System.Text;
using Kzys.Backend.Configuration;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using StackExchange.Redis;

namespace Kzys.Backend.RateLimiting;

/// <summary>Fixed-window counters in Redis so limits are shared by every control-plane pod.</summary>
public sealed class RedisRateLimiter
{
    private const string Script = """
        local c = redis.call('INCR', KEYS[1])
        if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
        return {c, redis.call('TTL', KEYS[1])}
        """;

    private readonly IDatabase _db;
    private readonly ILogger<RedisRateLimiter> _log;

    public RedisRateLimiter(IConnectionMultiplexer redis, ILogger<RedisRateLimiter> log)
    {
        _db = redis.GetDatabase();
        _log = log;
    }

    /// <returns>Seconds to wait when over the limit, otherwise null. Fails open if Redis is unavailable.</returns>
    public async Task<int?> HitAsync(string key, int limit, int windowSeconds = 60)
    {
        if (limit <= 0) return null;
        try
        {
            var res = (RedisResult[])(await _db.ScriptEvaluateAsync(
                Script, [(RedisKey)("rl:" + key)], [windowSeconds]))!;
            var count = (long)res[0];
            var ttl = (long)res[1];
            return count > limit ? (int)Math.Max(1, ttl) : null;
        }
        catch (RedisException ex)
        {
            _log.LogWarning(ex, "rate limiter unavailable, allowing request");
            return null;
        }
    }
}

[AttributeUsage(AttributeTargets.Method)]
public sealed class RedisRateLimitAttribute : Attribute, IAsyncActionFilter
{
    private readonly string _policy;
    public RedisRateLimitAttribute(string policy) => _policy = policy;

    public async Task OnActionExecutionAsync(ActionExecutingContext ctx, ActionExecutionDelegate next)
    {
        var sp = ctx.HttpContext.RequestServices;
        var limiter = sp.GetRequiredService<RedisRateLimiter>();
        var cfg = sp.GetRequiredService<AppConfig>();
        var http = ctx.HttpContext;
        var room = ctx.RouteData.Values.TryGetValue("roomId", out var r) ? r?.ToString() ?? "" : "";
        var who = Identity(http);

        var checks = _policy switch
        {
            "create" => new[] { (_policy + ":" + who, cfg.CreateRateLimitPerMinute) },
            // Per-IP is generous (shared NAT / event venues); the per-room limit is the real flood guard.
            "join" => new[]
            {
                ($"join:ip:{who}", cfg.JoinRateLimitPerMinute),
                ($"join:room:{room}", cfg.JoinRoomRateLimitPerMinute),
            },
            "promote" => new[]
            {
                ($"promote:{who}", cfg.PromoteRateLimitPerMinute),
                ($"promote:room:{room}", cfg.PromoteRoomRateLimitPerMinute),
            },
            _ => new[] { ($"{_policy}:{who}", cfg.MediaRateLimitPerMinute) },
        };

        foreach (var (key, limit) in checks)
        {
            var retry = await limiter.HitAsync(key, limit);
            if (retry is null) continue;
            http.Response.Headers.RetryAfter = retry.Value.ToString();
            ctx.Result = new ObjectResult(new { error = "too many requests" })
            {
                StatusCode = StatusCodes.Status429TooManyRequests,
            };
            return;
        }
        await next();
    }

    private static string Identity(HttpContext ctx)
    {
        var auth = ctx.Request.Headers.Authorization.ToString();
        if (!string.IsNullOrEmpty(auth))
            return "t:" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(auth)))[..16];
        return "ip:" + (ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown");
    }
}
