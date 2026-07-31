using OpenCvSharp;

namespace MahjongSoulOverlay.Vision.River;

/// <summary>
/// The classification result for a single river cell observation.
/// </summary>
public enum RiverCellState
{
    /// <summary>The cell appears empty (table felt visible).</summary>
    Empty,

    /// <summary>The cell contains a normally-oriented tile.</summary>
    NormalTile,

    /// <summary>The cell contains a tile rotated sideways (riichi declaration).</summary>
    RiichiRotatedTile,

    /// <summary>The cell is occluded (e.g. hand or arm passing over).</summary>
    Occluded,

    /// <summary>Insufficient evidence; classification is uncertain.</summary>
    Unknown
}

/// <summary>
/// Classifies each of the 18 river cells as Empty, NormalTile,
/// RiichiRotatedTile, Occluded, or Unknown using simple threshold-based
/// feature analysis on a canonical cell patch.
/// </summary>
internal static class RiverSlotClassifier
{
    /// <summary>
    /// Normalised background MAE below which a cell is probably empty.
    /// </summary>
    public const double DefaultBackgroundDiffLow = 0.08;

    /// <summary>
    /// Normalised background MAE above which a cell is probably occupied.
    /// </summary>
    public const double DefaultBackgroundDiffHigh = 0.20;

    /// <summary>
    /// Minimum Canny edge-to-pixel ratio in the central region for a cell
    /// to be considered occupied.
    /// </summary>
    public const double DefaultEdgeDensityThreshold = 0.04;

    /// <summary>
    /// Normalised mean brightness below which a cell is considered empty
    /// (dark green table felt).
    /// </summary>
    public const double DefaultBrightnessEmpty = 0.30;

    /// <summary>
    /// Normalised mean brightness above which a cell is considered
    /// to contain a tile face (bright white/ivory).
    /// </summary>
    public const double DefaultBrightnessTile = 0.50;

    /// <summary>
    /// Motion level above which a cell is considered occluded.
    /// </summary>
    public const double DefaultMotionThreshold = 0.15;

    /// <summary>
    /// Ratio of horizontal to vertical edges that indicates a
    /// riichi-rotated tile.
    /// </summary>
    public const double DefaultRiichiEdgeRatio = 1.5;

    /// <summary>
    /// Per-frame observation for a single river cell, returned by
    /// <see cref="Classify"/>.
    /// </summary>
    public sealed record RiverCellObservation(
        RiverCellState State,
        double Confidence,
        double BackgroundDifference,
        double EdgeDensity,
        double Brightness);

