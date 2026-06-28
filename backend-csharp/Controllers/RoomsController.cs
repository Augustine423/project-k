using Kzys.Backend.Models;
using Kzys.Backend.Services;
using Microsoft.AspNetCore.Mvc;

namespace Kzys.Backend.Controllers
{
    [ApiController]
    [Route("api/rooms")]
    public class RoomsController : ControllerBase
    {
        private readonly RoomPlanManager _plans;
        private readonly ISubscriptionService _subscriptions;
        private readonly IRoomStore _rooms;

        public RoomsController(RoomPlanManager plans, ISubscriptionService subscriptions, IRoomStore rooms)
        {
            _plans = plans;
            _subscriptions = subscriptions;
            _rooms = rooms;
        }

        public record CreateRoomRequest(
            string? HostName,
            string? UserId,
            string? PlanId,
            int? RequestedParticipants,
            string? BillingMode,
            string? SubscriptionPeriod,
            int? DurationHours,
            string? PaymentReference,
            string? UnlockCode);

        [HttpGet("plans")]
        public IActionResult ListPlans()
        {
            var allowPaid = DevBillingHelper.AutoMockPaymentsEnabled
                || string.Equals(Environment.GetEnvironmentVariable("KZYS_ALLOW_PAID_PLANS"), "true", StringComparison.OrdinalIgnoreCase);

            var plans = _plans.GetAllPlans().Select(p => new
            {
                id = p.PlanId,
                name = p.Name,
                maxParticipants = p.MaxParticipants,
                isPaid = p.IsPaid,
                description = p.Description,
                pricePerRoom = p.PricePerRoom,
                monthlyPrice = p.MonthlyPrice,
                annualPrice = p.AnnualPrice,
                pricingUrl = _plans.BuildPricingUrl(p.PlanId),
                margin = _plans.GetMarginReport(p),
                available = !p.IsPaid || allowPaid,
            });

            return Ok(new
            {
                plans,
                devPaidUnlocked = allowPaid,
                autoMockPayments = DevBillingHelper.AutoMockPaymentsEnabled,
                marginModel = new
                {
                    RoomPlanManager.MonthlyBaselineCostUsd,
                    RoomPlanManager.CostPerParticipantHourUsd,
                    RoomPlanManager.TargetMarginMultiplier,
                    RoomPlanManager.SubscriptionDiscountRate,
                },
            });
        }

        [HttpGet("quote")]
        public async Task<IActionResult> Quote(
            [FromQuery] string planId,
            [FromQuery] int durationHours = RoomPlanManager.DefaultRoomDurationHours,
            CancellationToken cancellationToken = default)
        {
            if (!_plans.TryGetPlan(planId, out _))
                return BadRequest(new { error = "Invalid plan." });

            var quote = await _subscriptions.GetQuoteAsync(planId, durationHours, cancellationToken);
            return Ok(quote);
        }

        [HttpPost("create")]
        public async Task<IActionResult> Create(
            [FromBody] CreateRoomRequest? request,
            CancellationToken cancellationToken = default)
        {
            var userId = (request?.UserId ?? request?.HostName)?.Trim();
            var durationHours = request?.DurationHours > 0
                ? request.DurationHours.Value
                : RoomPlanManager.DefaultRoomDurationHours;

            var billingMode = ParseBillingMode(request?.BillingMode);
            var subscriptionPeriod = ParseSubscriptionPeriod(request?.SubscriptionPeriod);

            var auth = await _subscriptions.AuthorizeRoomCreationAsync(
                new RoomCreationRequest(
                    userId ?? string.Empty,
                    request?.PlanId?.Trim(),
                    request?.RequestedParticipants,
                    billingMode,
                    durationHours,
                    request?.PaymentReference?.Trim(),
                    request?.UnlockCode?.Trim(),
                    subscriptionPeriod),
                cancellationToken);

            if (!auth.IsAuthorized)
            {
                return PaymentRequired(new
                {
                    error = auth.Error,
                    requiresPayment = auth.RequiresPayment,
                    planId = auth.RequiredPlanId,
                    resolvedPlan = auth.ResolvedPlan is null ? null : new
                    {
                        auth.ResolvedPlan.PlanId,
                        auth.ResolvedPlan.Name,
                        auth.ResolvedPlan.MaxParticipants,
                        auth.ResolvedPlan.PricePerRoom,
                        auth.ResolvedPlan.MonthlyPrice,
                        auth.ResolvedPlan.AnnualPrice,
                    },
                    amountDue = auth.AmountDue,
                    pricingUrl = auth.PricingUrl ?? (auth.RequiredPlanId is not null
                        ? _plans.BuildPricingUrl(auth.RequiredPlanId)
                        : null),
                    quote = auth.Quote,
                });
            }

            var plan = auth.ResolvedPlan!;
            RegisteredRoom room;
            try
            {
                room = await _rooms.CreateAsync(
                    plan,
                    request?.HostName?.Trim(),
                    userId,
                    billingMode,
                    durationHours,
                    cancellationToken);
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { error = ex.Message });
            }

