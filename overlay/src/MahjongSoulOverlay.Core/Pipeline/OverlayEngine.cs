using System.Collections.ObjectModel;
using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.Events;
using MahjongSoulOverlay.Core.Lifecycle;
using MahjongSoulOverlay.Core.River;

namespace MahjongSoulOverlay.Core.Pipeline;

public sealed record OverlayLayer(
    Guid TileId,
    Seat Seat,
    NormalizedQuad Quad,
    DiscardKind Kind);

public enum CandidateResolutionStatus
{
    Confirmed,
    Expired,
    Ambiguous,
    Rejected
}

public sealed record CandidateResolution(
    Guid CandidateId,
    Seat Actor,
    TableEventKind CandidateKind,
    TableEventKind OutcomeKind,
    CandidateResolutionStatus Status,
    DateTimeOffset ResolvedAt,
    string Reason,
    Seat? SourceSeat,
    Guid? SourceTileId);

public sealed record EngineOutput(
    LifecycleState Lifecycle,
    IReadOnlyList<OverlayLayer> Layers,
    IReadOnlyList<TableEvent> Events,
    IReadOnlyList<CandidateResolution> CandidateResolutions,
    bool ShouldHideOverlay);

public sealed class OverlayEngine
{
    private static readonly Seat[] Seats = Enum.GetValues<Seat>();

    private readonly TableLifecycle _lifecycle;
    private readonly EventClassifier _classifier;
    private readonly TimeSpan _associationWindow;
    private readonly IReadOnlyDictionary<Seat, TransactionAggregator> _aggregators;
    private readonly IReadOnlyDictionary<Seat, RiverTracker> _riverTrackers;
    private readonly Dictionary<Seat, SeatObservation> _previousStable = [];
    private readonly Dictionary<Seat, TableEvent> _lastFormalByActor = [];
    private readonly Dictionary<Guid, DiscardKind> _overlayKinds = [];
    private readonly List<TableEvent> _formalHistory = [];
    private readonly List<PendingCandidate> _pendingCandidates = [];
    private readonly List<RemovalEvidence> _recentRemovals = [];
    private readonly HashSet<Guid> _resolvedCandidateIds = [];
    private readonly HashSet<Guid> _confirmedRemovalTombstones = [];
    private DateTimeOffset? _lastTimestamp;

    public OverlayEngine(
        TableLifecycle lifecycle,
        EventClassifier classifier,
        TimeSpan associationWindow,
        IReadOnlyDictionary<Seat, TransactionAggregator> aggregators,
        IReadOnlyDictionary<Seat, RiverTracker> riverTrackers)
    {
        ArgumentNullException.ThrowIfNull(lifecycle);
        ArgumentNullException.ThrowIfNull(classifier);
        ArgumentNullException.ThrowIfNull(aggregators);
        ArgumentNullException.ThrowIfNull(riverTrackers);
        if (associationWindow <= TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(
                nameof(associationWindow),
                associationWindow,
                "Association window must be positive.");
        }

        EnsureCompleteSeatMap(aggregators, nameof(aggregators));
        EnsureCompleteSeatMap(riverTrackers, nameof(riverTrackers));

        _lifecycle = lifecycle;
        _classifier = classifier;
        _associationWindow = associationWindow;
        _aggregators = new ReadOnlyDictionary<Seat, TransactionAggregator>(
            new Dictionary<Seat, TransactionAggregator>(aggregators));
        _riverTrackers = new ReadOnlyDictionary<Seat, RiverTracker>(
            new Dictionary<Seat, RiverTracker>(riverTrackers));
    }

    public EngineOutput Push(TableObservation observation)
    {
        ArgumentNullException.ThrowIfNull(observation);
        EnsureMonotonic(observation.Timestamp);
        EnsureCompleteSeatMap(observation.Seats, nameof(observation));
        _lastTimestamp = observation.Timestamp;

        var lifecycle = _lifecycle.Push(new LifecycleInput(
            observation.TableStructureVisible,
            observation.HandBaselineVisible,
            observation.ResultScreenVisible));

        if (lifecycle.Action is LifecycleAction.ClearOverlay or LifecycleAction.HideOverlay)
            ClearHandState(observation.Timestamp);

        if (lifecycle.State != LifecycleState.HandActive)
        {
            CaptureStableBaselines(observation);
            return Snapshot(lifecycle, [], []);
        }

        if (!observation.TableStructureVisible)
            return Snapshot(lifecycle, [], [], shouldHide: true);

        var events = new List<TableEvent>();
        var resolutions = new List<CandidateResolution>();
        var classified = ClassifyFrame(observation, events, resolutions);
        TrackRivers(observation, classified);
        ResolveEvidence(observation.Timestamp, events, resolutions);

        return Snapshot(lifecycle, events, resolutions);
    }

