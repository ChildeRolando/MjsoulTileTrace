namespace MahjongSoulOverlay.Windows.Capture;

public interface IWindowsCaptureBackend : IAsyncDisposable
{
    event EventHandler<CapturedFrame>? FrameArrived;
    Task StartAsync(nint windowHandle, CancellationToken cancellationToken);
    Task StopAsync();
}

public sealed class WindowsCaptureSource : IFrameSource
{
    private readonly IWindowsCaptureBackend _backend;
    private readonly SemaphoreSlim _lifecycle = new(1, 1);
    private CancellationTokenRegistration _cancellationRegistration;
    private bool _closing;
    private bool _disposed;

    public WindowsCaptureSource()
        : this(new WindowsGraphicsCaptureBackend())
    {
    }

    public WindowsCaptureSource(IWindowsCaptureBackend backend)
    {
        _backend = backend ?? throw new ArgumentNullException(nameof(backend));
        _backend.FrameArrived += ForwardFrame;
    }

    public event EventHandler<CapturedFrame>? FrameArrived;

    public bool IsRunning { get; private set; }

    public async Task StartAsync(nint windowHandle, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        await _lifecycle.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            ObjectDisposedException.ThrowIf(_disposed || _closing, this);
            if (IsRunning)
                return;
            await _backend.StartAsync(windowHandle, cancellationToken).ConfigureAwait(false);
            IsRunning = true;
            _cancellationRegistration = cancellationToken.Register(
                static state => _ = ((WindowsCaptureSource)state!).StopAsync(),
                this);
        }
        finally
        {
            _lifecycle.Release();
        }
    }

    public async Task StopAsync()
    {
        await _lifecycle.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_disposed)
                return;
            if (!IsRunning)
                return;
            _cancellationRegistration.Dispose();
            await _backend.StopAsync().ConfigureAwait(false);
            IsRunning = false;
        }
        finally
        {
            _lifecycle.Release();
        }
    }

    public async ValueTask DisposeAsync()
    {
        await _lifecycle.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_disposed)
                return;
            _closing = true;
            _cancellationRegistration.Dispose();
            if (IsRunning)
            {
                await _backend.StopAsync().ConfigureAwait(false);
                IsRunning = false;
            }
            _backend.FrameArrived -= ForwardFrame;
            await _backend.DisposeAsync().ConfigureAwait(false);
            _disposed = true;
        }
        finally
        {
            _closing = false;
            _lifecycle.Release();
        }
    }

    private void ForwardFrame(object? sender, CapturedFrame frame) =>
        FrameArrived?.Invoke(this, frame);
}
