using OpenCvSharp;

namespace MahjongSoulOverlay.Vision.Hand;

/// <summary>
/// Fits a trapezoidal plane to the orange tile-back mask of a side hand.
///
/// Two masks are used:
///   cleanMask — for fitting top/bottom boundary lines (middle portion only)
///   rawMask   — for recovering true xStart/xEnd within the fitted corridor
///
/// This prevents thin tapered ends from being truncated by morphological
/// operations or fixed-pixel-count column thresholds.
/// </summary>
public static class SideHandPlaneFitter
{
    private const double RansacInlierPx = 6.0;
    private const double MinOccupiedFraction = 0.25;
    private const double EndTrimFraction = 0.08;
    private const double MinSpanFraction = 0.35;
    /// <summary>Maximum gap (as fraction of pitch) to merge nearby runs.</summary>
    private const double MaxRunMergeGapPitch = 0.40;

    public sealed record PlaneFitResult(
        double TopStartY, double TopEndY,
        double BottomStartY, double BottomEndY,
        int ColStart, int ColEnd,
        double TopSlope, double BottomSlope,
        double Pitch,
        double Confidence);

    /// <summary>
    /// Fits the plane using <paramref name="cleanMask"/> for boundary lines
    /// and <paramref name="rawMask"/> for true column extents.
    /// </summary>
    public static PlaneFitResult? Fit(Mat rawMask, Mat cleanMask)
    {
        ArgumentNullException.ThrowIfNull(rawMask);
        ArgumentNullException.ThrowIfNull(cleanMask);
        if (rawMask.Size() != cleanMask.Size())
            throw new ArgumentException("Raw and clean masks must have the same size.");

        int w = rawMask.Cols, h = rawMask.Rows;

        // ── 1. Find core span from clean mask for slope fitting ───────
        var coreFit = FitCoreFromClean(cleanMask, w, h);
        if (coreFit is null) return null;

        var (topLine, bottomLine, coreStart, coreEnd) = coreFit.Value;

        // ── 2. Estimate pitch from the fitted band ────────────────────
        double pitch = EstimatePitch(rawMask, topLine, bottomLine, coreStart, coreEnd, w, h);

        // ── 3. Recover true xStart/xEnd from raw mask ─────────────────
        int colStart, colEnd;
        var extent = RecoverEndpoints(
            rawMask, topLine, bottomLine, coreStart, coreEnd, pitch, w, h);
        if (extent is ({ } s, { } e))
        {
            colStart = s;
            colEnd = e;
        }
        else
        {
            // Fall back to core span + pitch padding.
            colStart = Math.Max(0, (int)(coreStart - pitch * 0.25));
            colEnd = Math.Min(w - 1, (int)(coreEnd + pitch * 0.25));
        }

        // ── 4. Evaluate boundary lines at the recovered endpoints ─────
        double topStartY = LineY(topLine, colStart);
        double topEndY = LineY(topLine, colEnd);
        double bottomStartY = LineY(bottomLine, colStart);
        double bottomEndY = LineY(bottomLine, colEnd);

        // ── 5. Validity ───────────────────────────────────────────────
        if (!IsValid(topStartY, topEndY, bottomStartY, bottomEndY,
                colStart, colEnd, w, h))
            return null;

        double confidence = Math.Min(1.0,
            (topLine.Item3 + bottomLine.Item3) / 2.0);

        return new PlaneFitResult(
            topStartY, topEndY,
            bottomStartY, bottomEndY,
            colStart, colEnd,
            -topLine.Item0 / topLine.Item1,
            -bottomLine.Item0 / bottomLine.Item1,
            pitch,
            confidence);
    }

    // ── Core fitting from clean mask ─────────────────────────────────

