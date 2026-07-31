using OpenCvSharp;

namespace MahjongSoulOverlay.Vision.River;

/// <summary>
/// Maintains per-cell background references for the 3x6 river grid.
/// Background subtraction detects when a tile enters a cell that was
/// previously empty.
/// </summary>
internal sealed class RiverBackgroundModel : IDisposable
{
    private readonly Mat[] _backgrounds;
    private double _emaAlpha;
    private bool _disposed;

    /// <summary>
    /// Creates a new background model that can store one reference
    /// patch per river cell (18 cells).
    /// </summary>
    /// <param name="emaAlpha">
    /// Exponential moving average coefficient for slow background updates.
    /// Must be in [0, 1]. Default is 0.01.
    /// </param>
    public RiverBackgroundModel(double emaAlpha = 0.01)
    {
        if (!double.IsFinite(emaAlpha) || emaAlpha is < 0d or > 1d)
            throw new ArgumentOutOfRangeException(
                nameof(emaAlpha), emaAlpha, "EMA alpha must be within [0, 1].");

        _backgrounds = new Mat[RiverSlotLayout.CellCount];
        _emaAlpha = emaAlpha;
    }

    /// <summary>
    /// Returns true when background references have been captured
    /// for all cells.
    /// </summary>
    public bool IsCaptured
    {
        get
        {
            if (_disposed)
                return false;
            for (int i = 0; i < _backgrounds.Length; i++)
            {
                Mat? bg = _backgrounds[i];
                if (bg is null || bg.Empty())
                    return false;
            }
            return true;
        }
    }

    /// <summary>
    /// Capture a baseline background patch for every river cell.
    /// Each patch should be a grayscale or single-channel image as
    /// produced by <see cref="RiverRectifier.WarpCell"/>.
    /// </summary>
    /// <param name="cellPatches">
    /// Exactly 18 warped cell patches in discard order.
    /// </param>
    public void Capture(IReadOnlyList<Mat> cellPatches)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        ArgumentNullException.ThrowIfNull(cellPatches);

        if (cellPatches.Count != RiverSlotLayout.CellCount)
            throw new ArgumentException(
                $"Expected {RiverSlotLayout.CellCount} cell patches, got {cellPatches.Count}.",
                nameof(cellPatches));

        for (int i = 0; i < RiverSlotLayout.CellCount; i++)
        {
            Mat? old = _backgrounds[i];
            Mat patch = cellPatches[i] ?? throw new ArgumentException(
                $"Cell patch at index {i} is null.", nameof(cellPatches));

            _backgrounds[i] = patch.Clone();
            old?.Dispose();
        }
    }

    /// <summary>
    /// Compute the normalised Mean Absolute Error between the stored
    /// background and the current patch for a single cell.
    /// </summary>
    /// <param name="cellIndex">0-based cell index (0-17).</param>
    /// <param name="currentPatch">The current warped cell patch.</param>
    /// <returns>Normalised MAE in [0, 1]. Returns 1 when no background
    /// is available.</returns>
    public double Difference(int cellIndex, Mat currentPatch)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        ArgumentNullException.ThrowIfNull(currentPatch);

        if (cellIndex < 0 || cellIndex >= RiverSlotLayout.CellCount)
            throw new ArgumentOutOfRangeException(
                nameof(cellIndex), cellIndex,
                $"Cell index must be within [0, {RiverSlotLayout.CellCount - 1}].");

        Mat? background = _backgrounds[cellIndex];
        if (background is null || background.Empty())
            return 1d;

        using Mat diff = new();
        Cv2.Absdiff(background, currentPatch, diff);

        Scalar mean = Cv2.Mean(diff);
        // Pixel values are in [0,255]; divide by 255 for [0,1].
        return Math.Clamp(mean.Val0 / 255d, 0d, 1d);
    }

    /// <summary>
    /// Compute the normalised MAE between every stored background and
    /// the corresponding current patch.
    /// </summary>
    /// <param name="cellPatches">Exactly 18 current cell patches.</param>
    /// <returns>18 normalised MAE values in [0, 1].</returns>
    public IReadOnlyList<double> Differences(IReadOnlyList<Mat> cellPatches)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        ArgumentNullException.ThrowIfNull(cellPatches);

        if (cellPatches.Count != RiverSlotLayout.CellCount)
            throw new ArgumentException(
                $"Expected {RiverSlotLayout.CellCount} cell patches, got {cellPatches.Count}.",
                nameof(cellPatches));

        double[] diffs = new double[RiverSlotLayout.CellCount];
        for (int i = 0; i < RiverSlotLayout.CellCount; i++)
            diffs[i] = Difference(i, cellPatches[i]);

        return diffs;
    }

    /// <summary>
    /// Slowly update each background cell using an exponential moving
    /// average: bg = (1 - alpha) * bg + alpha * current.
    /// Only cells whose current patch differs from the background by
    /// less than <paramref name="updateThreshold"/> are updated, to
    /// avoid blending tile pixels into the empty background.
    /// </summary>
    /// <param name="cellPatches">Exactly 18 current cell patches.</param>
    /// <param name="updateThreshold">
    /// Maximum MAE at which a cell is considered still empty and safe
    /// to update. Default is 0.08.
    /// </param>
    public void Update(
        IReadOnlyList<Mat> cellPatches, double updateThreshold = 0.08)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        ArgumentNullException.ThrowIfNull(cellPatches);

        if (cellPatches.Count != RiverSlotLayout.CellCount)
            throw new ArgumentException(
                $"Expected {RiverSlotLayout.CellCount} cell patches, got {cellPatches.Count}.",
                nameof(cellPatches));

        double alpha = _emaAlpha;
        if (alpha <= 0d)
            return;

        for (int i = 0; i < RiverSlotLayout.CellCount; i++)
        {
            Mat? bg = _backgrounds[i];
            if (bg is null || bg.Empty())
                continue;

            Mat current = cellPatches[i];
            double diff = Difference(i, current);
            if (diff > updateThreshold)
                continue;

            // bg = (1 - alpha) * bg + alpha * current
            using Mat scaledBg = bg * (1d - alpha);
            using Mat scaledCurrent = current * alpha;
            using Mat updated = new();
            Cv2.Add(scaledBg, scaledCurrent, updated);

            Mat? old = _backgrounds[i];
            _backgrounds[i] = updated.Clone();
            old?.Dispose();
        }
    }

    /// <summary>
    /// Clear all stored background references.
    /// </summary>
    public void Reset()
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        for (int i = 0; i < _backgrounds.Length; i++)
        {
            Mat? bg = Interlocked.Exchange(ref _backgrounds[i], null!);
            bg?.Dispose();
        }
    }

    /// <inheritdoc />
    public void Dispose()
    {
        if (_disposed)
            return;

        _disposed = true;
        for (int i = 0; i < _backgrounds.Length; i++)
        {
            Mat? bg = Interlocked.Exchange(ref _backgrounds[i], null!);
            bg?.Dispose();
        }
    }
}