    /// <summary>
    /// Classify a single canonical cell patch.
    /// </summary>
    /// <param name="cellPatch">
    /// A single-channel (grayscale) patch of size
    /// <see cref="RiverRectifier.CellPatchWidth"/> x
    /// <see cref="RiverRectifier.CellPatchHeight"/> pixels.
    /// </param>
    /// <param name="backgroundDifference">
    /// Normalised MAE [0,1] from <see cref="RiverBackgroundModel"/>.
    /// </param>
    /// <param name="motionLevel">Per-cell motion level [0,1] from
    /// <see cref="Motion.StabilityGate"/>.</param>
    /// <param name="tableBrightness">
    /// Median normalised brightness of an empty table-felt reference.
    /// Cells darker than this plus a margin are likely empty.
    /// </param>
    /// <param name="backgroundDiffLow">
    /// Threshold below which background diff suggests empty.
    /// </param>
    /// <param name="backgroundDiffHigh">
    /// Threshold above which background diff suggests occupied.
    /// </param>
    /// <param name="edgeDensityThreshold">
    /// Minimum central-region Canny edge density for an occupied cell.
    /// </param>
    /// <param name="brightnessEmpty">
    /// Normalised brightness ceiling for an empty cell.
    /// </param>
    /// <param name="brightnessTile">
    /// Normalised brightness floor for a tile.
    /// </param>
    /// <param name="motionThreshold">
    /// Motion level above which the cell is considered occluded.
    /// </param>
    /// <param name="riichiEdgeRatio">
    /// If horizontal_edges / vertical_edges exceeds this ratio the
    /// tile is classified as riichi-rotated.
    /// </param>
    /// <returns>A classification observation.</returns>
    public static RiverCellObservation Classify(
        Mat cellPatch,
        double backgroundDifference,
        double motionLevel,
        double tableBrightness,
        double backgroundDiffLow = DefaultBackgroundDiffLow,
        double backgroundDiffHigh = DefaultBackgroundDiffHigh,
        double edgeDensityThreshold = DefaultEdgeDensityThreshold,
        double brightnessEmpty = DefaultBrightnessEmpty,
        double brightnessTile = DefaultBrightnessTile,
        double motionThreshold = DefaultMotionThreshold,
        double riichiEdgeRatio = DefaultRiichiEdgeRatio)
    {
        ArgumentNullException.ThrowIfNull(cellPatch);
        if (cellPatch.Empty())
            throw new ArgumentException("Cell patch must not be empty.", nameof(cellPatch));

        double brightness = Mean(cellPatch) / 255d;
        double edgeDensity = CentralEdgeDensity(cellPatch);
        (double horizontalRatio, double verticalRatio) = EdgeOrientationRatio(cellPatch);

        RiverCellState state;
        double confidence;

        bool hasBackground = backgroundDifference is >= 0d and < 0.9d
            && Math.Abs(backgroundDifference - 0.5) > 0.01;

        if (motionLevel > motionThreshold)
        {
            state = RiverCellState.Occluded;
            confidence = Math.Clamp((motionLevel - motionThreshold) / (1d - motionThreshold), 0d, 1d);
        }
        else if (hasBackground &&
                 backgroundDifference < backgroundDiffLow &&
                 brightness < brightnessEmpty)
        {
            state = RiverCellState.Empty;
            confidence = Math.Clamp(
                1d - backgroundDifference / backgroundDiffLow, 0d, 1d);
        }
        else if (hasBackground && backgroundDifference > backgroundDiffHigh)
        {
            if (horizontalRatio > verticalRatio * riichiEdgeRatio)
                state = RiverCellState.RiichiRotatedTile;
            else
                state = RiverCellState.NormalTile;

            double bgConf = Math.Clamp(
                (backgroundDifference - backgroundDiffHigh) / (1d - backgroundDiffHigh), 0d, 1d);
            double edgeConf = Math.Clamp(
                edgeDensity / (edgeDensityThreshold * 2d), 0d, 1d);
            double brightConf = brightness >= brightnessTile
                ? 1d
                : Math.Clamp(brightness / brightnessTile, 0d, 1d);
            confidence = (bgConf * 0.4d) + (edgeConf * 0.35d) + (brightConf * 0.25d);
        }
        // No-background fallback: rely on edge density + brightness.
        else if (!hasBackground && edgeDensity > edgeDensityThreshold * 0.6
                 && brightness > brightnessEmpty)
        {
            if (horizontalRatio > verticalRatio * riichiEdgeRatio)
                state = RiverCellState.RiichiRotatedTile;
            else
                state = RiverCellState.NormalTile;

            double edgeConf = Math.Clamp(edgeDensity / (edgeDensityThreshold * 2d), 0d, 1d);
            double brightConf = brightness >= brightnessTile ? 1d
                : Math.Clamp(brightness / brightnessTile, 0d, 1d);
            confidence = (edgeConf * 0.55d) + (brightConf * 0.45d);
        }
        else if (!hasBackground && edgeDensity < edgeDensityThreshold * 0.3
                 && brightness < brightnessEmpty)
        {
            state = RiverCellState.Empty;
            confidence = Math.Clamp(1d - brightness / brightnessEmpty, 0d, 1d);
        }
        else
        {
            state = RiverCellState.Unknown;
            confidence = hasBackground
                ? Math.Clamp((backgroundDiffHigh - backgroundDifference) / backgroundDiffHigh, 0d, 1d)
                : 0.5;
        }

        return new RiverCellObservation(
            state, Math.Clamp(confidence, 0d, 1d),
            backgroundDifference, edgeDensity, brightness);
    }

