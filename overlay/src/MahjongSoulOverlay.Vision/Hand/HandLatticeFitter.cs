namespace MahjongSoulOverlay.Vision.Hand;

/// <summary>
/// Fits a tile-seam lattice to an edge signal.
///
/// The edge signal E(x) peaks at vertical boundaries:
///   peak 0         = left edge of tile 0
///   peaks 1..12    = 12 internal seams between tiles
///   peak 13        = right edge of tile 12
///
/// We want the 12 INTERNAL seams (peaks 1..12).  The lattice provides
/// the search window; the actual peak positions come from snapping.
/// </summary>
public static class HandLatticeFitter
{
    private const double SearchRadiusFraction = 0.22;
    private const double MinSeamGapFraction = 0.50;
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
        int seamCount = tileCount - 1; // 12 internal seams for 13 tiles

        // ── 1. Find ALL candidate edge peaks ──────────────────────────
        List<int> allPeaks = FindAllEdgePeaks(edgeSignal, (int)(initialPitch * 0.35));

        if (allPeaks.Count < seamCount)
            return null;

        // ── 2. The first strong peak is usually the left boundary of tile 0.
        //    The first internal seam is roughly initialPitch pixels to the right.
        //    Estimate x0 so that (x0 + initialPitch) ≈ position of first internal seam.
        int firstBoundaryPeak = allPeaks[0];
        // Find the first peak that's at least 0.6*pitch from the left boundary
        // — that's the first internal seam.
        int firstSeamIdx = -1;
        for (int i = 1; i < allPeaks.Count; i++)
        {
            if (allPeaks[i] - firstBoundaryPeak >= initialPitch * 0.6)
            {
                firstSeamIdx = i;
                break;
            }
        }
        if (firstSeamIdx < 0) return null;

        double pitch = initialPitch;
        double x0 = allPeaks[firstSeamIdx] - pitch; // so x0 + pitch ≈ first internal seam

        // ── 3. Iterate: snap → refine pitch → snap again ───────────────
        List<int> snapped = [];
        for (int iter = 0; iter < MaxIterations; iter++)
        {
            snapped = SnapSeams(edgeSignal, x0, pitch, seamCount, n);
            if (snapped.Count < seamCount * 0.7)
                break;

            // Refine pitch from median gap.
            List<double> gaps = [];
            for (int i = 1; i < snapped.Count; i++)
                gaps.Add(snapped[i] - snapped[i - 1]);
            pitch = Median(gaps);

            // Refine x0.
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

    // ── Find all edge peaks ─────────────────────────────────────────

    private static List<int> FindAllEdgePeaks(double[] signal, int minDistance)
    {
        int n = signal.Length;
        // Estimate noise floor as median signal value.
        double[] sorted = (double[])signal.Clone();
        Array.Sort(sorted);
        double noiseFloor = sorted[n / 2];
        double threshold = noiseFloor + (sorted.Max() - noiseFloor) * 0.08;

        List<(int pos, double val)> raw = [];
        for (int x = 1; x < n - 1; x++)
        {
            if (signal[x] > threshold &&
                signal[x] > signal[x - 1] &&
                signal[x] >= signal[x + 1])
            {
                raw.Add((x, signal[x]));
            }
        }

        // Non-maximum suppression: sort by strength, keep strongest,
        // enforce minimum distance.
        bool[] suppressed = new bool[n];
        List<int> selected = [];
        foreach (var (pos, _) in raw.OrderByDescending(p => p.val))
        {
            if (suppressed[pos]) continue;
            selected.Add(pos);
            // Mark neighbours within minDistance as suppressed.
            for (int x = Math.Max(0, pos - minDistance);
                 x <= Math.Min(n - 1, pos + minDistance); x++)
                suppressed[x] = true;
        }

        selected.Sort();
        return selected;
    }

    // ── Snap seams ──────────────────────────────────────────────────

    private static List<int> SnapSeams(
        double[] signal, double x0, double pitch, int seamCount, int n)
    {
        double radius = pitch * SearchRadiusFraction;
        int minGap = Math.Max(2, (int)(pitch * MinSeamGapFraction));

        List<int> snapped = [];
        int? prevX = null;

        for (int i = 1; i <= seamCount; i++)
        {
            double predicted = x0 + i * pitch;
            int left = Math.Max(1, (int)(predicted - radius));
            int right = Math.Min(n - 2, (int)(predicted + radius));
            if (right - left < 2) continue;

            // Find the strongest LOCAL MAXIMUM in the window.
            int bestX = -1;
            double bestVal = double.MinValue;
            for (int x = left; x <= right; x++)
            {
                // Must be a genuine local maximum.
                if (signal[x] <= signal[x - 1] || signal[x] < signal[x + 1])
                    continue;
                // Must not be too close to the previous snapped seam.
                if (prevX.HasValue && x - prevX.Value < minGap)
                    continue;
                if (signal[x] > bestVal)
                {
                    bestVal = signal[x];
                    bestX = x;
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
