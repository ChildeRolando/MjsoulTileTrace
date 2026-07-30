using System.Collections.ObjectModel;
using MahjongSoulOverlay.Core.Domain;

namespace MahjongSoulOverlay.Core.Profiles;

public enum LayoutDirection
{
    LeftToRight,
    RightToLeft,
    TopToBottom,
    BottomToTop
}

public sealed record TileScale
{
    public TileScale(double width, double height)
    {
        Width = RequirePositiveNormalized(width, nameof(width));
        Height = RequirePositiveNormalized(height, nameof(height));
    }

    public double Width { get; }

    public double Height { get; }

    private static double RequirePositiveNormalized(double value, string parameterName)
    {
        if (!double.IsFinite(value) || value is <= 0d or > 1d)
            throw new ArgumentOutOfRangeException(parameterName, value, "Value must be within (0, 1].");

        return value;
    }
}

public sealed record RegionThresholds
{
    public RegionThresholds(double occupancy, double stable)
    {
        Occupancy = RequireNormalized(occupancy, nameof(occupancy));
        Stable = RequireNormalized(stable, nameof(stable));
    }

    public double Occupancy { get; }

    public double Stable { get; }

    private static double RequireNormalized(double value, string parameterName)
    {
        if (!double.IsFinite(value) || value is < 0d or > 1d)
            throw new ArgumentOutOfRangeException(parameterName, value, "Value must be within [0, 1].");

        return value;
    }
}

public sealed record SeatProfile
{
    public SeatProfile(
        Seat seat,
        NormalizedQuad mainHandRegion,
        IReadOnlyList<NormalizedQuad> mainSlots,
        LayoutDirection mainHandDirection,
        NormalizedQuad drawnSlot,
        NormalizedQuad riverRegion,
        LayoutDirection riverFlowDirection,
        NormalizedQuad meldRegion,
        LayoutDirection meldExpansionDirection,
        TileScale mainTileScale,
        TileScale riverTileScale,
        TileScale meldTileScale,
        double minimumTileAspect,
        double maximumTileAspect,
        double minimumAngle,
        double maximumAngle,
        double perspectiveTolerance,
        RegionThresholds mainHandThresholds,
        RegionThresholds drawnSlotThresholds,
        RegionThresholds riverThresholds,
        RegionThresholds meldThresholds,
        double minimumTileConfidence)
    {
        ArgumentNullException.ThrowIfNull(mainHandRegion);
        ArgumentNullException.ThrowIfNull(mainSlots);
        ArgumentNullException.ThrowIfNull(drawnSlot);
        ArgumentNullException.ThrowIfNull(riverRegion);
        ArgumentNullException.ThrowIfNull(meldRegion);
        ArgumentNullException.ThrowIfNull(mainTileScale);
        ArgumentNullException.ThrowIfNull(riverTileScale);
        ArgumentNullException.ThrowIfNull(meldTileScale);
        ArgumentNullException.ThrowIfNull(mainHandThresholds);
        ArgumentNullException.ThrowIfNull(drawnSlotThresholds);
        ArgumentNullException.ThrowIfNull(riverThresholds);
        ArgumentNullException.ThrowIfNull(meldThresholds);

        if (!double.IsFinite(minimumTileAspect) || minimumTileAspect <= 0d)
            throw new ArgumentOutOfRangeException(
                nameof(minimumTileAspect), minimumTileAspect,
                "Minimum tile aspect must be finite and positive.");
        if (!double.IsFinite(maximumTileAspect) ||
            maximumTileAspect <= 0d ||
            maximumTileAspect < minimumTileAspect)
            throw new ArgumentOutOfRangeException(
                nameof(maximumTileAspect), maximumTileAspect,
                "Maximum tile aspect must be finite, positive, and at least the minimum.");
        if (!double.IsFinite(minimumAngle))
            throw new ArgumentOutOfRangeException(
                nameof(minimumAngle), minimumAngle, "Minimum angle must be finite.");
        if (!double.IsFinite(maximumAngle) || maximumAngle < minimumAngle)
            throw new ArgumentOutOfRangeException(
                nameof(maximumAngle), maximumAngle,
                "Maximum angle must be finite and at least the minimum.");
        if (!double.IsFinite(perspectiveTolerance) || perspectiveTolerance < 0d)
            throw new ArgumentOutOfRangeException(
                nameof(perspectiveTolerance), perspectiveTolerance,
                "Perspective tolerance must be finite and non-negative.");
        if (!double.IsFinite(minimumTileConfidence) || minimumTileConfidence is < 0d or > 1d)
            throw new ArgumentOutOfRangeException(
                nameof(minimumTileConfidence), minimumTileConfidence,
                "Minimum tile confidence must be within [0, 1].");

        Seat = seat;
        MainHandRegion = mainHandRegion;
        MainSlots = Array.AsReadOnly(mainSlots.ToArray());
        MainHandDirection = mainHandDirection;
        DrawnSlot = drawnSlot;
        RiverRegion = riverRegion;
        RiverFlowDirection = riverFlowDirection;
        MeldRegion = meldRegion;
        MeldExpansionDirection = meldExpansionDirection;
        MainTileScale = mainTileScale;
        RiverTileScale = riverTileScale;
        MeldTileScale = meldTileScale;
        MinimumTileAspect = minimumTileAspect;
        MaximumTileAspect = maximumTileAspect;
        MinimumAngle = minimumAngle;
        MaximumAngle = maximumAngle;
        PerspectiveTolerance = perspectiveTolerance;
        MainHandThresholds = mainHandThresholds;
        DrawnSlotThresholds = drawnSlotThresholds;
        RiverThresholds = riverThresholds;
        MeldThresholds = meldThresholds;
        MinimumTileConfidence = minimumTileConfidence;
    }

    public Seat Seat { get; }

    public NormalizedQuad MainHandRegion { get; }

    public IReadOnlyList<NormalizedQuad> MainSlots { get; }

    public LayoutDirection MainHandDirection { get; }

    public NormalizedQuad DrawnSlot { get; }

    public NormalizedQuad RiverRegion { get; }

    public LayoutDirection RiverFlowDirection { get; }

    public NormalizedQuad MeldRegion { get; }

    public LayoutDirection MeldExpansionDirection { get; }

    public TileScale MainTileScale { get; }

    public TileScale RiverTileScale { get; }

    public TileScale MeldTileScale { get; }

    public double MinimumTileAspect { get; }

    public double MaximumTileAspect { get; }

    public double MinimumAngle { get; }

    public double MaximumAngle { get; }

    public double PerspectiveTolerance { get; }

    public RegionThresholds MainHandThresholds { get; }

    public RegionThresholds DrawnSlotThresholds { get; }

    public RegionThresholds RiverThresholds { get; }

    public RegionThresholds MeldThresholds { get; }

    public double MinimumTileConfidence { get; }
}

public sealed record TableProfile
{
    public TableProfile(
        string id,
        int width,
        int height,
        double displayScale,
        IReadOnlyDictionary<Seat, SeatProfile> seats)
    {
        ArgumentNullException.ThrowIfNull(seats);

        Id = id;
        Width = width;
        Height = height;
        DisplayScale = displayScale;
        Seats = new ReadOnlyDictionary<Seat, SeatProfile>(
            new Dictionary<Seat, SeatProfile>(seats));
    }

    public string Id { get; }

    public int Width { get; }

    public int Height { get; }

    public double DisplayScale { get; }

    public IReadOnlyDictionary<Seat, SeatProfile> Seats { get; }
}
