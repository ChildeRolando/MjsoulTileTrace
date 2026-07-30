using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.Events;
using MahjongSoulOverlay.Core.Lifecycle;
using MahjongSoulOverlay.Core.Pipeline;
using MahjongSoulOverlay.Windows.Capture;
using MahjongSoulOverlay.Windows.Diagnostics;
using MahjongSoulOverlay.Windows.Overlay;
using MahjongSoulOverlay.Windows.Shell;

namespace MahjongSoulOverlay.Windows.Tests;

public sealed class TrayApplicationContextTests
{
    [Fact]
    public void Production_engine_composition_can_reset_without_OS_dependencies()
    {
        var engine = MahjongSoulOverlay.Windows.Program.CreateEngine();

        var output = engine.ManualReset();

        Assert.Equal(LifecycleState.Detached, output.Lifecycle);
        Assert.True(output.ShouldHideOverlay);
        Assert.Empty(output.Layers);
    }

    [Fact]
    public async Task Pause_resume_clear_and_diagnostics_are_explicit()
    {
        var rig = new Rig();
        await rig.Context.StartAsync();
        rig.Target.Report(TargetWindowChange.Found, EligibleWindow(), Bounds());
        await rig.Capture.Started.Task.WaitAsync(TimeSpan.FromSeconds(2));

        rig.Tray.RaisePause();
        Assert.Equal(ApplicationStatus.Paused, rig.Tray.Status);
        Assert.True(rig.Tray.ResumeEnabled);
        Assert.False(rig.Tray.PauseEnabled);
        Assert.True(rig.Overlay.Last!.ShouldHide);

        rig.Capture.Report(Frame(1));
        await Task.Delay(50);
        Assert.Empty(rig.Detector.Frames);

        rig.Tray.RaiseResume();
        await rig.Detector.Reset.Task.WaitAsync(TimeSpan.FromSeconds(2));
        Assert.Equal(2, rig.Engine.ResetCount);
        rig.Capture.Report(Frame(2));
        await rig.Detector.Detected.Task.WaitAsync(TimeSpan.FromSeconds(2));
        await Eventually(() => rig.Tray.Status == ApplicationStatus.Active);

        rig.Tray.RaiseClear();
        await Eventually(() => rig.Tray.Status == ApplicationStatus.Synchronizing);
        Assert.Equal(3, rig.Engine.ResetCount);
        Assert.Empty(rig.Overlay.Last!.Layers);

        Assert.False(rig.Diagnostics.IsEnabled);
        rig.Tray.RaiseDiagnostics();
        Assert.True(rig.Diagnostics.IsEnabled);
        rig.Tray.RaiseDiagnostics();
        Assert.False(rig.Diagnostics.IsEnabled);

        await rig.Context.ExitAsync();
    }

    [Fact]
    public async Task Latest_frame_replaces_stale_frame()
    {
        var rig = new Rig(blockDetection: true);
        await rig.Context.StartAsync();
        rig.Target.Report(TargetWindowChange.Found, EligibleWindow(), Bounds());
        await rig.Capture.Started.Task.WaitAsync(TimeSpan.FromSeconds(2));

        rig.Capture.Report(Frame(1));
        await rig.Detector.Entered.Task.WaitAsync(TimeSpan.FromSeconds(2));
        rig.Capture.Report(Frame(2));
        rig.Capture.Report(Frame(3));
        rig.Detector.Release.TrySetResult();
        await rig.Detector.ThreeSeen.Task.WaitAsync(TimeSpan.FromSeconds(2));

        Assert.Equal([1, 3], rig.Detector.Frames);
        await rig.Context.ExitAsync();
    }

