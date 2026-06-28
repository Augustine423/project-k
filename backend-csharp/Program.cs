using Kzys.Backend.Hubs;
using Kzys.Backend.Data;
using Kzys.Backend.Services;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.EntityFrameworkCore;
using StackExchange.Redis;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.UseKestrel(options =>
{
    options.Limits.RequestHeadersTimeout = ServerTimeoutOptions.ReadTimeout;
    options.Limits.KeepAliveTimeout = TimeSpan.FromSeconds(120);
});

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddSingleton<RoomPlanManager>();
builder.Services.AddScoped<ISubscriptionService, SubscriptionService>();

var redisUrl = Environment.GetEnvironmentVariable("REDIS_URL") ?? "kzys-redis:6379";
builder.Services.AddSingleton<IConnectionMultiplexer>(_ =>
    ConnectionMultiplexer.Connect(redisUrl));
builder.Services.AddSingleton<IRoomStore, RedisRoomStore>();
builder.Services.AddSingleton<IChatPresenceStore, RedisChatPresenceStore>();

var dbPath = Environment.GetEnvironmentVariable("KZYS_DB_PATH")
    ?? Path.Combine(AppContext.BaseDirectory, "data", "kzys.db");
Directory.CreateDirectory(Path.GetDirectoryName(dbPath)!);
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite($"Data Source={dbPath}"));

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("token-policy", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(1),
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                QueueLimit = 0,
            }));
});

var allowedOrigin = Environment.GetEnvironmentVariable("CORS_ORIGIN");
builder.Services.AddCors(options =>
{
    options.AddPolicy("CorsPolicy", policy =>
    {
        if (string.IsNullOrWhiteSpace(allowedOrigin))
            policy.AllowAnyHeader().AllowAnyMethod().AllowAnyOrigin();
        else
            policy.AllowAnyHeader().AllowAnyMethod().WithOrigins(allowedOrigin).AllowCredentials();
    });
});

var signalR = builder.Services.AddSignalR(options =>
{
    options.EnableDetailedErrors = builder.Environment.IsDevelopment();
    options.ClientTimeoutInterval = ServerTimeoutOptions.ReadTimeout;
    options.KeepAliveInterval = TimeSpan.FromSeconds(15);
});

signalR.AddStackExchangeRedis(redisUrl, redisOptions =>
{
    redisOptions.Configuration.ChannelPrefix = RedisChannel.Literal("kzys:signalr");
});

var app = builder.Build();

await DatabaseSeeder.InitializeAsync(app.Services);

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("CorsPolicy");
app.UseRateLimiter();
app.UseAuthorization();

app.MapControllers();
app.MapHub<MeetingHub>("/meetinghub");
app.MapHub<MeetingHub>("/api/meetinghub");
app.MapGet("/", () => "KZYS C# Backend Signaling Server Running!");
app.MapGet("/health", () => Results.Ok(new { status = "healthy" }));

app.Run();
