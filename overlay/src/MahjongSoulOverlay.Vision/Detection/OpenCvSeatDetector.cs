using System.Globalization;
using System.Text;
using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.Profiles;
using MahjongSoulOverlay.Vision.Frames;
using OpenCvSharp;

namespace MahjongSoulOverlay.Vision.Detection;

public sealed class OpenCvSeatDetector : IDisposable
{
    private readonly TableProfile _profile;
    private readonly int _stableFramesRequired;
    private readonly Dictionary<Seat, StabilityState> _stability = [];
    private int _resultFrames;
    private bool _disposed;

    public OpenCvSeatDetector(TableProfile profile, int stableFramesRequired = 3)
    {
        ArgumentNullException.ThrowIfNull(profile);
        if (stableFramesRequired <= 0)
            throw new ArgumentOutOfRangeException(
                nameof(stableFramesRequired), "Stable frame count must be positive.");

        var expectedSeats = Enum.GetValues<Seat>();
        if (profile.Seats.Count != expectedSeats.Length ||
            expectedSeats.Any(seat => !profile.Seats.ContainsKey(seat)))
        {
            throw new ArgumentException(
                "A detector profile must contain exactly the four seats.", nameof(profile));
        }

        _profile = profile;
        _stableFramesRequired = stableFramesRequired;
    }

    public TableObservation Detect(PixelFrame frame, DateTimeOffset timestamp)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        ArgumentNullException.ThrowIfNull(frame);
        var mat = frame.Mat;
        if (frame.Width != _profile.Width || frame.Height != _profile.Height)
        {
            throw new ArgumentException(
                $"Frame dimensions must be {_profile.Width}x{_profile.Height}.", nameof(frame));
        }

        var tableColor = DominantTableColor(mat);
        var seats = new Dictionary<Seat, SeatObservation>();
        foreach (var seat in Enum.GetValues<Seat>())
        {
            var profile = _profile.Seats[seat];
            var mainScores = profile.MainSlots
                .Select(slot => SlotScore(mat, slot, tableColor))
                .ToArray();
            var mainSlots = mainScores
                .Select(score => score >= profile.MainHandThresholds.Occupancy)
                .ToArray();
            var drawnScore = SlotScore(mat, profile.DrawnSlot, tableColor);
            var drawn = drawnScore >= profile.DrawnSlotThresholds.Occupancy;

            var river = DetectTiles(
                mat, profile, profile.RiverRegion, [], tableColor, isRiver: true);
            var excludedMeldAreas = profile.MainSlots
                .Zip(mainSlots)
                .Where(pair => pair.Second)
                .Select(pair => pair.First)
                .Concat(drawn ? [profile.DrawnSlot] : [])
                .ToArray();
            var meld = DetectTiles(
                mat, profile, profile.MeldRegion, excludedMeldAreas, tableColor, isRiver: false);
            var meldGroups = CountGroups(meld, profile);
            var signature = Signature(mainSlots, drawn, meldGroups, meld.Count, river);
            var stable = UpdateStability(seat, signature);
            var confidence = ObservationConfidence(
                mainScores, mainSlots, drawnScore, drawn,
                profile, river, meld);

            seats.Add(seat, new SeatObservation(
                seat,
                mainSlots.Count(value => value),
                mainSlots,
                drawn,
                meldGroups,
                meld.Count,
                river.Select(candidate => candidate.Tile).ToArray(),
                stable,
                confidence,
                timestamp));
        }

        var tableVisible = seats.Values.All(seat => seat.MainHandCount > 0);
        var baselineVisible =
            tableVisible &&
            seats.Values.All(seat => seat.IsStable && seat.RiverTiles.Count == 0);
        if (!tableVisible && HasLargeCentralForeground(mat))
            _resultFrames++;
        else
            _resultFrames = 0;

