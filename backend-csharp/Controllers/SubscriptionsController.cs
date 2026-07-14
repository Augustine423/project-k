using Kzys.Backend.Models;
using Kzys.Backend.Services;
using Microsoft.AspNetCore.Mvc;

namespace Kzys.Backend.Controllers;

[ApiController]
[Route("api/subscriptions")]
public class SubscriptionsController : ControllerBase
{
    private readonly ISubscriptionService _subscriptions;
    private readonly RoomPlanManager _plans;

    public SubscriptionsController(ISubscriptionService subscriptions, RoomPlanManager plans)
    {
        _subscriptions = subscriptions;
        _plans = plans;
    }

    public record ActivateSubscriptionRequest(
        string UserId,
        string PlanId,
        string Period,
        string? PaymentReference);

    [HttpGet("me")]
    public async Task<IActionResult> GetMySubscriptions(
        [FromQuery] string userId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(userId))
            return BadRequest(new { error = "userId is required." });

        var now = DateTime.UtcNow;
        var active = new List<object>();

        foreach (var plan in _plans.GetAllPlans().Where(p => p.IsPaid))
        {
            var sub = await _subscriptions.GetActiveSubscriptionAsync(userId, plan.PlanId, cancellationToken);
            if (sub is not null)
            {
                active.Add(new
                {
                    sub.Id,
                    sub.PlanId,
                    planName = plan.Name,
                    period = sub.Period.ToString().ToLowerInvariant(),
                    sub.AmountPaid,
                    sub.StartsAt,
                    sub.ExpiresAt,
                    maxParticipants = plan.MaxParticipants,
                });
            }
        }

        return Ok(new { userId, activeSubscriptions = active, checkedAt = now });
    }

    [HttpPost("activate")]
    public async Task<IActionResult> Activate(
        [FromBody] ActivateSubscriptionRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.UserId))
            return BadRequest(new { error = "userId is required." });

        if (!_plans.TryGetPlan(request.PlanId, out var plan))
            return BadRequest(new { error = "Invalid plan." });

        if (!plan.IsPaid)
            return BadRequest(new { error = "Cannot subscribe to the free plan." });

        var period = string.Equals(request.Period, "annual", StringComparison.OrdinalIgnoreCase)
            ? SubscriptionBillingPeriod.Annual
            : SubscriptionBillingPeriod.Monthly;

        var subscription = await _subscriptions.ActivateSubscriptionAsync(
            request.UserId.Trim(),
            plan.PlanId,
            period,
            request.PaymentReference,
            cancellationToken);

        return Ok(new
        {
            subscription.Id,
            subscription.PlanId,
            planName = plan.Name,
            period = subscription.Period.ToString().ToLowerInvariant(),
            subscription.AmountPaid,
            subscription.StartsAt,
            subscription.ExpiresAt,
            maxParticipants = plan.MaxParticipants,
            pricingUrl = _plans.BuildPricingUrl(plan.PlanId),
        });
    }
}
