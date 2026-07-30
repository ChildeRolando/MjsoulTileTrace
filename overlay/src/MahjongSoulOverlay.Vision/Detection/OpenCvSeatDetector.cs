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
        var anchorVisibility = new Dictionary<Seat, bool>();
        foreach (var seat in Enum.GetValues<Seat>())
        {
            var profile = _profile.Seats[seat];
            var anchorScore = SlotScore(mat, profile.MainHandRegion, tableColor);
            anchorVisibility.Add(
                seat, anchorScore >= profile.MainHandThresholds.Stable);
            var mainScores = profile.MainSlots
                .Select(slot => SlotScore(mat, slot, tableColor))
                .ToArray();
            var mainSlots = mainScores
                .Select(score => score >= profile.MainHandThresholds.Occupancy)
                .ToArray();
            var drawnScore = SlotScore(mat, profile.DrawnSlot, tableColor);
            var rawDrawn = drawnScore >= profile.DrawnSlotThresholds.Occupancy;

            var river = DetectTiles(
                mat,
                profile,
                profile.RiverRegion,
                [],
                tableColor,
                profile.RiverThresholds,
                profile.RiverTileScale,
                isRiver: true);
            var excludedMeldAreas = profile.MainSlots
                .Zip(mainSlots)
                .Where(pair => pair.Second)
                .Select(pair => pair.First)
                .Concat(rawDrawn && mainSlots.All(value => value)
                    ? [profile.DrawnSlot]
                    : [])
                .ToArray();
            var meld = DetectTiles(
                mat,
                profile,
                profile.MeldRegion,
                excludedMeldAreas,
                tableColor,
                profile.MeldThresholds,
                profile.MeldTileScale,
                isRiver: false);
            var meldTopology = AnalyzeMeldTopology(
                mat, profile, excludedMeldAreas, tableColor);
            var contourGroups = CountGroups(meld, profile, profile.MeldTileScale);
            var meldGroups = meld.Count == 0
                ? 0
                : Math.Max(meldTopology.Groups, contourGroups);
            var meldTiles = meldGroups == 0
                ? 0
                : meld.Count == meldGroups * 4
                    ? meldGroups * 4
                    : meldGroups * 3;
            var drawn = rawDrawn &&
                (mainSlots.All(value => value) ||
                 meldTiles == 0 ||
                 !BoundingBoxesOverlap(profile.DrawnSlot, profile.MeldRegion));
            var signature = Signature(mainSlots, drawn, meldGroups, meldTiles, river);
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
                meldTiles,
                river.Select(candidate => candidate.Tile).ToArray(),
                stable,
                confidence,
                timestamp));
        }

        var tableVisible = anchorVisibility.Values.All(value => value);
        var baselineVisible =
            tableVisible &&
            seats.Values.All(seat =>
                seat.MainHandCount > 0 &&
                seat.IsStable &&
                seat.RiverTiles.Count == 0);
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
        RegionThresholds thresholds,
        TileScale tileScale,
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
        var lowEdgeThreshold = Math.Max(1d, thresholds.Occupancy * 255d);
        var highEdgeThreshold = Math.Max(
            lowEdgeThreshold + 1d, thresholds.Stable * 255d);
        Cv2.Canny(blurred, edges, lowEdgeThreshold, highEdgeThreshold);
        Cv2.BitwiseAnd(edges, mask, edges);
        using var kernel = Cv2.GetStructuringElement(MorphShapes.Rect, new Size(2, 2));
        Cv2.MorphologyEx(edges, edges, MorphTypes.Close, kernel);
        Cv2.FindContours(
            edges, out var contours, out _, RetrievalModes.List,
            ContourApproximationModes.ApproxSimple);

        using var foreground = CreateForegroundMask(frame, tableColor, thresholds);
        Point[][] foregroundContours;
        Cv2.BitwiseAnd(foreground, mask, foreground);
        Cv2.FindContours(
            foreground, out foregroundContours, out _, RetrievalModes.External,
            ContourApproximationModes.ApproxSimple);

        var candidates = new List<TileCandidate>();
        foreach (var contour in contours.Concat(foregroundContours))
        {
            if (contour.Length < 4)
                continue;
            var rectangle = Cv2.MinAreaRect(contour);
            if (!TryConfidence(
                    rectangle,
                    profile,
                    tileScale,
                    frame.Width,
                    frame.Height,
                    out var confidence))
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

        var deduplicated = Deduplicate(candidates, tileScale);
        if (isRiver &&
            deduplicated.Count > 0 &&
            IsFullRiverRegion(region, tileScale))
        {
            var gridCandidates = DetectRiverGrid(
                frame, profile, region, tableColor, thresholds, tileScale);
            if (gridCandidates.Count > deduplicated.Count)
                deduplicated = gridCandidates;
        }
        return Order(
            deduplicated,
            isRiver ? profile.RiverFlowDirection : profile.MeldExpansionDirection);
    }

    private static bool IsFullRiverRegion(
        NormalizedQuad region, TileScale tileScale)
    {
        var points = Points(region).ToArray();
        var boundingArea =
            (points.Max(point => point.X) - points.Min(point => point.X)) *
            (points.Max(point => point.Y) - points.Min(point => point.Y));
        return boundingArea / (tileScale.Width * tileScale.Height) >= 12d;
    }

    private static IReadOnlyList<TileCandidate> DetectRiverGrid(
        Mat frame,
        SeatProfile profile,
        NormalizedQuad region,
        Scalar tableColor,
        RegionThresholds thresholds,
        TileScale tileScale)
    {
        var candidates = new List<TileCandidate>();
        var cells = RiverGrid(region, profile.Seat, profile.RiverFlowDirection);
        for (var index = 0; index < cells.Count; index++)
        {
            var evidenceCell = RiverEvidenceCell(cells[index], profile.Seat);
            var score = SlotScore(frame, evidenceCell, tableColor);
            if (score < thresholds.Occupancy)
                continue;

            var center = Center(cells[index]);
            var quad = ExpectedQuad(center, tileScale);
            var confidence = ClassificationConfidence(
                score, thresholds.Occupancy, occupied: true);
            var id = FormattableString.Invariant(
                $"{profile.Seat.ToString().ToLowerInvariant()}-river-grid-{index:D2}");
            candidates.Add(new TileCandidate(
                new DetectedTile(id, quad, confidence), center));
        }
        if (candidates.Count <= 1 &&
            candidates.All(candidate =>
                candidate.Center != Center(cells[0])))
        {
            candidates.Clear();
        }
        return candidates;
    }

    private static IReadOnlyList<NormalizedQuad> RiverGrid(
        NormalizedQuad region, Seat seat, LayoutDirection direction)
    {
        var horizontal =
            direction is LayoutDirection.LeftToRight or LayoutDirection.RightToLeft;
        var cells = new List<NormalizedQuad>(18);
        for (var crossIndex = 0; crossIndex < 3; crossIndex++)
        {
            var cross = seat is Seat.Top or Seat.Left
                ? 2 - crossIndex
                : crossIndex;
            for (var along = 0; along < 6; along++)
            {
                var flowIndex = direction is LayoutDirection.RightToLeft or
                    LayoutDirection.BottomToTop
                    ? 5 - along
                    : along;
                var column = horizontal ? flowIndex : cross;
                var row = horizontal ? cross : flowIndex;
                var columns = horizontal ? 6d : 3d;
                var rows = horizontal ? 3d : 6d;
                cells.Add(Subdivide(
                    region,
                    column / columns,
                    row / rows,
                    (column + 1) / columns,
                    (row + 1) / rows));
            }
        }
        return cells;
    }

    private static NormalizedQuad RiverEvidenceCell(
        NormalizedQuad cell, Seat seat) =>
        seat switch
        {
            Seat.Bottom => Subdivide(cell, 0.15, 0.4, 0.85, 0.95),
            Seat.Right => Subdivide(cell, 0.4, 0.15, 0.95, 0.85),
            Seat.Top => Subdivide(cell, 0.15, 0.05, 0.85, 0.6),
            Seat.Left => Subdivide(cell, 0.05, 0.15, 0.6, 0.85),
            _ => throw new ArgumentOutOfRangeException(nameof(seat))
        };

    private static NormalizedQuad Subdivide(
        NormalizedQuad region, double left, double top, double right, double bottom) =>
        new(
            Bilinear(region, left, top),
            Bilinear(region, right, top),
            Bilinear(region, right, bottom),
            Bilinear(region, left, bottom));

    private static NormalizedPoint Bilinear(
        NormalizedQuad region, double x, double y)
    {
        var topX = region.TopLeft.X + (region.TopRight.X - region.TopLeft.X) * x;
        var topY = region.TopLeft.Y + (region.TopRight.Y - region.TopLeft.Y) * x;
        var bottomX =
            region.BottomLeft.X + (region.BottomRight.X - region.BottomLeft.X) * x;
        var bottomY =
            region.BottomLeft.Y + (region.BottomRight.Y - region.BottomLeft.Y) * x;
        return new NormalizedPoint(
            topX + (bottomX - topX) * y,
            topY + (bottomY - topY) * y);
    }

    private static NormalizedPoint Center(NormalizedQuad quad) =>
        new(
            Points(quad).Average(point => point.X),
            Points(quad).Average(point => point.Y));

    private static NormalizedQuad ExpectedQuad(
        NormalizedPoint center, TileScale scale)
    {
        var halfWidth = scale.Width / 2d;
        var halfHeight = scale.Height / 2d;
        var left = Math.Clamp(center.X - halfWidth, 0d, 1d);
        var right = Math.Clamp(center.X + halfWidth, 0d, 1d);
        var top = Math.Clamp(center.Y - halfHeight, 0d, 1d);
        var bottom = Math.Clamp(center.Y + halfHeight, 0d, 1d);
        return new NormalizedQuad(
            new(left, top), new(right, top),
            new(right, bottom), new(left, bottom));
    }

    private static MeldTopology AnalyzeMeldTopology(
        Mat frame,
        SeatProfile profile,
        IReadOnlyList<NormalizedQuad> excluded,
        Scalar tableColor)
    {
        using var foreground =
            CreateForegroundMask(frame, tableColor, profile.MeldThresholds);
        using var regionMask = Mat.Zeros(frame.Size(), MatType.CV_8UC1).ToMat();
        Cv2.FillConvexPoly(
            regionMask,
            ToPixels(profile.MeldRegion, frame.Width, frame.Height),
            Scalar.White);
        if (excluded.Count > 0)
        {
            using var exclusion = Mat.Zeros(frame.Size(), MatType.CV_8UC1).ToMat();
            foreach (var quad in excluded)
                Cv2.FillConvexPoly(
                    exclusion, ToPixels(quad, frame.Width, frame.Height), Scalar.White);
            using var kernel = Cv2.GetStructuringElement(MorphShapes.Rect, new Size(5, 5));
            Cv2.Dilate(exclusion, exclusion, kernel);
            Cv2.BitwiseNot(exclusion, exclusion);
            Cv2.BitwiseAnd(regionMask, exclusion, regionMask);
        }
        Cv2.BitwiseAnd(foreground, regionMask, foreground);

        var bounds = Cv2.BoundingRect(
            ToPixels(profile.MeldRegion, frame.Width, frame.Height));
        bounds = bounds.Intersect(new Rect(0, 0, frame.Width, frame.Height));
        if (bounds.Width <= 0 || bounds.Height <= 0)
            return new MeldTopology(0, 0);

        using var roi = new Mat(foreground, bounds);
        var horizontal =
            profile.MeldExpansionDirection is LayoutDirection.LeftToRight or
                LayoutDirection.RightToLeft;
        var axisLength = horizontal ? roi.Width : roi.Height;
        var expectedAxisSpan = horizontal
            ? profile.MeldTileScale.Width * frame.Width
            : profile.MeldTileScale.Height * frame.Height;
        var expectedPerpendicularSpan = horizontal
            ? profile.MeldTileScale.Height * frame.Height
            : profile.MeldTileScale.Width * frame.Width;
        var minimumProjection = Math.Max(1, expectedPerpendicularSpan * 0.18d);
        var occupied = new bool[axisLength];
        for (var index = 0; index < axisLength; index++)
        {
            using var slice = horizontal
                ? new Mat(roi, new Rect(index, 0, 1, roi.Height))
                : new Mat(roi, new Rect(0, index, roi.Width, 1));
            occupied[index] = Cv2.CountNonZero(slice) >= minimumProjection;
        }

        var minimumRun = Math.Max(
            2,
            expectedAxisSpan * (1d - profile.PerspectiveTolerance) * 0.3d);
        var runs = FindRuns(occupied)
            .Where(run => run.End - run.Start + 1 >= minimumRun)
            .ToArray();
        if (runs.Length == 0)
            return new MeldTopology(0, 0);

        var gapGroups = 1;
        var groupGap = Math.Max(3d, expectedAxisSpan * 0.12d);
        for (var index = 1; index < runs.Length; index++)
        {
            if (runs[index].Start - runs[index - 1].End - 1 > groupGap)
                gapGroups++;
        }
        var groups = Math.Max(gapGroups, (int)Math.Ceiling(runs.Length / 4d));
        return new MeldTopology(groups, runs.Length);
    }

    private static IEnumerable<(int Start, int End)> FindRuns(
        IReadOnlyList<bool> occupied)
    {
        var start = -1;
        for (var index = 0; index < occupied.Count; index++)
        {
            if (occupied[index] && start < 0)
                start = index;
            if (!occupied[index] && start >= 0)
            {
                yield return (start, index - 1);
                start = -1;
            }
        }
        if (start >= 0)
            yield return (start, occupied.Count - 1);
    }

    private static Mat CreateForegroundMask(
        Mat frame, Scalar tableColor, RegionThresholds thresholds)
    {
        using var table = new Mat(frame.Size(), frame.Type(), tableColor);
        using var difference = new Mat();
        Cv2.Absdiff(frame, table, difference);
        var channels = Cv2.Split(difference);
        try
        {
            var maximumDifference = new Mat();
            Cv2.Max(channels[0], channels[1], maximumDifference);
            if (channels.Length > 2)
                Cv2.Max(maximumDifference, channels[2], maximumDifference);
            Cv2.Threshold(
                maximumDifference,
                maximumDifference,
                thresholds.Occupancy * 255d,
                255,
                ThresholdTypes.Binary);
            return maximumDifference;
        }
        finally
        {
            foreach (var channel in channels)
                channel.Dispose();
        }
    }

    private static bool BoundingBoxesOverlap(
        NormalizedQuad first, NormalizedQuad second)
    {
        var firstPoints = Points(first).ToArray();
        var secondPoints = Points(second).ToArray();
        return Math.Min(firstPoints.Max(point => point.X), secondPoints.Max(point => point.X)) >
               Math.Max(firstPoints.Min(point => point.X), secondPoints.Min(point => point.X)) &&
               Math.Min(firstPoints.Max(point => point.Y), secondPoints.Max(point => point.Y)) >
               Math.Max(firstPoints.Min(point => point.Y), secondPoints.Min(point => point.Y));
    }

    private static IReadOnlyList<TileCandidate> Deduplicate(
        IReadOnlyList<TileCandidate> candidates, TileScale tileScale)
    {
        var minimumSeparation =
            Math.Min(tileScale.Width, tileScale.Height) * 0.35d;
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
        TileScale tileScale,
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

        var expectedWidth = tileScale.Width * frameWidth;
        var expectedHeight = tileScale.Height * frameHeight;
        var actual = new[] { width, height }.OrderBy(value => value).ToArray();
        var expected = new[] { expectedWidth, expectedHeight }.OrderBy(value => value).ToArray();
        var tolerance = profile.PerspectiveTolerance;
        var firstRatio = actual[0] / expected[0];
        var secondRatio = actual[1] / expected[1];
        if (firstRatio < 1d - tolerance || firstRatio > 1d + tolerance ||
            secondRatio < 1d - tolerance || secondRatio > 1d + tolerance)
        {
            return false;
        }

        var sizeError = (Math.Abs(1d - firstRatio) + Math.Abs(1d - secondRatio)) / 2d;
        confidence = Math.Clamp(1d - sizeError, 0d, 1d);
        return confidence >= profile.MinimumTileConfidence;
    }

    private static int CountGroups(
        IReadOnlyList<TileCandidate> candidates,
        SeatProfile profile,
        TileScale tileScale)
    {
        if (candidates.Count == 0)
            return 0;

        var horizontal =
            profile.MeldExpansionDirection is LayoutDirection.LeftToRight or LayoutDirection.RightToLeft;
        var expectedSpan = horizontal
            ? tileScale.Width
            : tileScale.Height;
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

    private readonly record struct MeldTopology(int Groups, int Tiles);
}
