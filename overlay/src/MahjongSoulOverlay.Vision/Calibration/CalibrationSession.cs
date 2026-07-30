using System.Collections.ObjectModel;
using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.Profiles;
using MahjongSoulOverlay.Vision.Profiles;

namespace MahjongSoulOverlay.Vision.Calibration;

public enum CalibrationRegionKind
{
    MainHandRegion,
    MainSlot,
    DrawnSlot,
    RiverRegion,
    MeldRegion
}

public enum CalibrationCorner
{
    TopLeft,
    TopRight,
    BottomRight,
    BottomLeft
}

public readonly record struct CalibrationPoint(double X, double Y);

public sealed record CalibrationTarget(
    Seat Seat,
    CalibrationRegionKind RegionKind,
    int? MainSlotIndex = null);

public sealed record CalibratedQuad(CalibrationTarget Target, NormalizedQuad Quad);

public sealed class CalibrationSession
{
    public const int MainSlotCount = 13;

    private static readonly Seat[] SeatOrder =
        [Seat.Bottom, Seat.Right, Seat.Top, Seat.Left];

    private static readonly CalibrationCorner[] CornerOrder =
    [
        CalibrationCorner.TopLeft,
        CalibrationCorner.TopRight,
        CalibrationCorner.BottomRight,
        CalibrationCorner.BottomLeft
    ];

    private readonly List<CalibrationPoint> _points = [];
    private readonly ReadOnlyCollection<CalibrationTarget> _targets;

    public CalibrationSession(int imageWidth, int imageHeight)
    {
        if (imageWidth <= 0)
            throw new ArgumentOutOfRangeException(nameof(imageWidth));
        if (imageHeight <= 0)
            throw new ArgumentOutOfRangeException(nameof(imageHeight));

        ImageWidth = imageWidth;
        ImageHeight = imageHeight;
        _targets = Array.AsReadOnly(CreateTargets());
    }

    public int ImageWidth { get; }

    public int ImageHeight { get; }

    public IReadOnlyList<CalibrationTarget> Targets => _targets;

    public bool IsComplete => _points.Count == _targets.Count * CornerOrder.Length;

    public CalibrationTarget? CurrentTarget =>
        IsComplete ? null : _targets[_points.Count / CornerOrder.Length];

    public CalibrationCorner? CurrentCorner =>
        IsComplete ? null : CornerOrder[_points.Count % CornerOrder.Length];

    public IReadOnlyList<CalibrationPoint> CurrentPoints
    {
        get
        {
            if (IsComplete)
                return Array.Empty<CalibrationPoint>();

            var count = _points.Count % CornerOrder.Length;
            var start = _points.Count - count;
            return Array.AsReadOnly(_points.Skip(start).ToArray());
        }
    }

    public IReadOnlyList<CalibratedQuad> CompletedQuads
    {
        get
        {
            var completed = _points.Count / CornerOrder.Length;
            var result = new CalibratedQuad[completed];
            for (var index = 0; index < completed; index++)
            {
                result[index] = new CalibratedQuad(
                    _targets[index],
                    CreateQuad(_points.Skip(index * CornerOrder.Length).Take(4)));
            }

            return Array.AsReadOnly(result);
        }
    }

    public void AddPoint(double x, double y)
    {
        if (IsComplete)
            throw new InvalidOperationException("Calibration is already complete.");
        if (!double.IsFinite(x) || x < 0d || x > ImageWidth)
            throw new ArgumentOutOfRangeException(nameof(x));
        if (!double.IsFinite(y) || y < 0d || y > ImageHeight)
            throw new ArgumentOutOfRangeException(nameof(y));

        var point = new CalibrationPoint(x, y);
        if (_points.Count % CornerOrder.Length == CornerOrder.Length - 1)
        {
            var candidate = _points.TakeLast(3).Append(point);
            _ = CreateQuad(candidate);
        }

        _points.Add(point);
    }

    public bool UndoLastPoint()
    {
        if (_points.Count == 0)
            return false;

        _points.RemoveAt(_points.Count - 1);
        return true;
    }

    public void ResetCurrentSeat()
    {
        var seat = CurrentTarget?.Seat ?? Seat.Left;
        var firstTarget = _targets
            .Select((target, index) => (target, index))
            .First(item => item.target.Seat == seat)
            .index;
        var firstPoint = firstTarget * CornerOrder.Length;
        if (_points.Count > firstPoint)
            _points.RemoveRange(firstPoint, _points.Count - firstPoint);
    }

    public TableProfile BuildProfile(string id)
    {
        if (!IsComplete)
            throw new InvalidOperationException("All four seats must be complete before saving.");
        if (string.IsNullOrWhiteSpace(id))
            throw new ArgumentException("A profile ID is required.", nameof(id));

        var completed = CompletedQuads.ToDictionary(item => item.Target, item => item.Quad);
        var seats = SeatOrder.ToDictionary(
            seat => seat,
            seat => BuildSeatProfile(seat, completed));
        return new TableProfile(id, ImageWidth, ImageHeight, 1d, seats);
    }

    public TableProfile SaveAndReload(string path, string id)
    {
        if (string.IsNullOrWhiteSpace(path))
            throw new ArgumentException("A destination path is required.", nameof(path));

        var json = ProfileLoader.Serialize(BuildProfile(id));
        File.WriteAllText(path, json);
        return ProfileLoader.Load(path);
    }

