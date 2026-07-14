using Kzys.Backend.Data;
using Kzys.Backend.Services;
using Microsoft.EntityFrameworkCore;

namespace Kzys.Backend.Services;

public static class DatabaseSeeder
{
    public static async Task InitializeAsync(IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var planManager = scope.ServiceProvider.GetRequiredService<RoomPlanManager>();

        await db.Database.EnsureCreatedAsync();

        if (!await db.RoomPlans.AnyAsync())
        {
            var catalog = RoomPlanManager.CreateDefaultCatalog();
            db.RoomPlans.AddRange(catalog);
            await db.SaveChangesAsync();
        }

        var plans = await db.RoomPlans.AsNoTracking().ToListAsync();
        planManager.LoadPlans(plans);
    }
}
