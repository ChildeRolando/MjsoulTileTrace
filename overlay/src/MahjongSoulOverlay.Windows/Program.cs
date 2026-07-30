using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.Events;
using MahjongSoulOverlay.Core.Lifecycle;
using MahjongSoulOverlay.Core.Pipeline;
using MahjongSoulOverlay.Core.River;
using MahjongSoulOverlay.Vision.Detection;
using MahjongSoulOverlay.Vision.Profiles;
using MahjongSoulOverlay.Windows.Capture;
using MahjongSoulOverlay.Windows.Diagnostics;
using MahjongSoulOverlay.Windows.Overlay;
using MahjongSoulOverlay.Windows.Shell;

namespace MahjongSoulOverlay.Windows;

static class Program
{
    /// <summary>
    ///  The main entry point for the application.
    /// </summary>
    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();
        var profilePath = Path.GetFullPath(
            Path.Combine(AppContext.BaseDirectory, "Profiles", "yonma-1920x1080.standard.json"));
        var profile = ProfileLoader.Load(profilePath);
        var detector = new OpenCvFrameDetector(new OpenCvSeatDetector(profile));
        var engine = new OverlayEngineAdapter(CreateEngine());
        var overlayForm = new OverlayForm();
        var context = new TrayApplicationContext(
            new MahjongWindowLocator(),
            new WindowsCaptureSource(),
            detector,
            engine,
            new OverlayFormAdapter(overlayForm),
            new DiagnosticSessionAdapter(new DiagnosticRecorder()),
            new WinFormsTrayView(),
            new WindowsFormsDispatcher(overlayForm));
        context.StartAsync().GetAwaiter().GetResult();
        Application.Run(context);
    }

    internal static OverlayEngine CreateEngine()
    {
        var aggregators = Enum.GetValues<Seat>().ToDictionary(
            seat => seat,
            _ => new TransactionAggregator(TimeSpan.FromSeconds(2), 3));
        var trackers = Enum.GetValues<Seat>().ToDictionary(
            seat => seat,
            _ => new RiverTracker(0.3));
        return new OverlayEngine(
            new TableLifecycle(),
            new EventClassifier(),
            TimeSpan.FromSeconds(2),
            aggregators,
            trackers);
    }
}
