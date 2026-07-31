using OpenCvSharp;

namespace MahjongSoulOverlay.Vision.Hand;

/// <summary>
/// Result produced by <see cref="HandLatticeEstimator.Estimate"/> that
/// describes the 1-D arrangement of tiles within a rectified hand strip.
/// </summary>
internal sealed class HandLatticeEstimate
{
    /// <summary>
    /// Initializes a new instance of <see cref="HandLatticeEstimate"/>.
    /// </summary>
    /// <param name="mainTileCount">Number of tiles identified in the main hand.</param>
    /// <param name="drawPresent">Whether a drawn tile was detected.</param>
    /// <param name="pitch">Median pixel distance between consecutive tile centres.</param>
    /// <param name="mainTileCenters">X-positions (in strip pixels) of the main-hand tile centres.</param>
    /// <param name="drawTileCenter">X-position of the drawn tile centre, or <c>null</c>.</param>
    /// <param name="confidence">Confidence score in [0, 1].</param>
    /// <param name="mainHandEndX">
    /// The X-coordinate in the strip where the main hand ends
    /// (just past the last main tile).
    /// </param>
    /// <param name="drawGapStartX">
    /// The X-coordinate in the strip where the draw gap begins
    /// (same as <paramref name="mainHandEndX"/> when a draw is present).
    /// </param>
    public HandLatticeEstimate(
        int mainTileCount,
        bool drawPresent,
        double pitch,
        IReadOnlyList<double> mainTileCenters,
        double? drawTileCenter,
        double confidence,
        double mainHandEndX,
        double drawGapStartX)
    {
        if (mainTileCount < 0)
            throw new ArgumentOutOfRangeException(nameof(mainTileCount));
        ArgumentNullException.ThrowIfNull(mainTileCenters);
        if (!double.IsFinite(pitch) || pitch <= 0d)
            throw new ArgumentOutOfRangeException(
                nameof(pitch), pitch, "Pitch must be finite and positive.");
        if (confidence is < 0d or > 1d)
            throw new ArgumentOutOfRangeException(
                nameof(confidence), confidence, "Confidence must be in [0, 1].");

        MainTileCount = mainTileCount;
        DrawPresent = drawPresent;
        Pitch = pitch;
        MainTileCenters = mainTileCenters;
        DrawTileCenter = drawTileCenter;
        Confidence = confidence;
        MainHandEndX = mainHandEndX;
        DrawGapStartX = drawGapStartX;
    }

    /// <summary>Number of tiles identified in the main hand.</summary>
    public int MainTileCount { get; }

    /// <summary>Whether a drawn tile was detected.</summary>
    public bool DrawPresent { get; }

    /// <summary>Median pixel distance between consecutive tile centres.</summary>
    public double Pitch { get; }

    /// <summary>
    /// X-positions (in strip pixels, 0..900) of the main-hand tile centres,
    /// ordered left-to-right.
    /// </summary>
    public IReadOnlyList<double> MainTileCenters { get; }

    /// <summary>X-position of the drawn tile centre, or <c>null</c> if not present.</summary>
    public double? DrawTileCenter { get; }

    /// <summary>Confidence score in [0, 1].</summary>
    public double Confidence { get; }

    /// <summary>
    /// The X-coordinate in the strip where the main hand ends
    /// (roughly <c>lastMainCenter + 0.5 * Pitch</c>).
    /// </summary>
    public double MainHandEndX { get; }

    /// <summary>
    /// The X-coordinate in the strip where the draw gap begins.
    /// Equal to <see cref="MainHandEndX"/> when a draw is present,
    /// otherwise the full strip width.
    /// </summary>
    public double DrawGapStartX { get; }
}

/// <summary>
/// Fits a 1-D tile lattice to a rectified hand strip to determine how many
/// main-hand tiles exist and where they are located.
/// </summary>
internal static class HandLatticeEstimator
{
    private const double DrawGapMultiplier = 1.5; // gap > multiplier * median -> draw separation

