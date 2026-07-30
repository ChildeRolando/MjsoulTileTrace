using MahjongSoulOverlay.Core.Domain;

namespace MahjongSoulOverlay.Core.Events;

public sealed record ObservationDelta(
    Seat Seat,
    int MainHandDelta,
    int DrawnSlotDelta,
    int MeldGroupDelta,
    int MeldTileDelta,
    int RiverDelta,
    bool MainSlotRemoved,
    bool IsStable,
    DateTimeOffset Timestamp);

public static class ObservationDiffer
{
    public static ObservationDelta Diff(SeatObservation before, SeatObservation after)
    {
        if (before.Seat != after.Seat)
            throw new ArgumentException("Observations must belong to the same seat.");

        var removed = Enumerable.Range(0, before.MainSlots.Count)
            .Any(index => before.MainSlots[index] &&
                (index >= after.MainSlots.Count || !after.MainSlots[index]));

        return new ObservationDelta(
            after.Seat,
            after.MainHandCount - before.MainHandCount,
            Convert.ToInt32(after.DrawnSlotOccupied) - Convert.ToInt32(before.DrawnSlotOccupied),
            after.MeldGroups - before.MeldGroups,
            after.MeldTiles - before.MeldTiles,
            after.RiverTiles.Count - before.RiverTiles.Count,
            removed,
            before.IsStable && after.IsStable,
            after.Timestamp);
    }
}
