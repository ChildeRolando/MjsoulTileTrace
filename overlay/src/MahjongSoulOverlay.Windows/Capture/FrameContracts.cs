namespace MahjongSoulOverlay.Windows.Capture;

public interface IFrameSource : IAsyncDisposable
{
    event EventHandler<CapturedFrame>? FrameArrived;
    Task StartAsync(nint windowHandle, CancellationToken cancellationToken);
    Task StopAsync();
}

public sealed class CapturedFrame
{
    private CapturedFrame(
        int width,
        int height,
        int stride,
        ReadOnlyMemory<byte> bgra,
        DateTimeOffset timestamp)
    {
        Width = width;
        Height = height;
        Stride = stride;
        Bgra = bgra;
        Timestamp = timestamp;
    }

    public int Width { get; }
    public int Height { get; }
    public int Stride { get; }
    public ReadOnlyMemory<byte> Bgra { get; }
    public DateTimeOffset Timestamp { get; }

    public static CapturedFrame CopyFrom(
        int width,
        int height,
        int stride,
        ReadOnlySpan<byte> bgra,
        DateTimeOffset timestamp)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(width);
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(height);
        if (stride < checked(width * 4))
            throw new ArgumentOutOfRangeException(nameof(stride));
        if (bgra.Length < checked(stride * height))
            throw new ArgumentException("The source buffer is smaller than the frame.", nameof(bgra));

        return new CapturedFrame(
            width,
            height,
            stride,
            bgra[..checked(stride * height)].ToArray(),
            timestamp);
    }

    internal static CapturedFrame TakeOwnership(
        int width,
        int height,
        int stride,
        byte[] bgra,
        DateTimeOffset timestamp)
    {
        ArgumentNullException.ThrowIfNull(bgra);
        if (width <= 0 || height <= 0 || stride < checked(width * 4)
            || bgra.Length != checked(stride * height))
        {
            throw new ArgumentException("The owned buffer does not match the frame geometry.", nameof(bgra));
        }

        return new CapturedFrame(width, height, stride, bgra, timestamp);
    }
}

public sealed class LatestFrameDispatcher : IAsyncDisposable
{
    private readonly Func<CapturedFrame, Task> _consumer;
    private readonly object _sync = new();
    private Task? _processing;
    private bool _stopped;

    public LatestFrameDispatcher(Func<CapturedFrame, Task> consumer) =>
        _consumer = consumer ?? throw new ArgumentNullException(nameof(consumer));

    public long DroppedFrames { get; private set; }

    public bool TryPost(CapturedFrame frame)
    {
        lock (_sync)
        {
            if (_stopped || _processing is { IsCompleted: false })
            {
                DroppedFrames++;
                return false;
            }

            _processing = ConsumeAsync(frame);
            return true;
        }
    }

    public async Task StopAsync()
    {
        Task? processing;
        lock (_sync)
        {
            _stopped = true;
            processing = _processing;
        }

        if (processing is not null)
            await processing.ConfigureAwait(false);
    }

    public async ValueTask DisposeAsync() => await StopAsync().ConfigureAwait(false);

    private async Task ConsumeAsync(CapturedFrame frame) =>
        await _consumer(frame).ConfigureAwait(false);
}