        return new TableObservation(
            seats,
            tableVisible,
            baselineVisible,
            _resultFrames >= 2,
            timestamp);
    }

    public void ResetBaseline()
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        _stability.Clear();
        _resultFrames = 0;
    }

    public void Dispose()
    {
        _disposed = true;
        _stability.Clear();
        _resultFrames = 0;
    }

    private bool UpdateStability(Seat seat, string signature)
    {
        if (!_stability.TryGetValue(seat, out var state) ||
            !string.Equals(state.Signature, signature, StringComparison.Ordinal))
        {
            _stability[seat] = new StabilityState(signature, 1);
            return _stableFramesRequired == 1;
        }

        var count = state.Count + 1;
        _stability[seat] = state with { Count = count };
        return count >= _stableFramesRequired;
    }

    private static string Signature(
        IReadOnlyList<bool> mainSlots,
        bool drawn,
        int meldGroups,
        int meldTiles,
        IReadOnlyList<TileCandidate> river)
    {
        var builder = new StringBuilder(mainSlots.Count + 32);
        foreach (var occupied in mainSlots)
            builder.Append(occupied ? '1' : '0');
        builder.Append('|').Append(drawn ? '1' : '0')
            .Append('|').Append(meldGroups)
            .Append('|').Append(meldTiles)
            .Append('|').Append(river.Count);
        foreach (var candidate in river)
        {
            builder.Append(':')
                .Append(Math.Round(candidate.Center.X, 3).ToString(CultureInfo.InvariantCulture))
                .Append(',')
                .Append(Math.Round(candidate.Center.Y, 3).ToString(CultureInfo.InvariantCulture));
        }
        return builder.ToString();
    }

    private static double ObservationConfidence(
        IReadOnlyList<double> mainScores,
        IReadOnlyList<bool> mainSlots,
        double drawnScore,
        bool drawn,
        SeatProfile profile,
        IReadOnlyList<TileCandidate> river,
        IReadOnlyList<TileCandidate> meld)
    {
        var classifications = mainScores.Zip(mainSlots)
            .Select(pair => ClassificationConfidence(
                pair.First, profile.MainHandThresholds.Occupancy, pair.Second))
            .Append(ClassificationConfidence(
                drawnScore, profile.DrawnSlotThresholds.Occupancy, drawn))
            .ToList();
        classifications.AddRange(river.Select(candidate => candidate.Tile.Confidence));
        classifications.AddRange(meld.Select(candidate => candidate.Tile.Confidence));
        return Math.Clamp(classifications.Min(), 0d, 1d);
    }

    private static double ClassificationConfidence(
        double score, double threshold, bool occupied)
    {
        if (threshold <= 0d)
            return 1d;
        return occupied
            ? Math.Clamp(score / threshold, 0d, 1d)
            : Math.Clamp((threshold - score) / threshold, 0d, 1d);
    }

    private static double SlotScore(Mat frame, NormalizedQuad region, Scalar tableColor)
    {
        var structural = OccupancyScorer.Score(frame, region, baseline: null);
        var regionColor = MeanColor(frame, region);
        var colorDistance = Math.Sqrt(
            Math.Pow(regionColor.Val0 - tableColor.Val0, 2) +
            Math.Pow(regionColor.Val1 - tableColor.Val1, 2) +
            Math.Pow(regionColor.Val2 - tableColor.Val2, 2)) /
            (255d * Math.Sqrt(3d));
        return Math.Clamp(Math.Max(structural, colorDistance), 0d, 1d);
    }

    private static Scalar DominantTableColor(Mat frame)
    {
        using var sampled = new Mat();
        Cv2.Resize(
            frame, sampled, new Size(64, 36), 0, 0, InterpolationFlags.Area);
        var channels = Cv2.Split(sampled);
        try
        {
            var medians = channels.Take(3).Select(Median).ToArray();
            return new Scalar(
                medians.ElementAtOrDefault(0),
                medians.ElementAtOrDefault(1),
                medians.ElementAtOrDefault(2));
        }
        finally
        {
            foreach (var channel in channels)
                channel.Dispose();
        }
    }

    private static double Median(Mat channel)
    {
        var values = new byte[channel.Rows * channel.Cols];
        channel.GetArray(out values);
        Array.Sort(values);
        return values[values.Length / 2];
    }

    private static Scalar MeanColor(Mat frame, NormalizedQuad region)
    {
        var points = ToPixels(region, frame.Width, frame.Height);
        var bounds = Cv2.BoundingRect(points);
        bounds = bounds.Intersect(new Rect(0, 0, frame.Width, frame.Height));
        if (bounds.Width <= 0 || bounds.Height <= 0)
            return Scalar.All(0);

        using var roi = new Mat(frame, bounds);
        using var mask = Mat.Zeros(bounds.Size, MatType.CV_8UC1).ToMat();
        var localPoints = points
            .Select(point => new Point(point.X - bounds.X, point.Y - bounds.Y))
            .ToArray();
        Cv2.FillConvexPoly(mask, localPoints, Scalar.White);
        return Cv2.Mean(roi, mask);
    }

    private static List<TileCandidate> DetectTiles(
        Mat frame,
        SeatProfile profile,
        NormalizedQuad region,
        IReadOnlyList<NormalizedQuad> excluded,
        Scalar tableColor,
        bool isRiver)
    {
        using var grayscale = ToGrayscale(frame);
        using var blurred = new Mat();
        using var edges = new Mat();
        using var mask = Mat.Zeros(frame.Size(), MatType.CV_8UC1).ToMat();
        Cv2.FillConvexPoly(mask, ToPixels(region, frame.Width, frame.Height), Scalar.White);
        if (excluded.Count > 0)
        {
            using var exclusionMask = Mat.Zeros(frame.Size(), MatType.CV_8UC1).ToMat();
            foreach (var quad in excluded)
                Cv2.FillConvexPoly(
                    exclusionMask, ToPixels(quad, frame.Width, frame.Height), Scalar.White);
            using var exclusionKernel =
                Cv2.GetStructuringElement(MorphShapes.Rect, new Size(5, 5));
            Cv2.Dilate(exclusionMask, exclusionMask, exclusionKernel);
            Cv2.BitwiseNot(exclusionMask, exclusionMask);
            Cv2.BitwiseAnd(mask, exclusionMask, mask);
        }

        Cv2.GaussianBlur(grayscale, blurred, new Size(3, 3), 0);
        Cv2.Canny(blurred, edges, 35, 110);
        Cv2.BitwiseAnd(edges, mask, edges);
        using var kernel = Cv2.GetStructuringElement(MorphShapes.Rect, new Size(2, 2));
        Cv2.MorphologyEx(edges, edges, MorphTypes.Close, kernel);
        Cv2.FindContours(
            edges, out var contours, out _, RetrievalModes.List,
            ContourApproximationModes.ApproxSimple);

        using var table = new Mat(frame.Size(), frame.Type(), tableColor);
        using var difference = new Mat();
        Cv2.Absdiff(frame, table, difference);
        var differenceChannels = Cv2.Split(difference);
        Point[][] foregroundContours;
        try
        {
            using var maximumDifference = new Mat();
            Cv2.Max(differenceChannels[0], differenceChannels[1], maximumDifference);
            if (differenceChannels.Length > 2)
                Cv2.Max(maximumDifference, differenceChannels[2], maximumDifference);
            using var foreground = new Mat();
            Cv2.Threshold(
                maximumDifference,
                foreground,
                profile.MinimumTileConfidence * 255d * 0.6d,
                255,
                ThresholdTypes.Binary);
            Cv2.BitwiseAnd(foreground, mask, foreground);
            Cv2.FindContours(
                foreground, out foregroundContours, out _, RetrievalModes.External,
                ContourApproximationModes.ApproxSimple);
        }
        finally
        {
            foreach (var channel in differenceChannels)
                channel.Dispose();
        }

        var candidates = new List<TileCandidate>();
        foreach (var contour in contours.Concat(foregroundContours))
        {
            if (contour.Length < 4)
                continue;
            var rectangle = Cv2.MinAreaRect(contour);
            if (!TryConfidence(rectangle, profile, frame.Width, frame.Height, out var confidence))
                continue;

            var points = rectangle.Points();
            var quad = NormalizeQuad(points, frame.Width, frame.Height);
            var center = new NormalizedPoint(
                Math.Clamp(rectangle.Center.X / frame.Width, 0d, 1d),
                Math.Clamp(rectangle.Center.Y / frame.Height, 0d, 1d));
            var idPrefix = isRiver ? "river" : "meld";
            var id = FormattableString.Invariant(
                $"{profile.Seat.ToString().ToLowerInvariant()}-{idPrefix}-{center.X:F4}-{center.Y:F4}");
            candidates.Add(new TileCandidate(
                new DetectedTile(id, quad, confidence), center));
        }

        var deduplicated = Deduplicate(candidates, profile);
        return Order(
            deduplicated,
            isRiver ? profile.RiverFlowDirection : profile.MeldExpansionDirection);
    }

    private static IReadOnlyList<TileCandidate> Deduplicate(
        IReadOnlyList<TileCandidate> candidates, SeatProfile profile)
    {
        var minimumSeparation =
            Math.Min(profile.ExpectedTileScale.Width, profile.ExpectedTileScale.Height) * 0.35d;
        var accepted = new List<TileCandidate>();
        foreach (var candidate in candidates
                     .OrderByDescending(value => value.Tile.Confidence)
                     .ThenBy(value => value.Center.X)
                     .ThenBy(value => value.Center.Y))
        {
            var duplicate = accepted.Any(existing =>
                Math.Sqrt(
                    Math.Pow(existing.Center.X - candidate.Center.X, 2) +
                    Math.Pow(existing.Center.Y - candidate.Center.Y, 2)) <
                minimumSeparation);
            if (!duplicate)
                accepted.Add(candidate);
        }
        return accepted;
    }

    private static bool TryConfidence(
        RotatedRect rectangle,
        SeatProfile profile,
        int frameWidth,
        int frameHeight,
        out double confidence)
    {
        confidence = 0d;
        var width = Math.Abs(rectangle.Size.Width);
        var height = Math.Abs(rectangle.Size.Height);
        if (width < 2d || height < 2d)
            return false;

        var aspect = width / height;
        var reciprocal = height / width;
        if (!InRange(aspect, profile.MinimumTileAspect, profile.MaximumTileAspect) &&
            !InRange(reciprocal, profile.MinimumTileAspect, profile.MaximumTileAspect))
        {
            return false;
        }

        var angle = NormalizeAngle(rectangle.Angle);
        var alternateAngle = NormalizeAngle(rectangle.Angle + 90d);
        if (!InRange(angle, profile.MinimumAngle, profile.MaximumAngle) &&
            !InRange(alternateAngle, profile.MinimumAngle, profile.MaximumAngle))
        {
            return false;
        }

        var expectedWidth = profile.ExpectedTileScale.Width * frameWidth;
        var expectedHeight = profile.ExpectedTileScale.Height * frameHeight;
        var actual = new[] { width, height }.OrderBy(value => value).ToArray();
        var expected = new[] { expectedWidth, expectedHeight }.OrderBy(value => value).ToArray();
        var tolerance = Math.Clamp(profile.PerspectiveTolerance + 0.35d, 0.35d, 0.9d);
        var firstRatio = actual[0] / expected[0];
        var secondRatio = actual[1] / expected[1];
        if (firstRatio < 1d - tolerance || firstRatio > 1d + tolerance ||
            secondRatio < 1d - tolerance || secondRatio > 1d + tolerance)
        {
            return false;
        }

        var sizeError = (Math.Abs(1d - firstRatio) + Math.Abs(1d - secondRatio)) / 2d;
        confidence = Math.Clamp(1d - sizeError, profile.MinimumTileConfidence, 1d);
        return confidence >= profile.MinimumTileConfidence;
    }

    private static int CountGroups(IReadOnlyList<TileCandidate> candidates, SeatProfile profile)
    {
        if (candidates.Count == 0)
            return 0;

        var horizontal =
            profile.MeldExpansionDirection is LayoutDirection.LeftToRight or LayoutDirection.RightToLeft;
        var expectedSpan = horizontal
            ? profile.ExpectedTileScale.Width
            : profile.ExpectedTileScale.Height;
        var orderedValues = candidates
            .Select(candidate => horizontal ? candidate.Center.X : candidate.Center.Y)
            .OrderBy(value => value)
            .ToArray();
        var groups = 1;
        for (var index = 1; index < orderedValues.Length; index++)
        {
            if (orderedValues[index] - orderedValues[index - 1] > expectedSpan * 1.65d)
                groups++;
        }
        return groups;
    }

    private bool HasLargeCentralForeground(Mat frame)
    {
        var riverPoints = _profile.Seats.Values
            .SelectMany(seat => Points(seat.RiverRegion))
            .ToArray();
        var left = (int)Math.Floor(riverPoints.Min(point => point.X) * frame.Width);
        var top = (int)Math.Floor(riverPoints.Min(point => point.Y) * frame.Height);
        var right = (int)Math.Ceiling(riverPoints.Max(point => point.X) * frame.Width);
        var bottom = (int)Math.Ceiling(riverPoints.Max(point => point.Y) * frame.Height);
        var bounds = new Rect(
            Math.Clamp(left, 0, frame.Width - 1),
            Math.Clamp(top, 0, frame.Height - 1),
            Math.Clamp(right - left, 1, frame.Width - Math.Clamp(left, 0, frame.Width - 1)),
            Math.Clamp(bottom - top, 1, frame.Height - Math.Clamp(top, 0, frame.Height - 1)));

        using var grayscale = ToGrayscale(frame);
        using var central = new Mat(grayscale, bounds);
        using var binary = new Mat();
        Cv2.Threshold(central, binary, 0, 255, ThresholdTypes.Binary | ThresholdTypes.Otsu);
        Cv2.FindContours(
            binary, out var contours, out _, RetrievalModes.External,
            ContourApproximationModes.ApproxSimple);
        return contours.Any(contour => Cv2.ContourArea(contour) >= bounds.Width * bounds.Height * 0.35d);
    }

    private static List<TileCandidate> Order(
        IEnumerable<TileCandidate> source, LayoutDirection direction)
    {
        IOrderedEnumerable<TileCandidate> ordered = direction switch
        {
            LayoutDirection.LeftToRight => source.OrderBy(value => value.Center.X)
                .ThenBy(value => value.Center.Y),
            LayoutDirection.RightToLeft => source.OrderByDescending(value => value.Center.X)
                .ThenBy(value => value.Center.Y),
            LayoutDirection.TopToBottom => source.OrderBy(value => value.Center.Y)
                .ThenBy(value => value.Center.X),
            LayoutDirection.BottomToTop => source.OrderByDescending(value => value.Center.Y)
                .ThenBy(value => value.Center.X),
            _ => throw new ArgumentOutOfRangeException(nameof(direction))
        };
        return ordered.ToList();
    }

    private static NormalizedQuad NormalizeQuad(Point2f[] points, int width, int height)
    {
        var orderedByY = points.OrderBy(point => point.Y).ThenBy(point => point.X).ToArray();
        var top = orderedByY.Take(2).OrderBy(point => point.X).ToArray();
        var bottom = orderedByY.Skip(2).OrderBy(point => point.X).ToArray();
        return new NormalizedQuad(
            Normalize(top[0], width, height),
            Normalize(top[1], width, height),
            Normalize(bottom[1], width, height),
            Normalize(bottom[0], width, height));
    }

    private static NormalizedPoint Normalize(Point2f point, int width, int height) =>
        new(
            Math.Clamp(point.X / width, 0d, 1d),
            Math.Clamp(point.Y / height, 0d, 1d));

    private static Point[] ToPixels(NormalizedQuad quad, int width, int height) =>
        Points(quad)
            .Select(point => new Point(
                Math.Clamp((int)Math.Round(point.X * width), 0, width - 1),
                Math.Clamp((int)Math.Round(point.Y * height), 0, height - 1)))
            .ToArray();

    private static IEnumerable<NormalizedPoint> Points(NormalizedQuad quad) =>
        [quad.TopLeft, quad.TopRight, quad.BottomRight, quad.BottomLeft];

    private static Mat ToGrayscale(Mat frame)
    {
        if (frame.Channels() == 1)
            return frame.Clone();
        var grayscale = new Mat();
        Cv2.CvtColor(
            frame,
            grayscale,
            frame.Channels() == 4
                ? ColorConversionCodes.BGRA2GRAY
                : ColorConversionCodes.BGR2GRAY);
        return grayscale;
    }

    private static bool InRange(double value, double minimum, double maximum) =>
        value >= minimum && value <= maximum;

    private static double NormalizeAngle(double angle)
    {
        while (angle > 180d)
            angle -= 360d;
        while (angle < -180d)
            angle += 360d;
        return angle;
    }

    private sealed record StabilityState(string Signature, int Count);

    private sealed record TileCandidate(DetectedTile Tile, NormalizedPoint Center);
}