    [Fact]
    public async Task Overlay_updates_are_marshaled_and_diagnostics_are_opt_in()
    {
        var rig = new Rig();
        await rig.Context.StartAsync();
        rig.Target.Report(TargetWindowChange.Found, EligibleWindow(), Bounds());
        await rig.Capture.Started.Task.WaitAsync(TimeSpan.FromSeconds(2));
        var postsBeforeFrame = rig.Ui.PostCount;
        rig.Capture.Report(Frame(4));
        await rig.Detector.Detected.Task.WaitAsync(TimeSpan.FromSeconds(2));

        Assert.True(rig.Ui.PostCount > postsBeforeFrame);
        Assert.Equal(0, rig.Diagnostics.RecordCount);

        rig.Tray.RaiseDiagnostics();
        rig.Detector.Detected = NewSignal();
        rig.Capture.Report(Frame(5));
        await rig.Detector.Detected.Task.WaitAsync(TimeSpan.FromSeconds(2));
        await Eventually(() => rig.Diagnostics.RecordCount == 1);
        Assert.Equal(1, rig.Diagnostics.RecordCount);

        await rig.Context.ExitAsync();
    }

    [Theory]
    [InlineData(1280, 720, 96)]
    [InlineData(1920, 1080, 120)]
    public async Task Unsupported_target_is_not_captured(int width, int height, int dpi)
    {
        var rig = new Rig();
        await rig.Context.StartAsync();
        rig.Target.Report(
            TargetWindowChange.Found,
            EligibleWindow() with { ClientWidth = width, ClientHeight = height, Dpi = dpi },
            new ScreenRect(0, 0, width, height));

        await Eventually(() => rig.Tray.Status == ApplicationStatus.Unsupported);
        Assert.Equal(0, rig.Capture.StartCount);
        Assert.True(rig.Overlay.Last!.ShouldHide);
        await rig.Context.ExitAsync();
    }

    [Fact]
    public async Task Lost_and_minimized_targets_hide_and_stop_capture()
    {
        var rig = new Rig();
        await rig.Context.StartAsync();
        rig.Target.Report(TargetWindowChange.Found, EligibleWindow(), Bounds());
        await rig.Capture.Started.Task.WaitAsync(TimeSpan.FromSeconds(2));

        rig.Target.Report(TargetWindowChange.Minimized, EligibleWindow(), null);
        await Eventually(() => rig.Tray.Status == ApplicationStatus.WindowLost);
        Assert.True(rig.Overlay.Last!.ShouldHide);
        Assert.Equal(1, rig.Capture.StopCount);

        rig.Target.Report(TargetWindowChange.Lost, null, null);
        await Eventually(() => rig.Tray.Status == ApplicationStatus.WindowLost);
        await rig.Context.ExitAsync();
    }

    [Fact]
    public async Task Exceptions_are_contained_and_exit_drains_all_resources()
    {
        var rig = new Rig();
        rig.Detector.Error = new InvalidOperationException("vision failed");
        await rig.Context.StartAsync();
        rig.Target.Report(TargetWindowChange.Found, EligibleWindow(), Bounds());
        await rig.Capture.Started.Task.WaitAsync(TimeSpan.FromSeconds(2));
        rig.Capture.Report(Frame(6));

        await Eventually(() => rig.Tray.Status == ApplicationStatus.Error);
        Assert.Equal(1, rig.Capture.StopCount);
        await Task.WhenAll(rig.Context.PauseAsync(), rig.Context.ExitAsync());

        Assert.True(rig.Capture.Disposed);
        Assert.True(rig.Target.Disposed);
        Assert.True(rig.Diagnostics.Disposed);
        Assert.True(rig.Overlay.Disposed);
        Assert.True(rig.Tray.Disposed);
    }

    [Fact]
    public async Task Resume_recovers_after_a_detector_exception()
    {
        var rig = new Rig();
        rig.Detector.Error = new InvalidOperationException("vision failed");
        await rig.Context.StartAsync();
        rig.Target.Report(TargetWindowChange.Found, EligibleWindow(), Bounds());
        await rig.Capture.Started.Task.WaitAsync(TimeSpan.FromSeconds(2));
        rig.Capture.Report(Frame(7));
        await Eventually(() => rig.Tray.Status == ApplicationStatus.Error);

        rig.Detector.Error = null;
        rig.Detector.Detected = NewSignal();
        await rig.Context.ResumeAsync();
        rig.Capture.Report(Frame(8));
        await rig.Detector.Detected.Task.WaitAsync(TimeSpan.FromSeconds(2));

        Assert.Contains((byte)8, rig.Detector.Frames);
        await rig.Context.ExitAsync();
    }

