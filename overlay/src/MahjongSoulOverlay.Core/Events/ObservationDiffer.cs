using MahjongSoulOverlay.Core.Domain;

namespace MahjongSoulOverlay.Core.Events;

public sealed record ObservationDelta
{
    public ObservationDelta(
        Seat seat,
        int mainHandDelta,
        int drawnSlotDelta,
        int meldGroupDelta,
        int meldTileDelta,
        int riverDelta,
        bool mainSlotRemoved,
        bool isStable,
        double confidence,
        DateTimeOffset timestamp)
    {
        if (!double.IsFinite(confidence) || confidence is < 0d or > 1d)
            throw new ArgumentOutOfRangeException(
                nameof(confidence), confidence, "Confidence must be within [0, 1].");

        Seat = seat;
        MainHandDelta = mainHandDelta;
        DrawnSlotDelta = drawnSlotDelta;
        MeldGroupDelta = meldGroupDelta;
        MeldTileDelta = meldTileDelta;
        RiverDelta = riverDelta;
        MainSlotRemoved = mainSlotRemoved;
        IsStable = isStable;
        Confidence = confidence;
        Timestamp = timestamp;
    }

    public Seat Seat { get; }

    public int MainHandDelta { get; }

    public int DrawnSlotDelta { get; }

    public int MeldGroupDelta { get; }

    public int MeldTileDelta { get; }

    public int RiverDelta { get; }

    public bool MainSlotRemoved { get; }

    public bool IsStable { get; }

    public double Confidence { get; }

    public DateTimeOffset Timestamp { get; }

    public bool HasStructuralChange =>
        MainHandDelta != 0 ||
        DrawnSlotDelta != 0 ||
        MeldGroupDelta != 0 ||
        MeldTileDelta != 0 ||
        RiverDelta != 0 ||
        MainSlotRemoved;
}

public static class ObservationDiffer
{
    public static ObservationDelta Diff(SeatObservation before, SeatObservation after)
    {
        if (before.Seat != after.Seat)
            throw new ArgumentException("Observations must belong to the same seat.");

        var removed = Enumerable.Range(0, Math.Min(before.MainSlots.Count, after.MainSlots.Count))
            .Any(index => before.MainSlots[index] &&
                !after.MainSlots[index]);

        return new ObservationDelta(
            after.Seat,
            after.MainHandCount - before.MainHandCount,
            Convert.ToInt32(after.DrawnSlotOccupied) - Convert.ToInt32(before.DrawnSlotOccupied),
            after.MeldGroups - before.MeldGroups,
            after.MeldTiles - before.MeldTiles,
            after.RiverTiles.Count - before.RiverTiles.Count,
            removed,
            before.IsStable && after.IsStable,
            Math.Min(before.Confidence, after.Confidence),
            after.Timestamp);
    }
}
