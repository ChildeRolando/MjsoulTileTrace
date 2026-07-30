using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.Profiles;

namespace MahjongSoulOverlay.Core.Tests;

public sealed class SeatProfileTests
{
    [Fact]
    public void Profile_exposes_independent_directions_scales_perspective_and_region_thresholds()
    {
        var profile = CreateProfile();

        Assert.Equal(LayoutDirection.LeftToRight, profile.MainHandDirection);
        Assert.Equal(LayoutDirection.TopToBottom, profile.RiverFlowDirection);
        Assert.Equal(LayoutDirection.RightToLeft, profile.MeldExpansionDirection);
        Assert.Equal(new TileScale(0.02, 0.04), profile.MainTileScale);
        Assert.Equal(new TileScale(0.03, 0.05), profile.RiverTileScale);
        Assert.Equal(new TileScale(0.04, 0.06), profile.MeldTileScale);
        Assert.Equal(0.15, profile.PerspectiveTolerance);
        Assert.NotEqual(profile.MainHandThresholds, profile.DrawnSlotThresholds);
        Assert.NotEqual(profile.RiverThresholds, profile.MeldThresholds);
    }

    [Fact]
    public void Seat_profile_defensively_copies_main_slots()
    {
        var slots = new[] { Quad() };
        var profile = CreateProfile(slots);

        slots[0] = OtherQuad();

        Assert.Equal(Quad(), profile.MainSlots[0]);
    }

    [Fact]
    public void Table_profile_defensively_copies_seat_dictionary()
    {
        var bottom = CreateProfile();
        var seats = new Dictionary<Seat, SeatProfile> { [Seat.Bottom] = bottom };
        var profile = new TableProfile("test", 1920, 1080, 1d, seats);

        seats.Clear();

        Assert.Same(bottom, profile.Seats[Seat.Bottom]);
    }

    [Theory]
    [InlineData(0, 0.04)]
    [InlineData(0.02, 0)]
    [InlineData(double.NaN, 0.04)]
    [InlineData(0.02, double.PositiveInfinity)]
    public void Profile_rejects_invalid_scale(double width, double height)
    {
        Assert.Throws<ArgumentOutOfRangeException>(
            () => CreateProfile(mainTileScale: new TileScale(width, height)));
    }

    [Theory]
    [InlineData(-0.01)]
    [InlineData(double.NaN)]
    [InlineData(double.PositiveInfinity)]
    public void Profile_rejects_invalid_perspective_tolerance(double perspective)
    {
        Assert.Throws<ArgumentOutOfRangeException>(
            () => CreateProfile(perspectiveTolerance: perspective));
    }

    [Fact]
    public void Profile_accepts_finite_perspective_tolerance_above_one()
    {
        Assert.Equal(1.5, CreateProfile(perspectiveTolerance: 1.5).PerspectiveTolerance);
    }

    [Theory]
    [InlineData(0, 1)]
    [InlineData(-1, 1)]
    [InlineData(1, 0)]
    [InlineData(2, 1)]
    [InlineData(double.NaN, 1)]
    [InlineData(1, double.PositiveInfinity)]
    public void Profile_rejects_invalid_aspect_bounds(double minimum, double maximum)
    {
        Assert.Throws<ArgumentOutOfRangeException>(
            () => CreateProfile(minimumTileAspect: minimum, maximumTileAspect: maximum));
    }

    [Theory]
    [InlineData(10, -10)]
    [InlineData(double.NaN, 10)]
    [InlineData(-10, double.PositiveInfinity)]
    public void Profile_rejects_invalid_angle_bounds(double minimum, double maximum)
    {
        Assert.Throws<ArgumentOutOfRangeException>(
            () => CreateProfile(minimumAngle: minimum, maximumAngle: maximum));
    }

