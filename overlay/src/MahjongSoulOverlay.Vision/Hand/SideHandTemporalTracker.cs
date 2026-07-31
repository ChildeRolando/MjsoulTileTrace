namespace MahjongSoulOverlay.Vision.Hand;

/// <summary>
/// Tracks tile-back instances over time to distinguish transient hand-animation
/// occlusion from persistent structural changes (tedashi, tsumogiri).
///
/// Uses timestamps (not frame counts) so behaviour is independent of video
/// frame rate.  Maintains a two-channel update policy: stable geometry updated
/// only from consecutive high-confidence low-motion frames, while transient
/// observations continue during animation without overwriting stable geometry.
/// </summary>
public sealed class SideHandTemporalTracker
{
    private readonly TemporalTrackerOptions _options;
    private readonly Dictionary<int, TrackedOrdinal> _tracked = [];
    private bool _geometryFrozen;
    private DateTimeOffset _lastGeometryUpdate = DateTimeOffset.MinValue;
    private BackSurfaceGeometry? _stableGeometry;
    private ProjectiveTileSequenceModel? _stableModel;
    private IReadOnlyList<BackTileInstance> _stableInstances = [];
    private bool _previousExtraPresent;
    private IReadOnlyList<bool> _previousMainSequence = []; // stable ordinal presence
    private int _geometryConsensusCount;
    private double _lastMotionScore = 1.0;

    public SideHandTemporalTracker(TemporalTrackerOptions? options = null)
    {
        _options = options ?? new TemporalTrackerOptions();
    }

