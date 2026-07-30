using System.Threading.Channels;
using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.Lifecycle;
using MahjongSoulOverlay.Core.Pipeline;
using MahjongSoulOverlay.Windows.Capture;
using MahjongSoulOverlay.Windows.Diagnostics;
using MahjongSoulOverlay.Windows.Overlay;

namespace MahjongSoulOverlay.Windows.Shell;

public enum ApplicationStatus
{
    Waiting,
    Unsupported,
    Synchronizing,
    Active,
    Paused,
    WindowLost,
    Error,
}

public static class TrayLabels
{
    public const string WaitingStatus = "状态: 等待雀魂窗口";
    public const string Pause = "暂停识别";
    public const string Resume = "恢复识别";
    public const string ClearHand = "清除本局并重新同步";
    public const string ShowDiagnostics = "显示诊断区域";
    public const string SaveDiagnosticKeyFrame = "保存诊断关键帧";
    public const string Exit = "退出";

    public static string Status(ApplicationStatus status) => status switch
    {
        ApplicationStatus.Waiting => WaitingStatus,
        ApplicationStatus.Unsupported => "状态: 窗口尺寸或 DPI 不受支持",
        ApplicationStatus.Synchronizing => "状态: 正在同步",
        ApplicationStatus.Active => "状态: 本局识别中",
        ApplicationStatus.Paused => "状态: 已暂停",
        ApplicationStatus.WindowLost => "状态: 雀魂窗口已丢失",
        ApplicationStatus.Error => "状态: 识别异常，已暂停",
        _ => throw new ArgumentOutOfRangeException(nameof(status)),
    };
}

internal interface IWindowTargetMonitor : IAsyncDisposable
{
    event EventHandler<TargetWindowChangedEventArgs>? TargetChanged;
    void Start();
    Task StopAsync();
}

internal interface ITableFrameDetector : IDisposable
{
    Task<TableObservation> DetectAsync(CapturedFrame frame, CancellationToken token);
    void ResetBaseline();
}

internal interface IOverlayEngine
{
    EngineOutput Push(TableObservation observation);
    EngineOutput ManualReset();
}

internal interface IOverlayView : IDisposable
{
    void Update(OverlayUpdate update);
}

internal interface IDiagnosticSession : IAsyncDisposable
{
    bool IsEnabled { get; }
    void Enable();
    void Disable();
    Task RecordAsync(
        CapturedFrame frame,
        DiagnosticSnapshot snapshot,
        bool keyFrame,
        CancellationToken cancellationToken = default);
}

internal interface IUiDispatcher
{
    void Post(Action action);
    Task PostAsync(Action action);
}

internal interface ITrayView : IDisposable
{
    event EventHandler? PauseRequested;
    event EventHandler? ResumeRequested;
    event EventHandler? ClearRequested;
    event EventHandler? DiagnosticsRequested;
    event EventHandler? KeyFrameRequested;
    event EventHandler? ExitRequested;
    void SetState(ApplicationStatus status, bool paused);
}

public sealed class TrayApplicationContext : ApplicationContext, IAsyncDisposable
{
    private readonly IWindowTargetMonitor _targetMonitor;
    private readonly IFrameSource _capture;
    private readonly ITableFrameDetector _detector;
    private readonly IOverlayEngine _engine;
    private readonly IOverlayView _overlay;
    private readonly IDiagnosticSession _diagnostics;
    private readonly ITrayView _tray;
    private readonly IUiDispatcher _ui;
    private readonly Channel<QueuedFrame> _frames;
    private readonly object _frameWriteSync = new();
    private readonly CancellationTokenSource _shutdown = new();
    private readonly SemaphoreSlim _stateGate = new(1, 1);
    private readonly SemaphoreSlim _pipelineGate = new(1, 1);
    private Task? _worker;
    private Task? _exitTask;
    private nint _targetHandle;
    private volatile bool _paused;
    private bool _started;
    private volatile bool _exiting;
    private volatile bool _saveNextKeyFrame;
    private long _generation;

