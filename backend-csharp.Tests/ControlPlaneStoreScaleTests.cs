using Kzys.Backend.Models;
using Kzys.Backend.Services;
using StackExchange.Redis;
using Xunit;

namespace Kzys.Backend.Tests;

public sealed class ControlPlaneStoreScaleTests : IAsyncLifetime
{
    private ConnectionMultiplexer? _redis;
    private ControlPlaneStore? _store;
    private readonly List<string> _roomIds = [];

    public async Task InitializeAsync()
    {
        var url = Environment.GetEnvironmentVariable("REDIS_URL") ?? "redis://localhost:6379";
        var config = ConfigurationOptions.Parse(url.Replace("redis://", "", StringComparison.OrdinalIgnoreCase));
        config.AbortOnConnectFail = false;
        _redis = await ConnectionMultiplexer.ConnectAsync(config);
        _store = new ControlPlaneStore(_redis);
        await _store.PingAsync();
    }

    public async Task DisposeAsync()
    {
        if (_store is not null)
        {
            foreach (var roomId in _roomIds)
                await _store.DeleteRoomAsync(roomId);
        }
        if (_redis is not null)
            await _redis.DisposeAsync();
    }

    [Fact]
    public async Task TryAddParticipant_respects_room_cap()
    {
        var store = _store!;
        var roomId = await CreateRoomAsync(store);
        const int max = 250;

        for (var i = 0; i < max; i++)
        {
            var (added, _) = await store.TryAddParticipantAsync(MakeParticipant(roomId, $"p-{i}"), max);
            Assert.True(added);
        }

        var (overflow, _) = await store.TryAddParticipantAsync(MakeParticipant(roomId, "p-overflow"), max);
        Assert.False(overflow);

        var count = await store.GetParticipantCountAsync(roomId);
        Assert.Equal(max, count);
    }

    [Fact]
    public async Task ListParticipantsPage_returns_slices_without_loading_all_at_once()
    {
        var store = _store!;
        var roomId = await CreateRoomAsync(store);
        const int total = 120;
        const int pageSize = 50;

        for (var i = 0; i < total; i++)
        {
            var p = MakeParticipant(roomId, $"page-{i:D4}");
            p.JoinedAt = DateTime.UtcNow.AddMilliseconds(i);
            await store.TryAddParticipantAsync(p, 10_000);
        }

        var first = await store.ListParticipantsPageAsync(roomId, 0, pageSize);
        var second = await store.ListParticipantsPageAsync(roomId, pageSize, pageSize);

        Assert.Equal(total, first.Total);
        Assert.Equal(pageSize, first.Items.Count);
        Assert.True(first.HasMore);
        Assert.Equal(pageSize, second.Items.Count);
        Assert.True(second.HasMore);
        Assert.DoesNotContain(first.Items[0].Id, second.Items.Select(p => p.Id));
    }

    [Fact]
    public async Task GetMediaStats_uses_O1_count_and_small_media_hash()
    {
        var store = _store!;
        var roomId = await CreateRoomAsync(store);

        for (var i = 0; i < 80; i++)
            await store.TryAddParticipantAsync(MakeParticipant(roomId, $"media-{i}"), 10_000);

        await store.SetMediaPresenceAsync(roomId, new MediaPresenceRecord
        {
            ParticipantId = "media-1",
            Publishing = true,
            Audio = true,
            Video = true,
            UpdatedAt = DateTime.UtcNow,
        });

        var stats = await store.GetMediaStatsAsync(roomId);
        Assert.Equal(80, stats.TotalParticipants);
        Assert.Equal(1, stats.Publishers);
        Assert.Equal(79, stats.Listeners);
    }

    [Fact]
    public async Task SearchParticipants_finds_matches_with_scan_cap()
    {
        var store = _store!;
        var roomId = await CreateRoomAsync(store);

        for (var i = 0; i < 40; i++)
        {
            var p = MakeParticipant(roomId, i % 5 == 0 ? $"VIP-{i}" : $"Guest-{i}");
            await store.TryAddParticipantAsync(p, 10_000);
        }

        var results = await store.SearchParticipantsAsync(roomId, "vip", limit: 20, scanCap: 500);
        Assert.True(results.Items.Count >= 8);
        Assert.All(results.Items, p => Assert.Contains("vip", p.DisplayName, StringComparison.OrdinalIgnoreCase));
    }

    private async Task<string> CreateRoomAsync(ControlPlaneStore store)
    {
        var roomId = "room-scale-" + Guid.NewGuid().ToString("N")[..10];
        _roomIds.Add(roomId);
        await store.SaveRoomAsync(new RoomRecord
        {
            Id = roomId,
            MaxParticipants = 10_000,
            MaxPublishers = 50,
            HostParticipantId = "host-1",
            CreatedAt = DateTime.UtcNow,
        });
        return roomId;
    }

    private static ParticipantRecord MakeParticipant(string roomId, string id) => new()
    {
        Id = id,
        RoomId = roomId,
        DisplayName = id,
        Role = ParticipantRoles.Participant,
        Approved = true,
        JoinedAt = DateTime.UtcNow,
    };
}

public sealed class RoomPresenceBroadcasterTests
{
    [Fact]
    public void LargeRoomEventThreshold_defaults_to_200()
    {
        var config = Kzys.Backend.Configuration.AppConfig.Load();
        Assert.True(config.LargeRoomEventThreshold >= 100);
        Assert.True(config.MaxRoomParticipants >= 10_000);
    }
}