    /// <summary>
    /// Classify all 18 river cells at once.
    /// </summary>
    /// <param name="cellPatches">Exactly 18 canonical cell patches.</param>
    /// <param name="backgroundDifferences">Exactly 18 normalised MAE values.</param>
    /// <param name="motionLevels">Exactly 18 normalised motion levels.</param>
    /// <param name="tableBrightness">Median normalised table-felt brightness.</param>
    /// <returns>18 cell observations in discard order.</returns>
    public static IReadOnlyList<RiverCellObservation> ClassifyAll(
        IReadOnlyList<Mat> cellPatches,
        IReadOnlyList<double> backgroundDifferences,
        IReadOnlyList<double> motionLevels,
        double tableBrightness)
    {
        ArgumentNullException.ThrowIfNull(cellPatches);
        ArgumentNullException.ThrowIfNull(backgroundDifferences);
        ArgumentNullException.ThrowIfNull(motionLevels);

        if (cellPatches.Count != RiverSlotLayout.CellCount)
            throw new ArgumentException(
                $"Expected {RiverSlotLayout.CellCount} cell patches, got {cellPatches.Count}.",
                nameof(cellPatches));
        if (backgroundDifferences.Count != RiverSlotLayout.CellCount)
            throw new ArgumentException(
                $"Expected {RiverSlotLayout.CellCount} background diffs, got {backgroundDifferences.Count}.",
                nameof(backgroundDifferences));
        if (motionLevels.Count != RiverSlotLayout.CellCount)
            throw new ArgumentException(
                $"Expected {RiverSlotLayout.CellCount} motion levels, got {motionLevels.Count}.",
                nameof(motionLevels));

        RiverCellObservation[] observations = new RiverCellObservation[RiverSlotLayout.CellCount];
        for (int i = 0; i < RiverSlotLayout.CellCount; i++)
        {
            observations[i] = Classify(
                cellPatches[i],
                backgroundDifferences[i],
                motionLevels[i],
                tableBrightness);
        }

        return observations;
    }

    /// <summary>
    /// Compute the mean pixel value of a single-channel Mat.
    /// </summary>
    private static double Mean(Mat mat)
    {
        Scalar mean = Cv2.Mean(mat);
        return mean.Val0;
    }

    /// <summary>
    /// Compute Canny edge density in the central 60-70% region of the
    /// patch to avoid tile edges and sides.
    /// </summary>
    private static double CentralEdgeDensity(Mat cellPatch)
    {
        using Mat blurred = new();
        Cv2.GaussianBlur(cellPatch, blurred, new Size(3, 3), 0);

        using Mat edges = new();
        Cv2.Canny(blurred, edges, 40, 120);

        // Use central 60-70% region (avoid border artefacts near tile sides).
        int marginX = edges.Cols / 6;
        int marginY = edges.Rows / 6;
        Rect centralRect = new(
            marginX,
            marginY,
            edges.Cols - 2 * marginX,
            edges.Rows - 2 * marginY);

        using Mat central = new Mat(edges, centralRect);
        double nonZero = Cv2.CountNonZero(central);
        double area = centralRect.Width * centralRect.Height;

        return area > 0d ? nonZero / area : 0d;
    }

    /// <summary>
    /// Compute the ratio of horizontal to vertical edge response using
    /// Sobel operators on the central region of the patch. Riichi-rotated
    /// tiles exhibit dominant horizontal edges (long side of tile runs
    /// horizontally in the cell), while normal tiles have dominant
    /// vertical edges.
    /// </summary>
    private static (double HorizontalRatio, double VerticalRatio) EdgeOrientationRatio(
        Mat cellPatch)
    {
        int marginX = cellPatch.Cols / 6;
        int marginY = cellPatch.Rows / 6;
        Rect centralRect = new(
            marginX,
            marginY,
            cellPatch.Cols - 2 * marginX,
            cellPatch.Rows - 2 * marginY);

        using Mat central = new Mat(cellPatch, centralRect);

        using Mat gradX = new();
        using Mat gradY = new();
        // Sobel with ksize=3 for a good trade-off between noise sensitivity
        // and directional selectivity.
        Cv2.Sobel(central, gradX, MatType.CV_64F, 1, 0, 3);
        Cv2.Sobel(central, gradY, MatType.CV_64F, 0, 1, 3);

        // Convert to absolute values and sum.
        using Mat absGradX = new();
        using Mat absGradY = new();
        Cv2.ConvertScaleAbs(gradX, absGradX);
        Cv2.ConvertScaleAbs(gradY, absGradY);

        Scalar sumX = Cv2.Sum(absGradX);
        Scalar sumY = Cv2.Sum(absGradY);

        double totalX = sumX.Val0;
        double totalY = sumY.Val0;
        double sum = totalX + totalY;

        if (sum <= 0d)
            return (0d, 0d);

        return (totalX / sum, totalY / sum);
    }
}