    [Fact]
    public async Task Clear_during_detection_discards_the_in_flight_result_before_reset()
    {
        var rig = new Rig(blockDetection: true);
        await rig.Context.StartAsync();
        rig.Target.Report(TargetWindowChange.Found, EligibleWindow(), Bounds());
        await rig.Capture.Started.Task.WaitAsync(TimeSpan.FromSeconds(2));
        rig.Capture.Report(Frame(9));
        await rig.Detector.Entered.Task.WaitAsync(TimeSpan.FromSeconds(2));

        rig.Tray.RaiseClear();
        rig.Detector.Release.TrySetResult();
        await Eventually(() => rig.Engine.ResetCount >= 2);
        await rig.Detector.Detected.Task.WaitAsync(TimeSpan.FromSeconds(2));
        await Task.Delay(50);

        Assert.Equal(0, rig.Engine.PushCount);
        await rig.Context.ExitAsync();
    }

    [Fact]
    public async Task Exit_continues_disposal_when_capture_stop_fails()
    {
        var rig = new Rig();
        await rig.Context.StartAsync();
        rig.Target.Report(TargetWindowChange.Found, EligibleWindow(), Bounds());
        await rig.Capture.Started.Task.WaitAsync(TimeSpan.FromSeconds(2));
        rig.Capture.StopError = new InvalidOperationException("device lost");

        await rig.Context.ExitAsync();

        Assert.True(rig.Capture.Disposed);
        Assert.True(rig.Target.Disposed);
        Assert.True(rig.Diagnostics.Disposed);
        Assert.True(rig.Overlay.Disposed);
        Assert.True(rig.Tray.Disposed);
    }

    [Fact]
    public async Task Exit_waits_for_UI_cleanup_to_finish()
    {
        var rig = new Rig();
        await rig.Context.StartAsync();
        rig.Ui.HoldAsyncPosts = true;

        var exiting = rig.Context.ExitAsync();
        await Eventually(() => rig.Ui.PendingAsyncPosts > 0);

        Assert.False(exiting.IsCompleted);
        Assert.False(rig.Tray.Disposed);

        rig.Ui.FlushAsyncPosts();
        await exiting.WaitAsync(TimeSpan.FromSeconds(2));
        Assert.True(rig.Overlay.Disposed);
        Assert.True(rig.Tray.Disposed);
    }

    [Fact]
    public async Task Pause_during_detection_cannot_publish_stale_active_output()
    {
        var rig = new Rig();
        rig.Engine.BlockPush = true;
        await rig.Context.StartAsync();
        rig.Target.Report(TargetWindowChange.Found, EligibleWindow(), Bounds());
        await rig.Capture.Started.Task.WaitAsync(TimeSpan.FromSeconds(2));
        rig.Capture.Report(Frame(10));
        await rig.Engine.PushEntered.Task.WaitAsync(TimeSpan.FromSeconds(2));

        await rig.Context.PauseAsync();
        rig.Engine.ReleasePush.TrySetResult();
        await Task.Delay(50);

        Assert.Equal(ApplicationStatus.Paused, rig.Tray.Status);
        Assert.True(rig.Overlay.Last!.ShouldHide);
        Assert.Equal(0, rig.Diagnostics.RecordCount);
        await rig.Context.ExitAsync();
    }

    [Fact]
    public void Tray_labels_are_exact()
    {
        Assert.Equal("状态: 等待雀魂窗口", TrayLabels.WaitingStatus);
        Assert.Equal("暂停识别", TrayLabels.Pause);
        Assert.Equal("恢复识别", TrayLabels.Resume);
        Assert.Equal("清除本局并重新同步", TrayLabels.ClearHand);
        Assert.Equal("显示诊断区域", TrayLabels.ShowDiagnostics);
        Assert.Equal("保存诊断关键帧", TrayLabels.SaveDiagnosticKeyFrame);
        Assert.Equal("退出", TrayLabels.Exit);
    }

    private static WindowSnapshot EligibleWindow() =>
        new((nint)42, "雀魂麻将", "MahjongSoul.exe", true, false, 1920, 1080, 96);

    private static ScreenRect Bounds() => new(0, 0, 1920, 1080);

