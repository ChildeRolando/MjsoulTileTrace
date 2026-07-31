using MahjongSoulOverlay.Vision.River;
using OpenCvSharp;

namespace MahjongSoulOverlay.Vision.Motion;

/// <summary>
/// Detects per-ROI and per-cell motion via frame differencing, and
/// gates structural observation updates with a temporal stability
/// requirement. During animations (discard, call), structural
/// observations are suppressed and the previous stable state is kept.
/// </summary>
internal sealed class StabilityGate : IDisposable
{
    private readonly Dictionary<string, StabilityCounter> _stateCounters;
    private readonly Dictionary<int, CellStability> _cellStability;

    private Mat? _previousRoi;
    private Mat?[] _previousCells;
    private bool _disposed;

    /// <summary>
    /// Default motion threshold: a normalised mean absolute frame
    /// difference above which the ROI is considered animating.
    /// </summary>
    public const double DefaultMotionThreshold = 0.03;

    /// <summary>
    /// Default number of consecutive stable frames required before a
    /// state transition is accepted.
    /// </summary>
    public const int DefaultRequiredStableFrames = 3;

    public StabilityGate()
    {
        _stateCounters = new Dictionary<string, StabilityCounter>();
        _cellStability = new Dictionary<int, CellStability>();
        _previousCells = new Mat?[RiverSlotLayout.CellCount];
    }

    /// <summary>
    /// Returns true when the mean absolute frame difference between
    /// <paramref name="currentRoi"/> and the previously stored ROI
    /// exceeds <paramref name="threshold"/>.
    /// </summary>
    /// <param name="currentRoi">Current ROI patch.</param>
    /// <param name="previousRoi">Previously stored ROI patch (overrides
    /// the internally stored one if provided).</param>
    /// <param name="threshold">
    /// Normalised MAE threshold. Default is 0.03.
    /// </param>
    public bool IsAnimating(
        Mat currentRoi, Mat? previousRoi = null, double threshold = DefaultMotionThreshold)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        ArgumentNullException.ThrowIfNull(currentRoi);

        Mat? reference = previousRoi ?? _previousRoi;
        if (reference is null || reference.Empty()
            || reference.Size() != currentRoi.Size()
            || reference.Type() != currentRoi.Type())
        {
            return false;
        }

