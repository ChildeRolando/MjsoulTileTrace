using System.Text.Json;
using System.Text.Json.Serialization;
using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.Events;
using MahjongSoulOverlay.Core.Lifecycle;
using MahjongSoulOverlay.Core.Pipeline;
using MahjongSoulOverlay.Core.Profiles;
using MahjongSoulOverlay.Core.River;
using MahjongSoulOverlay.Vision.Detection;
using MahjongSoulOverlay.Vision.Frames;
using MahjongSoulOverlay.Vision.Profiles;
using OpenCvSharp;

namespace MahjongSoulOverlay.Replay;

public sealed record ReplayOptions(
    string InputPath,
    string ProfilePath,
    string EventsPath,
    string? AnnotatedPath);

public sealed record ReplayAuditRecord(
    int FrameNumber,
    DateTimeOffset Timestamp,
    IReadOnlyList<SeatObservation> Observations,
    LifecycleState Lifecycle,
    IReadOnlyList<TableEvent> Events,
    IReadOnlyList<CandidateResolution> CandidateResolutions,
    IReadOnlyList<OverlayLayer> Layers);

public static class ReplayAuditJson
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Converters = { new JsonStringEnumConverter() },
    };

    public static string Serialize(ReplayAuditRecord record)
    {
        ArgumentNullException.ThrowIfNull(record);
        return JsonSerializer.Serialize(record, Options);
    }
}

public static class ReplayFrameCount
{
    public static bool IsTrustworthy(double frameCount) =>
        double.IsFinite(frameCount) &&
        frameCount > 0d &&
        Math.Abs(frameCount - Math.Round(frameCount)) < 0.000001d;
}

public sealed class ReplayRunner
{
    private const int RequiredWidth = 1920;
    private const int RequiredHeight = 1080;

    public int Run(ReplayOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        if (!TryResolvePaths(options, out var paths))
            return 2;

        TableProfile profile;
        try
        {
            profile = ProfileLoader.Load(paths.Profile);
        }
        catch (Exception exception) when (
            exception is IOException or UnauthorizedAccessException or
            JsonException or InvalidDataException or ArgumentException)
        {
            return 2;
        }

        try
        {
            return RunValidated(paths, profile);
        }
        catch (Exception exception) when (
            exception is OpenCvSharpException or IOException or
            UnauthorizedAccessException or ArgumentException)
        {
            return 1;
        }
    }

    private static int RunValidated(ResolvedReplayPaths paths, TableProfile profile)
    {
        using var capture = new VideoCapture(paths.Input);
        if (!capture.IsOpened())
            return 1;

        var width = (int)capture.FrameWidth;
        var height = (int)capture.FrameHeight;
        if (width != RequiredWidth || height != RequiredHeight)
            return 2;

        var framesPerSecond = capture.Fps;
        if (!double.IsFinite(framesPerSecond) || framesPerSecond <= 0d)
            return 1;
        var reportedFrameCount = (double)capture.FrameCount;
        if (!ReplayFrameCount.IsTrustworthy(reportedFrameCount))
            return 1;
        var expectedFrames = (long)Math.Round(reportedFrameCount);

        EnsureParentDirectory(paths.Events);
        if (paths.Annotated is not null)
            EnsureParentDirectory(paths.Annotated);
        var temporaryEvents = TemporarySibling(paths.Events);
        var temporaryAnnotated = paths.Annotated is null
            ? null
            : TemporarySibling(paths.Annotated);
        try
        {
            var result = Process(
                capture,
                profile,
                temporaryEvents,
                temporaryAnnotated,
                framesPerSecond,
                expectedFrames,
                new Size(width, height));
            if (result != 0)
                return result;

            if (temporaryAnnotated is not null && paths.Annotated is not null)
                File.Move(temporaryAnnotated, paths.Annotated);
            File.Move(temporaryEvents, paths.Events);
            return 0;
        }
        finally
        {
            TryDelete(temporaryEvents);
            if (temporaryAnnotated is not null)
                TryDelete(temporaryAnnotated);
        }
    }