    public EngineOutput ManualReset()
    {
        var lifecycle = _lifecycle.ManualReset();
        ClearHandState(_lastTimestamp);
        return Snapshot(lifecycle, [], []);
    }

    private Dictionary<Seat, DiscardKind?> ClassifyFrame(
        TableObservation observation,
        List<TableEvent> events,
        List<CandidateResolution> resolutions)
    {
        var classified = Seats.ToDictionary(seat => seat, _ => (DiscardKind?)null);

        foreach (var seat in Seats)
        {
            var current = observation.Seats[seat];
            if (!_previousStable.TryGetValue(seat, out var previous))
            {
                if (current.IsStable)
                    _previousStable[seat] = current;
                continue;
            }

            ObservationTransaction? transaction;
            if (!current.IsStable)
            {
                _aggregators[seat].AdvanceClock(current.Timestamp);
                transaction = _aggregators[seat].TryComplete();
            }
            else
            {
                var delta = ObservationDiffer.Diff(previous, current);
                _previousStable[seat] = current;
                if (IsPureRiverRemoval(delta))
                    continue;

                var aggregator = _aggregators[seat];
                aggregator.Add(delta);
                transaction = aggregator.TryComplete();
            }

            if (transaction is null)
                continue;

            _lastFormalByActor.TryGetValue(seat, out var previousFormal);
            var candidate = _classifier.Classify(transaction, previousFormal);
            if (_resolvedCandidateIds.Contains(candidate.Id) ||
                _pendingCandidates.Any(item => item.Candidate.Id == candidate.Id))
            {
                continue;
            }

            if (candidate.Kind == TableEventKind.Unknown)
            {
                _resolvedCandidateIds.Add(candidate.Id);
                resolutions.Add(Resolution(
                    candidate,
                    TableEventKind.Unknown,
                    CandidateResolutionStatus.Rejected,
                    observation.Timestamp,
                    "classifier-rejected"));
            }
            else if (candidate.ConfirmationRequirement == ConfirmationRequirement.None)
            {
                Formalize(candidate, null, events);
                _resolvedCandidateIds.Add(candidate.Id);
                resolutions.Add(Resolution(
                    candidate,
                    candidate.Kind,
                    CandidateResolutionStatus.Confirmed,
                    observation.Timestamp,
                    "local-confirmation-not-required"));
                classified[seat] = candidate.Kind switch
                {
                    TableEventKind.Tsumogiri => DiscardKind.Tsumogiri,
                    TableEventKind.Tedashi => DiscardKind.Tedashi,
                    _ => null,
                };
            }
            else
            {
                _pendingCandidates.Add(new PendingCandidate(candidate));
            }
        }

        return classified;
    }

    private void TrackRivers(
        TableObservation observation,
        IReadOnlyDictionary<Seat, DiscardKind?> classified)
    {
        foreach (var seat in Seats)
        {
            if (!observation.Seats[seat].IsStable)
                continue;

            var update = _riverTrackers[seat].Update(
                seat,
                observation.Seats[seat].RiverTiles,
                DiscardKind.Unknown,
                observation.Timestamp);

            if (classified[seat] is { } discardKind && update.Added.Count == 1)
                _overlayKinds[update.Added[0].Id] = discardKind;

            foreach (var removed in update.Removed)
            {
                _overlayKinds.Remove(removed.Id);
                if (_confirmedRemovalTombstones.Contains(removed.Id) ||
                    _recentRemovals.Any(item => item.Tile.Id == removed.Id))
                {
                    continue;
                }

                _recentRemovals.Add(new RemovalEvidence(removed, observation.Timestamp));
            }
        }
    }