    internal TrayApplicationContext(
        IWindowTargetMonitor targetMonitor,
        IFrameSource capture,
        ITableFrameDetector detector,
        IOverlayEngine engine,
        IOverlayView overlay,
        IDiagnosticSession diagnostics,
        ITrayView tray,
        IUiDispatcher ui)
    {
        _targetMonitor = targetMonitor ?? throw new ArgumentNullException(nameof(targetMonitor));
        _capture = capture ?? throw new ArgumentNullException(nameof(capture));
        _detector = detector ?? throw new ArgumentNullException(nameof(detector));
        _engine = engine ?? throw new ArgumentNullException(nameof(engine));
        _overlay = overlay ?? throw new ArgumentNullException(nameof(overlay));
        _diagnostics = diagnostics ?? throw new ArgumentNullException(nameof(diagnostics));
        _tray = tray ?? throw new ArgumentNullException(nameof(tray));
        _ui = ui ?? throw new ArgumentNullException(nameof(ui));
        _frames = Channel.CreateBounded<QueuedFrame>(new BoundedChannelOptions(1)
        {
            SingleReader = true,
            SingleWriter = false,
            FullMode = BoundedChannelFullMode.Wait,
            AllowSynchronousContinuations = false,
        });

        _targetMonitor.TargetChanged += TargetChanged;
        _capture.FrameArrived += FrameArrived;
        _tray.PauseRequested += PauseRequested;
        _tray.ResumeRequested += ResumeRequested;
        _tray.ClearRequested += ClearRequested;
        _tray.DiagnosticsRequested += DiagnosticsRequested;
        _tray.KeyFrameRequested += KeyFrameRequested;
        _tray.ExitRequested += ExitRequested;
        _tray.SetState(ApplicationStatus.Waiting, paused: false);
    }

    public Task StartAsync()
    {
        if (_started)
            return Task.CompletedTask;
        ObjectDisposedException.ThrowIf(_exiting, this);
        _started = true;
        _worker = ProcessFramesAsync(_shutdown.Token);
        _targetMonitor.Start();
        return Task.CompletedTask;
    }

    public Task PauseAsync() => ChangePauseAsync(paused: true);

    public Task ResumeAsync() => ChangePauseAsync(paused: false);

    public Task ExitAsync()
    {
        lock (_frames)
            return _exitTask ??= ExitCoreAsync();
    }

    public async ValueTask DisposeAsync() =>
        await ExitAsync().ConfigureAwait(false);

    private void FrameArrived(object? sender, CapturedFrame frame)
    {
        if (_paused || _exiting || _targetHandle == nint.Zero)
            return;

        lock (_frameWriteSync)
        {
            var queued = new QueuedFrame(
                frame,
                Interlocked.Read(ref _generation),
                _targetHandle);
            if (_frames.Writer.TryWrite(queued))
                return;

            _frames.Reader.TryRead(out _);
            _frames.Writer.TryWrite(queued);
        }
    }

    private void TargetChanged(object? sender, TargetWindowChangedEventArgs args) =>
        Forget(HandleTargetChangedAsync(args));

    private async Task HandleTargetChangedAsync(TargetWindowChangedEventArgs args)
    {
        await _stateGate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_exiting)
                return;

            if (args.Change is TargetWindowChange.Minimized or TargetWindowChange.Lost ||
                args.Window is null)
            {
                _targetHandle = nint.Zero;
                InvalidateFrames();
                await _capture.StopAsync().ConfigureAwait(false);
                Hide();
                SetStatus(ApplicationStatus.WindowLost);
                return;
            }

            if (!IsSupported(args.Window, args.ClientBounds))
            {
                _targetHandle = nint.Zero;
                InvalidateFrames();
                await _capture.StopAsync().ConfigureAwait(false);
                Hide();
                SetStatus(ApplicationStatus.Unsupported);
                return;
            }