            if (plan.IsPaid && billingMode == BillingMode.PerRoom)
            {
                await _subscriptions.RecordRoomPurchaseAsync(
                    userId!,
                    room.RoomId,
                    plan.PlanId,
                    durationHours,
                    auth.PaymentReference,
                    cancellationToken);
            }

            await LiveKitRoomService.EnsureRoomAsync(room.RoomId, room.MaxParticipants);

            var quote = await _subscriptions.GetQuoteAsync(plan.PlanId, durationHours, cancellationToken);

            return Ok(new
            {
                roomId = room.RoomId,
                joinKey = room.JoinKey,
                expiresAt = room.ExpiresAt,
                planId = room.PlanId,
                planName = room.PlanName,
                maxParticipants = room.MaxParticipants,
                isPaid = plan.IsPaid,
                billingMode = billingMode.ToString().ToLowerInvariant(),
                amountCharged = plan.IsPaid ? (auth.AmountDue ?? quote.TotalPrice) : 0m,
                mockPayment = auth.MockPayment,
                paymentReference = auth.PaymentReference,
                quote,
            });
        }

        [HttpGet("validate")]
        public async Task<IActionResult> Validate(
            [FromQuery] string roomId,
            [FromQuery] string joinKey,
            CancellationToken cancellationToken)
        {
            var (valid, room, error) = await _rooms.TryValidateAsync(roomId, joinKey, cancellationToken);
            if (!valid)
                return NotFound(new { valid = false, error });

            return Ok(new
            {
                valid = true,
                roomId = room!.RoomId,
                planId = room.PlanId,
                planName = room.PlanName,
                maxParticipants = room.MaxParticipants,
                billingMode = room.BillingMode.ToString().ToLowerInvariant(),
            });
        }

        [HttpGet("status")]
        public async Task<IActionResult> Status(
            [FromQuery] string roomId,
            [FromQuery] string joinKey,
            CancellationToken cancellationToken)
        {
            var (valid, room, error) = await _rooms.TryValidateAsync(roomId, joinKey, cancellationToken);
            if (!valid)
                return NotFound(new { error });

            var (count, _) = await LiveKitRoomService.GetParticipantInfoAsync(roomId);

            return Ok(new
            {
                roomId = room!.RoomId,
                planId = room.PlanId,
                planName = room.PlanName,
                maxParticipants = room.MaxParticipants,
                participantCount = count,
                seatsRemaining = Math.Max(0, room.MaxParticipants - count),
                isFull = count >= room.MaxParticipants,
            });
        }

        private static BillingMode ParseBillingMode(string? value) =>
            string.Equals(value, "subscription", StringComparison.OrdinalIgnoreCase)
                ? BillingMode.Subscription
                : BillingMode.PerRoom;

        private static SubscriptionBillingPeriod ParseSubscriptionPeriod(string? value) =>
            string.Equals(value, "annual", StringComparison.OrdinalIgnoreCase)
                ? SubscriptionBillingPeriod.Annual
                : SubscriptionBillingPeriod.Monthly;

        private static ObjectResult PaymentRequired(object value) =>
            new(value) { StatusCode = StatusCodes.Status402PaymentRequired };
    }
}