    private void ResolveEvidence(
        DateTimeOffset now,
        List<TableEvent> events,
        List<CandidateResolution> resolutions)
    {
        var candidates = _pendingCandidates
            .OrderBy(item => item.Candidate.ObservedAt)
            .ThenBy(item => item.Candidate.Id)
            .ToArray();
        var removals = _recentRemovals
            .OrderBy(item => item.ObservedAt)
            .ThenBy(item => item.Tile.Id)
            .ToArray();
        var candidateEdges = candidates.ToDictionary(
            candidate => candidate,
            candidate => removals
                .Where(removal => IsEligible(candidate.Candidate, removal))
                .ToArray());
        var visitedCandidates = new HashSet<PendingCandidate>();
        var visitedRemovals = new HashSet<RemovalEvidence>();
        var consumedCandidates = new HashSet<PendingCandidate>();
        var consumedRemovals = new HashSet<RemovalEvidence>();

        foreach (var root in candidates)
        {
            if (!visitedCandidates.Add(root))
                continue;

            var componentCandidates = new List<PendingCandidate>();
            var componentRemovals = new List<RemovalEvidence>();
            var candidateQueue = new Queue<PendingCandidate>();
            var removalQueue = new Queue<RemovalEvidence>();
            candidateQueue.Enqueue(root);

            while (candidateQueue.Count > 0 || removalQueue.Count > 0)
            {
                while (candidateQueue.TryDequeue(out var candidate))
                {
                    componentCandidates.Add(candidate);
                    foreach (var removal in candidateEdges[candidate])
                    {
                        if (visitedRemovals.Add(removal))
                            removalQueue.Enqueue(removal);
                    }
                }

                while (removalQueue.TryDequeue(out var removal))
                {
                    componentRemovals.Add(removal);
                    foreach (var candidate in candidates)
                    {
                        if (visitedCandidates.Contains(candidate) ||
                            !candidateEdges[candidate].Contains(removal))
                        {
                            continue;
                        }

                        visitedCandidates.Add(candidate);
                        candidateQueue.Enqueue(candidate);
                    }
                }
            }

            var latestEvidence = componentCandidates
                .Select(item => item.Candidate.ObservedAt)
                .Concat(componentRemovals.Select(item => item.ObservedAt))
                .Max();
            if (now <= latestEvidence + _associationWindow)
                continue;

            ResolveComponent(
                componentCandidates,
                componentRemovals,
                now,
                events,
                resolutions);
            consumedCandidates.UnionWith(componentCandidates);
            consumedRemovals.UnionWith(componentRemovals);
        }

        _pendingCandidates.RemoveAll(consumedCandidates.Contains);
        _recentRemovals.RemoveAll(consumedRemovals.Contains);
        _recentRemovals.RemoveAll(removal =>
            now > removal.ObservedAt + _associationWindow &&
            !_pendingCandidates.Any(candidate =>
                IsEligible(candidate.Candidate, removal)));
    }

    private void ResolveComponent(
        IReadOnlyList<PendingCandidate> candidates,
        IReadOnlyList<RemovalEvidence> removals,
        DateTimeOffset now,
        List<TableEvent> events,
        List<CandidateResolution> resolutions)
    {
        if (candidates.Count == 1 && removals.Count == 1)
        {
            var candidate = candidates[0].Candidate;
            var removal = removals[0];
            events.Add(new TableEvent(
                TableEventKind.CalledDiscard,
                removal.Tile.Seat,
                candidate.Actor,
                removal.ObservedAt,
                removal.Tile.Confidence));
            Formalize(candidate, removal, events);
            _resolvedCandidateIds.Add(candidate.Id);
            _confirmedRemovalTombstones.Add(removal.Tile.Id);
            resolutions.Add(Resolution(
                candidate,
                candidate.Kind,
                CandidateResolutionStatus.Confirmed,
                now,
                "unique-source-removal",
                removal.Tile.Seat,
                removal.Tile.Id));
            return;
        }

        var status = removals.Count == 0
            ? CandidateResolutionStatus.Expired
            : CandidateResolutionStatus.Ambiguous;
        var reason = removals.Count == 0
            ? "association-window-expired"
            : candidates.Count > 1
                ? "multiple-eligible-candidates"
                : "multiple-eligible-removals";

        foreach (var pending in candidates
            .OrderBy(item => item.Candidate.ObservedAt)
            .ThenBy(item => item.Candidate.Id))
        {
            var candidate = pending.Candidate;
            _resolvedCandidateIds.Add(candidate.Id);
            resolutions.Add(Resolution(
                candidate,
                TableEventKind.Unknown,
                status,
                now,
                reason));
        }
    }

