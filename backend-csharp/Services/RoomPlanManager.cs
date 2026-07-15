using System.Collections.Immutable;
using Kzys.Backend.Models;

namespace Kzys.Backend.Services;

/// <summary>
/// Thread-safe plan catalog, pricing, margin math, and participant-limit validation.
/// Target retail = ~2× estimated infrastructure cost.
/// </summary>
public sealed class RoomPlanManager
{
    public const string Free = "free";
    public const string Plus100 = "plus100";
    public const string Plus500 = "plus500";
    public const string Plus1000 = "plus1000";
    public const string Plus2000 = "plus2000";
    public const string Plus10000 = "plus10000";

  // Margin model (USD) — baseline $60–100/mo shared across rooms + variable participant-hours.
    public const decimal MonthlyBaselineCostUsd = 70m;
    public const decimal CostPerParticipantHourUsd = 0.003m;
    public const decimal TargetMarginMultiplier = 2.0m;
    public const decimal SubscriptionDiscountRate = 0.20m;
    public const int DefaultRoomDurationHours = 24;
    public const int SubscriptionRoomsPerMonthEquivalent = 4;

    private readonly object _sync = new();
    private ImmutableDictionary<string, RoomPlan> _plansById =
        ImmutableDictionary<string, RoomPlan>.Empty;

    public void LoadPlans(IEnumerable<RoomPlan> plans)
    {
        var map = plans.ToImmutableDictionary(p => p.PlanId, StringComparer.OrdinalIgnoreCase);
        lock (_sync)
        {
            _plansById = map;
        }
    }

    public IReadOnlyList<RoomPlan> GetAllPlans()
    {
        lock (_sync)
        {
            return _plansById.Values.OrderBy(p => p.MaxParticipants).ToList();
        }
    }

    public bool TryGetPlan(string? planId, out RoomPlan plan)
    {
        plan = null!;
        if (string.IsNullOrWhiteSpace(planId))
            return TryGetPlan(Free, out plan);

        lock (_sync)
        {
            return _plansById.TryGetValue(planId.Trim(), out plan!);
        }
    }

    public RoomPlan GetPlan(string planId)
    {
        if (!TryGetPlan(planId, out var plan))
            throw new KeyNotFoundException($"Unknown plan '{planId}'.");
        return plan;
    }

    /// <summary>
    /// Smallest plan that supports the requested participant count.
    /// </summary>
    public RoomPlan ResolvePlanForParticipants(int requestedParticipants)
    {
        if (requestedParticipants <= 0)
            return GetPlan(Free);

        lock (_sync)
        {
            var match = _plansById.Values
                .Where(p => p.MaxParticipants >= requestedParticipants)
                .OrderBy(p => p.MaxParticipants)
                .FirstOrDefault();

            return match ?? _plansById.Values.MaxBy(p => p.MaxParticipants)!;
        }
    }

    public PlanValidationResult ValidateParticipantLimit(string? planId, int requestedParticipants)
    {
        if (!TryGetPlan(planId, out var selected))
            return PlanValidationResult.Fail($"Unknown plan '{planId}'.");

        if (requestedParticipants <= 0)
            requestedParticipants = 1;

        if (requestedParticipants > selected.MaxParticipants)
        {
            var required = ResolvePlanForParticipants(requestedParticipants);
            return PlanValidationResult.Fail(
                $"Plan '{selected.Name}' allows up to {selected.MaxParticipants} participants. " +
                $"Requested {requestedParticipants} requires '{required.Name}'.",
                requiredPlanId: required.PlanId,
                requiresUpgrade: true);
        }

        if (!selected.IsPaid && requestedParticipants > 30)
        {
            var required = ResolvePlanForParticipants(requestedParticipants);
            return PlanValidationResult.Fail(
                $"Free tier allows up to 30 participants. Requested {requestedParticipants} requires a paid plan.",
                requiredPlanId: required.PlanId,
                requiresUpgrade: true);
        }

        return PlanValidationResult.Ok(selected);
    }

    /// <summary>
    /// Per-room price scaled by 24h blocks (default 24h included in PricePerRoom).
    /// </summary>
    public decimal CalculateRoomPrice(RoomPlan plan, int durationHours = DefaultRoomDurationHours)
    {
        var blocks = Math.Max(1, (int)Math.Ceiling(durationHours / (double)DefaultRoomDurationHours));
        return Math.Round(plan.PricePerRoom * blocks, 2, MidpointRounding.AwayFromZero);
    }

    public decimal CalculateRoomPrice(string planId, int durationHours = DefaultRoomDurationHours)
        => CalculateRoomPrice(GetPlan(planId), durationHours);