    private NormalizedQuad CreateQuad(IEnumerable<CalibrationPoint> source)
    {
        var points = source
            .Select(point => new NormalizedPoint(
                point.X / ImageWidth,
                point.Y / ImageHeight))
            .ToArray();
        if (points.Length != CornerOrder.Length)
            throw new ArgumentException("A quadrilateral requires exactly four points.", nameof(source));
        if (!IsConvex(points))
            throw new ArgumentException(
                "Points must form a non-zero convex quadrilateral in the guided corner order.",
                nameof(source));

        return new NormalizedQuad(points[0], points[1], points[2], points[3]);
    }

    private static bool IsConvex(IReadOnlyList<NormalizedPoint> points)
    {
        const double epsilon = 1e-12;
        var crossProducts = new double[4];
        var twiceArea = 0d;
        for (var index = 0; index < points.Count; index++)
        {
            var current = points[index];
            var next = points[(index + 1) % points.Count];
            var following = points[(index + 2) % points.Count];
            twiceArea += current.X * next.Y - next.X * current.Y;
            crossProducts[index] =
                (next.X - current.X) * (following.Y - next.Y) -
                (next.Y - current.Y) * (following.X - next.X);
        }

        return Math.Abs(twiceArea) > epsilon &&
            (crossProducts.All(value => value > epsilon) ||
             crossProducts.All(value => value < -epsilon));
    }

    private static CalibrationTarget[] CreateTargets() =>
    [
        .. SeatOrder.SelectMany(seat =>
            new[] { new CalibrationTarget(seat, CalibrationRegionKind.MainHandRegion) }
                .Concat(Enumerable.Range(0, MainSlotCount)
                    .Select(index => new CalibrationTarget(
                        seat, CalibrationRegionKind.MainSlot, index)))
                .Append(new CalibrationTarget(seat, CalibrationRegionKind.DrawnSlot))
                .Append(new CalibrationTarget(seat, CalibrationRegionKind.RiverRegion))
                .Append(new CalibrationTarget(seat, CalibrationRegionKind.MeldRegion)))
    ];

    private static SeatProfile BuildSeatProfile(
        Seat seat,
        IReadOnlyDictionary<CalibrationTarget, NormalizedQuad> completed)
    {
        var direction = seat switch
        {
            Seat.Bottom => LayoutDirection.LeftToRight,
            Seat.Right => LayoutDirection.BottomToTop,
            Seat.Top => LayoutDirection.RightToLeft,
            Seat.Left => LayoutDirection.TopToBottom,
            _ => throw new ArgumentOutOfRangeException(nameof(seat))
        };
        var drawnSlot = completed[new CalibrationTarget(
            seat, CalibrationRegionKind.DrawnSlot)];
        var tileWidth = new[]
        {
            drawnSlot.TopLeft.X, drawnSlot.TopRight.X,
            drawnSlot.BottomRight.X, drawnSlot.BottomLeft.X
        }.Max() - new[]
        {
            drawnSlot.TopLeft.X, drawnSlot.TopRight.X,
            drawnSlot.BottomRight.X, drawnSlot.BottomLeft.X
        }.Min();
        var tileHeight = new[]
        {
            drawnSlot.TopLeft.Y, drawnSlot.TopRight.Y,
            drawnSlot.BottomRight.Y, drawnSlot.BottomLeft.Y
        }.Max() - new[]
        {
            drawnSlot.TopLeft.Y, drawnSlot.TopRight.Y,
            drawnSlot.BottomRight.Y, drawnSlot.BottomLeft.Y
        }.Min();

        return new SeatProfile(
            seat,
            completed[new CalibrationTarget(seat, CalibrationRegionKind.MainHandRegion)],
            Enumerable.Range(0, MainSlotCount)
                .Select(index => completed[new CalibrationTarget(
                    seat, CalibrationRegionKind.MainSlot, index)])
                .ToArray(),
            direction,
            drawnSlot,
            completed[new CalibrationTarget(seat, CalibrationRegionKind.RiverRegion)],
            direction,
            completed[new CalibrationTarget(seat, CalibrationRegionKind.MeldRegion)],
            direction,
            new TileScale(tileWidth, tileHeight),
            0.25d,
            4d,
            -180d,
            180d,
            0.35d,
            new RegionThresholds(0.15d, 0.25d),
            new RegionThresholds(0.15d, 0.25d),
            new RegionThresholds(0.15d, 0.25d),
            new RegionThresholds(0.15d, 0.25d),
            0.4d);
    }
}

public static class CalibrationProfileGeometry
{
    public static IReadOnlyList<CalibratedQuad> Enumerate(TableProfile profile)
    {
        ArgumentNullException.ThrowIfNull(profile);

        var result = new List<CalibratedQuad>();
        foreach (var seat in new[] { Seat.Bottom, Seat.Right, Seat.Top, Seat.Left })
        {
            var seatProfile = profile.Seats[seat];
            result.Add(new CalibratedQuad(
                new CalibrationTarget(seat, CalibrationRegionKind.MainHandRegion),
                seatProfile.MainHandRegion));
            result.AddRange(seatProfile.MainSlots.Select((quad, index) =>
                new CalibratedQuad(
                    new CalibrationTarget(seat, CalibrationRegionKind.MainSlot, index),
                    quad)));
            result.Add(new CalibratedQuad(
                new CalibrationTarget(seat, CalibrationRegionKind.DrawnSlot),
                seatProfile.DrawnSlot));
            result.Add(new CalibratedQuad(
                new CalibrationTarget(seat, CalibrationRegionKind.RiverRegion),
                seatProfile.RiverRegion));
            result.Add(new CalibratedQuad(
                new CalibrationTarget(seat, CalibrationRegionKind.MeldRegion),
                seatProfile.MeldRegion));
        }

        return result.AsReadOnly();
    }
}
