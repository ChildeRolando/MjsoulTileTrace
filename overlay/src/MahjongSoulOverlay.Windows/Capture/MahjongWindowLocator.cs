using System.Runtime.InteropServices;
using System.Text;

namespace MahjongSoulOverlay.Windows.Capture;

public enum TargetWindowChange
{
    Found,
    GeometryChanged,
    Minimized,
    Lost,
    Ambiguous,
}

public sealed record TargetWindowChangedEventArgs(
    TargetWindowChange Change,
    WindowSnapshot? Window,
    ScreenRect? ClientBounds);

public interface IWindowEnumerator
{
    IReadOnlyList<WindowSnapshot> Enumerate();
    ScreenRect GetClientBounds(nint windowHandle);
}

public sealed class MahjongWindowLocator : IAsyncDisposable
{
    private readonly IWindowEnumerator _windows;
    private readonly TimeSpan _pollInterval;
    private readonly object _lifecycleSync = new();
    private CancellationTokenSource? _pollingCancellation;
    private Task? _pollingTask;
    private Task? _stoppingTask;
    private bool _restartRequested;
    private bool _disposed;
    private WindowSnapshot? _target;
    private ScreenRect? _bounds;
    private LocatorState _state;

    public MahjongWindowLocator(
        IWindowEnumerator? windows = null,
        TimeSpan? pollInterval = null)
    {
        _windows = windows ?? new Win32WindowEnumerator();
        _pollInterval = pollInterval ?? TimeSpan.FromSeconds(1);
    }

    public event EventHandler<TargetWindowChangedEventArgs>? TargetChanged;

    public bool IsRunning
    {
        get
        {
            lock (_lifecycleSync)
                return _pollingTask is not null && _stoppingTask is null;
        }
    }

    public void Start()
    {
        lock (_lifecycleSync)
        {
            ObjectDisposedException.ThrowIf(_disposed, this);
            if (_stoppingTask is not null)
            {
                _restartRequested = true;
                return;
            }
            if (_pollingTask is not null)
                return;
            StartCore();
        }
    }

    private void StartCore()
    {
        _pollingCancellation = new CancellationTokenSource();
        _pollingTask = PollAsync(_pollingCancellation.Token);
    }

    public Task StopAsync()
    {
        lock (_lifecycleSync)
        {
            _restartRequested = false;
            if (_stoppingTask is not null)
                return _stoppingTask;
            if (_pollingTask is null)
                return Task.CompletedTask;

            var completion = new TaskCompletionSource(
                TaskCreationOptions.RunContinuationsAsynchronously);
            var polling = _pollingTask;
            var cancellation = _pollingCancellation!;
            _stoppingTask = completion.Task;
            cancellation.Cancel();
            _ = CompleteStopAsync(polling, cancellation, completion);
            return completion.Task;
        }
    }

    public async ValueTask DisposeAsync()
    {
        Task stopping;
        lock (_lifecycleSync)
        {
            if (_disposed)
                return;
            _disposed = true;
            _restartRequested = false;
            stopping = StopAsync();
        }

        await stopping.ConfigureAwait(false);
    }

    private async Task CompleteStopAsync(
        Task polling,
        CancellationTokenSource cancellation,
        TaskCompletionSource completion)
    {
        Exception? error = null;
        try
        {
            await polling.ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
        }
        catch (Exception exception)
        {
            error = exception;
        }
        finally
        {
            cancellation.Dispose();
            lock (_lifecycleSync)
            {
                _pollingCancellation = null;
                _pollingTask = null;
                _stoppingTask = null;
                if (_restartRequested && !_disposed)
                {
                    _restartRequested = false;
                    StartCore();
                }
            }

            if (error is null)
                completion.SetResult();
            else
                completion.SetException(error);
        }
    }

    private async Task PollAsync(CancellationToken cancellationToken)
    {
        using var timer = new PeriodicTimer(_pollInterval);
        do
        {
            PollOnce();
        }
        while (await timer.WaitForNextTickAsync(cancellationToken).ConfigureAwait(false));
    }

    internal void PollOnce()
    {
        var all = _windows.Enumerate();
        var eligible = all.Where(MahjongWindowEligibility.IsEligible).ToArray();
        if (eligible.Length > 1)
        {
            if (_state != LocatorState.Ambiguous)
                SetTarget(null, null, TargetWindowChange.Ambiguous, LocatorState.Ambiguous);
            return;
        }

        if (eligible.Length == 1)
        {
            var next = eligible[0];
            ScreenRect bounds;
            try
            {
                bounds = _windows.GetClientBounds(next.Handle);
            }
            catch (InvalidOperationException)
            {
                SetTarget(null, null, TargetWindowChange.Lost, LocatorState.None);
                return;
            }
            if (_state != LocatorState.Target || _target is null || _target.Handle != next.Handle)
                SetTarget(next, bounds, TargetWindowChange.Found, LocatorState.Target);
            else if (_target != next || _bounds != bounds)
                SetTarget(next, bounds, TargetWindowChange.GeometryChanged, LocatorState.Target);
            else
            {
                _target = next;
                _bounds = bounds;
                _state = LocatorState.Target;
            }

            return;
        }

        if (_target is null)
        {
            if (_state != LocatorState.None)
                SetTarget(null, null, TargetWindowChange.Lost, LocatorState.None);
            return;
        }

        var sameWindow = all.FirstOrDefault(window => window.Handle == _target.Handle);
        if (sameWindow is { Minimized: true })
        {
            if (_state != LocatorState.Minimized)
                SetTarget(sameWindow, null, TargetWindowChange.Minimized, LocatorState.Minimized);
            return;
        }

        if (sameWindow is { Visible: true })
        {
            ScreenRect changedBounds;
            try
            {
                changedBounds = _windows.GetClientBounds(sameWindow.Handle);
            }
            catch (InvalidOperationException)
            {
                SetTarget(null, null, TargetWindowChange.Lost, LocatorState.None);
                return;
            }
            if (_target != sameWindow || _bounds != changedBounds)
                SetTarget(sameWindow, changedBounds, TargetWindowChange.GeometryChanged, LocatorState.Target);
            return;
        }

        SetTarget(null, null, TargetWindowChange.Lost, LocatorState.None);
    }

