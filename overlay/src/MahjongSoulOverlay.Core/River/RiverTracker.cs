using System.Collections.ObjectModel;
using MahjongSoulOverlay.Core.Domain;

namespace MahjongSoulOverlay.Core.River;

public sealed class RiverTracker
{
    private const double GeometryEpsilon = 1e-12;

    private readonly double _minimumIntersectionOverUnion;
    private readonly List<RiverTile> _tiles = [];

    public RiverTracker(double minimumIntersectionOverUnion)
    {
        if (!double.IsFinite(minimumIntersectionOverUnion)
            || minimumIntersectionOverUnion is < 0d or > 1d)
        {
            throw new ArgumentOutOfRangeException(
                nameof(minimumIntersectionOverUnion),
                minimumIntersectionOverUnion,
                "Intersection-over-union threshold must be within [0, 1].");
        }

        _minimumIntersectionOverUnion = minimumIntersectionOverUnion;
    }

    public IReadOnlyList<RiverTile> Tiles => Snapshot(_tiles);

    public RiverUpdateResult Update(
        Seat seat,
        IReadOnlyList<DetectedTile> detections,
        DiscardKind? newDiscardKind,
        DateTimeOffset timestamp,
        bool callConfirmed = false)
    {
        if (!Enum.IsDefined(seat))
            throw new ArgumentOutOfRangeException(nameof(seat), seat, "Seat is not defined.");
        ArgumentNullException.ThrowIfNull(detections);
        if (detections.Any(static detection => detection is null))
            throw new ArgumentException("Detections cannot contain null elements.", nameof(detections));
        if (newDiscardKind is { } kind && !Enum.IsDefined(kind))
        {
            throw new ArgumentOutOfRangeException(
                nameof(newDiscardKind), newDiscardKind, "Discard kind is not defined.");
        }

        var seatTiles = _tiles
            .Select((tile, index) => new IndexedTile(index, tile))
            .Where(entry => entry.Tile.Seat == seat)
            .ToArray();

        var pairs = new List<MatchPair>();
        for (var existingIndex = 0; existingIndex < seatTiles.Length; existingIndex++)
        {
            for (var detectionIndex = 0; detectionIndex < detections.Count; detectionIndex++)
            {
                var overlap = IntersectionOverUnion(
                    seatTiles[existingIndex].Tile.Quad,
                    detections[detectionIndex].Quad);
                if (overlap > 0d && overlap >= _minimumIntersectionOverUnion)
                    pairs.Add(new MatchPair(existingIndex, detectionIndex, overlap));
            }
        }

        pairs.Sort(static (left, right) =>
        {
            var byOverlap = right.IntersectionOverUnion.CompareTo(left.IntersectionOverUnion);
            if (byOverlap != 0)
                return byOverlap;

            var byExisting = left.ExistingIndex.CompareTo(right.ExistingIndex);
            return byExisting != 0
                ? byExisting
                : left.DetectionIndex.CompareTo(right.DetectionIndex);
        });

        var assignedExisting = new bool[seatTiles.Length];
        var assignedDetections = new bool[detections.Count];
        var detectionForExisting = new int[seatTiles.Length];
        Array.Fill(detectionForExisting, -1);

        foreach (var pair in pairs)
        {
            if (assignedExisting[pair.ExistingIndex]
                || assignedDetections[pair.DetectionIndex])
            {
                continue;
            }

            assignedExisting[pair.ExistingIndex] = true;
            assignedDetections[pair.DetectionIndex] = true;
            detectionForExisting[pair.ExistingIndex] = pair.DetectionIndex;
        }

        var updated = new List<RiverTile>();
        var removed = new List<RiverTile>();
        for (var existingIndex = 0; existingIndex < seatTiles.Length; existingIndex++)
        {
            var indexedTile = seatTiles[existingIndex];
            if (assignedExisting[existingIndex])
            {
                var detection = detections[detectionForExisting[existingIndex]];
                var changed = indexedTile.Tile with
                {
                    Quad = detection.Quad,
                    Confidence = detection.Confidence
                };
                _tiles[indexedTile.GlobalIndex] = changed;
                updated.Add(changed);
            }
            else
            {
                removed.Add(indexedTile.Tile with { WasCalled = callConfirmed });
            }
        }

        if (removed.Count > 0)
        {
            var removedIds = removed.Select(static tile => tile.Id).ToHashSet();
            _tiles.RemoveAll(tile => removedIds.Contains(tile.Id));
        }

        var added = new List<RiverTile>();
        if (newDiscardKind is { } suppliedKind)
        {
            for (var detectionIndex = 0; detectionIndex < detections.Count; detectionIndex++)
            {
                if (assignedDetections[detectionIndex])
                    continue;

                var detection = detections[detectionIndex];
                var tile = new RiverTile(
                    Guid.NewGuid(),
                    seat,
                    detection.Quad,
                    suppliedKind,
                    WasCalled: false,
                    detection.Confidence,
                    timestamp);
                _tiles.Add(tile);
                added.Add(tile);
            }
        }

        return new RiverUpdateResult(added, updated, removed);
    }

    private static IReadOnlyList<RiverTile> Snapshot(IEnumerable<RiverTile> tiles) =>
        new ReadOnlyCollection<RiverTile>(tiles.ToArray());

