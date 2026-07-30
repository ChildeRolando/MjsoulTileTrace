using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.Events;

namespace MahjongSoulOverlay.Core.Tests;

public sealed class ObservationDifferTests
{
    [Fact]
    public void Diff_reports_every_structural_change()
    {
        var timestamp = DateTimeOffset.FromUnixTimeSeconds(42);
        var before = Observation(Seat.Bottom, [true, true, true], false, 1, 3, 1, true);
        var after = Observation(Seat.Bottom, [true, false], true, 3, 7, 3, true, timestamp);

        var delta = ObservationDiffer.Diff(before, after);

        Assert.Equal(Seat.Bottom, delta.Seat);
        Assert.Equal(-2, delta.MainHandDelta);
        Assert.Equal(1, delta.DrawnSlotDelta);
        Assert.Equal(2, delta.MeldGroupDelta);
        Assert.Equal(4, delta.MeldTileDelta);
        Assert.Equal(2, delta.RiverDelta);
        Assert.True(delta.MainSlotRemoved);
        Assert.True(delta.IsStable);
        Assert.Equal(timestamp, delta.Timestamp);
    }

    [Fact]
    public void Diff_detects_a_removed_middle_slot()
    {
        var before = Observation(Seat.Right, [true, true, true]);
        var after = Observation(Seat.Right, [true, false, true]);

        Assert.True(ObservationDiffer.Diff(before, after).MainSlotRemoved);
    }

    [Fact]
    public void Diff_detects_a_removed_tail_slot()
    {
        var before = Observation(Seat.Top, [true, true, true]);
        var after = Observation(Seat.Top, [true, true]);

        Assert.True(ObservationDiffer.Diff(before, after).MainSlotRemoved);
    }

    [Fact]
    public void Diff_does_not_treat_an_added_slot_as_removal()
    {
        var before = Observation(Seat.Left, [true, true]);
        var after = Observation(Seat.Left, [true, true, true]);

        Assert.False(ObservationDiffer.Diff(before, after).MainSlotRemoved);
    }

    [Fact]
    public void Diff_rejects_observations_from_different_seats()
    {
        var before = Observation(Seat.Bottom, [true]);
        var after = Observation(Seat.Top, [true]);

        Assert.Throws<ArgumentException>(() => ObservationDiffer.Diff(before, after));
    }

    [Theory]
    [InlineData(false, true)]
    [InlineData(true, false)]
    [InlineData(false, false)]
    public void Diff_is_unstable_when_either_endpoint_is_unstable(bool beforeStable, bool afterStable)
    {
        var before = Observation(Seat.Bottom, [true], stable: beforeStable);
        var after = Observation(Seat.Bottom, [true], stable: afterStable);

        Assert.False(ObservationDiffer.Diff(before, after).IsStable);
    }

    [Fact]
    public void Diff_reports_no_changes_for_unchanged_observations()
    {
        var observation = Observation(Seat.Bottom, [true, false, true], true, 1, 3, 2, true);

        var delta = ObservationDiffer.Diff(observation, observation);

        Assert.Equal(0, delta.MainHandDelta);
        Assert.Equal(0, delta.DrawnSlotDelta);
        Assert.Equal(0, delta.MeldGroupDelta);
        Assert.Equal(0, delta.MeldTileDelta);
        Assert.Equal(0, delta.RiverDelta);
        Assert.False(delta.MainSlotRemoved);
        Assert.True(delta.IsStable);
    }

    private static SeatObservation Observation(
        Seat seat,
        IReadOnlyList<bool> mainSlots,
        bool drawn = false,
        int meldGroups = 0,
        int meldTiles = 0,
        int riverCount = 0,
        bool stable = true,
        DateTimeOffset? timestamp = null)
    {
        var river = Enumerable.Range(0, riverCount)
            .Select(index => new DetectedTile(index.ToString(), Quad(), 1d))
            .ToArray();

        return new SeatObservation(
            seat,
            mainSlots.Count(occupied => occupied),
            mainSlots,
            drawn,
            meldGroups,
            meldTiles,
            river,
            stable,
            1d,
            timestamp ?? DateTimeOffset.UnixEpoch);
    }

    private static NormalizedQuad Quad() =>
        new(new(0.1, 0.1), new(0.2, 0.1), new(0.2, 0.2), new(0.1, 0.2));
}
