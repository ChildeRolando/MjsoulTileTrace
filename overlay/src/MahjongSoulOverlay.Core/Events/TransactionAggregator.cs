using MahjongSoulOverlay.Core.Domain;

namespace MahjongSoulOverlay.Core.Events;

public sealed class ObservationTransaction
{
    public ObservationTransaction(
        IReadOnlyList<ObservationDelta> deltas,
        bool isConflicted,
        DateTimeOffset completedAt)
    {
        ArgumentNullException.ThrowIfNull(deltas);
        if (deltas.Count == 0)
            throw new ArgumentException("A transaction must contain at least one delta.", nameof(deltas));

        var copiedDeltas = deltas.ToArray();
        if (copiedDeltas.Zip(copiedDeltas.Skip(1))
            .Any(pair => pair.Second.Timestamp < pair.First.Timestamp))
        {
            throw new ArgumentException(
                "Transaction deltas must be ordered by nondecreasing timestamp.",
                nameof(deltas));
        }
        if (completedAt < copiedDeltas[^1].Timestamp)
            throw new ArgumentOutOfRangeException(
                nameof(completedAt),
                completedAt,
                "Completion cannot precede the latest retained delta.");

        Deltas = Array.AsReadOnly(copiedDeltas);
        Seat = copiedDeltas[0].Seat;
        MainHandDelta = copiedDeltas.Aggregate(0L, (total, item) => total + item.MainHandDelta);
        DrawnSlotDelta = copiedDeltas.Aggregate(0L, (total, item) => total + item.DrawnSlotDelta);
        MeldGroupDelta = copiedDeltas.Aggregate(0L, (total, item) => total + item.MeldGroupDelta);
        MeldTileDelta = copiedDeltas.Aggregate(0L, (total, item) => total + item.MeldTileDelta);
        RiverDelta = copiedDeltas.Aggregate(0L, (total, item) => total + item.RiverDelta);
        MainSlotRemoved = copiedDeltas.Any(item => item.MainSlotRemoved);
        IsConflicted = isConflicted || copiedDeltas.Any(item => item.Seat != Seat);
        StartedAt = copiedDeltas[0].Timestamp;
        CompletedAt = completedAt;
        Confidence = copiedDeltas.Min(item => item.Confidence);
    }

    public Seat Seat { get; }

    public long MainHandDelta { get; }

    public long DrawnSlotDelta { get; }

    public long MeldGroupDelta { get; }

    public long MeldTileDelta { get; }

    public long RiverDelta { get; }

    public bool MainSlotRemoved { get; }

    public bool IsConflicted { get; }

    public DateTimeOffset StartedAt { get; }

    public DateTimeOffset CompletedAt { get; }

    public IReadOnlyList<ObservationDelta> Deltas { get; }

    public double Confidence { get; }

    public long ConcealedDelta => MainHandDelta + DrawnSlotDelta;
}

public sealed class TransactionAggregator
{
    private const int DefaultMaxDeltas = 512;

    private readonly TimeSpan _timeout;
    private readonly int _stableFramesRequired;
    private readonly int _maxDeltas;
    private readonly List<ObservationDelta> _deltas = [];
    private DateTimeOffset? _lastAcceptedTimestamp;
    private DateTimeOffset _clock;
    private int _stableFrames;
    private bool _timedOut;
    private bool _overflowed;
    private bool _seatConflict;

    public TransactionAggregator(
        TimeSpan timeout,
        int stableFramesRequired,
        int maxDeltas = DefaultMaxDeltas)
    {
        if (timeout <= TimeSpan.Zero)
            throw new ArgumentOutOfRangeException(
                nameof(timeout), timeout, "Timeout must be positive.");
        if (stableFramesRequired <= 0)
            throw new ArgumentOutOfRangeException(
                nameof(stableFramesRequired),
                stableFramesRequired,
                "Stable frame count must be positive.");
        if (maxDeltas <= 0)
            throw new ArgumentOutOfRangeException(
                nameof(maxDeltas), maxDeltas, "Delta limit must be positive.");

        _timeout = timeout;
        _stableFramesRequired = stableFramesRequired;
        _maxDeltas = maxDeltas;
    }

    public void Add(ObservationDelta delta)
    {
        ArgumentNullException.ThrowIfNull(delta);
        EnsureMonotonic(delta.Timestamp, nameof(delta));

        _lastAcceptedTimestamp = delta.Timestamp;
        _clock = delta.Timestamp;

        if (_deltas.Count == 0 && !delta.HasStructuralChange)
            return;

        _seatConflict = _deltas.Count > 0 &&
            (_seatConflict || delta.Seat != _deltas[0].Seat);

        if (!_overflowed)
        {
            _deltas.Add(delta);
            _overflowed = _deltas.Count >= _maxDeltas;
        }

        _stableFrames = delta.IsStable ? _stableFrames + 1 : 0;
        _timedOut = delta.Timestamp - _deltas[0].Timestamp >= _timeout;
    }

    public void AdvanceClock(DateTimeOffset now)
    {
        EnsureMonotonic(now, nameof(now));

        _lastAcceptedTimestamp = now;
        _clock = now;
        _timedOut = _deltas.Count > 0 && now - _deltas[0].Timestamp >= _timeout;
    }

    public ObservationTransaction? TryComplete()
    {
        if (_deltas.Count == 0 ||
            (!_timedOut && !_overflowed && !_seatConflict &&
                _stableFrames < _stableFramesRequired))
        {
            return null;
        }

        try
        {
            return new ObservationTransaction(
                _deltas,
                _timedOut || _overflowed || _seatConflict,
                _clock);
        }
        finally
        {
            ClearInFlight();
        }
    }

    public void Reset(DateTimeOffset? baselineTimestamp = null)
    {
        ClearInFlight();
        _lastAcceptedTimestamp = baselineTimestamp;
        _clock = baselineTimestamp.GetValueOrDefault();
    }

    private void EnsureMonotonic(DateTimeOffset timestamp, string parameterName)
    {
        if (_lastAcceptedTimestamp is not null && timestamp < _lastAcceptedTimestamp)
            throw new ArgumentOutOfRangeException(
                parameterName, timestamp, "Timestamps cannot move backwards.");
    }

    private void ClearInFlight()
    {
        _deltas.Clear();
        _stableFrames = 0;
        _timedOut = false;
        _overflowed = false;
        _seatConflict = false;
    }
}