            if (_targetHandle != args.Window.Handle)
            {
                if (_targetHandle != nint.Zero)
                    await _capture.StopAsync().ConfigureAwait(false);
                _targetHandle = args.Window.Handle;
                InvalidateFrames();
                await ResetPipelineAsync().ConfigureAwait(false);
                if (!_paused)
                    await _capture.StartAsync(_targetHandle, _shutdown.Token).ConfigureAwait(false);
            }
            SetStatus(_paused ? ApplicationStatus.Paused : ApplicationStatus.Synchronizing);
        }
        catch (Exception exception) when (Contain(exception))
        {
        }
        finally
        {
            _stateGate.Release();
        }
    }

    private async Task ChangePauseAsync(bool paused)
    {
        await _stateGate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_exiting || _paused == paused)
                return;
            _paused = paused;
            if (paused)
            {
                InvalidateFrames();
                await _capture.StopAsync().ConfigureAwait(false);
                Hide();
                SetStatus(ApplicationStatus.Paused);
            }
            else
            {
                InvalidateFrames();
                await ResetPipelineAsync().ConfigureAwait(false);
                SetStatus(_targetHandle == nint.Zero
                    ? ApplicationStatus.Waiting
                    : ApplicationStatus.Synchronizing);
                if (_targetHandle != nint.Zero)
                    await _capture.StartAsync(_targetHandle, _shutdown.Token).ConfigureAwait(false);
            }
        }
        catch (Exception exception) when (Contain(exception))
        {
        }
        finally
        {
            _stateGate.Release();
        }
    }

    private void PauseRequested(object? sender, EventArgs args) => Forget(PauseAsync());
    private void ResumeRequested(object? sender, EventArgs args) => Forget(ResumeAsync());

    private void ClearRequested(object? sender, EventArgs args) =>
        Forget(ClearAsync());

    private async Task ClearAsync()
    {
        await _stateGate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_exiting)
                return;
            InvalidateFrames();
            await ResetPipelineAsync().ConfigureAwait(false);
            SetStatus(_paused
                ? ApplicationStatus.Paused
                : _targetHandle == nint.Zero
                    ? ApplicationStatus.Waiting
                    : ApplicationStatus.Synchronizing);
        }
        catch (Exception exception) when (Contain(exception))
        {
        }
        finally
        {
            _stateGate.Release();
        }
    }

    private void DiagnosticsRequested(object? sender, EventArgs args)
    {
        if (_diagnostics.IsEnabled)
            _diagnostics.Disable();
        else
            _diagnostics.Enable();
    }

    private void KeyFrameRequested(object? sender, EventArgs args) =>
        _saveNextKeyFrame = true;

    private void ExitRequested(object? sender, EventArgs args) => Forget(ExitAsync());

    private async Task ProcessFramesAsync(CancellationToken cancellationToken)
    {
        try
        {
            await foreach (var queued in _frames.Reader.ReadAllAsync(cancellationToken)
                .ConfigureAwait(false))
            {
                if (_paused || _exiting || queued.TargetHandle == nint.Zero ||
                    queued.Generation != Interlocked.Read(ref _generation))
                    continue;

                try
                {
                    await _pipelineGate.WaitAsync(cancellationToken).ConfigureAwait(false);
                    TableObservation observation;
                    EngineOutput output;
                    try
                    {
                        observation = await _detector.DetectAsync(
                            queued.Frame, cancellationToken).ConfigureAwait(false);
                        if (queued.Generation != Interlocked.Read(ref _generation))
                            continue;
                        output = _engine.Push(observation);
                    }
                    finally
                    {
                        _pipelineGate.Release();
                    }

                    if (!IsCurrent(queued))
                        continue;

                    var update = new OverlayUpdate(
                        queued.TargetHandle,
                        TargetEligible: true,
                        output.ShouldHideOverlay,
                        output.Layers.ToArray());
                    var status = output.Lifecycle == LifecycleState.HandActive
                        ? ApplicationStatus.Active
                        : ApplicationStatus.Synchronizing;
                    _ui.Post(() =>
                    {
                        if (!IsCurrent(queued))
                            return;
                        _overlay.Update(update);
                        _tray.SetState(status, paused: false);
                    });

                    if (_diagnostics.IsEnabled && IsCurrent(queued))
                    {
                        var keyFrame = _saveNextKeyFrame;
                        _saveNextKeyFrame = false;
                        await _diagnostics.RecordAsync(
                            queued.Frame,
                            DiagnosticSnapshot.From(observation, output),
                            keyFrame,
                            cancellationToken).ConfigureAwait(false);
                    }
                }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception)
                {
                    await EnterProcessingErrorAsync().ConfigureAwait(false);
                }
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
        catch (Exception exception) when (Contain(exception))
        {
        }
    }

    private async Task EnterProcessingErrorAsync()
    {
        await _stateGate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_exiting)
                return;
            _paused = true;
            InvalidateFrames();
            await _capture.StopAsync().ConfigureAwait(false);
            Hide();
            SetStatus(ApplicationStatus.Error);
        }
        finally
        {
            _stateGate.Release();
        }
    }

    private async Task ExitCoreAsync()
    {
        await _stateGate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_exiting)
                return;
            _exiting = true;
            InvalidateFrames();
            _shutdown.Cancel();
            _frames.Writer.TryComplete();
            await IgnoreFailureAsync(_capture.StopAsync).ConfigureAwait(false);
            await IgnoreFailureAsync(_targetMonitor.StopAsync).ConfigureAwait(false);
        }
        finally
        {
            _stateGate.Release();
        }

        if (_worker is not null)
            await IgnoreFailureAsync(() => _worker).ConfigureAwait(false);
        _capture.FrameArrived -= FrameArrived;
        _targetMonitor.TargetChanged -= TargetChanged;
        await IgnoreFailureAsync(() => _capture.DisposeAsync().AsTask()).ConfigureAwait(false);
        await IgnoreFailureAsync(() => _targetMonitor.DisposeAsync().AsTask()).ConfigureAwait(false);
        await IgnoreFailureAsync(() => _diagnostics.DisposeAsync().AsTask()).ConfigureAwait(false);
        try
        {
            _detector.Dispose();
        }
        catch
        {
        }
        await _ui.PostAsync(() =>
        {
            try
            {
                _overlay.Dispose();
            }
            finally
            {
                try
                {
                    _tray.Dispose();
                }
                finally
                {
                    ExitThread();
                }
            }
        }).ConfigureAwait(false);
        _shutdown.Dispose();
    }

    private async Task ResetPipelineAsync()
    {
        await _pipelineGate.WaitAsync().ConfigureAwait(false);
        EngineOutput output;
        try
        {
            _detector.ResetBaseline();
            output = _engine.ManualReset();
        }
        finally
        {
            _pipelineGate.Release();
        }
        _ui.Post(() => _overlay.Update(new OverlayUpdate(
            _targetHandle,
            _targetHandle != nint.Zero,
            ShouldHide: true,
            output.Layers.ToArray())));
    }

    private void InvalidateFrames()
    {
        Interlocked.Increment(ref _generation);
        lock (_frameWriteSync)
        {
            while (_frames.Reader.TryRead(out _)) { }
        }
    }

    private void Hide() =>
        _ui.Post(() => _overlay.Update(new OverlayUpdate(
            _targetHandle, TargetEligible: false, ShouldHide: true, [])));

    private void SetStatus(ApplicationStatus status) =>
        _ui.Post(() => _tray.SetState(status, _paused));

    private bool IsCurrent(QueuedFrame queued) =>
        !_paused &&
        !_exiting &&
        queued.TargetHandle != nint.Zero &&
        queued.TargetHandle == _targetHandle &&
        queued.Generation == Interlocked.Read(ref _generation);

    private bool Contain(Exception exception)
    {
        if (_exiting && exception is ObjectDisposedException or OperationCanceledException)
            return true;
        _paused = true;
        Hide();
        SetStatus(ApplicationStatus.Error);
        return true;
    }

    private static bool IsSupported(WindowSnapshot window, ScreenRect? bounds) =>
        !window.Minimized &&
        window.ClientWidth == 1920 &&
        window.ClientHeight == 1080 &&
        window.Dpi == 96 &&
        bounds is { Width: 1920, Height: 1080 };

    private static void Forget(Task task) =>
        _ = task.ContinueWith(
            static _ => { },
            CancellationToken.None,
            TaskContinuationOptions.OnlyOnFaulted | TaskContinuationOptions.ExecuteSynchronously,
            TaskScheduler.Default);

    private static async Task IgnoreFailureAsync(Func<Task> operation)
    {
        try
        {
            await operation().ConfigureAwait(false);
        }
        catch
        {
        }
    }

    private sealed record QueuedFrame(
        CapturedFrame Frame,
        long Generation,
        nint TargetHandle);
}

