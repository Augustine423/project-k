using Kzys.Backend.Configuration;
using Kzys.Backend.Data;
using Kzys.Backend.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Kzys.Backend.Controllers;

[ApiController]
public sealed class HealthController : ControllerBase
{
    private readonly ControlPlaneStore _store;
    private readonly AppConfig _config;
    private readonly IServiceProvider _services;

    public HealthController(ControlPlaneStore store, AppConfig config, IServiceProvider services)
    {
        _store = store;
        _config = config;
        _services = services;
    }

    [HttpGet("/health")]
    public IActionResult Health() =>
        Ok(new { status = "healthy", instance = InstanceIdentity.Id, service = _config.ServiceName });

    [HttpGet("/ready")]
    public async Task<IActionResult> Ready(CancellationToken ct)
    {
        try
        {
            await _store.PingAsync(ct);

            var databaseUrl = Environment.GetEnvironmentVariable("DATABASE_URL");
            if (!string.IsNullOrWhiteSpace(databaseUrl))
            {
                using var scope = _services.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                if (!await db.Database.CanConnectAsync(ct))
                    throw new InvalidOperationException("postgres not reachable");
            }

            return Ok(new
            {
                status = "ready",
                instance = InstanceIdentity.Id,
                service = _config.ServiceName,
                postgres = string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("DATABASE_URL")) ? "sqlite" : "postgres",
            });
        }
        catch
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                status = "not ready",
                instance = InstanceIdentity.Id,
            });
        }
    }
}
