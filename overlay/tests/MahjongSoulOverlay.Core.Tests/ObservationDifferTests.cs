using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.Events;

namespace MahjongSoulOverlay.Core.Tests;

public sealed class ObservationDifferTests
{
    [Fact]
    public void Diff_reports_each_structural_change_independently()
    {
        var before = SeatObservation.Stable(Seat.Bottom, mainHandCount: 13, drawnOccupied: false,
            meldGroups: 0, meldTiles: 0, river: []);
        var after = SeatObservation.Stable(Seat.Bottom, mainHandCount: 13, drawnOccupied: true,
            meldGroups: 0, meldTiles: 0, river: []);

        var delta = ObservationDiffer.Diff(before, after);

        Assert.Equal(0, delta.MainHandDelta);
        Assert.Equal(1, delta.DrawnSlotDelta);
        Assert.Equal(0, delta.RiverDelta);
        Assert.True(delta.IsStable);
    }
}
