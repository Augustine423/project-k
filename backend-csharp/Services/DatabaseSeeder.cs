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
        await EnsureUsersTableAsync(db);

        if (!await db.RoomPlans.AnyAsync())
        {
            var catalog = RoomPlanManager.CreateDefaultCatalog();
            db.RoomPlans.AddRange(catalog);
            await db.SaveChangesAsync();
        }

        var plans = await db.RoomPlans.AsNoTracking().ToListAsync();
        planManager.LoadPlans(plans);
    }

    /// <summary>
    /// EnsureCreated is a no-op when the DB already exists — add Users for upgrades.
    /// </summary>
    private static async Task EnsureUsersTableAsync(AppDbContext db)
    {
        if (db.Database.IsSqlite())
        {
            await db.Database.ExecuteSqlRawAsync("""
                CREATE TABLE IF NOT EXISTS "Users" (
                    "Id" TEXT NOT NULL CONSTRAINT "PK_Users" PRIMARY KEY,
                    "Email" TEXT NOT NULL,
                    "PasswordHash" TEXT NOT NULL,
                    "Username" TEXT NULL,
                    "FullName" TEXT NULL,
                    "CreatedAt" TEXT NOT NULL,
                    "UpdatedAt" TEXT NOT NULL
                );
                """);
            await db.Database.ExecuteSqlRawAsync(
                """CREATE UNIQUE INDEX IF NOT EXISTS "IX_Users_Email" ON "Users" ("Email");""");
            await db.Database.ExecuteSqlRawAsync(
                """CREATE INDEX IF NOT EXISTS "IX_Users_Username" ON "Users" ("Username");""");
            return;
        }

        if (db.Database.IsNpgsql())
        {
            await db.Database.ExecuteSqlRawAsync("""
                CREATE TABLE IF NOT EXISTS "Users" (
                    "Id" text NOT NULL,
                    "Email" character varying(320) NOT NULL,
                    "PasswordHash" text NOT NULL,
                    "Username" character varying(64) NULL,
                    "FullName" character varying(120) NULL,
                    "CreatedAt" timestamp with time zone NOT NULL,
                    "UpdatedAt" timestamp with time zone NOT NULL,
                    CONSTRAINT "PK_Users" PRIMARY KEY ("Id")
                );
                """);
            await db.Database.ExecuteSqlRawAsync(
                """CREATE UNIQUE INDEX IF NOT EXISTS "IX_Users_Email" ON "Users" ("Email");""");
            await db.Database.ExecuteSqlRawAsync(
                """CREATE INDEX IF NOT EXISTS "IX_Users_Username" ON "Users" ("Username");""");
        }
    }
}