    private static CapturedFrame Frame(byte marker)
    {
        var bytes = new byte[1920 * 1080 * 4];
        bytes[0] = marker;
        return CapturedFrame.CopyFrom(1920, 1080, 1920 * 4, bytes, DateTimeOffset.UtcNow);
    }

    private static TaskCompletionSource NewSignal() =>
        new(TaskCreationOptions.RunContinuationsAsynchronously);

    private static async Task Eventually(Func<bool> condition)
    {
        for (var index = 0; index < 100 && !condition(); index++)
            await Task.Delay(10);
        Assert.True(condition());
    }

    private sealed class Rig
    {
        public Rig(bool blockDetection = false)
        {
            Detector.Block = blockDetection;
            Context = new TrayApplicationContext(
                Target,
                Capture,
                Detector,
                Engine,
                Overlay,
                Diagnostics,
                Tray,
                Ui);
        }

        public FakeTargetMonitor Target { get; } = new();
        public FakeCapture Capture { get; } = new();
        public FakeDetector Detector { get; } = new();
        public FakeEngine Engine { get; } = new();
        public FakeOverlay Overlay { get; } = new();
        public FakeDiagnostics Diagnostics { get; } = new();
        public FakeTray Tray { get; } = new();
        public FakeUi Ui { get; } = new();
        public TrayApplicationContext Context { get; }
    }

    private sealed class FakeTargetMonitor : IWindowTargetMonitor
    {
        public event EventHandler<TargetWindowChangedEventArgs>? TargetChanged;
        public bool Disposed { get; private set; }
        public void Start() { }
        public Task StopAsync() => Task.CompletedTask;
        public ValueTask DisposeAsync() { Disposed = true; return ValueTask.CompletedTask; }
        public void Report(TargetWindowChange change, WindowSnapshot? window, ScreenRect? bounds) =>
            TargetChanged?.Invoke(this, new(change, window, bounds));
    }

    private sealed class FakeCapture : IFrameSource
    {
        public event EventHandler<CapturedFrame>? FrameArrived;
        public int StartCount { get; private set; }
        public int StopCount { get; private set; }
        public bool Disposed { get; private set; }
        public Exception? StopError { get; set; }
        public TaskCompletionSource Started { get; } = NewSignal();
        public Task StartAsync(nint windowHandle, CancellationToken cancellationToken)
        {
            StartCount++;
            Started.TrySetResult();
            return Task.CompletedTask;
        }
        public Task StopAsync()
        {
            StopCount++;
            return StopError is null ? Task.CompletedTask : Task.FromException(StopError);
        }
        public ValueTask DisposeAsync() { Disposed = true; return ValueTask.CompletedTask; }
        public void Report(CapturedFrame frame) => FrameArrived?.Invoke(this, frame);
    }

    private sealed class FakeDetector : ITableFrameDetector
    {
        public readonly List<byte> Frames = [];
        public bool Block { get; set; }
        public Exception? Error { get; set; }
        public TaskCompletionSource Reset { get; } = NewSignal();
        public TaskCompletionSource Entered { get; } = NewSignal();
        public TaskCompletionSource Release { get; } = NewSignal();
        public TaskCompletionSource ThreeSeen { get; } = NewSignal();
        public TaskCompletionSource Detected { get; set; } = NewSignal();
        public async Task<TableObservation> DetectAsync(CapturedFrame frame, CancellationToken token)
        {
            var marker = frame.Bgra.Span[0];
            Frames.Add(marker);
            Entered.TrySetResult();
            if (Block && Frames.Count == 1)
                await Release.Task.WaitAsync(token);
            if (Error is not null)
                throw Error;
            if (marker == 3)
                ThreeSeen.TrySetResult();
            Detected.TrySetResult();
            return TestObservation.Create(frame.Timestamp);
        }
        public void ResetBaseline() => Reset.TrySetResult();
        public void Dispose() { }
    }

