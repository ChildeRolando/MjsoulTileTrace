using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.Pipeline;
using MahjongSoulOverlay.Vision.Detection;
using MahjongSoulOverlay.Vision.Frames;
using MahjongSoulOverlay.Windows.Capture;
using MahjongSoulOverlay.Windows.Diagnostics;
using MahjongSoulOverlay.Windows.Overlay;

namespace MahjongSoulOverlay.Windows.Shell;

internal sealed class OpenCvFrameDetector : ITableFrameDetector
{
    private readonly OpenCvSeatDetector _detector;

    internal OpenCvFrameDetector(OpenCvSeatDetector detector) =>
        _detector = detector ?? throw new ArgumentNullException(nameof(detector));

    public Task<TableObservation> DetectAsync(
        CapturedFrame frame,
        CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        using var pixelFrame = PixelFrame.CopyFromBgra(
            frame.Width, frame.Height, frame.Stride, frame.Bgra.Span);
        return Task.FromResult(_detector.Detect(pixelFrame, frame.Timestamp));
    }

    public void ResetBaseline() => _detector.ResetBaseline();
    public void Dispose() => _detector.Dispose();
}

internal sealed class OverlayEngineAdapter : IOverlayEngine
{
    private readonly OverlayEngine _engine;
    internal OverlayEngineAdapter(OverlayEngine engine) => _engine = engine;
    public EngineOutput Push(TableObservation observation) => _engine.Push(observation);
    public EngineOutput ManualReset() => _engine.ManualReset();
}

internal sealed class OverlayFormAdapter : IOverlayView
{
    private readonly OverlayForm _form;
    internal OverlayFormAdapter(OverlayForm form) => _form = form;
    public void Update(OverlayUpdate update) => _form.UpdateOverlay(update);
    public void Dispose() => _form.Dispose();
}

internal sealed class DiagnosticSessionAdapter : IDiagnosticSession
{
    private readonly DiagnosticRecorder _recorder;
    internal DiagnosticSessionAdapter(DiagnosticRecorder recorder) => _recorder = recorder;
    public bool IsEnabled => _recorder.IsEnabled;
    public void Enable() => _recorder.Enable();
    public void Disable() => _recorder.Disable();
    public Task RecordAsync(CapturedFrame frame, DiagnosticSnapshot snapshot, bool keyFrame,
        CancellationToken cancellationToken = default) =>
        _recorder.RecordAsync(frame, snapshot, keyFrame, cancellationToken);
    public ValueTask DisposeAsync() => _recorder.DisposeAsync();
}

internal sealed class WindowsFormsDispatcher : IUiDispatcher
{
    private readonly Control _control;
    internal WindowsFormsDispatcher(Control control) => _control = control;
    public void Post(Action action)
    {
        if (_control.IsDisposed || _control.Disposing)
            return;
        if (_control.InvokeRequired)
            _control.BeginInvoke(action);
        else
            action();
    }

    public Task PostAsync(Action action)
    {
        if (_control.IsDisposed || _control.Disposing)
            return Task.CompletedTask;
        if (!_control.InvokeRequired)
        {
            action();
            return Task.CompletedTask;
        }

        var completion = new TaskCompletionSource(
            TaskCreationOptions.RunContinuationsAsynchronously);
        try
        {
            _control.BeginInvoke(() =>
            {
                try
                {
                    action();
                    completion.TrySetResult();
                }
                catch (Exception exception)
                {
                    completion.TrySetException(exception);
                }
            });
        }
        catch (Exception exception)
        {
            completion.TrySetException(exception);
        }
        return completion.Task;
    }
}