    /// <summary>
    /// Process one frame's detected topology and return the tracking result.
    /// </summary>
    /// <param name="topology">Current frame's instance topology.</param>
    /// <param name="now">Frame timestamp.</param>
    /// <param name="motionScore">Motion score 0 (static) to 1 (high motion).</param>
    /// <returns>Tracking result with confirmed ordinals, missing state, evidence flags.</returns>
    public TrackingResult Update(
        SideHandInstanceTopology topology,
        DateTimeOffset now,
        double motionScore)
    {
        ArgumentNullException.ThrowIfNull(topology);
        if (motionScore is < 0 or > 1)
            throw new ArgumentOutOfRangeException(nameof(motionScore));

        var instances = topology.OrderedMainInstances;
        bool isAnimating = motionScore > 0.25;
        bool isLowConfidence = topology.Confidence < _options.LowConfidenceThreshold;
        bool isGeometryFailure = topology.Status == TopologyStatus.GeometryFailure;

        // ── If geometry failure, don't update anything ────────────
        if (isGeometryFailure)
        {
            return MakeResult(instances, topology.ExtraInstance,
                _tracked.Values.Any(t => t.State == TrackState.ConfirmedMissing)
                    ? _tracked.First(t => t.Value.State == TrackState.ConfirmedMissing).Key
                    : null,
                false, false, false, topology.Confidence, "GeometryFailure");
        }

        // ── Match current instances to tracked ordinals ──────────
        var matches = MatchInstances(instances, topology.ProjectiveModel);

        // ── Update tracked ordinals ──────────────────────────────
        int totalLost = 0;
        HashSet<int> seenOrdinals = [];

        foreach (var (ordinal, tracked) in _tracked)
        {
            if (matches.TryGetValue(ordinal, out var matchedInst))
            {
                // Instance present this frame.
                seenOrdinals.Add(ordinal);
                tracked.LastSeenAt = now;
                tracked.LastU = matchedInst.UCenter;
                tracked.Confidence = matchedInst.Confidence;

                // Clear candidate missing on reappearance.
                if (tracked.State == TrackState.CandidateMissing)
                {
                    tracked.State = TrackState.Tracking;
                    tracked.MissingSince = null;
                }
            }
            else
            {
                // Instance absent this frame.
                if (isAnimating)
                {
                    // During animation, missing is ambiguous.
                    if (tracked.State == TrackState.Tracking)
                    {
                        tracked.State = TrackState.CandidateMissing;
                        tracked.MissingSince = now;
                    }
                    totalLost++;
                }
                else if (isLowConfidence)
                {
                    // Low confidence — don't confirm, don't clear.
                    totalLost++;
                }
                else
                {
                    // Not animating, good confidence — accumulate absence.
                    if (tracked.State == TrackState.Tracking)
                    {
                        tracked.State = TrackState.CandidateMissing;
                        tracked.MissingSince = now;
                        totalLost++;
                    }
                    else if (tracked.State == TrackState.CandidateMissing &&
                             tracked.MissingSince is { } since)
                    {
                        if ((now - since) >= _options.MissingConfirmDuration)
                        {
                            tracked.State = TrackState.ConfirmedMissing;
                        }
                        totalLost++;
                    }
                    else if (tracked.State == TrackState.ConfirmedMissing)
                    {
                        totalLost++;
                    }
                }
            }
        }

        // ── Add new ordinals for unmatched instances ─────────────
        int nextOrdinal = _tracked.Count > 0 ? _tracked.Keys.Max() + 1 : 0;
        foreach (var inst in instances)
        {
            bool matched = matches.Values.Any(m => ReferenceEquals(m, inst));
            if (!matched)
            {
                _tracked[nextOrdinal] = new TrackedOrdinal
                {
                    Ordinal = nextOrdinal,
                    LastSeenAt = now,
                    LastU = inst.UCenter,
                    State = TrackState.Tracking,
                    Confidence = inst.Confidence,
                };
                seenOrdinals.Add(nextOrdinal);
                nextOrdinal++;
            }
        }

        // ── Detect occlusion vs genuine loss ─────────────────────
        bool isOccluded = totalLost >= _options.OcclusionMinConcurrentLoss && isAnimating;
        if (isOccluded)
        {
            // During occlusion, reset candidate timers.
            foreach (var (_, tracked) in _tracked)
            {
                if (tracked.State == TrackState.CandidateMissing)
                {
                    tracked.State = TrackState.Tracking;
                    tracked.MissingSince = null;
                }
            }
        }

        // ── Find confirmed missing ordinal ───────────────────────
        int? confirmedMissing = null;
        foreach (var (ordinal, tracked) in _tracked.OrderBy(kv => kv.Key))
        {
            if (tracked.State == TrackState.ConfirmedMissing)
            {
                confirmedMissing = ordinal;
                break; // Only one confirmed missing at a time.
            }
        }

        // ── Tsumogiri / Tedashi evidence ─────────────────────────
        bool extraPresent = topology.ExtraInstance is not null;
        bool mainSequenceUnchanged = _previousMainSequence.Count > 0 &&
            instances.Count == _previousMainSequence.Count(t => t) &&
            AreInstancesStable(instances);

        bool tsumogiriEvidence = _previousExtraPresent && !extraPresent &&
            mainSequenceUnchanged && !isAnimating && confirmedMissing is null;

        bool tedashiEvidence = confirmedMissing is not null &&
            extraPresent && !isAnimating;

        // ── Geometry consensus ───────────────────────────────────
        if (!isAnimating && !isLowConfidence && !isOccluded &&
            topology.Confidence >= _options.LowConfidenceThreshold + 0.15)
        {
            bool sameCount = _stableInstances.Count == instances.Count ||
                (_stableInstances.Count == 0 && instances.Count >= 5);
            bool positionsAgree = _stableInstances.Count == 0 ||
                AreInstancePositionsAgree(_stableInstances, instances,
                    _options.OrdinalMatchTolerance * 2);

            if (sameCount && positionsAgree)
            {
                _geometryConsensusCount++;
            }
            else
            {
                _geometryConsensusCount = 1;
            }

            if (_geometryConsensusCount >= 3 &&
                (now - _lastGeometryUpdate) >= _options.MaxStableAge)
            {
                _stableInstances = instances;
                _stableModel = topology.ProjectiveModel;
                _geometryFrozen = false;
                _lastGeometryUpdate = now;
                _geometryConsensusCount = 0;
            }
        }
        else if (isAnimating)
        {
            _geometryFrozen = true;
            _geometryConsensusCount = 0;
        }

        // ── Update previous state ────────────────────────────────
        _previousExtraPresent = extraPresent;
        _previousMainSequence = instances.Select(_ => true).ToList();
        _lastMotionScore = motionScore;

        // ── Build tracker state string ────────────────────────────
        string trackerState;
        if (isOccluded) trackerState = "Occluded";
        else if (isLowConfidence) trackerState = "LowConfidence";
        else if (isGeometryFailure) trackerState = "GeometryFailure";
        else if (_geometryFrozen) trackerState = "GeometryFrozen";
        else if (confirmedMissing is { } cm)
            trackerState = $"ConfirmedMissing({cm})";
        else if (_tracked.Values.Any(t => t.State == TrackState.CandidateMissing))
        {
            var cand = _tracked.Values.First(t => t.State == TrackState.CandidateMissing);
            trackerState = $"CandidateMissing({cand.Ordinal})";
        }
        else trackerState = "Tracking";

        return MakeResult(instances, topology.ExtraInstance,
            confirmedMissing, isOccluded, tsumogiriEvidence, tedashiEvidence,
            topology.Confidence, trackerState);
    }

