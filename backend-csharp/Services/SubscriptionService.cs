using Kzys.Backend.Data;
using Kzys.Backend.Models;
using Microsoft.EntityFrameworkCore;

namespace Kzys.Backend.Services;

public record RoomCreationRequest(
    string UserId,
    string? PlanId,
    int? RequestedParticipants,
    BillingMode BillingMode,
    int DurationHours,
    string? PaymentReference,
    string? UnlockCode,
    SubscriptionBillingPeriod SubscriptionPeriod = SubscriptionBillingPeriod.Monthly);

public sealed record RoomCreationAuthorization(
    bool IsAuthorized,
    string? Error,
    bool RequiresPayment,
    string? RequiredPlanId,
    RoomPlan? ResolvedPlan,
    decimal? AmountDue,
    string? PricingUrl,
    RoomPriceQuote? Quote,
    string? PaymentReference = null,
    bool MockPayment = false)
{
    public static RoomCreationAuthorization Allowed(
        RoomPlan plan,
        decimal amountDue = 0m,
        string? paymentReference = null,
        bool mockPayment = false) =>
        new(true, null, false, null, plan, amountDue, null, null, paymentReference, mockPayment);

    public static RoomCreationAuthorization PaymentRequired(
        string error,
        RoomPlan requiredPlan,
        RoomPriceQuote quote) =>
        new(false, error, true, requiredPlan.PlanId, requiredPlan, quote.TotalPrice, quote.PricingUrl, quote);
}

public interface ISubscriptionService
{
    Task<RoomCreationAuthorization> AuthorizeRoomCreationAsync(
        RoomCreationRequest request,
        CancellationToken cancellationToken = default);

    Task<UserSubscription?> GetActiveSubscriptionAsync(
        string userId,
        string planId,
        CancellationToken cancellationToken = default);

    Task<RoomPriceQuote> GetQuoteAsync(
        string planId,
        int durationHours = RoomPlanManager.DefaultRoomDurationHours,
        CancellationToken cancellationToken = default);

    Task<UserSubscription> ActivateSubscriptionAsync(
        string userId,
        string planId,
        SubscriptionBillingPeriod period,
        string? paymentReference,
        CancellationToken cancellationToken = default);

    Task RecordRoomPurchaseAsync(
        string userId,
        string roomId,
        string planId,
        int durationHours,
        string? paymentReference,
        CancellationToken cancellationToken = default);
}

public sealed class SubscriptionService : ISubscriptionService
{
    private readonly AppDbContext _db;
    private readonly RoomPlanManager _plans;

    public SubscriptionService(AppDbContext db, RoomPlanManager plans)
    {
        _db = db;
        _plans = plans;
    }

