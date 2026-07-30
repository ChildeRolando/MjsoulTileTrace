using MahjongSoulOverlay.Core.Domain;

namespace MahjongSoulOverlay.Core.Tests;

public sealed class DomainContractTests
{
    [Fact]
    public void Seat_observation_defensively_copies_slot_and_river_collections()
    {
        var slots = new[] { true, false };
        var river = new[] { new DetectedTile("one", Quad(), 0.8) };
        var observation = new SeatObservation(
            Seat.Bottom, 1, slots, false, 0, 0, river, true, 0.9, DateTimeOffset.UnixEpoch);

        slots[0] = false;
        river[0] = new DetectedTile("changed", Quad(), 0.8);

        Assert.True(observation.MainSlots[0]);
        Assert.Equal("one", observation.RiverTiles[0].DetectionId);
    }

    [Fact]
    public void Table_observation_defensively_copies_seat_dictionary()
    {
        var bottom = SeatObservation.Stable(Seat.Bottom, 1, false, 0, 0, []);
        var seats = new Dictionary<Seat, SeatObservation> { [Seat.Bottom] = bottom };
        var observation = new TableObservation(
            seats, true, false, false, DateTimeOffset.UnixEpoch);

        seats.Clear();

        Assert.Same(bottom, observation.Seats[Seat.Bottom]);
    }

    [Fact]
    public void Seat_observation_requires_count_to_equal_occupied_slots()
    {
        Assert.Throws<ArgumentException>(() => new SeatObservation(
            Seat.Bottom, 2, [true, false], false, 0, 0, [], true, 1d,
            DateTimeOffset.UnixEpoch));
    }

    [Theory]
    [InlineData(-1, 0)]
    [InlineData(0, -1)]
    public void Seat_observation_rejects_negative_meld_counts(int meldGroups, int meldTiles)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => new SeatObservation(
            Seat.Bottom, 1, [true], false, meldGroups, meldTiles, [], true, 1d,
            DateTimeOffset.UnixEpoch));
    }

    [Theory]
    [InlineData(-0.01, 0.5)]
    [InlineData(1.01, 0.5)]
    [InlineData(0.5, -0.01)]
    [InlineData(0.5, 1.01)]
    [InlineData(double.NaN, 0.5)]
    [InlineData(double.PositiveInfinity, 0.5)]
    [InlineData(0.5, double.NegativeInfinity)]
    public void Normalized_point_rejects_non_normalized_coordinates(double x, double y)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => new NormalizedPoint(x, y));
    }

    [Theory]
    [InlineData(-0.01)]
    [InlineData(1.01)]
    [InlineData(double.NaN)]
    [InlineData(double.PositiveInfinity)]
    public void Detected_tile_rejects_invalid_confidence(double confidence)
    {
        Assert.Throws<ArgumentOutOfRangeException>(
            () => new DetectedTile("tile", Quad(), confidence));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("  ")]
    public void Detected_tile_rejects_missing_detection_id(string? detectionId)
    {
        Assert.Throws<ArgumentException>(
            () => new DetectedTile(detectionId!, Quad(), 1d));
    }

    [Fact]
    public void Detected_tile_rejects_a_null_quad()
    {
        Assert.Throws<ArgumentNullException>(
            () => new DetectedTile("tile", null!, 1d));
    }

    [Theory]
    [InlineData(-0.01)]
    [InlineData(1.01)]
    [InlineData(double.NaN)]
    [InlineData(double.PositiveInfinity)]
    public void Seat_observation_rejects_invalid_confidence(double confidence)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => new SeatObservation(
            Seat.Bottom, 1, [true], false, 0, 0, [], true, confidence,
            DateTimeOffset.UnixEpoch));
    }

    private static NormalizedQuad Quad() =>
        new(new(0.1, 0.1), new(0.2, 0.1), new(0.2, 0.2), new(0.1, 0.2));
}