    private sealed class FakeEngine : IOverlayEngine
    {
        public int ResetCount { get; private set; }
        public int PushCount { get; private set; }
        public bool BlockPush { get; set; }
        public TaskCompletionSource PushEntered { get; } = NewSignal();
        public TaskCompletionSource ReleasePush { get; } = NewSignal();
        public EngineOutput Push(TableObservation observation) =>
            Push();
        private EngineOutput Push()
        {
            PushCount++;
            PushEntered.TrySetResult();
            if (BlockPush)
                ReleasePush.Task.GetAwaiter().GetResult();
            return new(LifecycleState.HandActive, [], [], [], false);
        }
        public EngineOutput ManualReset()
        {
            ResetCount++;
            return new(LifecycleState.SessionReady, [], [], [], true);
        }
    }

    private sealed class FakeOverlay : IOverlayView
    {
        public OverlayUpdate? Last { get; private set; }
        public bool Disposed { get; private set; }
        public void Update(OverlayUpdate update) => Last = update;
        public void Dispose() => Disposed = true;
    }

    private sealed class FakeDiagnostics : IDiagnosticSession
    {
        public bool IsEnabled { get; private set; }
        public int RecordCount { get; private set; }
        public bool Disposed { get; private set; }
        public void Enable() => IsEnabled = true;
        public void Disable() => IsEnabled = false;
        public Task RecordAsync(CapturedFrame frame, DiagnosticSnapshot snapshot, bool keyFrame,
            CancellationToken cancellationToken = default)
        { RecordCount++; return Task.CompletedTask; }
        public ValueTask DisposeAsync() { Disposed = true; return ValueTask.CompletedTask; }
    }

    private sealed class FakeTray : ITrayView
    {
        public event EventHandler? PauseRequested;
        public event EventHandler? ResumeRequested;
        public event EventHandler? ClearRequested;
        public event EventHandler? DiagnosticsRequested;
        public event EventHandler? KeyFrameRequested;
        public event EventHandler? ExitRequested;
        public ApplicationStatus Status { get; private set; }
        public bool PauseEnabled { get; private set; }
        public bool ResumeEnabled { get; private set; }
        public bool Disposed { get; private set; }
        public void SetState(ApplicationStatus status, bool paused)
        { Status = status; PauseEnabled = !paused; ResumeEnabled = paused; }
        public void Dispose() => Disposed = true;
        public void RaisePause() => PauseRequested?.Invoke(this, EventArgs.Empty);
        public void RaiseResume() => ResumeRequested?.Invoke(this, EventArgs.Empty);
        public void RaiseClear() => ClearRequested?.Invoke(this, EventArgs.Empty);
        public void RaiseDiagnostics() => DiagnosticsRequested?.Invoke(this, EventArgs.Empty);
        public void RaiseKeyFrame() => KeyFrameRequested?.Invoke(this, EventArgs.Empty);
        public void RaiseExit() => ExitRequested?.Invoke(this, EventArgs.Empty);
    }

    private sealed class FakeUi : IUiDispatcher
    {
        private readonly Queue<(Action Action, TaskCompletionSource Completion)> _pending = [];
        public int PostCount { get; private set; }
        public bool HoldAsyncPosts { get; set; }
        public int PendingAsyncPosts { get { lock (_pending) return _pending.Count; } }
        public void Post(Action action) { PostCount++; action(); }
        public Task PostAsync(Action action)
        {
            PostCount++;
            if (!HoldAsyncPosts)
            {
                action();
                return Task.CompletedTask;
            }

            var completion = NewSignal();
            lock (_pending)
                _pending.Enqueue((action, completion));
            return completion.Task;
        }
        public void FlushAsyncPosts()
        {
            while (true)
            {
                (Action Action, TaskCompletionSource Completion) pending;
                lock (_pending)
                {
                    if (!_pending.TryDequeue(out pending))
                        return;
                }
                try
                {
                    pending.Action();
                    pending.Completion.TrySetResult();
                }
                catch (Exception exception)
                {
                    pending.Completion.TrySetException(exception);
                }
            }
        }
    }

    private static class TestObservation
    {
        public static TableObservation Create(DateTimeOffset timestamp)
        {
            var seats = Enum.GetValues<Seat>().ToDictionary(
                seat => seat,
                seat => new SeatObservation(
                    seat, 13, Enumerable.Repeat(true, 13).ToArray(),
                    false, 0, 0, [], true, 1, timestamp));
            return new TableObservation(seats, true, true, false, timestamp);
        }
    }
}
