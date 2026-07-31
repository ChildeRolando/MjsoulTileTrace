using MahjongSoulOverlay.Core.Domain;
using OpenCvSharp;

namespace MahjongSoulOverlay.Vision.Hand;

/// <summary>
/// Shared geometry of the back-surface corridor for a side hand.
/// The ridge separates the light top surface from the darker back surface.
/// The lower rail is the bottom boundary of the back surfaces.
/// Both are image lines in rotated-ROI coordinates (ax + by + c = 0).
/// </summary>
public sealed record BackSurfaceGeometry
{
    /// <summary>Top/back ridge line (ax + by + c = 0) in rotated-ROI pixels.</summary>
    public Vec4d RidgeLine { get; }

    /// <summary>Lower back rail line (ax + by + c = 0) in rotated-ROI pixels.</summary>
    public Vec4d LowerRailLine { get; }

    /// <summary>First valid column index in rotated-ROI.</summary>
    public int ValidStart { get; }

    /// <summary>Last valid column index in rotated-ROI.</summary>
    public int ValidEnd { get; }

    /// <summary>+1 if top is brighter than back, -1 if back is brighter than top.</summary>
    public int ContrastSign { get; }

    /// <summary>Overall geometry confidence [0, 1].</summary>
    public double Confidence { get; }

    /// <summary>Number of inlier columns used for the ridge fit.</summary>
    public int RidgeInliers { get; }

    /// <summary>Number of inlier columns used for the lower rail fit.</summary>
    public int LowerRailInliers { get; }

    /// <summary>Mean absolute residual of ridge fit in pixels.</summary>
    public double NormalizedResidual { get; }

    /// <summary>Mean back-surface height in pixels across the valid span.</summary>
    public double MeanBackHeight { get; }

    public BackSurfaceGeometry(
        Vec4d ridgeLine,
        Vec4d lowerRailLine,
        int validStart,
        int validEnd,
        int contrastSign,
        double confidence,
        int ridgeInliers,
        int lowerRailInliers,
        double normalizedResidual,
        double meanBackHeight)
    {
        if (validStart < 0 || validEnd <= validStart)
            throw new ArgumentException("ValidStart must be >= 0 and ValidEnd > ValidStart.");
        if (confidence is < 0 or > 1)
            throw new ArgumentOutOfRangeException(nameof(confidence));
        if (ridgeInliers < 0 || lowerRailInliers < 0)
            throw new ArgumentException("Inlier counts must be non-negative.");

        RidgeLine = ridgeLine;
        LowerRailLine = lowerRailLine;
        ValidStart = validStart;
        ValidEnd = validEnd;
        ContrastSign = contrastSign;
        Confidence = confidence;
        RidgeInliers = ridgeInliers;
        LowerRailInliers = lowerRailInliers;
        NormalizedResidual = normalizedResidual;
        MeanBackHeight = meanBackHeight;
    }

    /// <summary>Evaluate the ridge line at column x.</summary>
    public double RidgeY(double x) => -(RidgeLine.Item0 * x + RidgeLine.Item2) / RidgeLine.Item1;

    /// <summary>Evaluate the lower rail line at column x.</summary>
    public double LowerRailY(double x) => -(LowerRailLine.Item0 * x + LowerRailLine.Item2) / LowerRailLine.Item1;

    /// <summary>Back-surface height at column x.</summary>
    public double BackHeight(double x) => LowerRailY(x) - RidgeY(x);
}

/// <summary>
/// A single detected tile-back trapezoid within the back-surface corridor.
/// Bounded by the shared ridge (top), shared lower rail (bottom),
/// and two neighbouring tile boundaries (left/right).
/// </summary>
public sealed record BackTileInstance
{
    /// <summary>Left boundary u-parameter in [0, 1].</summary>
    public double ULeft { get; }

    /// <summary>Right boundary u-parameter in [0, 1].</summary>
    public double URight { get; }

    /// <summary>Centre u-parameter.</summary>
    public double UCenter { get; }

    /// <summary>Quad in normalised frame coordinates.</summary>
    public NormalizedQuad Quad { get; }

