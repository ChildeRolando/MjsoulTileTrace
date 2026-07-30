using MahjongSoulOverlay.Core.Domain;

namespace MahjongSoulOverlay.Core.Events;

public sealed record ObservationTransaction(
    Seat Seat,
    int MainHandDelta,
    int DrawnSlotDelta,
    int MeldGroupDelta,
    int MeldTileDelta,
    int RiverDelta,
    bool MainSlotRemoved,
    bool IsConflicted,
    DateTimeOffset StartedAt,
    DateTimeOffset CompletedAt)
{
    public int ConcealedDelta => MainHandDelta + DrawnSlotDelta;
}

public sealed class TransactionAggregator
{
    private readonly TimeSpan _timeout;
    private readonly int _stableFramesRequired;
    private readonly List<ObservationDelta> _deltas = [];
    private DateTimeOffset _clock;
    private int _stableFrames;
    private bool _timedOut;

    public TransactionAggregator(TimeSpan timeout, int stableFramesRequired)
    {
        if (timeout <= TimeSpan.Zero)
            throw new ArgumentOutOfRangeException(
                nameof(timeout), timeout, "Timeout must be positive.");
        if (stableFramesRequired <= 0)
            throw new ArgumentOutOfRangeException(
                nameof(stableFramesRequired),
                stableFramesRequired,
                "Stable frame count must be positive.");

        _timeout = timeout;
        _stableFramesRequired = stableFramesRequired;
    }

    public void Add(ObservationDelta delta)
    {
        ArgumentNullException.ThrowIfNull(delta);

        if (_deltas.Count > 0 && delta.Timestamp < _clock)
            throw new ArgumentOutOfRangeException(
                nameof(delta), delta.Timestamp, "Observation timestamps cannot move backwards.");

        _deltas.Add(delta);
        _clock = delta.Timestamp;
        _stableFrames = delta.IsStable ? _stableFrames + 1 : 0;
    }

    public void AdvanceClock(DateTimeOffset now)
    {
        if (_deltas.Count > 0 && now < _clock)
            throw new ArgumentOutOfRangeException(
                nameof(now), now, "The transaction clock cannot move backwards.");

        _clock = now;
        _timedOut = _deltas.Count > 0 && now - _deltas[0].Timestamp > _timeout;
    }

    public ObservationTransaction? TryComplete()
    {
        if (_deltas.Count == 0 ||
            (!_timedOut && _stableFrames < _stableFramesRequired))
        {
            return null;
        }

        var first = _deltas[0];
        var transaction = new ObservationTransaction(
            first.Seat,
            _deltas.Sum(item => item.MainHandDelta),
            _deltas.Sum(item => item.DrawnSlotDelta),
            _deltas.Sum(item => item.MeldGroupDelta),
            _deltas.Sum(item => item.MeldTileDelta),
            _deltas.Sum(item => item.RiverDelta),
            _deltas.Any(item => item.MainSlotRemoved),
            _timedOut || _deltas.Any(item => item.Seat != first.Seat),
            first.Timestamp,
            _clock);

        _deltas.Clear();
        _stableFrames = 0;
        _timedOut = false;
        return transaction;
    }
}
