using Kzys.Backend.Configuration;
using Kzys.Backend.Models;
using Kzys.Backend.Realtime;
using Kzys.Backend.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Kzys.Backend.Tests;

public sealed class RoomModeServiceTests
{
    private static RoomModeService CreateService(AppConfig? config = null)
    {
        config ??= AppConfig.Load();
        return new RoomModeService(
            store: null!,
            config: config,
            hub: null!,
            log: NullLogger<RoomModeService>.Instance);
    }

    [Fact]
    public void EvaluateMode_pinned_skips_auto_webinar()
    {
        var svc = CreateService();
        var mode = svc.EvaluateMode(
            RoomModes.Interactive,
            modePinned: true,
            totalParticipants: 500,
            publishers: 10,
            listeners: 490);
        Assert.Equal(RoomModes.Interactive, mode);
    }

    [Fact]
    public void EvaluateMode_flips_to_webinar_at_listener_threshold()
    {
        var svc = CreateService();
        var mode = svc.EvaluateMode(
            RoomModes.Interactive,
            modePinned: false,
            totalParticipants: 400,
            publishers: 20,
            listeners: 380);
        Assert.Equal(RoomModes.Webinar, mode);
    }

    [Fact]
    public void EvaluateMode_stays_interactive_below_threshold()
    {
        var svc = CreateService();
        var mode = svc.EvaluateMode(
            RoomModes.Interactive,
            modePinned: false,
            totalParticipants: 50,
            publishers: 30,
            listeners: 20);
        Assert.Equal(RoomModes.Interactive, mode);
    }
}