    /// <summary>Fraction of the inner corridor area covered by orange mask pixels.</summary>
    public double OrangeCoverage { get; }

    /// <summary>Whether orange mask pixels are present near the ridge.</summary>
    public bool RidgeSupport { get; }

    /// <summary>Whether orange mask pixels are present near the lower rail.</summary>
    public bool LowerRailSupport { get; }

    /// <summary>Instance width in u-units.</summary>
    public double Width { get; }

    /// <summary>Detection confidence [0, 1].</summary>
    public double Confidence { get; }

    public BackTileInstance(
        double uLeft,
        double uRight,
        NormalizedQuad quad,
        double orangeCoverage,
        bool ridgeSupport,
        bool lowerRailSupport,
        double confidence)
    {
        if (uLeft >= uRight)
            throw new ArgumentException("ULeft must be strictly less than URight.");
        if (orangeCoverage is < 0 or > 1)
            throw new ArgumentOutOfRangeException(nameof(orangeCoverage));
        if (confidence is < 0 or > 1)
            throw new ArgumentOutOfRangeException(nameof(confidence));

        ULeft = uLeft;
        URight = uRight;
        UCenter = (uLeft + uRight) * 0.5;
        Quad = quad;
        OrangeCoverage = orangeCoverage;
        RidgeSupport = ridgeSupport;
        LowerRailSupport = lowerRailSupport;
        Width = uRight - uLeft;
        Confidence = confidence;
    }
}

/// <summary>Classification of the gap between two adjacent instances.</summary>
public enum GapClass
{
    /// <summary>Normal adjacency — narrow seam/gap between consecutive main-hand tiles.</summary>
    NormalAdjacency,

    /// <summary>Approximately one projected tile width — internal hole or tedashi candidate.</summary>
    MissingOneTile,

    /// <summary>Larger gap at a terminal end followed by one valid instance — extra/drawn tile.</summary>
    TerminalExtraGap,

    /// <summary>Gap too large to be part of the same sequence — unrelated component.</summary>
    InvalidLargeGap,
}

/// <summary>
/// One-dimensional projective mapping from ordinal k to u-parameter.
/// u(k) = (A * k + B) / (C * k + 1) where k is the ordinal index.
/// Equal physical spacing under perspective produces this rational mapping.
/// </summary>
public sealed record ProjectiveTileSequenceModel
{
    public double A { get; }
    public double B { get; }
    public double C { get; }
    /// <summary>Ordinal offset — the k value corresponding to the first detected instance.</summary>
    public int K0 { get; }
    /// <summary>Mean absolute residual in u-units.</summary>
    public double Residual { get; }
    /// <summary>Whether du/dk &gt; 0 across the valid range.</summary>
    public bool IsMonotonic { get; }
    /// <summary>Fit confidence [0, 1].</summary>
    public double Confidence { get; }
    /// <summary>Number of inlier instances used for the fit.</summary>
    public int InlierCount { get; }

    public ProjectiveTileSequenceModel(
        double a, double b, double c, int k0,
        double residual, bool isMonotonic, double confidence, int inlierCount)
    {
        if (confidence is < 0 or > 1)
            throw new ArgumentOutOfRangeException(nameof(confidence));
        if (residual < 0)
            throw new ArgumentOutOfRangeException(nameof(residual));

        A = a; B = b; C = c; K0 = k0;
        Residual = residual;
        IsMonotonic = isMonotonic;
        Confidence = confidence;
        InlierCount = inlierCount;
    }

    /// <summary>Predicted u-position for ordinal index k.</summary>
    public double PredictedU(int k) => (A * k + B) / (C * k + 1.0);

    /// <summary>Predicted tile width in u-units at ordinal k (derivative of u w.r.t. k).</summary>
    public double PredictedWidth(int k)
    {
        double denom = C * k + 1.0;
        return (A * denom - (A * k + B) * C) / (denom * denom);
    }

    /// <summary>Predicted u-position relative to K0 (zero-based ordinal).</summary>
    public double PredictedUAt(int zeroBasedOrdinal) => PredictedU(K0 + zeroBasedOrdinal);