internal sealed class WinFormsTrayView : ITrayView
{
    private readonly NotifyIcon _icon;
    private readonly ToolStripMenuItem _status;
    private readonly ToolStripMenuItem _pause;
    private readonly ToolStripMenuItem _resume;
    private readonly ToolStripMenuItem _diagnostics;

    internal WinFormsTrayView()
    {
        _status = new ToolStripMenuItem(TrayLabels.WaitingStatus) { Enabled = false };
        _pause = Item(TrayLabels.Pause, () => PauseRequested?.Invoke(this, EventArgs.Empty));
        _resume = Item(TrayLabels.Resume, () => ResumeRequested?.Invoke(this, EventArgs.Empty));
        var clear = Item(TrayLabels.ClearHand, () => ClearRequested?.Invoke(this, EventArgs.Empty));
        var show = Item(TrayLabels.ShowDiagnostics, () => DiagnosticsRequested?.Invoke(this, EventArgs.Empty));
        show.CheckOnClick = true;
        _diagnostics = show;
        var key = Item(TrayLabels.SaveDiagnosticKeyFrame,
            () => KeyFrameRequested?.Invoke(this, EventArgs.Empty));
        var exit = Item(TrayLabels.Exit, () => ExitRequested?.Invoke(this, EventArgs.Empty));
        var menu = new ContextMenuStrip();
        menu.Items.AddRange(new ToolStripItem[]
        {
            _status, new ToolStripSeparator(), _pause, _resume, clear,
            _diagnostics, key, new ToolStripSeparator(), exit
        });
        _icon = new NotifyIcon
        {
            Icon = SystemIcons.Application,
            Text = "雀魂手摸切标记",
            ContextMenuStrip = menu,
            Visible = true,
        };
        SetState(ApplicationStatus.Waiting, paused: false);
    }

    public event EventHandler? PauseRequested;
    public event EventHandler? ResumeRequested;
    public event EventHandler? ClearRequested;
    public event EventHandler? DiagnosticsRequested;
    public event EventHandler? KeyFrameRequested;
    public event EventHandler? ExitRequested;

    public void SetState(ApplicationStatus status, bool paused)
    {
        _status.Text = TrayLabels.Status(status);
        _pause.Enabled = !paused;
        _resume.Enabled = paused;
    }

    public void Dispose()
    {
        _icon.Visible = false;
        _icon.ContextMenuStrip?.Dispose();
        _icon.Dispose();
    }

    private static ToolStripMenuItem Item(string text, Action action)
    {
        var item = new ToolStripMenuItem(text);
        item.Click += (_, _) => action();
        return item;
    }
}
