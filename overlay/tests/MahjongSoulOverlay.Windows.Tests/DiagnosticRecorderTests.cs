using System.Text.Json;
using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.Lifecycle;
using MahjongSoulOverlay.Windows.Capture;
using MahjongSoulOverlay.Windows.Diagnostics;

namespace MahjongSoulOverlay.Windows.Tests;

public sealed class DiagnosticRecorderTests : IDisposable
{
    private readonly string _root = Path.Combine(
        Path.GetTempPath(),
        "MahjongSoulOverlay.Tests",
        Guid.NewGuid().ToString("N"));

    [Fact]
    public async Task Recorder_is_disabled_by_default_and_writes_nothing()
    {
        await using var recorder = new DiagnosticRecorder(_root);
        await recorder.RecordAsync(Frame(), Snapshot(), keyFrame: true);

        Assert.False(Directory.Exists(_root));
    }

    [Fact]
    public async Task Explicit_enable_writes_png_and_valid_jsonl_then_disable_stops_writes()
    {
        await using var recorder = new DiagnosticRecorder(_root);
        recorder.Enable();
        await recorder.RecordAsync(Frame(), Snapshot(), keyFrame: true);
        recorder.Disable();
        await recorder.RecordAsync(Frame(), Snapshot(), keyFrame: true);

        var session = Assert.Single(Directory.GetDirectories(_root));
        Assert.Single(Directory.GetFiles(session, "*.png"));
        var lines = await File.ReadAllLinesAsync(Assert.Single(Directory.GetFiles(session, "*.jsonl")));
        var line = Assert.Single(lines);
        using var document = JsonDocument.Parse(line);
        var payload = document.RootElement.GetProperty("payload");
        Assert.Equal(4, payload.GetProperty("observations").GetArrayLength());
        Assert.True(payload.TryGetProperty("events", out _));
        Assert.True(payload.TryGetProperty("candidateResolutions", out _));
        Assert.True(payload.TryGetProperty("layers", out _));
        Assert.True(payload.TryGetProperty("lifecycle", out _));
    }

    [Fact]
    public async Task Recorder_serializes_an_immutable_snapshot_at_call_time()
    {
        await using var recorder = new DiagnosticRecorder(_root);
        recorder.Enable();
        var observations = Observations();
        var snapshot = new DiagnosticSnapshot(
            observations,
            [],
            [],
            [],
            LifecycleState.HandActive);

        var pending = recorder.RecordAsync(Frame(), snapshot, keyFrame: false);
        observations[0] = SeatObservation.Stable(Seat.Right, 0, false, 0, 0, []);
        await pending;

        var session = Assert.Single(Directory.GetDirectories(_root));
        var line = Assert.Single(await File.ReadAllLinesAsync(
            Assert.Single(Directory.GetFiles(session, "*.jsonl"))));
        using var document = JsonDocument.Parse(line);
        Assert.Equal(
            "Bottom",
            document.RootElement.GetProperty("payload")
                .GetProperty("observations")[0]
                .GetProperty("seat")
                .GetString());
    }

    [Fact]
    public void Recorder_rejects_paths_outside_diagnostics_root()
    {
        Assert.Throws<ArgumentException>(() =>
            new DiagnosticRecorder(_root, sessionName: "..\\escape"));
    }

    [Fact]
    public async Task Dispose_drains_accepted_writes_and_each_jsonl_line_is_complete()
    {
        var recorder = new DiagnosticRecorder(_root);
        recorder.Enable();
        _ = recorder.RecordAsync(Frame(), Snapshot(), keyFrame: false);
        _ = recorder.RecordAsync(Frame(), Snapshot(), keyFrame: false);

        await recorder.DisposeAsync();

        var session = Assert.Single(Directory.GetDirectories(_root));
        var lines = await File.ReadAllLinesAsync(
            Assert.Single(Directory.GetFiles(session, "*.jsonl")));
        Assert.Equal(2, lines.Length);
        foreach (var line in lines)
            using (JsonDocument.Parse(line)) { }
    }

    [Fact]
    public async Task Pre_canceled_record_writes_no_partial_jsonl()
    {
        await using var recorder = new DiagnosticRecorder(_root);
        recorder.Enable();
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => recorder.RecordAsync(Frame(), Snapshot(), false, cancellation.Token));

        Assert.False(Directory.Exists(_root));
    }

    public void Dispose()
    {
        if (Directory.Exists(_root))
            Directory.Delete(_root, recursive: true);
    }

    private static CapturedFrame Frame() =>
        CapturedFrame.CopyFrom(1, 1, 4, [0, 0, 0, 255], DateTimeOffset.UnixEpoch);

    private static DiagnosticSnapshot Snapshot() =>
        new(Observations(), [], [], [], LifecycleState.HandActive);

    private static SeatObservation[] Observations() =>
    [
        SeatObservation.Stable(Seat.Bottom, 0, false, 0, 0, []),
        SeatObservation.Stable(Seat.Right, 0, false, 0, 0, []),
        SeatObservation.Stable(Seat.Top, 0, false, 0, 0, []),
        SeatObservation.Stable(Seat.Left, 0, false, 0, 0, []),
    ];
}