    /// <summary>Predicted width at zero-based ordinal.</summary>
    public double PredictedWidthAt(int zeroBasedOrdinal) => PredictedWidth(K0 + zeroBasedOrdinal);
}

/// <summary>Overall topology status for a frame.</summary>
public enum TopologyStatus
{
    /// <summary>Geometry and instances valid.</summary>
    Valid,

    /// <summary>Hand region partially occluded (animation, UI element).</summary>
    Occluded,

    /// <summary>Instances detected but confidence below threshold.</summary>
    LowConfidence,

    /// <summary>Geometry detection failed — no valid back surface found.</summary>
    GeometryFailure,
}

/// <summary>
/// Parsed instance-based topology for one side-hand frame.
/// Derived from detected tile-back instances and their projective spacing.
/// </summary>
public sealed record SideHandInstanceTopology
{
    /// <summary>Ordered detected instances assigned to the main hand sequence.</summary>
    public IReadOnlyList<BackTileInstance> OrderedMainInstances { get; }

    /// <summary>
    /// Main hand split into contiguous segments.
    /// Usually one segment; two when an internal tile is missing.
    /// </summary>
    public IReadOnlyList<IReadOnlyList<BackTileInstance>> MainSegments { get; }

    /// <summary>Terminal extra instance (drawn tile), or null.</summary>
    public BackTileInstance? ExtraInstance { get; }

    /// <summary>Zero-based ordinal of the missing main tile, if detected.</summary>
    public int? MissingMainOrdinal { get; }

    /// <summary>The fitted projective sequence model.</summary>
    public ProjectiveTileSequenceModel? ProjectiveModel { get; }

    /// <summary>Overall topology confidence [0, 1].</summary>
    public double Confidence { get; }

    /// <summary>Current status.</summary>
    public TopologyStatus Status { get; }

    /// <summary>Total detected instances (main + extra).</summary>
    public int InstanceCount { get; }

    /// <summary>Number of confirmed main instances.</summary>
    public int MainCount => OrderedMainInstances.Count;

    public SideHandInstanceTopology(
        IReadOnlyList<BackTileInstance> orderedMainInstances,
        IReadOnlyList<IReadOnlyList<BackTileInstance>> mainSegments,
        BackTileInstance? extraInstance,
        int? missingMainOrdinal,
        ProjectiveTileSequenceModel? projectiveModel,
        double confidence,
        TopologyStatus status)
    {
        ArgumentNullException.ThrowIfNull(orderedMainInstances);
        ArgumentNullException.ThrowIfNull(mainSegments);
        if (confidence is < 0 or > 1)
            throw new ArgumentOutOfRangeException(nameof(confidence));

        OrderedMainInstances = orderedMainInstances;
        MainSegments = mainSegments;
        ExtraInstance = extraInstance;
        MissingMainOrdinal = missingMainOrdinal;
        ProjectiveModel = projectiveModel;
        Confidence = confidence;
        Status = status;
        InstanceCount = orderedMainInstances.Count + (extraInstance is not null ? 1 : 0);
    }
}

/// <summary>Result from the temporal tracker for one frame.</summary>
public sealed record TrackingResult
{
    /// <summary>Stable-ordinal-ordered main instances observed this frame.</summary>
    public IReadOnlyList<BackTileInstance> OrderedMainInstances { get; }

    /// <summary>Terminal extra instance, or null.</summary>
    public BackTileInstance? ExtraInstance { get; }

    /// <summary>Confirmed missing main ordinal, or null.</summary>
    public int? MissingMainOrdinal { get; }

    /// <summary>Whether the hand is currently occluded (animation, etc.).</summary>
    public bool IsOccluded { get; }

    /// <summary>Whether tsumogiri evidence is present (extra disappeared, main unchanged).</summary>
    public bool TsumogiriEvidence { get; }

    /// <summary>Whether tedashi evidence is present (confirmed internal missing, extra present).</summary>
    public bool TedashiEvidence { get; }

    /// <summary>Overall tracker confidence [0, 1].</summary>
    public double Confidence { get; }

    /// <summary>Human-readable tracker state for diagnostics.</summary>
    public string TrackerState { get; }