    [Fact]
    public void Profile_rejects_null_required_reference_arguments()
    {
        var quad = Quad();
        var thresholds = new RegionThresholds(0.5, 0.6);
        var mainScale = new TileScale(0.02, 0.04);
        var riverScale = new TileScale(0.03, 0.05);
        var meldScale = new TileScale(0.04, 0.06);
        Func<SeatProfile>[] invalidFactories =
        [
            () => NewProfile(null!, [quad], quad, quad, quad,
                mainScale, riverScale, meldScale,
                thresholds, thresholds, thresholds, thresholds),
            () => NewProfile(quad, null!, quad, quad, quad,
                mainScale, riverScale, meldScale,
                thresholds, thresholds, thresholds, thresholds),
            () => NewProfile(quad, [quad], null!, quad, quad,
                mainScale, riverScale, meldScale,
                thresholds, thresholds, thresholds, thresholds),
            () => NewProfile(quad, [quad], quad, null!, quad,
                mainScale, riverScale, meldScale,
                thresholds, thresholds, thresholds, thresholds),
            () => NewProfile(quad, [quad], quad, quad, null!,
                mainScale, riverScale, meldScale,
                thresholds, thresholds, thresholds, thresholds),
            () => NewProfile(quad, [quad], quad, quad, quad,
                null!, riverScale, meldScale,
                thresholds, thresholds, thresholds, thresholds),
            () => NewProfile(quad, [quad], quad, quad, quad,
                mainScale, null!, meldScale,
                thresholds, thresholds, thresholds, thresholds),
            () => NewProfile(quad, [quad], quad, quad, quad,
                mainScale, riverScale, null!,
                thresholds, thresholds, thresholds, thresholds),
            () => NewProfile(quad, [quad], quad, quad, quad,
                mainScale, riverScale, meldScale,
                null!, thresholds, thresholds, thresholds),
            () => NewProfile(quad, [quad], quad, quad, quad,
                mainScale, riverScale, meldScale,
                thresholds, null!, thresholds, thresholds),
            () => NewProfile(quad, [quad], quad, quad, quad,
                mainScale, riverScale, meldScale,
                thresholds, thresholds, null!, thresholds),
            () => NewProfile(quad, [quad], quad, quad, quad,
                mainScale, riverScale, meldScale,
                thresholds, thresholds, thresholds, null!)
        ];

        Assert.All(invalidFactories,
            factory => Assert.Throws<ArgumentNullException>(() => factory()));
    }

    [Theory]
    [InlineData(-0.01, 0.5)]
    [InlineData(1.01, 0.5)]
    [InlineData(0.5, -0.01)]
    [InlineData(0.5, 1.01)]
    public void Region_thresholds_require_normalized_values(double occupancy, double stable)
    {
        Assert.Throws<ArgumentOutOfRangeException>(
            () => new RegionThresholds(occupancy, stable));
    }

    private static SeatProfile CreateProfile(
        IReadOnlyList<NormalizedQuad>? slots = null,
        TileScale? mainTileScale = null,
        TileScale? riverTileScale = null,
        TileScale? meldTileScale = null,
        double perspectiveTolerance = 0.15,
        double minimumTileAspect = 0.5,
        double maximumTileAspect = 2.0,
        double minimumAngle = -15,
        double maximumAngle = 15) =>
        NewProfile(
            Quad(),
            slots ?? [Quad()],
            Quad(),
            Quad(),
            Quad(),
            mainTileScale ?? new TileScale(0.02, 0.04),
            riverTileScale ?? new TileScale(0.03, 0.05),
            meldTileScale ?? new TileScale(0.04, 0.06),
            new RegionThresholds(0.7, 0.8),
            new RegionThresholds(0.6, 0.8),
            new RegionThresholds(0.5, 0.7),
            new RegionThresholds(0.4, 0.6),
            perspectiveTolerance,
            minimumTileAspect,
            maximumTileAspect,
            minimumAngle,
            maximumAngle);

    private static SeatProfile NewProfile(
        NormalizedQuad mainHandRegion,
        IReadOnlyList<NormalizedQuad> mainSlots,
        NormalizedQuad drawnSlot,
        NormalizedQuad riverRegion,
        NormalizedQuad meldRegion,
        TileScale mainTileScale,
        TileScale riverTileScale,
        TileScale meldTileScale,
        RegionThresholds mainHandThresholds,
        RegionThresholds drawnSlotThresholds,
        RegionThresholds riverThresholds,
        RegionThresholds meldThresholds,
        double perspectiveTolerance = 0.15,
        double minimumTileAspect = 0.5,
        double maximumTileAspect = 2.0,
        double minimumAngle = -15,
        double maximumAngle = 15) =>
        new(
            Seat.Bottom,
            mainHandRegion,
            mainSlots,
            LayoutDirection.LeftToRight,
            drawnSlot,
            riverRegion,
            LayoutDirection.TopToBottom,
            meldRegion,
            LayoutDirection.RightToLeft,
            mainTileScale,
            riverTileScale,
            meldTileScale,
            minimumTileAspect,
            maximumTileAspect,
            minimumAngle,
            maximumAngle,
            perspectiveTolerance,
            mainHandThresholds,
            drawnSlotThresholds,
            riverThresholds,
            meldThresholds,
            0.5);

    private static NormalizedQuad Quad() =>
        new(new(0.1, 0.1), new(0.2, 0.1), new(0.2, 0.2), new(0.1, 0.2));

    private static NormalizedQuad OtherQuad() =>
        new(new(0.3, 0.3), new(0.4, 0.3), new(0.4, 0.4), new(0.3, 0.4));
}
