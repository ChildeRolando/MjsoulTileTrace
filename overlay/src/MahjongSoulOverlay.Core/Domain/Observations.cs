using System.Collections.ObjectModel;

namespace MahjongSoulOverlay.Core.Domain;

public enum Seat { Bottom, Right, Top, Left }

public sealed record SeatObservation
{
    public SeatObservation(
        Seat seat,
        int mainHandCount,
        IReadOnlyList<bool> mainSlots,
        bool drawnSlotOccupied,
        int meldGroups,
        int meldTiles,
        IReadOnlyList<DetectedTile> riverTiles,
        bool isStable,
        double confidence,
        DateTimeOffset timestamp)
    {
        ArgumentNullException.ThrowIfNull(mainSlots);
        ArgumentNullException.ThrowIfNull(riverTiles);

        var copiedSlots = mainSlots.ToArray();
        if (mainHandCount != copiedSlots.Count(occupied => occupied))
            throw new ArgumentException(
                "Main hand count must equal the number of occupied main slots.",
                nameof(mainHandCount));
        if (meldGroups < 0)
            throw new ArgumentOutOfRangeException(
                nameof(meldGroups), meldGroups, "Meld group count cannot be negative.");
        if (meldTiles < 0)
            throw new ArgumentOutOfRangeException(
                nameof(meldTiles), meldTiles, "Meld tile count cannot be negative.");
        if (!double.IsFinite(confidence) || confidence is < 0d or > 1d)
            throw new ArgumentOutOfRangeException(
                nameof(confidence), confidence, "Confidence must be within [0, 1].");

        Seat = seat;
        MainHandCount = mainHandCount;
        MainSlots = Array.AsReadOnly(copiedSlots);
        DrawnSlotOccupied = drawnSlotOccupied;
        MeldGroups = meldGroups;
        MeldTiles = meldTiles;
        RiverTiles = Array.AsReadOnly(riverTiles.ToArray());
        IsStable = isStable;
        Confidence = confidence;
        Timestamp = timestamp;
    }

    public Seat Seat { get; }

    public int MainHandCount { get; }

    public IReadOnlyList<bool> MainSlots { get; }

    public bool DrawnSlotOccupied { get; }

    public int MeldGroups { get; }

    public int MeldTiles { get; }

    public IReadOnlyList<DetectedTile> RiverTiles { get; }

    public bool IsStable { get; }

    public double Confidence { get; }

    public DateTimeOffset Timestamp { get; }

    public static SeatObservation Stable(
        Seat seat, int mainHandCount, bool drawnOccupied, int meldGroups,
        int meldTiles, IReadOnlyList<DetectedTile> river) =>
        new(seat, mainHandCount, Enumerable.Repeat(true, mainHandCount).ToArray(),
            drawnOccupied, meldGroups, meldTiles, river, true, 1d, DateTimeOffset.UnixEpoch);
}

public sealed record TableObservation
{
    public TableObservation(
        IReadOnlyDictionary<Seat, SeatObservation> seats,
        bool tableStructureVisible,
        bool handBaselineVisible,
        bool resultScreenVisible,
        DateTimeOffset timestamp)
    {
        ArgumentNullException.ThrowIfNull(seats);

        Seats = new ReadOnlyDictionary<Seat, SeatObservation>(
            new Dictionary<Seat, SeatObservation>(seats));
        TableStructureVisible = tableStructureVisible;
        HandBaselineVisible = handBaselineVisible;
        ResultScreenVisible = resultScreenVisible;
        Timestamp = timestamp;
    }

    public IReadOnlyDictionary<Seat, SeatObservation> Seats { get; }

    public bool TableStructureVisible { get; }

    public bool HandBaselineVisible { get; }

    public bool ResultScreenVisible { get; }

    public DateTimeOffset Timestamp { get; }
}