    private static (Vec4d TopLine, Vec4d BottomLine, int CoreStart, int CoreEnd)?
        FitCoreFromClean(Mat cleanMask, int w, int h)
    {
        // Use connected components to find the hand band.
        // Column projection fragments when some columns are thin (tapered ends).
        using Mat labels = new Mat();
        using Mat stats = new Mat();
        using Mat centroids = new Mat();
        int nLabels = Cv2.ConnectedComponentsWithStats(
            cleanMask, labels, stats, centroids, PixelConnectivity.Connectivity8);

        // Find the component most likely to be the hand:
        // long (w ≥ 35 % of ROI width), wide aspect ratio (≥ 2.0),
        // reasonable area.
        double expectedCenterY = h * 0.5;
        (int Label, int X, int Y, int W, int H, int Area, double Score)? best = null;

        for (int i = 1; i < nLabels; i++)
        {
            int sx = stats.At<int>(i, (int)ConnectedComponentsTypes.Left);
            int sy = stats.At<int>(i, (int)ConnectedComponentsTypes.Top);
            int sw = stats.At<int>(i, (int)ConnectedComponentsTypes.Width);
            int sh = stats.At<int>(i, (int)ConnectedComponentsTypes.Height);
            int sa = stats.At<int>(i, (int)ConnectedComponentsTypes.Area);
            double cy = centroids.At<double>(i, 1);
            double aspect = sw / (double)Math.Max(sh, 1);

            if (sw < w * MinSpanFraction) continue;
            if (aspect < 1.8) continue; // not long enough — probably dora cluster

            // Score: prefer long, high aspect ratio, near expected center.
            double spanScore = Math.Min(1.0, (double)sw / (w * 0.7));
            double aspectScore = Math.Min(1.0, aspect / 5.0);
            double posScore = 1.0 - Math.Min(1.0, Math.Abs(cy - expectedCenterY) / (h * 0.4));
            double score = spanScore * 0.5 + aspectScore * 0.3 + posScore * 0.2;

            if (best is null || score > best.Value.Score)
                best = (i, sx, sy, sw, sh, sa, score);
        }

        if (best is not { } b)
            return null;

        int coreStart = b.X;
        int coreEnd = b.X + b.W - 1;

        // Collect top/bottom points within the core span.
        // Use the RAW mask for boundary points to capture thin ends that
        // cleanMask may have eroded. The cleanMask only determines the span.
        int trimCount = Math.Max(1, (int)((coreEnd - coreStart) * EndTrimFraction));
        int fitStart = coreStart + trimCount;
        int fitEnd = coreEnd - trimCount;
        if (fitEnd - fitStart < 20)
        { fitStart = coreStart; fitEnd = coreEnd; }

        // We need access to rawMask here. The caller passes it to Fit(),
        // but FitCoreFromClean only has cleanMask. Let's collect from
        // cleanMask for now — the CC approach preserves ends better than
        // column projection.
        List<Point2d> topPts = [], bottomPts = [];
        for (int x = coreStart; x <= coreEnd; x++)
        {
            int topY = -1, bottomY = -1;
            for (int y = 0; y < h; y++)
            {
                if (cleanMask.At<byte>(y, x) != 0)
                {
                    if (topY < 0) topY = y;
                    bottomY = y;
                }
            }
            if (topY >= 0)
            {
                topPts.Add(new Point2d(x, topY));
                bottomPts.Add(new Point2d(x, bottomY));
            }
        }

        if (topPts.Count < (coreEnd - coreStart) * MinOccupiedFraction)
            return null;

        var topFit = topPts.Where(p => p.X >= fitStart && p.X <= fitEnd).ToList();
        var bottomFit = bottomPts.Where(p => p.X >= fitStart && p.X <= fitEnd).ToList();

        Vec4d? tl = RansacLineFit(topFit, h);
        Vec4d? bl = RansacLineFit(bottomFit, h);
        if (tl is not { } topLine || bl is not { } bottomLine) return null;

        return (topLine, bottomLine, coreStart, coreEnd);
    }

    // ── Pitch estimation ─────────────────────────────────────────────

    private static double EstimatePitch(
        Mat rawMask, Vec4d topLine, Vec4d bottomLine,
        int coreStart, int coreEnd, int w, int h)
    {
        // Count foreground pixels per column within the fitted band.
        double[] bandProj = new double[w];
        int bandCols = 0;
        for (int x = coreStart; x <= coreEnd; x++)
        {
            int top = Math.Clamp((int)LineY(topLine, x) - 1, 0, h - 1);
            int bot = Math.Clamp((int)LineY(bottomLine, x) + 1, top + 1, h);
            int cnt = 0;
            for (int y = top; y < bot; y++)
                if (rawMask.At<byte>(y, x) != 0) cnt++;
            bandProj[x] = cnt;
            bandCols++;
        }

        if (bandCols < 10) return (coreEnd - coreStart) / 13.0;

        // Autocorrelation to find pitch.
        double mean = bandProj.Skip(coreStart).Take(bandCols).Average();
        double[] centered = bandProj.Select(v => v - mean).ToArray();
        int maxLag = Math.Min(bandCols / 3, coreEnd - coreStart);

        double[] ac = new double[maxLag];
        for (int lag = 10; lag < maxLag; lag++)
        {
            double sum = 0;
            for (int i = coreStart; i < coreEnd - lag; i++)
                sum += centered[i] * centered[i + lag];
            ac[lag] = sum / (coreEnd - lag - coreStart);
        }

        double maxAc = ac.Skip(10).Max();
        double threshold = maxAc * 0.15;
        for (int lag = 12; lag < maxLag - 1; lag++)
        {
            if (ac[lag] > threshold && ac[lag] > ac[lag - 1] && ac[lag] > ac[lag + 1])
                return lag;
        }

        return (coreEnd - coreStart) / 13.0;
    }

    // ── Endpoint recovery from raw mask ──────────────────────────────