    private void Formalize(
        LocalEventCandidate candidate,
        RemovalEvidence? source,
        List<TableEvent> events)
    {
        var formal = new TableEvent(
            candidate.Kind,
            candidate.Actor,
            source?.Tile.Seat,
            candidate.ObservedAt,
            candidate.Confidence);
        events.Add(formal);
        _formalHistory.Add(formal);
        if (!_lastFormalByActor.TryGetValue(candidate.Actor, out var latest) ||
            formal.Timestamp >= latest.Timestamp)
        {
            _lastFormalByActor[candidate.Actor] = formal;
        }
    }

    private EngineOutput Snapshot(
        LifecycleResult lifecycle,
        IEnumerable<TableEvent> events,
        IEnumerable<CandidateResolution> resolutions,
        bool shouldHide = false)
    {
        var layers = lifecycle.State == LifecycleState.HandActive
            ? _riverTrackers.Values
                .SelectMany(tracker => tracker.Tiles)
                .Where(tile => _overlayKinds.ContainsKey(tile.Id))
                .OrderBy(tile => tile.Seat)
                .ThenBy(tile => tile.Quad.TopLeft.Y)
                .ThenBy(tile => tile.Quad.TopLeft.X)
                .Select(tile => new OverlayLayer(
                    tile.Id,
                    tile.Seat,
                    tile.Quad,
                    _overlayKinds[tile.Id]))
                .ToArray()
            : [];

        return new EngineOutput(
            lifecycle.State,
            Immutable(layers),
            Immutable(events),
            Immutable(resolutions),
            shouldHide ||
                lifecycle.State == LifecycleState.Detached ||
                lifecycle.Action == LifecycleAction.HideOverlay);
    }

    private void CaptureStableBaselines(TableObservation observation)
    {
        foreach (var seat in Seats)
        {
            var current = observation.Seats[seat];
            if (current.IsStable)
                _previousStable[seat] = current;
        }
    }

    private void ClearHandState(DateTimeOffset? timestamp)
    {
        foreach (var seat in Seats)
        {
            _aggregators[seat].Reset(timestamp);
            _riverTrackers[seat].Update(
                seat,
                [],
                null,
                timestamp.GetValueOrDefault(DateTimeOffset.UnixEpoch));
        }

        _previousStable.Clear();
        _lastFormalByActor.Clear();
        _overlayKinds.Clear();
        _formalHistory.Clear();
        _pendingCandidates.Clear();
        _recentRemovals.Clear();
        _resolvedCandidateIds.Clear();
        _confirmedRemovalTombstones.Clear();
    }

    private void EnsureMonotonic(DateTimeOffset timestamp)
    {
        if (_lastTimestamp is not null && timestamp < _lastTimestamp)
        {
            throw new ArgumentOutOfRangeException(
                nameof(timestamp),
                timestamp,
                "Table timestamps cannot move backwards.");
        }
    }

    private bool IsEligible(
        LocalEventCandidate candidate,
        RemovalEvidence removal) =>
        candidate.Actor != removal.Tile.Seat &&
        (candidate.ObservedAt - removal.ObservedAt).Duration() <= _associationWindow;

    private static bool IsPureRiverRemoval(ObservationDelta delta) =>
        delta.RiverDelta < 0 &&
        delta.MainHandDelta == 0 &&
        delta.DrawnSlotDelta == 0 &&
        delta.MeldGroupDelta == 0 &&
        delta.MeldTileDelta == 0 &&
        !delta.MainSlotRemoved;

    private static CandidateResolution Resolution(
        LocalEventCandidate candidate,
        TableEventKind outcome,
        CandidateResolutionStatus status,
        DateTimeOffset resolvedAt,
        string reason,
        Seat? sourceSeat = null,
        Guid? sourceTileId = null) =>
        new(
            candidate.Id,
            candidate.Actor,
            candidate.Kind,
            outcome,
            status,
            resolvedAt,
            reason,
            sourceSeat,
            sourceTileId);

    private static IReadOnlyList<T> Immutable<T>(IEnumerable<T> values) =>
        new ReadOnlyCollection<T>(values.ToArray());

    private static void EnsureCompleteSeatMap<T>(
        IReadOnlyDictionary<Seat, T> map,
        string parameterName)
        where T : class
    {
        if (map.Count != Seats.Length ||
            Seats.Any(seat => !map.TryGetValue(seat, out var value) || value is null))
        {
            throw new ArgumentException(
                "Exactly one non-null value is required for every seat.",
                parameterName);
        }
    }

    private sealed record PendingCandidate(LocalEventCandidate Candidate);

    private sealed record RemovalEvidence(RiverTile Tile, DateTimeOffset ObservedAt);
}
