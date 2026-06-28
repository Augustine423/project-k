using Kzys.Backend.Models;
using Microsoft.EntityFrameworkCore;

namespace Kzys.Backend.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<RoomPlan> RoomPlans => Set<RoomPlan>();
    public DbSet<UserSubscription> UserSubscriptions => Set<UserSubscription>();
    public DbSet<RoomPurchase> RoomPurchases => Set<RoomPurchase>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<RoomPlan>(e =>
        {
            e.HasKey(p => p.PlanId);
            e.Property(p => p.PricePerRoom).HasPrecision(10, 2);
            e.Property(p => p.MonthlyPrice).HasPrecision(10, 2);
            e.Property(p => p.AnnualPrice).HasPrecision(10, 2);
        });

        modelBuilder.Entity<UserSubscription>(e =>
        {
            e.HasKey(s => s.Id);
            e.HasIndex(s => new { s.UserId, s.PlanId, s.IsActive });
            e.Property(s => s.AmountPaid).HasPrecision(10, 2);
            e.HasOne(s => s.Plan).WithMany().HasForeignKey(s => s.PlanId);
        });

        modelBuilder.Entity<RoomPurchase>(e =>
        {
            e.HasKey(p => p.Id);
            e.HasIndex(p => p.RoomId).IsUnique();
            e.Property(p => p.AmountPaid).HasPrecision(10, 2);
            e.HasOne(p => p.Plan).WithMany().HasForeignKey(p => p.PlanId);
        });
    }
}
