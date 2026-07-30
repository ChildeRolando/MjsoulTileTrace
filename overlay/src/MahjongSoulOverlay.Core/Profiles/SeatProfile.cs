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
        TileScale expectedTileScale,
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
        ArgumentNullException.ThrowIfNull(mainSlots);

        if (!double.IsFinite(perspectiveTolerance) || perspectiveTolerance is < 0d or > 1d)
            throw new ArgumentOutOfRangeException(
                nameof(perspectiveTolerance), perspectiveTolerance,
                "Perspective tolerance must be within [0, 1].");
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
        ExpectedTileScale = expectedTileScale;
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

    public TileScale ExpectedTileScale { get; }

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