    public async Task<RoomCreationAuthorization> AuthorizeRoomCreationAsync(
        RoomCreationRequest request,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.UserId))
            return new RoomCreationAuthorization(false, "userId is required.", false, null, null, null, null, null);

        var requestedParticipants = request.RequestedParticipants ?? 1;
        var durationHours = request.DurationHours > 0
            ? request.DurationHours
            : RoomPlanManager.DefaultRoomDurationHours;

        var planId = request.PlanId;
        if (string.IsNullOrWhiteSpace(planId))
            planId = _plans.ResolvePlanForParticipants(requestedParticipants).PlanId;

        if (!_plans.TryGetPlan(planId, out var plan))
            return new RoomCreationAuthorization(false, $"Unknown plan '{planId}'.", false, null, null, null, null, null);

        var validation = _plans.ValidateParticipantLimit(plan.PlanId, requestedParticipants);
        if (!validation.IsValid)
        {
            var requiredId = validation.RequiredPlanId ?? _plans.ResolvePlanForParticipants(requestedParticipants).PlanId;
            var requiredPlan = _plans.GetPlan(requiredId);
            var quote = await BuildQuoteAsync(requiredPlan, durationHours, cancellationToken);
            return RoomCreationAuthorization.PaymentRequired(validation.Error!, requiredPlan, quote);
        }

        if (!plan.IsPaid)
            return RoomCreationAuthorization.Allowed(plan);

        // Dev/UAT: auto-create mock payment + subscription from user input (name/userId).
        if (DevBillingHelper.AutoMockPaymentsEnabled)
            return await AuthorizeWithDevMockAsync(request, plan, durationHours, cancellationToken);

        if (IsDevBypass(request.UnlockCode))
            return RoomCreationAuthorization.Allowed(plan);

        if (request.BillingMode == BillingMode.Subscription)
        {
            var sub = await GetActiveSubscriptionAsync(request.UserId, plan.PlanId, cancellationToken);
            if (sub is not null)
                return RoomCreationAuthorization.Allowed(plan);

            var quote = await BuildQuoteAsync(plan, durationHours, cancellationToken);
            return RoomCreationAuthorization.PaymentRequired(
                $"No active subscription for '{plan.Name}'. Subscribe or pay per room.",
                plan,
                quote);
        }

        // Pay-per-room
        if (!string.IsNullOrWhiteSpace(request.PaymentReference))
            return RoomCreationAuthorization.Allowed(plan, _plans.CalculateRoomPrice(plan, durationHours));

        var perRoomQuote = await BuildQuoteAsync(plan, durationHours, cancellationToken);
        return RoomCreationAuthorization.PaymentRequired(
            $"Payment required: ${perRoomQuote.TotalPrice:F2} for {plan.Name} ({durationHours}h).",
            plan,
            perRoomQuote);
    }

    public Task<RoomPriceQuote> GetQuoteAsync(
        string planId,
        int durationHours = RoomPlanManager.DefaultRoomDurationHours,
        CancellationToken cancellationToken = default)
    {
        var plan = _plans.GetPlan(planId);
        return BuildQuoteAsync(plan, durationHours, cancellationToken);
    }

    public async Task<UserSubscription?> GetActiveSubscriptionAsync(
        string userId,
        string planId,
        CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        return await _db.UserSubscriptions
            .AsNoTracking()
            .Include(s => s.Plan)
            .Where(s => s.UserId == userId
                        && s.PlanId == planId
                        && s.IsActive
                        && s.ExpiresAt > now)
            .OrderByDescending(s => s.ExpiresAt)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<UserSubscription> ActivateSubscriptionAsync(
        string userId,
        string planId,
        SubscriptionBillingPeriod period,
        string? paymentReference,
        CancellationToken cancellationToken = default)
    {
        var plan = _plans.GetPlan(planId);
        if (!plan.IsPaid)
            throw new InvalidOperationException("Cannot subscribe to the free plan.");

        var now = DateTime.UtcNow;
        var amount = period == SubscriptionBillingPeriod.Annual ? plan.AnnualPrice : plan.MonthlyPrice;
        var expires = period == SubscriptionBillingPeriod.Annual
            ? now.AddYears(1)
            : now.AddMonths(1);

        // Deactivate prior subs for same user+tier
        var existing = await _db.UserSubscriptions
            .Where(s => s.UserId == userId && s.PlanId == planId && s.IsActive)
            .ToListAsync(cancellationToken);
        foreach (var sub in existing)
            sub.IsActive = false;

        var subscription = new UserSubscription
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            PlanId = planId,
            Period = period,
            AmountPaid = amount,
            StartsAt = now,
            ExpiresAt = expires,
            IsActive = true,
            PaymentReference = paymentReference ?? $"dev-sub-{Guid.NewGuid():N}",
            CreatedAt = now,
        };

        _db.UserSubscriptions.Add(subscription);
        await _db.SaveChangesAsync(cancellationToken);
        return subscription;
    }

    public async Task RecordRoomPurchaseAsync(
        string userId,
        string roomId,
        string planId,
        int durationHours,
        string? paymentReference,
        CancellationToken cancellationToken = default)
    {
        var plan = _plans.GetPlan(planId);
        var now = DateTime.UtcNow;
        var amount = _plans.CalculateRoomPrice(plan, durationHours);

        _db.RoomPurchases.Add(new RoomPurchase
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            RoomId = roomId,
            PlanId = planId,
            AmountPaid = amount,
            DurationHours = durationHours,
            PurchasedAt = now,
            ExpiresAt = now.AddHours(durationHours),
            PaymentReference = paymentReference ?? $"dev-room-{Guid.NewGuid():N}",
        });

        await _db.SaveChangesAsync(cancellationToken);
    }

    private async Task<RoomCreationAuthorization> AuthorizeWithDevMockAsync(
        RoomCreationRequest request,
        RoomPlan plan,
        int durationHours,
        CancellationToken cancellationToken)
    {
        string paymentRef;
        decimal amount;

        if (request.BillingMode == BillingMode.Subscription)
        {
            var sub = await GetActiveSubscriptionAsync(request.UserId, plan.PlanId, cancellationToken);
            if (sub is null)
            {
                paymentRef = DevBillingHelper.CreateMockPaymentReference(
                    request.UserId, plan.PlanId, "subscription");
                await ActivateSubscriptionAsync(
                    request.UserId,
                    plan.PlanId,
                    request.SubscriptionPeriod,
                    paymentRef,
                    cancellationToken);
                amount = request.SubscriptionPeriod == SubscriptionBillingPeriod.Annual
                    ? plan.AnnualPrice
                    : plan.MonthlyPrice;
            }
            else
            {
                paymentRef = sub.PaymentReference
                    ?? DevBillingHelper.CreateMockPaymentReference(request.UserId, plan.PlanId, "subscription");
                amount = 0m;
            }

            return RoomCreationAuthorization.Allowed(plan, amount, paymentRef, mockPayment: true);
        }

        paymentRef = !string.IsNullOrWhiteSpace(request.PaymentReference)
            ? request.PaymentReference.Trim()
            : DevBillingHelper.CreateMockPaymentReference(request.UserId, plan.PlanId, "room");

        amount = _plans.CalculateRoomPrice(plan, durationHours);
        return RoomCreationAuthorization.Allowed(plan, amount, paymentRef, mockPayment: true);
    }

    private Task<RoomPriceQuote> BuildQuoteAsync(RoomPlan plan, int durationHours, CancellationToken _)
    {
        var total = _plans.CalculateRoomPrice(plan, durationHours);
        var margin = _plans.GetMarginReport(plan, durationHours);
        var quote = new RoomPriceQuote(
            plan.PlanId,
            plan.Name,
            plan.MaxParticipants,
            durationHours,
            plan.PricePerRoom,
            total,
            plan.MonthlyPrice,
            plan.AnnualPrice,
            _plans.BuildPricingUrl(plan.PlanId),
            margin);

        return Task.FromResult(quote);
    }

    private static bool IsDevBypass(string? unlockCode)
    {
        if (string.Equals(Environment.GetEnvironmentVariable("KZYS_ALLOW_PAID_PLANS"), "true", StringComparison.OrdinalIgnoreCase))
            return true;

        var expected = Environment.GetEnvironmentVariable("KZYS_PAID_UNLOCK_CODE");
        return !string.IsNullOrWhiteSpace(expected) &&
               string.Equals(expected, unlockCode, StringComparison.Ordinal);
    }
}