    private static (int Start, int End)? RecoverEndpoints(
        Mat rawMask, Vec4d topLine, Vec4d bottomLine,
        int coreStart, int coreEnd, double pitch,
        int w, int h)
    {
        // Build occupancy within the fitted band using proportional threshold.
        bool[] occupied = new bool[w];
        for (int x = 0; x < w; x++)
        {
            double topY = LineY(topLine, x);
            double botY = LineY(bottomLine, x);
            if (topY >= h || botY < 0) continue;

            int top = Math.Clamp((int)Math.Floor(topY) - 2, 0, h - 1);
            int bot = Math.Clamp((int)Math.Ceiling(botY) + 2, top + 2, h);
            int bandH = bot - top;
            if (bandH < 3) continue;

            int cnt = 0;
            for (int y = top; y < bot; y++)
                if (rawMask.At<byte>(y, x) != 0) cnt++;

            // Proportional threshold: at least 10 % of band height.
            int minPx = Math.Max(1, (int)(bandH * 0.10));
            occupied[x] = cnt >= minPx;
        }

        // Find all occupied runs.
        List<(int S, int E)> runs = [];
        int rs = -1;
        for (int x = 0; x < w; x++)
        {
            if (occupied[x]) { if (rs < 0) rs = x; }
            else if (rs >= 0) { runs.Add((rs, x - 1)); rs = -1; }
        }
        if (rs >= 0) runs.Add((rs, w - 1));

        if (runs.Count == 0) return null;

        // Find the main run that overlaps the core span.
        var main = runs
            .OrderByDescending(r => Overlap(r.S, r.E, coreStart, coreEnd))
            .First();

        // Merge nearby runs outward from the main run.
        int start = main.S, end = main.E;
        int maxGap = Math.Max(2, (int)(pitch * MaxRunMergeGapPitch));
        bool changed;
        do
        {
            changed = false;
            foreach (var run in runs)
            {
                if (run.E < start && start - run.E - 1 <= maxGap)
                { start = run.S; changed = true; }
                else if (run.S > end && run.S - end - 1 <= maxGap)
                { end = run.E; changed = true; }
            }
        } while (changed);

        // Add pitch-based padding at ends.
        double pad = pitch * 0.15;
        start = Math.Max(0, (int)(start - pad));
        end = Math.Min(w - 1, (int)(end + pad));

        return (start, end);
    }

    private static int Overlap(int a1, int a2, int b1, int b2) =>
        Math.Max(0, Math.Min(a2, b2) - Math.Max(a1, b1) + 1);

    // ── Validity ──────────────────────────────────────────────────────

    private static bool IsValid(
        double topStartY, double topEndY,
        double bottomStartY, double bottomEndY,
        int colStart, int colEnd,
        int w, int h)
    {
        if (colStart < 0 || colEnd >= w) return false;
        if (colEnd - colStart < w * MinSpanFraction) return false;
        if (topStartY < 0 || topStartY >= h) return false;
        if (topEndY < 0 || topEndY >= h) return false;
        if (bottomStartY < 0 || bottomStartY >= h) return false;
        if (bottomEndY < 0 || bottomEndY >= h) return false;
        if (bottomStartY <= topStartY) return false;
        if (bottomEndY <= topEndY) return false;

        double bandH_s = bottomStartY - topStartY;
        double bandH_e = bottomEndY - topEndY;
        if (bandH_s < h * 0.03 || bandH_e < h * 0.03) return false;
        if (bandH_s > h * 0.85 || bandH_e > h * 0.85) return false;

        return true;
    }

    // ─── RANSAC ─────────────────────────────────────────────────────

    private static Vec4d? RansacLineFit(List<Point2d> points, int roiHeight)
    {
        if (points.Count < 5) return null;
        const int iterations = 200;
        int bestInliers = 0;
        double bestA = 0, bestB = 0, bestC = 0;
        var rng = new Random(42);

        for (int iter = 0; iter < iterations; iter++)
        {
            int i1 = rng.Next(points.Count);
            int i2; do { i2 = rng.Next(points.Count); } while (i2 == i1);
            var p1 = points[i1]; var p2 = points[i2];
            double dx = p2.X - p1.X, dy = p2.Y - p1.Y;
            if (Math.Abs(dx) < 1.0) continue;
            if (Math.Abs(dy / dx) > 0.8) continue;

            double a = dy, b = -dx;
            double c = p2.X * p1.Y - p2.Y * p1.X;
            double norm = Math.Sqrt(a * a + b * b);
            if (norm < 1e-9) continue;
            a /= norm; b /= norm; c /= norm;

            int inliers = 0;
            foreach (var p in points)
                if (Math.Abs(a * p.X + b * p.Y + c) <= RansacInlierPx) inliers++;

            if (inliers > bestInliers)
            { bestInliers = inliers; bestA = a; bestB = b; bestC = c; }
        }

        if (bestInliers < points.Count * 0.4) return null;
        return new Vec4d(bestA, bestB, bestC, (double)bestInliers / points.Count);
    }

    private static double LineY(Vec4d line, double x) =>
        -(line.Item0 * x + line.Item2) / line.Item1;
}
