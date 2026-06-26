using Kzys.Backend.Hubs;
using Microsoft.AspNetCore.RateLimiting;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Rate limiting — 10 token requests per IP per minute to prevent abuse
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

// Configure CORS — restrict to the origin set via CORS_ORIGIN env var in production
var allowedOrigin = Environment.GetEnvironmentVariable("CORS_ORIGIN");
builder.Services.AddCors(options =>
{
    options.AddPolicy("CorsPolicy", policy =>
    {
        if (string.IsNullOrWhiteSpace(allowedOrigin))
        {
            policy.AllowAnyHeader().AllowAnyMethod().AllowAnyOrigin();
        }
        else
        {
            policy.AllowAnyHeader()
                  .AllowAnyMethod()
                  .WithOrigins(allowedOrigin)
                  .AllowCredentials();
        }
    });
});

// Add SignalR with optional Redis backplane for multi-replica support
var redisUrl = Environment.GetEnvironmentVariable("REDIS_URL");
var signalR = builder.Services.AddSignalR(options =>
{
    options.EnableDetailedErrors = true;
});
if (!string.IsNullOrWhiteSpace(redisUrl))
{
    signalR.AddStackExchangeRedis(redisUrl);
}

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("CorsPolicy");
app.UseRateLimiter();
app.UseAuthorization();

app.MapControllers();

// Map SignalR Hubs
app.MapHub<MeetingHub>("/meetinghub");
app.MapHub<MeetingHub>("/api/meetinghub");

// Health check endpoint
app.MapGet("/", () => "KZYS C# Backend Signaling Server Running!");

app.Run();
