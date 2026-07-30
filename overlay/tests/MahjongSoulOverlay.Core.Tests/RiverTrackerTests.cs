using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.River;

namespace MahjongSoulOverlay.Core.Tests;

public sealed class RiverTrackerTests
{
    [Fact]
    public void New_unmatched_quad_creates_tile_with_supplied_kind()
    {
        var tracker = new RiverTracker(0.45);
        var detected = Tile("new", 0.10, 0.10, confidence: 0.82);

        var result = tracker.Update(
            Seat.Bottom, [detected], DiscardKind.Tedashi, DateTimeOffset.UnixEpoch);

        var added = Assert.Single(result.Added);
        Assert.Equal(Seat.Bottom, added.Seat);
        Assert.Equal(detected.Quad, added.Quad);
        Assert.Equal(DiscardKind.Tedashi, added.Kind);
        Assert.Equal(0.82, added.Confidence);
        Assert.Equal(DateTimeOffset.UnixEpoch, added.FirstSeen);
        Assert.False(added.WasCalled);
        Assert.Equal(added, Assert.Single(tracker.Tiles));
        Assert.Empty(result.Updated);
        Assert.Empty(result.Removed);
    }

    [Fact]
    public void Widened_horizontal_quad_with_sufficient_overlap_retains_identity_and_kind()
    {
        var tracker = new RiverTracker(0.45);
        var original = Tile("upright", 0.10, 0.10, width: 0.04, height: 0.06);
        var first = tracker.Update(
            Seat.Top, [original], DiscardKind.Tsumogiri, DateTimeOffset.UnixEpoch);
        var originalTile = Assert.Single(first.Added);
        var horizontal = Tile(
            "horizontal", 0.10, 0.10, width: 0.06, height: 0.04, confidence: 0.73);

        var result = tracker.Update(
            Seat.Top, [horizontal], DiscardKind.Tedashi,
            DateTimeOffset.UnixEpoch.AddSeconds(1));

        var updated = Assert.Single(result.Updated);
        Assert.Equal(originalTile.Id, updated.Id);
        Assert.Equal(DiscardKind.Tsumogiri, updated.Kind);
        Assert.Equal(horizontal.Quad, updated.Quad);
        Assert.Equal(0.73, updated.Confidence);
        Assert.Equal(originalTile.FirstSeen, updated.FirstSeen);
        Assert.Empty(result.Added);
        Assert.Empty(result.Removed);
    }

    [Fact]
    public void Called_tile_is_removed_without_shifting_remaining_ids()
    {
        var tracker = new RiverTracker(0.45);
        var first = Tile("a", 0.10, 0.10);
        var second = Tile("b", 0.16, 0.10);
        tracker.Update(
            Seat.Top, [first, second], DiscardKind.Tsumogiri, DateTimeOffset.UnixEpoch);
        var originalFirstId = tracker.Tiles.Single(tile => tile.Quad == first.Quad).Id;
        var originalSecondId = tracker.Tiles.Single(tile => tile.Quad == second.Quad).Id;

        var result = tracker.Update(
            Seat.Top, [second], null, DateTimeOffset.UnixEpoch.AddSeconds(1),
            callConfirmed: true);

        Assert.Equal(originalSecondId, Assert.Single(tracker.Tiles).Id);
        Assert.Equal(originalSecondId, Assert.Single(result.Updated).Id);
        var removed = Assert.Single(result.Removed);
        Assert.Equal(originalFirstId, removed.Id);
        Assert.True(removed.WasCalled);
    }

    [Fact]
    public void Unconfirmed_disappearance_is_removed_as_uncertain()
    {
        var tracker = new RiverTracker(0.45);
        var added = Assert.Single(tracker.Update(
            Seat.Left, [Tile("a", 0.10, 0.10)], DiscardKind.Tedashi,
            DateTimeOffset.UnixEpoch).Added);

        var result = tracker.Update(
            Seat.Left, [], null, DateTimeOffset.UnixEpoch.AddSeconds(1));

        Assert.Empty(tracker.Tiles);
        var removed = Assert.Single(result.Removed);
        Assert.Equal(added.Id, removed.Id);
        Assert.False(removed.WasCalled);
        Assert.Empty(result.Added);
        Assert.Empty(result.Updated);
    }

    [Fact]
    public void Zero_area_detection_does_not_match_an_existing_tile()
    {
        var tracker = new RiverTracker(0);
        var existing = Assert.Single(tracker.Update(
            Seat.Right, [Tile("real", 0.10, 0.10)], DiscardKind.Tsumogiri,
            DateTimeOffset.UnixEpoch).Added);
        var point = new NormalizedPoint(0.12, 0.12);
        var zeroArea = new DetectedTile(
            "zero", new NormalizedQuad(point, point, point, point), 1d);

        var result = tracker.Update(
            Seat.Right, [zeroArea], null, DateTimeOffset.UnixEpoch.AddSeconds(1));

        Assert.Empty(tracker.Tiles);
        Assert.Equal(existing.Id, Assert.Single(result.Removed).Id);
        Assert.Empty(result.Updated);
    }

    [Fact]
    public void Overlap_below_threshold_does_not_reassign_an_existing_tile()
    {
        var tracker = new RiverTracker(0.45);
        var original = Assert.Single(tracker.Update(
            Seat.Bottom, [Tile("old", 0.10, 0.10)], DiscardKind.Tsumogiri,
            DateTimeOffset.UnixEpoch).Added);

        var result = tracker.Update(
            Seat.Bottom, [Tile("barely-overlaps", 0.139, 0.10)],
            DiscardKind.Tedashi, DateTimeOffset.UnixEpoch.AddSeconds(1));

        var replacement = Assert.Single(result.Added);
        Assert.NotEqual(original.Id, replacement.Id);
        Assert.Equal(original.Id, Assert.Single(result.Removed).Id);
        Assert.Empty(result.Updated);
        Assert.Equal(replacement.Id, Assert.Single(tracker.Tiles).Id);
    }

