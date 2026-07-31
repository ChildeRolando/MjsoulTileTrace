namespace MahjongSoulOverlay.Vision.Hand;

/// <summary>
/// Fits a tile-seam lattice to an edge signal by first estimating pitch
/// via autocorrelation, predicting seam positions, then SNAPPING each
/// predicted position to the nearest actual peak in the edge signal.
/// The lattice provides the search window; the peaks provide the final
/// coordinates.
/// </summary>
public static class HandLatticeFitter
{
    private const double SearchRadiusFraction = 0.20;
    private const double MinSeamGapFraction = 0.55;
    private const int MaxIterations = 2;

    public sealed record LatticeFitResult(
        int TileCount,
        double X0,
        double Pitch,
        double Score,
        IReadOnlyList<int> SnappedSeams);

    /// <summary>
    /// Snaps predicted seam positions to local maxima in the edge signal.
    /// </summary>
    /// <param name="edgeSignal">Lightly-smoothed 1-D edge signal.</param>
    /// <param name="initialPitch">Pitch from autocorrelation.</param>
    /// <param name="tileCount">Expected tile count (13 for initial frame).</param>
    public static LatticeFitResult? Fit(
        double[] edgeSignal,
        double initialPitch,
        int tileCount = 13)
    {
        if (edgeSignal.Length < 50 || initialPitch < 5 || tileCount < 2)
            return null;

        int n = edgeSignal.Length;
        int seamCount = tileCount - 1;

        // ── 1. Estimate coarse x0 from the strongest edge in the left quarter ──
        int leftQuarter = Math.Min(n / 4, (int)(initialPitch * 2));
        int bestEdge = 0;
        double bestVal = 0;
        for (int x = 5; x < leftQuarter; x++)
        {
            if (edgeSignal[x] > edgeSignal[x - 1] &&
                edgeSignal[x] >= edgeSignal[x + 1] &&
                edgeSignal[x] > bestVal)
            {
                bestVal = edgeSignal[x];
                bestEdge = x;
            }
        }
        double pitch = initialPitch;
        double x0 = bestEdge > 0 ? bestEdge - pitch : pitch * 0.5;

        // ── 2. Iterate: snap → refine pitch → snap again ───────────────
        List<int> snapped = [];
        for (int iter = 0; iter < MaxIterations; iter++)
        {
            snapped = SnapAll(edgeSignal, x0, pitch, seamCount, n);
            if (snapped.Count < seamCount / 2)
                return null;

            // Refine pitch from median gap.
            List<double> gaps = [];
            for (int i = 1; i < snapped.Count; i++)
                gaps.Add(snapped[i] - snapped[i - 1]);
            pitch = Median(gaps);

            // Refine x0 so that predicted positions are centred on snapped peaks.
            double offsetSum = 0;
            for (int i = 0; i < snapped.Count; i++)
                offsetSum += snapped[i] - (i + 1) * pitch;
            x0 = snapped.Count > 0 ? offsetSum / snapped.Count : x0;
        }

        if (snapped.Count < seamCount * 0.7)
            return null;

        double score = snapped.Sum(x => edgeSignal[x]);
        return new LatticeFitResult(tileCount, x0, pitch, score, snapped);
    }

    // ── Snap all seams ────────────────────────────────────────────────

    private static List<int> SnapAll(
        double[] signal, double x0, double pitch, int seamCount, int n)
    {
        double radius = pitch * SearchRadiusFraction;
        int minGap = Math.Max(1, (int)(pitch * MinSeamGapFraction));

        List<int> snapped = [];
        int? prevX = null;

        for (int i = 1; i <= seamCount; i++)
        {
            double predicted = x0 + i * pitch;
            int left = Math.Max(1, (int)(predicted - radius));
            int right = Math.Min(n - 2, (int)(predicted + radius));
            if (right - left < 2) continue;

            // Find the strongest local maximum in the search window.
            int bestX = -1;
            double bestVal = double.MinValue;
            for (int x = left; x <= right; x++)
            {
                if (signal[x] > signal[x - 1] &&
                    signal[x] >= signal[x + 1] &&
                    signal[x] > bestVal)
                {
                    // Enforce minimum gap from previous seam.
                    if (!prevX.HasValue || x - prevX.Value >= minGap)
                    {
                        bestVal = signal[x];
                        bestX = x;
                    }
                }
            }

            if (bestX >= 0)
            {
                snapped.Add(bestX);
                prevX = bestX;
            }
        }

        return snapped;
    }

    private static double Median(List<double> values)
    {
        if (values.Count == 0) return 0;
        var sorted = values.OrderBy(v => v).ToList();
        int m = sorted.Count / 2;
        return sorted.Count % 2 == 1 ? sorted[m] : (sorted[m - 1] + sorted[m]) * 0.5;
    }
}
