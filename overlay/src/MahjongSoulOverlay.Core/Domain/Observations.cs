namespace MahjongSoulOverlay.Core.Domain;

public enum Seat { Bottom, Right, Top, Left }

public sealed record SeatObservation(
    Seat Seat,
    int MainHandCount,
    IReadOnlyList<bool> MainSlots,
    bool DrawnSlotOccupied,
    int MeldGroups,
    int MeldTiles,
    IReadOnlyList<DetectedTile> RiverTiles,
    bool IsStable,
    double Confidence,
    DateTimeOffset Timestamp)
{
    public static SeatObservation Stable(
        Seat seat, int mainHandCount, bool drawnOccupied, int meldGroups,
        int meldTiles, IReadOnlyList<DetectedTile> river) =>
        new(seat, mainHandCount, Enumerable.Repeat(true, mainHandCount).ToArray(),
            drawnOccupied, meldGroups, meldTiles, river, true, 1d, DateTimeOffset.UnixEpoch);
}

public sealed record TableObservation(
    IReadOnlyDictionary<Seat, SeatObservation> Seats,
    bool TableStructureVisible,
    bool HandBaselineVisible,
    bool ResultScreenVisible,
    DateTimeOffset Timestamp);