    private static int Process(
        VideoCapture capture,
        TableProfile profile,
        string eventsPath,
        string? annotatedPath,
        double framesPerSecond,
        long expectedFrames,
        Size size)
    {
        using var detector = new OpenCvSeatDetector(profile);
        var engine = CreateEngine();
        using var annotated = annotatedPath is null
            ? null
            : CreateAnnotatedWriter(annotatedPath, framesPerSecond, size);
        if (annotatedPath is not null && (annotated is null || !annotated.IsOpened()))
            return 1;

        using var output = new StreamWriter(
            new FileStream(eventsPath, FileMode.CreateNew, FileAccess.Write, FileShare.Read));
        using var frame = new Mat();
        var frameNumber = 0;
        while (capture.Read(frame))
        {
            if (frame.Empty())
                return 1;
            if (frame.Width != RequiredWidth || frame.Height != RequiredHeight)
                return 2;

            var timestamp = DateTimeOffset.UnixEpoch +
                TimeSpan.FromSeconds(frameNumber / framesPerSecond);
            using var pixels = new PixelFrame(frame.Clone());
            var observation = detector.Detect(pixels, timestamp);
            var engineOutput = engine.Push(observation);
            var record = new ReplayAuditRecord(
                frameNumber,
                timestamp,
                observation.Seats.Values.OrderBy(seat => seat.Seat).ToArray(),
                engineOutput.Lifecycle,
                engineOutput.Events,
                engineOutput.CandidateResolutions,
                engineOutput.Layers);
            output.WriteLine(ReplayAuditJson.Serialize(record));

            if (annotated is not null)
            {
                using var rendered = frame.Clone();
                ReplayAnnotator.Draw(rendered, profile, record);
                annotated.Write(rendered);
            }

            frameNumber++;
        }

        output.Flush();
        if (frameNumber == 0 ||
            expectedFrames > 0 && frameNumber < expectedFrames)
        {
            return 1;
        }

        return 0;
    }

    private static bool TryResolvePaths(
        ReplayOptions options,
        out ResolvedReplayPaths paths)
    {
        paths = new ResolvedReplayPaths(string.Empty, string.Empty, string.Empty, null);
        if (string.IsNullOrWhiteSpace(options.InputPath) ||
            string.IsNullOrWhiteSpace(options.ProfilePath) ||
            string.IsNullOrWhiteSpace(options.EventsPath))
        {
            return false;
        }

        try
        {
            var input = CanonicalPath(options.InputPath);
            var profile = CanonicalPath(options.ProfilePath);
            var events = CanonicalPath(options.EventsPath);
            var annotated = string.IsNullOrWhiteSpace(options.AnnotatedPath)
                ? null
                : CanonicalPath(options.AnnotatedPath);
            if (!File.Exists(input) || !File.Exists(profile))
                return false;
            if (File.Exists(events) ||
                annotated is not null && File.Exists(annotated))
            {
                return false;
            }

            var allPaths = new[] { input, profile, events, annotated }
                .Where(path => path is not null)
                .Cast<string>()
                .ToArray();
            if (allPaths.Distinct(StringComparer.OrdinalIgnoreCase).Count() != allPaths.Length)
                return false;

            paths = new ResolvedReplayPaths(input, profile, events, annotated);
            return true;
        }
        catch (Exception exception) when (
            exception is ArgumentException or NotSupportedException or
            PathTooLongException or UnauthorizedAccessException)
        {
            return false;
        }
    }

    private static string CanonicalPath(string path)
    {
        var fullPath = Path.GetFullPath(path);
        var root = Path.GetPathRoot(fullPath)
            ?? throw new ArgumentException("Path must have a root.", nameof(path));
        var current = root;
        foreach (var component in fullPath[root.Length..].Split(
                     new[] { Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar },
                     StringSplitOptions.RemoveEmptyEntries))
        {
            var candidate = Path.Combine(current, component);
            FileSystemInfo? info = Directory.Exists(candidate)
                ? new DirectoryInfo(candidate)
                : File.Exists(candidate)
                    ? new FileInfo(candidate)
                    : null;
            current = info?.ResolveLinkTarget(returnFinalTarget: true)?.FullName
                ?? candidate;
        }

        return Path.GetFullPath(current);
    }

    private static string TemporarySibling(string path)
    {
        var directory = Path.GetDirectoryName(path) ?? string.Empty;
        var stem = Path.GetFileNameWithoutExtension(path);
        var extension = Path.GetExtension(path);
        return Path.Combine(
            directory,
            $"{stem}.partial-{Guid.NewGuid():N}{extension}");
    }

