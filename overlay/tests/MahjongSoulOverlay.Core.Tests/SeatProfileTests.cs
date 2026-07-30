using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.Profiles;

namespace MahjongSoulOverlay.Core.Tests;

public sealed class SeatProfileTests
{
    [Fact]
    public void Profile_exposes_independent_directions_scale_perspective_and_region_thresholds()
    {
        var profile = CreateProfile();

        Assert.Equal(LayoutDirection.LeftToRight, profile.MainHandDirection);
        Assert.Equal(LayoutDirection.TopToBottom, profile.RiverFlowDirection);
        Assert.Equal(LayoutDirection.RightToLeft, profile.MeldExpansionDirection);
        Assert.Equal(new TileScale(0.02, 0.04), profile.ExpectedTileScale);
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
    [InlineData(0, 0.04, 0.15)]
    [InlineData(0.02, 0, 0.15)]
    [InlineData(double.NaN, 0.04, 0.15)]
    [InlineData(0.02, double.PositiveInfinity, 0.15)]
    [InlineData(0.02, 0.04, -0.01)]
    [InlineData(0.02, 0.04, 1.01)]
    public void Profile_rejects_invalid_scale_or_perspective(
        double width, double height, double perspective)
    {
        Assert.Throws<ArgumentOutOfRangeException>(
            () => CreateProfile(expectedTileScale: new TileScale(width, height),
                perspectiveTolerance: perspective));
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
        TileScale? expectedTileScale = null,
        double perspectiveTolerance = 0.15) =>
        new(
            Seat.Bottom,
            Quad(),
            slots ?? [Quad()],
            LayoutDirection.LeftToRight,
            Quad(),
            Quad(),
            LayoutDirection.TopToBottom,
            Quad(),
            LayoutDirection.RightToLeft,
            expectedTileScale ?? new TileScale(0.02, 0.04),
            0.5,
            2.0,
            -15,
            15,
            perspectiveTolerance,
            new RegionThresholds(0.7, 0.8),
            new RegionThresholds(0.6, 0.8),
            new RegionThresholds(0.5, 0.7),
            new RegionThresholds(0.4, 0.6),
            0.5);

    private static NormalizedQuad Quad() =>
        new(new(0.1, 0.1), new(0.2, 0.1), new(0.2, 0.2), new(0.1, 0.2));

    private static NormalizedQuad OtherQuad() =>
        new(new(0.3, 0.3), new(0.4, 0.3), new(0.4, 0.4), new(0.3, 0.4));
}