    private static double IntersectionOverUnion(NormalizedQuad left, NormalizedQuad right)
    {
        var leftArea = Area(left);
        var rightArea = Area(right);
        if (leftArea <= GeometryEpsilon || rightArea <= GeometryEpsilon)
            return 0d;

        var intersection = Intersection(left, right);
        var union = leftArea + rightArea - intersection;
        return union <= GeometryEpsilon ? 0d : intersection / union;
    }

    private static double Area(NormalizedQuad quad) => Area(ToPoints(quad));

    private static double Area(IReadOnlyList<NormalizedPoint> polygon) =>
        Math.Abs(SignedDoubleArea(polygon)) / 2d;

    private static double Intersection(NormalizedQuad subject, NormalizedQuad clip)
    {
        IReadOnlyList<NormalizedPoint> output = ToPoints(subject);
        var clipPoints = ToPoints(clip);
        var clipOrientation = Math.Sign(SignedDoubleArea(clipPoints));
        if (clipOrientation == 0)
            return 0d;

        for (var clipIndex = 0; clipIndex < clipPoints.Length; clipIndex++)
        {
            if (output.Count == 0)
                return 0d;

            var clipStart = clipPoints[clipIndex];
            var clipEnd = clipPoints[(clipIndex + 1) % clipPoints.Length];
            var input = output;
            var clipped = new List<NormalizedPoint>();
            var previous = input[^1];
            var previousInside = IsInside(previous, clipStart, clipEnd, clipOrientation);

            foreach (var current in input)
            {
                var currentInside = IsInside(current, clipStart, clipEnd, clipOrientation);
                if (currentInside != previousInside)
                    clipped.Add(LineIntersection(previous, current, clipStart, clipEnd));
                if (currentInside)
                    clipped.Add(current);

                previous = current;
                previousInside = currentInside;
            }

            output = clipped;
        }

        return Area(output);
    }

    private static bool IsInside(
        NormalizedPoint point,
        NormalizedPoint edgeStart,
        NormalizedPoint edgeEnd,
        int orientation) =>
        orientation * Cross(edgeStart, edgeEnd, point) >= -GeometryEpsilon;

    private static NormalizedPoint LineIntersection(
        NormalizedPoint subjectStart,
        NormalizedPoint subjectEnd,
        NormalizedPoint clipStart,
        NormalizedPoint clipEnd)
    {
        var subjectX = subjectEnd.X - subjectStart.X;
        var subjectY = subjectEnd.Y - subjectStart.Y;
        var clipX = clipEnd.X - clipStart.X;
        var clipY = clipEnd.Y - clipStart.Y;
        var denominator = subjectX * clipY - subjectY * clipX;
        if (Math.Abs(denominator) <= GeometryEpsilon)
            return subjectEnd;

        var offsetX = clipStart.X - subjectStart.X;
        var offsetY = clipStart.Y - subjectStart.Y;
        var distance = (offsetX * clipY - offsetY * clipX) / denominator;
        return new NormalizedPoint(
            Math.Clamp(subjectStart.X + distance * subjectX, 0d, 1d),
            Math.Clamp(subjectStart.Y + distance * subjectY, 0d, 1d));
    }

    private static double Cross(
        NormalizedPoint start,
        NormalizedPoint end,
        NormalizedPoint point) =>
        (end.X - start.X) * (point.Y - start.Y)
        - (end.Y - start.Y) * (point.X - start.X);

    private static double SignedDoubleArea(IReadOnlyList<NormalizedPoint> polygon)
    {
        if (polygon.Count < 3)
            return 0d;

        var sum = 0d;
        for (var index = 0; index < polygon.Count; index++)
        {
            var current = polygon[index];
            var next = polygon[(index + 1) % polygon.Count];
            sum += current.X * next.Y - next.X * current.Y;
        }

        return sum;
    }

    private static NormalizedPoint[] ToPoints(NormalizedQuad quad) =>
        [quad.TopLeft, quad.TopRight, quad.BottomRight, quad.BottomLeft];

    private readonly record struct IndexedTile(int GlobalIndex, RiverTile Tile);

    private readonly record struct MatchPair(
        int ExistingIndex,
        int DetectionIndex,
        double IntersectionOverUnion);
}

public sealed class RiverUpdateResult
{
    public RiverUpdateResult(
        IReadOnlyList<RiverTile> added,
        IReadOnlyList<RiverTile> updated,
        IReadOnlyList<RiverTile> removed)
    {
        ArgumentNullException.ThrowIfNull(added);
        ArgumentNullException.ThrowIfNull(updated);
        ArgumentNullException.ThrowIfNull(removed);

        Added = Snapshot(added, nameof(added));
        Updated = Snapshot(updated, nameof(updated));
        Removed = Snapshot(removed, nameof(removed));
    }

    public IReadOnlyList<RiverTile> Added { get; }

    public IReadOnlyList<RiverTile> Updated { get; }

    public IReadOnlyList<RiverTile> Removed { get; }

    private static IReadOnlyList<RiverTile> Snapshot(
        IReadOnlyList<RiverTile> tiles,
        string parameterName)
    {
        if (tiles.Any(static tile => tile is null))
            throw new ArgumentException("River tile collections cannot contain null.", parameterName);

        return new ReadOnlyCollection<RiverTile>(tiles.ToArray());
    }
}
