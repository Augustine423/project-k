namespace Kzys.Backend.Services;

/// <summary>
/// Dev/UAT billing stubs — auto-creates payments from user input. Replace with Stripe/etc. later.
/// </summary>
public static class DevBillingHelper
{
    public static bool AutoMockPaymentsEnabled =>
        string.Equals(Environment.GetEnvironmentVariable("KZYS_AUTO_MOCK_PAYMENTS"), "true", StringComparison.OrdinalIgnoreCase)
        || string.Equals(Environment.GetEnvironmentVariable("KZYS_ALLOW_PAID_PLANS"), "true", StringComparison.OrdinalIgnoreCase);

    public static string CreateMockPaymentReference(string userId, string planId, string kind)
    {
        var safeUser = new string(userId.Where(char.IsLetterOrDigit).Take(16).ToArray());
        if (string.IsNullOrEmpty(safeUser))
            safeUser = "user";
        return $"mock-{kind}-{safeUser}-{planId}-{DateTime.UtcNow:yyyyMMddHHmmss}";
    }
}