    /// <summary>
    /// Subscription monthly = (4 room purchases × per-room price) × 0.8 (20% discount).
    /// Annual = monthly × 12 × 0.8 (another 20% vs paying monthly).
    /// </summary>
    public static (decimal Monthly, decimal Annual) CalculateSubscriptionPrices(decimal pricePerRoom)
    {
        var monthly = Math.Round(
            pricePerRoom * SubscriptionRoomsPerMonthEquivalent * (1m - SubscriptionDiscountRate),
            2,
            MidpointRounding.AwayFromZero);

        var annual = Math.Round(
            monthly * 12m * (1m - SubscriptionDiscountRate),
            2,
            MidpointRounding.AwayFromZero);

        return (monthly, annual);
    }

    public static RoomPlan BuildCatalogPlan(
        string planId,
        string name,
        int maxParticipants,
        decimal pricePerRoom,
        bool isPaid,
        string description)
    {
        var (monthly, annual) = isPaid
            ? CalculateSubscriptionPrices(pricePerRoom)
            : (0m, 0m);

        return new RoomPlan
        {
            PlanId = planId,
            Name = name,
            MaxParticipants = maxParticipants,
            PricePerRoom = pricePerRoom,
            MonthlyPrice = monthly,
            AnnualPrice = annual,
            IsPaid = isPaid,
            Description = description,
        };
    }

    public static IReadOnlyList<RoomPlan> CreateDefaultCatalog() =>
    [
        BuildCatalogPlan(Free, "Free", 30, 0m, false,
            "Up to 30 participants per room — no charge"),
        BuildCatalogPlan(Plus100, "Plus 100", 100, 4.99m, true,
            "Up to 100 participants — $4.99 per room (24h)"),
        BuildCatalogPlan(Plus500, "Plus 500", 500, 14.99m, true,
            "Up to 500 participants — $14.99 per room (24h)"),
        BuildCatalogPlan(Plus1000, "Plus 1000", 1000, 24.99m, true,
            "Up to 1000 participants — $24.99 per room (24h)"),
        BuildCatalogPlan(Plus2000, "Plus 2000", 2000, 39.99m, true,
            "Up to 2000 participants — $39.99 per room (24h)"),
        BuildCatalogPlan(Plus10000, "Plus 10000", 10000, 99.99m, true,
            "Up to 10,000 participants (webinar-scale) — $99.99 per room (24h)"),
    ];

    /// <summary>
    /// Estimated infra cost for margin checks (50% average room fill assumption).
    /// </summary>
    public decimal EstimateInfrastructureCost(int maxParticipants, int durationHours = DefaultRoomDurationHours)
    {
        var baselineShare = Math.Round(MonthlyBaselineCostUsd / 30m, 4); // ~30 active rooms/mo
        var fillFactor = 0.5m;
        var participantHours = maxParticipants * durationHours * fillFactor;
        return Math.Round(
            baselineShare + (participantHours * CostPerParticipantHourUsd),
            4,
            MidpointRounding.AwayFromZero);
    }

    public MarginReport GetMarginReport(RoomPlan plan, int durationHours = DefaultRoomDurationHours)
    {
        var retail = CalculateRoomPrice(plan, durationHours);
        var cost = EstimateInfrastructureCost(plan.MaxParticipants, durationHours);
        var ratio = cost > 0 ? Math.Round(retail / cost, 2) : 0m;
        return new MarginReport(plan.PlanId, retail, cost, ratio, ratio >= TargetMarginMultiplier);
    }

    public string BuildPricingUrl(string planId)
    {
        var baseUrl = Environment.GetEnvironmentVariable("KZYS_PRICING_BASE_URL") ?? "/pricing";
        return $"{baseUrl.TrimEnd('/')}?plan={Uri.EscapeDataString(planId)}";
    }
}

public sealed record PlanValidationResult(
    bool IsValid,
    string? Error,
    string? RequiredPlanId,
    bool RequiresUpgrade,
    RoomPlan? Plan)
{
    public static PlanValidationResult Ok(RoomPlan plan) =>
        new(true, null, null, false, plan);

    public static PlanValidationResult Fail(string error, string? requiredPlanId = null, bool requiresUpgrade = false) =>
        new(false, error, requiredPlanId, requiresUpgrade, null);
}

public sealed record MarginReport(
    string PlanId,
    decimal RetailPrice,
    decimal EstimatedCost,
    decimal MarginRatio,
    bool MeetsTarget);

public sealed record RoomPriceQuote(
    string PlanId,
    string PlanName,
    int MaxParticipants,
    int DurationHours,
    decimal PricePerRoom,
    decimal TotalPrice,
    decimal MonthlySubscriptionPrice,
    decimal AnnualSubscriptionPrice,
    string PricingUrl,
    MarginReport Margin);
