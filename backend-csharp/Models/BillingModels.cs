namespace Kzys.Backend.Models;

/// <summary>
/// Catalog row for a room capacity tier (seeded on startup).
/// </summary>
public class RoomPlan
{
    public string PlanId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int MaxParticipants { get; set; }
    public decimal PricePerRoom { get; set; }
    public decimal MonthlyPrice { get; set; }
    public decimal AnnualPrice { get; set; }
    public bool IsPaid { get; set; }
    public string Description { get; set; } = string.Empty;
}

public enum SubscriptionBillingPeriod
{
    Monthly = 0,
    Annual = 1,
}

public enum BillingMode
{
    PerRoom = 0,
    Subscription = 1,
}

/// <summary>
/// Active or historical subscription for a user at a specific plan tier.
/// </summary>
public class UserSubscription
{
    public Guid Id { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string PlanId { get; set; } = string.Empty;
    public SubscriptionBillingPeriod Period { get; set; }
    public decimal AmountPaid { get; set; }
    public DateTime StartsAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public bool IsActive { get; set; }
    public string? PaymentReference { get; set; }
    public DateTime CreatedAt { get; set; }

    public RoomPlan? Plan { get; set; }
}

/// <summary>
/// Pay-per-room purchase record (24h room by default).
/// </summary>
public class RoomPurchase
{
    public Guid Id { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string RoomId { get; set; } = string.Empty;
    public string PlanId { get; set; } = string.Empty;
    public decimal AmountPaid { get; set; }
    public int DurationHours { get; set; }
    public DateTime PurchasedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public string? PaymentReference { get; set; }

    public RoomPlan? Plan { get; set; }
}