    public TrackingResult(
        IReadOnlyList<BackTileInstance> orderedMainInstances,
        BackTileInstance? extraInstance,
        int? missingMainOrdinal,
        bool isOccluded,
        bool tsumogiriEvidence,
        bool tedashiEvidence,
        double confidence,
        string trackerState)
    {
        ArgumentNullException.ThrowIfNull(orderedMainInstances);
        ArgumentNullException.ThrowIfNull(trackerState);
        if (confidence is < 0 or > 1)
            throw new ArgumentOutOfRangeException(nameof(confidence));

        OrderedMainInstances = orderedMainInstances;
        ExtraInstance = extraInstance;
        MissingMainOrdinal = missingMainOrdinal;
        IsOccluded = isOccluded;
        TsumogiriEvidence = tsumogiriEvidence;
        TedashiEvidence = tedashiEvidence;
        Confidence = confidence;
        TrackerState = trackerState;
    }
}

/// <summary>Output of the observation adapter, ready for SeatObservation construction.</summary>
public sealed record AdapterOutput
{
    public int MainHandCount { get; }
    public IReadOnlyList<bool> MainSlots { get; }
    public bool DrawnSlotOccupied { get; }
    public IReadOnlyList<NormalizedQuad> OccupiedMainQuads { get; }
    public bool MainSlotRemoved { get; }
    public double Confidence { get; }
    public IReadOnlyList<bool> ResolvedSlots { get; }

    public AdapterOutput(
        int mainHandCount,
        IReadOnlyList<bool> mainSlots,
        bool drawnSlotOccupied,
        IReadOnlyList<NormalizedQuad> occupiedMainQuads,
        bool mainSlotRemoved,
        double confidence,
        IReadOnlyList<bool> resolvedSlots)
    {
        ArgumentNullException.ThrowIfNull(mainSlots);
        ArgumentNullException.ThrowIfNull(occupiedMainQuads);
        ArgumentNullException.ThrowIfNull(resolvedSlots);
        if (confidence is < 0 or > 1)
            throw new ArgumentOutOfRangeException(nameof(confidence));

        MainHandCount = mainHandCount;
        MainSlots = mainSlots;
        DrawnSlotOccupied = drawnSlotOccupied;
        OccupiedMainQuads = occupiedMainQuads;
        MainSlotRemoved = mainSlotRemoved;
        Confidence = confidence;
        ResolvedSlots = resolvedSlots;
    }
}

// ── Options classes ─────────────────────────────────────────────────────

/// <summary>Configurable options for BackSurfaceGeometryDetector.</summary>
public sealed record BackSurfaceGeometryOptions
{
    /// <summary>Local window half-height in pixels for contrast computation.</summary>
    public int ContrastWindowRadius { get; init; } = 5;

    /// <summary>Epsilon added to MAD denominator for numerical stability.</summary>
    public double ContrastMadEpsilon { get; init; } = 5.0;

    /// <summary>Minimum absolute contrast for a ridge candidate point.</summary>
    public double MinContrast { get; init; } = 8.0;

    /// <summary>Minimum fraction of cross-section height that must have orange
    /// support on each side of the candidate ridge.</summary>
    public double MinOrangeSupportFraction { get; init; } = 0.30;

    /// <summary>RANSAC inlier distance in pixels for line fitting.</summary>
    public double RansacInlierPx { get; init; } = 4.0;

    /// <summary>Number of RANSAC iterations.</summary>
    public int RansacIterations { get; init; } = 200;

    /// <summary>Minimum fraction of candidate points that must be inliers.</summary>
    public double MinInlierFraction { get; init; } = 0.35;

    /// <summary>Minimum number of candidate points required.</summary>
    public int MinCandidatePoints { get; init; } = 15;

    /// <summary>Maximum absolute line slope |dy/dx| for valid ridge/rail.</summary>
    public double MaxSlope { get; init; } = 0.8;

    /// <summary>Minimum back-surface height as fraction of ROI height.</summary>
    public double MinBackHeightFraction { get; init; } = 0.04;

    /// <summary>Maximum back-surface height as fraction of ROI height.</summary>
    public double MaxBackHeightFraction { get; init; } = 0.85;