    /// <summary>
    /// Analyses <paramref name="handStrip"/> and returns a lattice estimate.
    /// </summary>
    /// <param name="handStrip">
    /// A single-channel (grayscale) <see cref="Mat"/> of the rectified hand.
    /// </param>
    /// <returns>
    /// A <see cref="HandLatticeEstimate"/> describing tile positions and
    /// whether a drawn tile is present.
    /// </returns>
    public static HandLatticeEstimate Estimate(Mat handStrip)
    {
        ArgumentNullException.ThrowIfNull(handStrip);
        if (handStrip.Empty())
            throw new ArgumentException(
                "Hand strip must not be empty.", nameof(handStrip));

        int width = handStrip.Width;
        if (width < 10)
            throw new ArgumentException(
                "Hand strip is too narrow.", nameof(handStrip));

        int hStrip = handStrip.Height;

        // 1. Compute mean intensity per column.
        double[] meanIntensity = new double[width];
        for (int x = 0; x < width; x++)
        {
            double sum = 0;
            for (int y = 0; y < hStrip; y++)
                sum += handStrip.At<byte>(y, x);
            meanIntensity[x] = sum / hStrip;
        }

        // 2. Estimate background intensity from the margins.  The leftmost
        //    and rightmost 10 % of the strip should be empty table (outside
        //    the hand).
        int margin = Math.Max(width / 10, 5);
        double bgIntensity = meanIntensity.Take(margin)
            .Concat(meanIntensity.Skip(width - margin))
            .Average();

        // 3. Foreground detection: a column is "foreground" when its mean
        //    deviates from the estimated background by more than a threshold.
        //    This works for both bright-on-dark (test images) and
        //    dark-on-bright (real opponent hands) tiles.
        double maxDeviation = meanIntensity.Max(
            v => Math.Abs(v - bgIntensity));
        if (maxDeviation < 5.0) maxDeviation = 5.0;

        // Threshold: 20 % of the maximum deviation from background.
        double devThreshold = maxDeviation * 0.20;
        if (devThreshold < 8.0) devThreshold = 8.0;

        bool[] isForeground = new bool[width];
        for (int x = 0; x < width; x++)
            isForeground[x] = Math.Abs(meanIntensity[x] - bgIntensity) >= devThreshold;

        // 4. Group contiguous foreground columns into runs.
        List<(int Start, int End)> runs = FindRuns(isForeground);

        // 5. Filter runs that are too short (noise).
        double expectedTileWidth = width / 13.0; // ~69 px at 900 width
        double minRunLength = expectedTileWidth * 0.25; // ~17 px
        runs = runs.Where(r => r.End - r.Start + 1 >= minRunLength).ToList();

        // 5b. Estimate tile count from total foreground width when runs are
        //     merged (dense hand).  Split wide runs proportionally.
        runs = SplitWideRuns(runs, expectedTileWidth);

        if (runs.Count == 0)
        {
            return new HandLatticeEstimate(
                mainTileCount: 0,
                drawPresent: false,
                pitch: expectedTileWidth,
                mainTileCenters: Array.Empty<double>(),
                drawTileCenter: null,
                confidence: 0.0,
                mainHandEndX: width,
                drawGapStartX: width);
        }

        // 6. Each run's centre = tile centre.
        List<double> allCenters = runs
            .Select(r => (r.Start + r.End) / 2.0)
            .ToList();

        double pitch = allCenters.Count >= 2
            ? Median(Gaps(allCenters))
            : expectedTileWidth;

        // 7. Find the draw gap (largest gap > 1.5x median).
        List<double> gaps = Gaps(allCenters);
        double medianGap = Median(gaps);
        int drawSplitIndex = -1;
        double maxGap = 0.0;
        for (int i = 0; i < gaps.Count; i++)
        {
            if (gaps[i] > maxGap)
            {
                maxGap = gaps[i];
                drawSplitIndex = i;
            }
        }

        bool drawPresent = false;
        List<double> mainCenters = [];
        double? drawCenter = null;

        if (maxGap > medianGap * DrawGapMultiplier && drawSplitIndex >= 0)
        {
            drawPresent = true;
            for (int i = 0; i <= drawSplitIndex; i++)
                mainCenters.Add(allCenters[i]);
            if (drawSplitIndex + 1 < allCenters.Count)
                drawCenter = allCenters[drawSplitIndex + 1];
        }
        else
        {
            mainCenters = allCenters;
        }

        // 8. Confidence from gap regularity.
        double confidence = ComputeConfidence(
            gaps, drawSplitIndex, medianGap);

        double mainHandEndX = mainCenters.Count > 0
            ? mainCenters[^1] + pitch * 0.5
            : width;
        double drawGapStartX = mainHandEndX;

        return new HandLatticeEstimate(
            mainTileCount: mainCenters.Count,
            drawPresent: drawPresent,
            pitch: pitch,
            mainTileCenters: mainCenters.AsReadOnly(),
            drawTileCenter: drawCenter,
            confidence: Math.Clamp(confidence, 0.0, 1.0),
            mainHandEndX: mainHandEndX,
            drawGapStartX: drawGapStartX);
    }