    /// <summary>Current stable geometry, or null if not yet established.</summary>
    public BackSurfaceGeometry? StableGeometry => _stableGeometry;

    /// <summary>Update the stable geometry from the pipeline.</summary>
    public void SetStableGeometry(BackSurfaceGeometry? geometry)
    {
        _stableGeometry = geometry;
        _geometryFrozen = geometry is null;
        _geometryConsensusCount = 0;
    }

    /// <summary>Whether geometry updates are currently frozen (hand animation).</summary>
    public bool IsGeometryFrozen => _geometryFrozen;

    /// <summary>Current stable instances.</summary>
    public IReadOnlyList<BackTileInstance> StableInstances => _stableInstances;

    /// <summary>Current stable projective model.</summary>
    public ProjectiveTileSequenceModel? StableModel => _stableModel;

    /// <summary>Reset all internal state.</summary>
    public void Reset()
    {
        _tracked.Clear();
        _geometryFrozen = false;
        _lastGeometryUpdate = DateTimeOffset.MinValue;
        _stableGeometry = null;
        _stableModel = null;
        _stableInstances = [];
        _previousExtraPresent = false;
        _previousMainSequence = [];
        _geometryConsensusCount = 0;
        _lastMotionScore = 1.0;
    }

    // ── Helpers ──────────────────────────────────────────────────

    private Dictionary<int, BackTileInstance> MatchInstances(
        IReadOnlyList<BackTileInstance> instances,
        ProjectiveTileSequenceModel? model)
    {
        var matches = new Dictionary<int, BackTileInstance>();
        if (instances.Count == 0 || _tracked.Count == 0) return matches;

        // Match by u-proximity to tracked positions.
        foreach (var inst in instances)
        {
            int? bestOrdinal = null;
            double bestDist = double.MaxValue;

            foreach (var (ordinal, tracked) in _tracked)
            {
                double dist = Math.Abs(inst.UCenter - tracked.LastU);
                if (dist < _options.OrdinalMatchTolerance && dist < bestDist)
                {
                    bestDist = dist;
                    bestOrdinal = ordinal;
                }
            }

            if (bestOrdinal is { } ord)
                matches[ord] = inst;
        }

        return matches;
    }

    private bool AreInstancesStable(IReadOnlyList<BackTileInstance> instances)
    {
        if (_stableInstances.Count != instances.Count) return false;
        return AreInstancePositionsAgree(_stableInstances, instances,
            _options.OrdinalMatchTolerance * 2);
    }

    private static bool AreInstancePositionsAgree(
        IReadOnlyList<BackTileInstance> a,
        IReadOnlyList<BackTileInstance> b,
        double tolerance)
    {
        if (a.Count != b.Count) return false;
        for (int i = 0; i < a.Count; i++)
        {
            if (Math.Abs(a[i].UCenter - b[i].UCenter) > tolerance)
                return false;
        }
        return true;
    }

    private static TrackingResult MakeResult(
        IReadOnlyList<BackTileInstance> mainInstances,
        BackTileInstance? extraInstance,
        int? missingOrdinal,
        bool isOccluded,
        bool tsumogiriEvidence,
        bool tedashiEvidence,
        double confidence,
        string trackerState)
    {
        return new TrackingResult(
            mainInstances,
            extraInstance,
            missingOrdinal,
            isOccluded,
            tsumogiriEvidence,
            tedashiEvidence,
            confidence,
            trackerState);
    }

    // ── Nested types ─────────────────────────────────────────────

    private enum TrackState { Tracking, CandidateMissing, ConfirmedMissing }

    private sealed class TrackedOrdinal
    {
        public int Ordinal { get; init; }
        public DateTimeOffset LastSeenAt { get; set; }
        public double LastU { get; set; }
        public TrackState State { get; set; } = TrackState.Tracking;
        public DateTimeOffset? MissingSince { get; set; }
        public double Confidence { get; set; }
    }
}