    private void SetTarget(
        WindowSnapshot? target,
        ScreenRect? bounds,
        TargetWindowChange change,
        LocatorState state)
    {
        _target = target;
        _bounds = bounds;
        _state = state;
        TargetChanged?.Invoke(this, new TargetWindowChangedEventArgs(change, target, bounds));
    }

    private enum LocatorState
    {
        None,
        Target,
        Ambiguous,
        Minimized,
    }
}

public sealed class Win32WindowEnumerator : IWindowEnumerator
{
    private const uint ProcessQueryLimitedInformation = 0x1000;

    public IReadOnlyList<WindowSnapshot> Enumerate()
    {
        var snapshots = new List<WindowSnapshot>();
        NativeMethods.EnumWindows(
            (handle, _) =>
            {
                snapshots.Add(CreateSnapshot(handle));
                return true;
            },
            nint.Zero);
        return snapshots;
    }

    public ScreenRect GetClientBounds(nint windowHandle)
    {
        if (!NativeMethods.GetClientRect(windowHandle, out var rect))
            throw new InvalidOperationException("Unable to read the target client rectangle.");
        var origin = new NativeMethods.Point();
        if (!NativeMethods.ClientToScreen(windowHandle, ref origin))
            throw new InvalidOperationException("Unable to translate the target client rectangle.");
        return ClientGeometry.ToScreen(
            new NativeRect(rect.Left, rect.Top, rect.Right, rect.Bottom),
            new ScreenPoint(origin.X, origin.Y));
    }

    private static WindowSnapshot CreateSnapshot(nint handle)
    {
        var titleLength = NativeMethods.GetWindowTextLength(handle);
        var title = new StringBuilder(titleLength + 1);
        _ = NativeMethods.GetWindowText(handle, title, title.Capacity);
        _ = NativeMethods.GetClientRect(handle, out var rect);
        _ = NativeMethods.GetWindowThreadProcessId(handle, out var processId);

        return new WindowSnapshot(
            handle,
            title.ToString(),
            ReadExecutableName(processId),
            NativeMethods.IsWindowVisible(handle),
            NativeMethods.IsIconic(handle),
            Math.Max(0, rect.Right - rect.Left),
            Math.Max(0, rect.Bottom - rect.Top),
            unchecked((int)NativeMethods.GetDpiForWindow(handle)));
    }

    private static string ReadExecutableName(uint processId)
    {
        var process = NativeMethods.OpenProcess(
            ProcessQueryLimitedInformation,
            false,
            processId);
        if (process == nint.Zero)
            return string.Empty;

        try
        {
            var capacity = 1024;
            var fullPath = new StringBuilder(capacity);
            return NativeMethods.QueryFullProcessImageName(process, 0, fullPath, ref capacity)
                ? Path.GetFileName(fullPath.ToString())
                : string.Empty;
        }
        finally
        {
            _ = NativeMethods.CloseHandle(process);
        }
    }

    private static class NativeMethods
    {
        internal delegate bool EnumWindowsProc(nint windowHandle, nint parameter);

        [StructLayout(LayoutKind.Sequential)]
        internal struct Rect
        {
            internal int Left;
            internal int Top;
            internal int Right;
            internal int Bottom;
        }

        [StructLayout(LayoutKind.Sequential)]
        internal struct Point
        {
            internal int X;
            internal int Y;
        }

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool EnumWindows(EnumWindowsProc callback, nint parameter);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool IsWindowVisible(nint windowHandle);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool IsIconic(nint windowHandle);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool GetClientRect(nint windowHandle, out Rect rect);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool ClientToScreen(nint windowHandle, ref Point point);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        internal static extern int GetWindowText(
            nint windowHandle,
            StringBuilder text,
            int maximumCount);

        [DllImport("user32.dll")]
        internal static extern int GetWindowTextLength(nint windowHandle);

        [DllImport("user32.dll")]
        internal static extern uint GetDpiForWindow(nint windowHandle);

        [DllImport("user32.dll")]
        internal static extern uint GetWindowThreadProcessId(
            nint windowHandle,
            out uint processId);

        [DllImport("kernel32.dll", SetLastError = true)]
        internal static extern nint OpenProcess(
            uint desiredAccess,
            [MarshalAs(UnmanagedType.Bool)] bool inheritHandle,
            uint processId);

        [DllImport("kernel32.dll", EntryPoint = "QueryFullProcessImageNameW",
            CharSet = CharSet.Unicode,
            SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool QueryFullProcessImageName(
            nint process,
            uint flags,
            StringBuilder executableName,
            ref int size);

        [DllImport("kernel32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool CloseHandle(nint handle);
    }
}
