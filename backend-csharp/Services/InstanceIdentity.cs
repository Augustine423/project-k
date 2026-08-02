namespace Kzys.Backend.Services;

/// <summary>Pod / host identity for logs and scaling metrics (multi-replica safe).</summary>
public static class InstanceIdentity
{
    public static string Id { get; } =
        Environment.GetEnvironmentVariable("HOSTNAME")
        ?? Environment.GetEnvironmentVariable("POD_NAME")
        ?? Environment.MachineName;
}