    [Fact]
    public void Equal_overlap_pairs_use_existing_then_detection_order_as_tie_breakers()
    {
        var tracker = new RiverTracker(0.45);
        var sameQuad = Tile("initial-a", 0.10, 0.10);
        var initial = tracker.Update(
            Seat.Bottom,
            [sameQuad, Tile("initial-b", 0.10, 0.10)],
            DiscardKind.Tsumogiri,
            DateTimeOffset.UnixEpoch);
        var firstId = initial.Added[0].Id;
        var secondId = initial.Added[1].Id;

        var result = tracker.Update(
            Seat.Bottom,
            [
                Tile("next-a", 0.10, 0.10, confidence: 0.61),
                Tile("next-b", 0.10, 0.10, confidence: 0.87)
            ],
            null,
            DateTimeOffset.UnixEpoch.AddSeconds(1));

        Assert.Collection(
            result.Updated,
            first =>
            {
                Assert.Equal(firstId, first.Id);
                Assert.Equal(0.61, first.Confidence);
            },
            second =>
            {
                Assert.Equal(secondId, second.Id);
                Assert.Equal(0.87, second.Confidence);
            });
    }

    [Fact]
    public void Result_and_tiles_are_immutable_snapshots()
    {
        var tracker = new RiverTracker(0.45);
        var firstResult = tracker.Update(
            Seat.Bottom, [Tile("a", 0.10, 0.10)], DiscardKind.Tedashi,
            DateTimeOffset.UnixEpoch);
        var firstTilesSnapshot = tracker.Tiles;
        var firstResultSnapshot = firstResult.Added;

        tracker.Update(
            Seat.Bottom, [Tile("a-moved", 0.11, 0.10)], null,
            DateTimeOffset.UnixEpoch.AddSeconds(1));

        Assert.Equal(0.10, Assert.Single(firstTilesSnapshot).Quad.TopLeft.X);
        Assert.Equal(0.10, Assert.Single(firstResultSnapshot).Quad.TopLeft.X);
        Assert.Equal(0.11, Assert.Single(tracker.Tiles).Quad.TopLeft.X);
        Assert.Throws<NotSupportedException>(
            () => ((IList<RiverTile>)firstTilesSnapshot).Add(firstTilesSnapshot[0]));
        Assert.Throws<NotSupportedException>(
            () => ((IList<RiverTile>)firstResultSnapshot).Clear());
    }

    [Fact]
    public void Updating_one_seat_neither_matches_nor_removes_another_seats_tiles()
    {
        var tracker = new RiverTracker(0.45);
        var quad = Tile("bottom", 0.10, 0.10);
        var bottom = Assert.Single(tracker.Update(
            Seat.Bottom, [quad], DiscardKind.Tedashi, DateTimeOffset.UnixEpoch).Added);

        var rightResult = tracker.Update(
            Seat.Right, [Tile("right", 0.10, 0.10)], DiscardKind.Tsumogiri,
            DateTimeOffset.UnixEpoch.AddSeconds(1));

        Assert.Empty(rightResult.Updated);
        Assert.Empty(rightResult.Removed);
        Assert.Equal(2, tracker.Tiles.Count);
        Assert.Contains(tracker.Tiles, tile => tile.Id == bottom.Id && tile.Seat == Seat.Bottom);
        Assert.Contains(tracker.Tiles, tile => tile.Seat == Seat.Right);
    }

    [Theory]
    [InlineData(-0.01)]
    [InlineData(1.01)]
    [InlineData(double.NaN)]
    [InlineData(double.PositiveInfinity)]
    public void Constructor_rejects_invalid_overlap_threshold(double threshold)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => new RiverTracker(threshold));
    }

    [Fact]
    public void Update_rejects_null_detections()
    {
        var tracker = new RiverTracker(0.45);

        Assert.Throws<ArgumentNullException>(
            () => tracker.Update(
                Seat.Bottom, null!, null, DateTimeOffset.UnixEpoch));
    }

    [Fact]
    public void Update_rejects_null_detection_elements()
    {
        var tracker = new RiverTracker(0.45);

        Assert.Throws<ArgumentException>(
            () => tracker.Update(
                Seat.Bottom, [null!], null, DateTimeOffset.UnixEpoch));
    }

    [Fact]
    public void Update_rejects_undefined_seat_and_discard_kind()
    {
        var tracker = new RiverTracker(0.45);

        Assert.Throws<ArgumentOutOfRangeException>(
            () => tracker.Update(
                (Seat)99, [], null, DateTimeOffset.UnixEpoch));
        Assert.Throws<ArgumentOutOfRangeException>(
            () => tracker.Update(
                Seat.Bottom, [], (DiscardKind)99, DateTimeOffset.UnixEpoch));
    }

    [Fact]
    public void Result_rejects_null_tile_elements()
    {
        Assert.Throws<ArgumentException>(
            () => new RiverUpdateResult([null!], [], []));
        Assert.Throws<ArgumentException>(
            () => new RiverUpdateResult([], [null!], []));
        Assert.Throws<ArgumentException>(
            () => new RiverUpdateResult([], [], [null!]));
    }

    private static DetectedTile Tile(
        string id,
        double x,
        double y,
        double width = 0.04,
        double height = 0.06,
        double confidence = 1d) =>
        new(
            id,
            new NormalizedQuad(
                new(x, y),
                new(x + width, y),
                new(x + width, y + height),
                new(x, y + height)),
            confidence);
}
