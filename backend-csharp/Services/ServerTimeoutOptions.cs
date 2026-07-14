namespace Kzys.Backend.Services;

public static class ServerTimeoutOptions
{
    public static TimeSpan ReadTimeout =>
        TimeSpan.FromSeconds(int.TryParse(Environment.GetEnvironmentVariable("KZYS_READ_TIMEOUT_SECONDS"), out var s) ? s : 30);

    public static TimeSpan WriteTimeout =>
        TimeSpan.FromSeconds(int.TryParse(Environment.GetEnvironmentVariable("KZYS_WRITE_TIMEOUT_SECONDS"), out var s) ? s : 30);

    public static int SfuStandbyPool =>
        int.TryParse(Environment.GetEnvironmentVariable("KZYS_SFU_STANDBY_POOL"), out var n) ? Math.Max(0, n) : 1;
}