        double difference = MeanAbsoluteDifference(currentRoi, reference);
        return difference > threshold;
    }

    /// <summary>
    /// Returns per-cell animation flags for all 18 river cells.
    /// </summary>
    /// <param name="currentCells">18 current cell patches.</param>
    /// <param name="previousCells">18 previous cell patches (overrides
    /// internally stored ones if provided).</param>
    /// <param name="threshold">Normalised MAE threshold.</param>
    public IReadOnlyList<bool> AreAnimating(
        IReadOnlyList<Mat> currentCells,
        IReadOnlyList<Mat>? previousCells = null,
        double threshold = DefaultMotionThreshold)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        ArgumentNullException.ThrowIfNull(currentCells);

        if (currentCells.Count != RiverSlotLayout.CellCount)
            throw new ArgumentException(
                $"Expected {RiverSlotLayout.CellCount} cells, got {currentCells.Count}.",
                nameof(currentCells));

        bool[] results = new bool[RiverSlotLayout.CellCount];
        for (int i = 0; i < RiverSlotLayout.CellCount; i++)
        {
            Mat? reference = previousCells?[i] ?? _previousCells[i];
            if (reference is null || reference.Empty()
                || reference.Size() != currentCells[i].Size()
                || reference.Type() != currentCells[i].Type())
            {
                results[i] = false;
                continue;
            }

            double diff = MeanAbsoluteDifference(currentCells[i], reference);
            results[i] = diff > threshold;
        }

        return results;
    }

    /// <summary>
    /// Returns per-cell normalised motion levels (0-1) for all 18
    /// river cells. These values are passed directly to
    /// <see cref="RiverSlotClassifier"/>.
    /// </summary>
    /// <param name="currentCells">18 current cell patches.</param>
    /// <param name="previousCells">18 previous cell patches (overrides
    /// internally stored ones if provided).</param>
    public IReadOnlyList<double> MotionLevels(
        IReadOnlyList<Mat> currentCells,
        IReadOnlyList<Mat>? previousCells = null)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        ArgumentNullException.ThrowIfNull(currentCells);

        if (currentCells.Count != RiverSlotLayout.CellCount)
            throw new ArgumentException(
                $"Expected {RiverSlotLayout.CellCount} cells, got {currentCells.Count}.",
                nameof(currentCells));

        double[] levels = new double[RiverSlotLayout.CellCount];
        for (int i = 0; i < RiverSlotLayout.CellCount; i++)
        {
            Mat? reference = previousCells?[i] ?? _previousCells[i];
            if (reference is null || reference.Empty()
                || reference.Size() != currentCells[i].Size()
                || reference.Type() != currentCells[i].Type())
            {
                levels[i] = 1d;
                continue;
            }

            levels[i] = MeanAbsoluteDifference(currentCells[i], reference);
        }

        return levels;
    }

    /// <summary>
    /// Store an ROI patch as the reference for the next frame's
    /// <see cref="IsAnimating"/> call.
    /// </summary>
    public void StoreFrame(Mat roi)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        ArgumentNullException.ThrowIfNull(roi);

        Mat? old = _previousRoi;
        _previousRoi = roi.Clone();
        old?.Dispose();
    }

    /// <summary>
    /// Store all 18 cell patches as references for the next frame's
    /// per-cell motion checks.
    /// </summary>
    public void StoreCells(IReadOnlyList<Mat> cells)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        ArgumentNullException.ThrowIfNull(cells);

        if (cells.Count != RiverSlotLayout.CellCount)
            throw new ArgumentException(
                $"Expected {RiverSlotLayout.CellCount} cells, got {cells.Count}.",
                nameof(cells));

        for (int i = 0; i < RiverSlotLayout.CellCount; i++)
        {
            Mat? old = _previousCells[i];
            _previousCells[i] = cells[i].Clone();
            old?.Dispose();
        }
    }

    /// <summary>
    /// Update the temporal stability counter for a named state
    /// signature. Returns true when <paramref name="requiredFrames"/>
    /// consecutive frames with the same signature have been observed.
    /// </summary>
    /// <param name="stateSignature">
    /// A string that uniquely identifies the current logical state
    /// (e.g. a hash of hand counts, river counts, etc.).
    /// </param>
    /// <param name="requiredFrames">
    /// Number of consecutive identical signatures required.
    /// </param>
    public bool UpdateStability(
        string stateSignature, int requiredFrames = DefaultRequiredStableFrames)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        ArgumentNullException.ThrowIfNull(stateSignature);

        if (requiredFrames <= 0)
            throw new ArgumentOutOfRangeException(
                nameof(requiredFrames), requiredFrames,
                "Required frame count must be positive.");

        if (!_stateCounters.TryGetValue(stateSignature, out StabilityCounter? counter))
        {
            // New signature — reset all counters and start this one.
            foreach (KeyValuePair<string, StabilityCounter> kv in _stateCounters)
                kv.Value.Dispose();
            _stateCounters.Clear();

            counter = new StabilityCounter(stateSignature, 1);
            _stateCounters[stateSignature] = counter;
            return requiredFrames == 1;
        }

        int count = counter.Increment();
        return count >= requiredFrames;
    }

    /// <summary>
    /// Check whether a specific river cell has been observed in the
    /// same <see cref="RiverCellState"/> for enough consecutive frames.
    /// </summary>
    /// <param name="cellIndex">0-based cell index (0-17).</param>
    /// <param name="state">The current per-frame state of the cell.</param>
    /// <param name="requiredFrames">
    /// Number of consecutive identical states required.
    /// </param>
    public bool IsCellStable(
        int cellIndex,
        RiverCellState state,
        int requiredFrames = DefaultRequiredStableFrames)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);

        if (cellIndex < 0 || cellIndex >= RiverSlotLayout.CellCount)
            throw new ArgumentOutOfRangeException(
                nameof(cellIndex), cellIndex,
                $"Cell index must be within [0, {RiverSlotLayout.CellCount - 1}].");
        if (requiredFrames <= 0)
            throw new ArgumentOutOfRangeException(
                nameof(requiredFrames), requiredFrames,
                "Required frame count must be positive.");

        if (!_cellStability.TryGetValue(cellIndex, out CellStability cell))
        {
            _cellStability[cellIndex] = new CellStability(state, 1);
            return requiredFrames == 1;
        }

        if (cell.State != state)
        {
            _cellStability[cellIndex] = new CellStability(state, 1);
            return requiredFrames == 1;
        }

        int count = cell.Increment();
        _cellStability[cellIndex] = new CellStability(state, count);
        return count >= requiredFrames;
    }

    /// <summary>
    /// Reset all stored references, counters, and stability state.
    /// </summary>
    public void Reset()
    {
        ObjectDisposedException.ThrowIf(_disposed, this);

        Mat? oldRoi = Interlocked.Exchange(ref _previousRoi, null!);
        oldRoi?.Dispose();

        for (int i = 0; i < _previousCells.Length; i++)
        {
            Mat? old = Interlocked.Exchange(ref _previousCells[i], null!);
            old?.Dispose();
        }

        foreach (StabilityCounter counter in _stateCounters.Values)
            counter.Dispose();
        _stateCounters.Clear();

        _cellStability.Clear();
    }

    /// <inheritdoc />
    public void Dispose()
    {
        if (_disposed)
            return;

        _disposed = true;

        Mat? oldRoi = Interlocked.Exchange(ref _previousRoi, null!);
        oldRoi?.Dispose();

        for (int i = 0; i < _previousCells.Length; i++)
        {
            Mat? old = Interlocked.Exchange(ref _previousCells[i], null!);
            old?.Dispose();
        }

        foreach (StabilityCounter counter in _stateCounters.Values)
            counter.Dispose();
        _stateCounters.Clear();

        _cellStability.Clear();
    }

    /// <summary>
    /// Compute the normalised mean absolute difference between two
    /// same-size, same-type matrices.
    /// </summary>
    private static double MeanAbsoluteDifference(Mat a, Mat b)
    {
        using Mat diff = new();
        Cv2.Absdiff(a, b, diff);
        Scalar mean = Cv2.Mean(diff);
        // Pixel values are in [0,255]; divide by 255 for [0,1].
        return Math.Clamp(mean.Val0 / 255d, 0d, 1d);
    }

    /// <summary>
    /// Lightweight mutable counter for state-signature stability tracking.
    /// </summary>
    private sealed class StabilityCounter
    {
        public StabilityCounter(string signature, int count)
        {
            Signature = signature;
            Count = count;
        }

        public string Signature { get; }
        public int Count { get; private set; }

        public int Increment()
        {
            Count++;
            return Count;
        }

        public void Dispose()
        {
            // No unmanaged resources; exists for symmetry.
        }
    }

    /// <summary>
    /// Lightweight per-cell stability tracking value.
    /// </summary>
    /// <param name="State">The cell state being tracked.</param>
    /// <param name="Count">Consecutive frames with this state.</param>
    private readonly record struct CellStability(RiverCellState State, int Count)
    {
        public int Increment() => Count + 1;
    }
}