    /// <summary>Fraction of columns trimmed from ends for lower-rail point collection.</summary>
    public double RailEndTrimFraction { get; init; } = 0.08;
}

/// <summary>Configurable options for BackTileInstanceDetector.</summary>
public sealed record BackTileInstanceOptions
{
    /// <summary>Fraction inset from ridge toward lower rail.</summary>
    public double CorridorInsetTop { get; init; } = 0.10;

    /// <summary>Fraction inset from lower rail toward ridge.</summary>
    public double CorridorInsetBottom { get; init; } = 0.10;

    /// <summary>Minimum fraction of corridor height an instance must span.</summary>
    public double MinCorridorSpanFraction { get; init; } = 0.60;

    /// <summary>Sigma for Gaussian smoothing of the occupancy signal.</summary>
    public double OccupancySmoothSigma { get; init; } = 1.5;

    /// <summary>Minimum orange coverage within the instance quad.</summary>
    public double MinOrangeCoverage { get; init; } = 0.35;

    /// <summary>Maximum gap between fragments to merge, as fraction of local
    /// projected tile width.</summary>
    public double MergeMaxGapWidth { get; init; } = 0.35;

    /// <summary>Minimum internal occupancy contrast to split a merged region.</summary>
    public double SplitMinInternalContrast { get; init; } = 0.15;

    /// <summary>Minimum peak prominence for boundary detection (fraction of signal range).</summary>
    public double BoundaryMinProminence { get; init; } = 0.08;

    /// <summary>Minimum distance between boundaries as fraction of expected tile width.</summary>
    public double BoundaryMinSeparation { get; init; } = 0.25;

    /// <summary>Number of u-samples for the occupancy signal.</summary>
    public int OccupancySamples { get; init; } = 900;
}

/// <summary>Configurable options for ProjectiveTileSequenceFitter.</summary>
public sealed record ProjectiveSequenceOptions
{
    /// <summary>Number of RANSAC iterations.</summary>
    public int RansacIterations { get; init; } = 500;

    /// <summary>Inlier tolerance in u-units.</summary>
    public double InlierUTolerance { get; init; } = 0.015;

    /// <summary>Maximum acceptable mean residual in u-units.</summary>
    public double MaxResidual { get; init; } = 0.025;

    /// <summary>Minimum fraction of instances that must be inliers.</summary>
    public double MinInlierFraction { get; init; } = 0.60;

    /// <summary>Minimum number of instances required to attempt a fit.</summary>
    public int MinInstanceCount { get; init; } = 3;
}

/// <summary>Configurable options for SideHandTemporalTracker.</summary>
public sealed record TemporalTrackerOptions
{
    /// <summary>Duration a single instance must be absent before confirming removal.</summary>
    public TimeSpan MissingConfirmDuration { get; init; } = TimeSpan.FromMilliseconds(400);

    /// <summary>Minimum number of instances simultaneously lost to classify as occlusion.</summary>
    public int OcclusionMinConcurrentLoss { get; init; } = 3;

    /// <summary>Confidence below which geometry is considered failed.</summary>
    public double LowConfidenceThreshold { get; init; } = 0.40;

    /// <summary>Minimum time between stable geometry updates.</summary>
    public TimeSpan MaxStableAge { get; init; } = TimeSpan.FromSeconds(2);

    /// <summary>Maximum u-offset for matching an instance to a tracked ordinal.</summary>
    public double OrdinalMatchTolerance { get; init; } = 0.03;

    /// <summary>Fraction of projected tile width for gap classification as normal adjacency.</summary>
    public double NormalGapMaxWidth { get; init; } = 0.45;

    /// <summary>Fraction of projected tile width for gap classification as missing one tile.
    /// Gaps between NormalGapMaxWidth and MissingGapMinWidth are ambiguous.</summary>
    public double MissingGapMinWidth { get; init; } = 0.80;

    /// <summary>Fraction of projected tile width for gap classification as terminal extra.
    /// Gaps between MissingGapMinWidth and TerminalExtraMinWidth are the extra separation.</summary>
    public double TerminalExtraMinWidth { get; init; } = 0.55;
}