    private static void TryDelete(string path)
    {
        try
        {
            File.Delete(path);
        }
        catch (IOException)
        {
        }
        catch (UnauthorizedAccessException)
        {
        }
    }

    private sealed record ResolvedReplayPaths(
        string Input,
        string Profile,
        string Events,
        string? Annotated);

    private static void EnsureParentDirectory(string path)
    {
        var parent = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(parent))
            Directory.CreateDirectory(parent);
    }

    private static VideoWriter CreateAnnotatedWriter(
        string path,
        double framesPerSecond,
        Size size)
    {
        var extension = Path.GetExtension(path);
        var codec = string.Equals(extension, ".avi", StringComparison.OrdinalIgnoreCase)
            ? VideoWriter.FourCC('M', 'J', 'P', 'G')
            : VideoWriter.FourCC('m', 'p', '4', 'v');
        return new VideoWriter(path, codec, framesPerSecond, size);
    }

    private static OverlayEngine CreateEngine()
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

internal static class ReplayAnnotator
{
    public static void Draw(
        Mat frame,
        TableProfile profile,
        ReplayAuditRecord record)
    {
        foreach (var seat in Enum.GetValues<Seat>())
        {
            var seatProfile = profile.Seats[seat];
            DrawQuad(frame, seatProfile.MainHandRegion, new Scalar(0, 220, 220), 1);
            DrawQuad(frame, seatProfile.DrawnSlot, new Scalar(220, 220, 0), 2);
            DrawQuad(frame, seatProfile.RiverRegion, new Scalar(0, 0, 255), 2);
            DrawQuad(frame, seatProfile.MeldRegion, new Scalar(255, 0, 255), 2);

            var observation = record.Observations.Single(item => item.Seat == seat);
            foreach (var tile in observation.RiverTiles)
                DrawQuad(frame, tile.Quad, new Scalar(0, 255, 0), 1);
            Cv2.PutText(
                frame,
                $"{seat} H{observation.MainHandCount} D{(observation.DrawnSlotOccupied ? 1 : 0)} " +
                $"R{observation.RiverTiles.Count} M{observation.MeldGroups}/{observation.MeldTiles} " +
                $"{observation.Confidence:F2}",
                LabelPoint(seat),
                HersheyFonts.HersheySimplex,
                0.55,
                Scalar.White,
                1,
                LineTypes.AntiAlias);
        }

        foreach (var layer in record.Layers)
        {
            var colour = layer.Kind == DiscardKind.Tsumogiri
                ? new Scalar(96, 96, 96)
                : new Scalar(0, 190, 255);
            DrawQuad(frame, layer.Quad, colour, layer.Kind == DiscardKind.Tedashi ? 4 : 2);
        }

        Cv2.PutText(
            frame,
            $"#{record.FrameNumber} {record.Timestamp:O} {record.Lifecycle}",
            new Point(20, 30),
            HersheyFonts.HersheySimplex,
            0.6,
            Scalar.White,
            1,
            LineTypes.AntiAlias);
    }

    private static Point LabelPoint(Seat seat) => seat switch
    {
        Seat.Bottom => new Point(20, 1050),
        Seat.Right => new Point(1450, 540),
        Seat.Top => new Point(760, 30),
        Seat.Left => new Point(20, 540),
        _ => throw new ArgumentOutOfRangeException(nameof(seat)),
    };

    private static void DrawQuad(
        Mat frame,
        NormalizedQuad quad,
        Scalar colour,
        int thickness)
    {
        var points = new[]
        {
            Point(quad.TopLeft, frame),
            Point(quad.TopRight, frame),
            Point(quad.BottomRight, frame),
            Point(quad.BottomLeft, frame),
        };
        Cv2.Polylines(frame, [points], true, colour, thickness, LineTypes.AntiAlias);
    }

    private static Point Point(NormalizedPoint point, Mat frame) =>
        new(
            Math.Clamp((int)Math.Round(point.X * frame.Width), 0, frame.Width - 1),
            Math.Clamp((int)Math.Round(point.Y * frame.Height), 0, frame.Height - 1));
}
