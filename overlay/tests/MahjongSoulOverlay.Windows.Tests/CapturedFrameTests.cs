using MahjongSoulOverlay.Windows.Capture;

namespace MahjongSoulOverlay.Windows.Tests;

public sealed class CapturedFrameTests
{
    [Fact]
    public void Frame_copies_source_bytes_and_preserves_stride()
    {
        var source = new byte[] { 1, 2, 3, 4, 5, 6, 7, 8 };
        var frame = CapturedFrame.CopyFrom(1, 2, 4, source, DateTimeOffset.UnixEpoch);
        source[0] = 99;

        Assert.Equal(4, frame.Stride);
        Assert.Equal(1, frame.Bgra.Span[0]);
    }

    [Fact]
    public async Task Dispatcher_drops_frames_while_consumer_is_busy()
    {
        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var consumed = new List<int>();
        await using var dispatcher = new LatestFrameDispatcher(async frame =>
        {
            consumed.Add(frame.Bgra.Span[0]);
            await gate.Task;
        });

        Assert.True(dispatcher.TryPost(Frame(1)));
        Assert.False(dispatcher.TryPost(Frame(2)));
        gate.SetResult();
        await dispatcher.StopAsync();

        Assert.Equal([1], consumed);
        Assert.Equal(1, dispatcher.DroppedFrames);
    }

    [Fact]
    public async Task Frame_source_start_stop_and_dispose_are_idempotent_and_cancelable()
    {
        var backend = new FakeCaptureBackend();
        await using var source = new WindowsCaptureSource(backend);
        using var cancellation = new CancellationTokenSource();

        await source.StartAsync(123, cancellation.Token);
        await source.StartAsync(123, cancellation.Token);
        cancellation.Cancel();
        await source.StopAsync();
        await source.StopAsync();

        Assert.Equal(1, backend.StartCount);
        Assert.Equal(1, backend.StopCount);
    }

    [Fact]
    public async Task Frame_source_propagates_start_errors_without_becoming_started()
    {
        var backend = new FakeCaptureBackend { StartError = new InvalidOperationException("boom") };
        await using var source = new WindowsCaptureSource(backend);

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => source.StartAsync(123, CancellationToken.None));

        Assert.False(source.IsRunning);
    }

    [Fact]
    public async Task Frame_source_can_retry_cleanup_after_a_stop_error()
    {
        var backend = new FakeCaptureBackend { StopFailuresRemaining = 1 };
        await using var source = new WindowsCaptureSource(backend);
        await source.StartAsync(123, CancellationToken.None);

        await Assert.ThrowsAsync<InvalidOperationException>(() => source.StopAsync());
        Assert.True(source.IsRunning);
        await source.StopAsync();

        Assert.False(source.IsRunning);
        Assert.Equal(2, backend.StopCount);
    }

    [Fact]
    public async Task Start_queued_during_dispose_is_rejected()
    {
        var backend = new FakeCaptureBackend { BlockStop = true };
        var source = new WindowsCaptureSource(backend);
        await source.StartAsync(123, CancellationToken.None);

        var disposing = source.DisposeAsync().AsTask();
        await backend.StopEntered.Task;
        var starting = source.StartAsync(456, CancellationToken.None);
        backend.AllowStop.SetResult();

        await disposing;
        await Assert.ThrowsAsync<ObjectDisposedException>(() => starting);
        Assert.False(source.IsRunning);
        Assert.Equal(1, backend.StartCount);
    }

    private static CapturedFrame Frame(byte value) =>
        CapturedFrame.CopyFrom(1, 1, 4, [value, 0, 0, 0], DateTimeOffset.UtcNow);

    private sealed class FakeCaptureBackend : IWindowsCaptureBackend
    {
        public int StartCount { get; private set; }
        public int StopCount { get; private set; }
        public Exception? StartError { get; init; }
        public int StopFailuresRemaining { get; set; }
        public bool BlockStop { get; init; }
        public TaskCompletionSource StopEntered { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource AllowStop { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public event EventHandler<CapturedFrame>? FrameArrived
        {
            add { }
            remove { }
        }

        public Task StartAsync(nint windowHandle, CancellationToken cancellationToken)
        {
            StartCount++;
            if (StartError is not null)
                return Task.FromException(StartError);
            return Task.CompletedTask;
        }

        public async Task StopAsync()
        {
            StopCount++;
            if (StopFailuresRemaining-- > 0)
                throw new InvalidOperationException("stop failed");
            if (BlockStop)
            {
                StopEntered.TrySetResult();
                await AllowStop.Task;
            }
        }

        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }
}
