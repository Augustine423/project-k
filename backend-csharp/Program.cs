using Kzys.Backend.Configuration;
using Kzys.Backend.Data;
using Kzys.Backend.Models;
using Kzys.Backend.Services;
using Kzys.Backend.Realtime;
using Microsoft.EntityFrameworkCore;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);
var config = AppConfig.Load();

builder.WebHost.UseKestrel(options =>
{
    options.Limits.RequestHeadersTimeout = TimeSpan.FromSeconds(120);
    options.Limits.KeepAliveTimeout = TimeSpan.FromSeconds(120);
    options.ListenAnyIP(int.Parse(config.Port));
});

builder.Services.AddSingleton(config);
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var redisUrl = config.RedisUrl.Replace("redis://", "", StringComparison.OrdinalIgnoreCase);
builder.Services.AddSingleton<IConnectionMultiplexer>(_ =>
{
    var options = ConfigurationOptions.Parse(redisUrl);
    options.AbortOnConnectFail = false;
    options.ConnectRetry = 5;
    options.ReconnectRetryPolicy = new ExponentialRetry(5000);
    return ConnectionMultiplexer.Connect(options);
});
builder.Services.AddSingleton<ControlPlaneStore>();
builder.Services.AddSingleton<RoomWsPresenceStore>();
builder.Services.AddSingleton<JwtTokenService>(_ => new JwtTokenService(config.JwtSigningSecret));
builder.Services.AddSingleton<TurnCredentialService>(_ =>
    new TurnCredentialService(config.TurnSharedSecret, config.TurnHost, config.TurnPort, config.TurnTlsPort, config.TurnUseTls));

builder.Services.AddSingleton<LiveKitTokenService>(_ =>
    new LiveKitTokenService(config.LiveKitApiKey, config.LiveKitApiSecret));
builder.Services.AddSingleton<RoomService>();
builder.Services.AddSingleton<RoomModeService>();
builder.Services.AddSingleton<RoomEventHub>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<RoomEventHub>());
builder.Services.AddSingleton<RoomPresenceService>();

builder.Services.AddSingleton<RoomPlanManager>();
builder.Services.AddScoped<ISubscriptionService, SubscriptionService>();

var dbPath = Environment.GetEnvironmentVariable("KZYS_DB_PATH")
    ?? Path.Combine(AppContext.BaseDirectory, "data", "kzys.db");
var databaseUrl = Environment.GetEnvironmentVariable("DATABASE_URL");
builder.Services.AddDbContext<AppDbContext>(options =>
{
    if (!string.IsNullOrWhiteSpace(databaseUrl))
        options.UseNpgsql(databaseUrl);
    else
    {
        Directory.CreateDirectory(Path.GetDirectoryName(dbPath)!);
        options.UseSqlite($"Data Source={dbPath}");
    }
});

builder.Services.AddCors(options =>
{
    options.AddPolicy("CorsPolicy", policy =>
    {
        if (config.CorsOrigin == "*")
            policy.AllowAnyHeader().AllowAnyMethod().AllowAnyOrigin();
        else
            policy.AllowAnyHeader().AllowAnyMethod()
                .WithOrigins(config.CorsOrigin.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                .AllowCredentials();
    });
});

var app = builder.Build();

await DatabaseSeeder.InitializeAsync(app.Services);

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("CorsPolicy");
app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(30) });

app.MapControllers();
app.MapGet("/", () => "KZYS C# Control Plane Running");

var hub = app.Services.GetRequiredService<RoomEventHub>();
var jwt = app.Services.GetRequiredService<JwtTokenService>();
var presence = app.Services.GetRequiredService<RoomPresenceService>();
var wsLogger = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("RoomWebSocket");

hub.ClientMessage += (roomId, participantId, payload) =>
    RoomWebSocketHandler.HandleClientMessage(hub, roomId, participantId, payload, wsLogger);

app.Map("/ws/rooms/{roomId}", async (HttpContext ctx, string roomId, RoomEventHub roomHub) =>
{
    if (!ctx.WebSockets.IsWebSocketRequest)
    {
        ctx.Response.StatusCode = StatusCodes.Status400BadRequest;
        return;
    }

    var token = ctx.Request.Query["token"].ToString();
    ParticipantClaims claims;
    try
    {
        claims = jwt.Verify(token);
    }
    catch
    {
        ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
        await ctx.Response.WriteAsJsonAsync(new { error = "invalid or mismatched token" });
        return;
    }

    if (claims.RoomId != roomId)
    {
        ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
        await ctx.Response.WriteAsJsonAsync(new { error = "invalid or mismatched token" });
        return;
    }

    presence.CancelPendingLeave(roomId, claims.ParticipantId);
    using var socket = await ctx.WebSockets.AcceptWebSocketAsync();
    await roomHub.HandleConnectionAsync(socket, roomId, claims.ParticipantId, ctx.RequestAborted);
});

app.Run();