    /// <summary>
    /// Splits foreground runs that are wider than ~1.4× the expected tile
    /// width into roughly equal segments, using the expected tile count for
    /// the run.  This handles densely packed hands (like the viewer's 13-tile
    /// hand) where tiles touch and the foreground detector sees one blob.
    /// </summary>
    private static List<(int Start, int End)> SplitWideRuns(
        List<(int Start, int End)> runs, double expectedTileWidth)
    {
        double mergeThreshold = expectedTileWidth * 1.4;
        List<(int, int)> result = [];

        foreach ((int start, int end) in runs)
        {
            int runWidth = end - start + 1;
            if (runWidth < mergeThreshold)
            {
                result.Add((start, end));
                continue;
            }

            // Estimate how many tiles are in this run.
            int estimatedTiles = Math.Max(2, (int)Math.Round(runWidth / expectedTileWidth));
            double tileWidth = (double)runWidth / estimatedTiles;

            for (int t = 0; t < estimatedTiles; t++)
            {
                int tStart = start + (int)Math.Round(t * tileWidth);
                int tEnd = start + (int)Math.Round((t + 1) * tileWidth) - 1;
                if (tEnd > end) tEnd = end;
                if (tStart > tEnd) continue;
                if (tEnd - tStart + 1 >= expectedTileWidth * 0.25)
                    result.Add((tStart, tEnd));
            }
        }

        return result;
    }

    private static List<(int Start, int End)> FindRuns(bool[] occupied)
    {
        List<(int, int)> runs = [];
        int start = -1;
        for (int i = 0; i < occupied.Length; i++)
        {
            if (occupied[i] && start < 0)
                start = i;
            if (!occupied[i] && start >= 0)
            {
                runs.Add((start, i - 1));
                start = -1;
            }
        }
        if (start >= 0)
            runs.Add((start, occupied.Length - 1));
        return runs;
    }

    private static List<double> Gaps(List<double> positions)
    {
        List<double> gaps = new(positions.Count - 1);
        for (int i = 1; i < positions.Count; i++)
            gaps.Add(positions[i] - positions[i - 1]);
        return gaps;
    }

    private static double Median(List<double> values)
    {
        if (values.Count == 0)
            return 0.0;

        List<double> sorted = [.. values.OrderBy(v => v)];
        int mid = sorted.Count / 2;
        return sorted.Count % 2 == 1
            ? sorted[mid]
            : (sorted[mid - 1] + sorted[mid]) * 0.5;
    }

    private static double ComputeConfidence(
        List<double> gaps, int drawSplitIndex, double medianGap)
    {
        if (gaps.Count == 0)
            return 0.0;

        // Exclude the draw gap when it is an outlier.
        List<double> regularGaps = [];
        for (int i = 0; i < gaps.Count; i++)
        {
            if (i == drawSplitIndex && gaps[i] > medianGap * DrawGapMultiplier)
                continue;
            regularGaps.Add(gaps[i]);
        }

        if (regularGaps.Count == 0)
            return 0.0;

        double meanGap = regularGaps.Average();
        if (meanGap <= 0.0)
            return 0.0;

        double variance = regularGaps.Average(g =>
            (g - meanGap) * (g - meanGap));
        double stdDev = Math.Sqrt(variance);

        return 1.0 - stdDev / meanGap;
    }
}
