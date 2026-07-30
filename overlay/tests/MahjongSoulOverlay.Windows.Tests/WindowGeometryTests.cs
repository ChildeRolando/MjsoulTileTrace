using MahjongSoulOverlay.Windows.Capture;

namespace MahjongSoulOverlay.Windows.Tests;

public sealed class WindowGeometryTests
{
    public static IEnumerable<object[]> EligibilityCases()
    {
        yield return [Snapshot(), true];
        yield return [Snapshot(visible: false), false];
        yield return [Snapshot(minimized: true), false];
        yield return [Snapshot(width: 1919), false];
        yield return [Snapshot(height: 1079), false];
        yield return [Snapshot(dpi: 120), false];
        yield return [Snapshot(title: "Notepad", executableName: "notepad.exe"), false];
        yield return [Snapshot(title: "Not Mahjong Soul", executableName: "notepad.exe"), false];
        yield return [Snapshot(title: "MahjongSoul"), true];
        yield return [Snapshot(title: "Unknown", executableName: "Jantama_MahjongSoul.exe"), true];
    }

    [Theory]
    [MemberData(nameof(EligibilityCases))]
    public void Eligibility_requires_supported_geometry_and_allowlisted_identity(
        WindowSnapshot snapshot,
        bool expected)
    {
        Assert.Equal(expected, MahjongWindowEligibility.IsEligible(snapshot));
    }

    [Fact]
    public void Selection_rejects_ambiguity()
    {
        var first = Snapshot(handle: 1);
        var second = Snapshot(handle: 2);

        Assert.Null(MahjongWindowEligibility.SelectUnique([first, second]));
        Assert.Equal(first, MahjongWindowEligibility.SelectUnique([first]));
    }

    [Fact]
    public void Client_geometry_translates_client_origin_to_screen_without_changing_size()
    {
        var client = new NativeRect(0, 0, 1920, 1080);
        var result = ClientGeometry.ToScreen(client, new ScreenPoint(53, 87));

        Assert.Equal(new ScreenRect(53, 87, 1920, 1080), result);
    }

    [Fact]
    public void Locator_emits_found_geometry_changed_minimized_and_lost()
    {
        var windows = new FakeWindowEnumerator();
        var locator = new MahjongWindowLocator(windows);
        var changes = new List<TargetWindowChange>();
        locator.TargetChanged += (_, change) => changes.Add(change.Change);

        windows.Snapshots = [Snapshot(handle: 7)];
        locator.PollOnce();
        windows.Bounds = new ScreenRect(5, 6, 1920, 1080);
        locator.PollOnce();
        windows.Snapshots = [Snapshot(handle: 7, minimized: true)];
        locator.PollOnce();
        locator.PollOnce();
        windows.Snapshots = [Snapshot(handle: 7)];
        locator.PollOnce();
        windows.Snapshots = [];
        locator.PollOnce();

        Assert.Equal(
            [
                TargetWindowChange.Found,
                TargetWindowChange.GeometryChanged,
                TargetWindowChange.Minimized,
                TargetWindowChange.Found,
                TargetWindowChange.Lost,
            ],
            changes);
    }

    [Fact]
    public void Locator_emits_ambiguity_and_does_not_choose_a_target()
    {
        var windows = new FakeWindowEnumerator
        {
            Snapshots = [Snapshot(handle: 1), Snapshot(handle: 2)],
        };
        var locator = new MahjongWindowLocator(windows);
        TargetWindowChangedEventArgs? received = null;
        locator.TargetChanged += (_, change) => received = change;

        locator.PollOnce();

        Assert.Equal(TargetWindowChange.Ambiguous, received?.Change);
        Assert.Null(received?.Window);
    }

    [Fact]
    public void Locator_emits_only_ambiguity_transitions_and_recovers_to_waiting()
    {
        var windows = new FakeWindowEnumerator
        {
            Snapshots = [Snapshot(handle: 1), Snapshot(handle: 2)],
        };
        var locator = new MahjongWindowLocator(windows);
        var changes = new List<TargetWindowChange>();
        locator.TargetChanged += (_, change) => changes.Add(change.Change);

        locator.PollOnce();
        locator.PollOnce();
        windows.Snapshots = [];
        locator.PollOnce();
        locator.PollOnce();

        Assert.Equal([TargetWindowChange.Ambiguous, TargetWindowChange.Lost], changes);
    }

    [Fact]
    public void Locator_recovers_when_geometry_lookup_races_with_window_close()
    {
        var windows = new FakeWindowEnumerator
        {
            Snapshots = [Snapshot(handle: 1)],
            ThrowOnNextBounds = true,
        };
        var locator = new MahjongWindowLocator(windows);
        var changes = new List<TargetWindowChange>();
        locator.TargetChanged += (_, change) => changes.Add(change.Change);

        locator.PollOnce();
        locator.PollOnce();

        Assert.Equal([TargetWindowChange.Lost, TargetWindowChange.Found], changes);
    }

    [Fact]
    public void Locator_recovers_when_unsupported_target_vanishes_during_geometry_lookup()
    {
        var windows = new FakeWindowEnumerator
        {
            Snapshots = [Snapshot(handle: 1)],
        };
        var locator = new MahjongWindowLocator(windows);
        var changes = new List<TargetWindowChange>();
        locator.TargetChanged += (_, change) => changes.Add(change.Change);
        locator.PollOnce();
        windows.Snapshots = [Snapshot(handle: 1, width: 1600, height: 900)];
        windows.ThrowOnNextBounds = true;

        locator.PollOnce();

        Assert.Equal([TargetWindowChange.Found, TargetWindowChange.Lost], changes);
    }

    [Fact]
    public void Locator_reports_an_unsupported_geometry_once_and_reports_restoration()
    {
        var windows = new FakeWindowEnumerator
        {
            Snapshots = [Snapshot(handle: 7)],
        };
        var locator = new MahjongWindowLocator(windows);
        var changes = new List<TargetWindowChange>();
        locator.TargetChanged += (_, change) => changes.Add(change.Change);
        locator.PollOnce();

        windows.Snapshots = [Snapshot(handle: 7, width: 1600, height: 900)];
        windows.Bounds = new ScreenRect(0, 0, 1600, 900);
        locator.PollOnce();
        locator.PollOnce();
        windows.Snapshots = [Snapshot(handle: 7)];
        windows.Bounds = new ScreenRect(0, 0, 1920, 1080);
        locator.PollOnce();

        Assert.Equal(
            [
                TargetWindowChange.Found,
                TargetWindowChange.GeometryChanged,
                TargetWindowChange.GeometryChanged,
            ],
            changes);
    }

    [Fact]
    public async Task Locator_concurrent_stop_and_dispose_are_idempotent()
    {
        var locator = new MahjongWindowLocator(
            new FakeWindowEnumerator(),
            TimeSpan.FromHours(1));
        locator.Start();

        await Task.WhenAll(locator.StopAsync(), locator.StopAsync());
        await locator.DisposeAsync();
        await locator.DisposeAsync();

        Assert.False(locator.IsRunning);
    }

    private static WindowSnapshot Snapshot(
        nint handle = 42,
        string title = "雀魂麻将",
        string executableName = "MahjongSoul.exe",
        bool visible = true,
        bool minimized = false,
        int width = 1920,
        int height = 1080,
        int dpi = 96) =>
        new(handle, title, executableName, visible, minimized, width, height, dpi);

    private sealed class FakeWindowEnumerator : IWindowEnumerator
    {
        public IReadOnlyList<WindowSnapshot> Snapshots { get; set; } = [];
        public ScreenRect Bounds { get; set; } = new(0, 0, 1920, 1080);
        public bool ThrowOnNextBounds { get; set; }

        public IReadOnlyList<WindowSnapshot> Enumerate() => Snapshots;

        public ScreenRect GetClientBounds(nint windowHandle)
        {
            if (ThrowOnNextBounds)
            {
                ThrowOnNextBounds = false;
                throw new InvalidOperationException("window vanished");
            }

            return Bounds;
        }
    }
}
