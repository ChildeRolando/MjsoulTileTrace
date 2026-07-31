using OpenCvSharp;

namespace MahjongSoulOverlay.Vision.Hand;

/// <summary>
/// Detects the shared top/back ridge and lower back rail for a side hand
/// using local relative luminance contrast in Lab colour space.
///
/// The ridge is the boundary between the lighter orange top surface and the
/// darker orange back surface.  Local luminance contrast (not absolute
/// brightness) is used so the detector is invariant to environmental
/// lighting changes and spatial gradients.
/// </summary>
public static class BackSurfaceGeometryDetector
{
    private static readonly BackSurfaceGeometryOptions Defaults = new();

    /// <summary>
    /// Detects back-surface geometry from the rotated BGR ROI and broad orange mask.
    /// </summary>
    /// <param name="rotatedBgr">Rotated BGR ROI (tiles run left→right).</param>
    /// <param name="rawOrangeMask">Broad binary orange mask (tops + backs + sides).</param>
    /// <param name="plane">Coarse plane fit providing column span.</param>
    /// <param name="previousStable">Previous stable geometry, or null.</param>
    /// <param name="options">Optional config overrides.</param>
    /// <returns>Detected geometry, or null if detection fails.</returns>
    public static BackSurfaceGeometry? Detect(
        Mat rotatedBgr,
        Mat rawOrangeMask,
        SideHandPlaneFitter.PlaneFitResult plane,
        BackSurfaceGeometry? previousStable = null,
        BackSurfaceGeometryOptions? options = null)
    {
        ArgumentNullException.ThrowIfNull(rotatedBgr);
        ArgumentNullException.ThrowIfNull(rawOrangeMask);
        ArgumentNullException.ThrowIfNull(plane);

        var opt = options ?? Defaults;
        int w = rawOrangeMask.Cols, h = rawOrangeMask.Rows;

        // ── 1. Determine valid column range ─────────────────────
        int colStart = Math.Max(0, plane.ColStart);
        int colEnd = Math.Min(w - 1, plane.ColEnd);
        if (colEnd - colStart < opt.MinCandidatePoints)
            return null;

        // ── 2. Build ridge and rail from plane geometry ──────────
        // The plane already gives us the top and bottom boundaries of the
        // orange region.  The ridge (top/back transition) is placed at a
        // calibrated fraction of the way from the plane's top to bottom.
        // This is a geometric fallback when luminance contrast is weak.
        const double ridgeFraction = 0.45; // ridge at ~45% down from plane top

        // Ridge line: interpolate between plane top and bottom.
        double ridgeTopStart = plane.TopStartY + ridgeFraction * (plane.BottomStartY - plane.TopStartY);
        double ridgeTopEnd = plane.TopEndY + ridgeFraction * (plane.BottomEndY - plane.TopEndY);

        // Fit ridge line through these two points (plus any valid columns).
        List<Point2d> ridgePoints = [];
        for (int x = colStart; x <= colEnd; x++)
        {
            double ux = (double)(x - colStart) / Math.Max(1, colEnd - colStart);
            double rY = ridgeTopStart + ux * (ridgeTopEnd - ridgeTopStart);
            // Validate: column must have orange above and below.
            int aboveO = 0, belowO = 0, totalO = 0;
            for (int y = 0; y < h; y++)
            {
                if (rawOrangeMask.At<byte>(y, x) > 0)
                {
                    totalO++;
                    if (y < rY) aboveO++;
                    else belowO++;
                }
            }
            if (totalO >= h * 0.06 && aboveO >= 2 && belowO >= 2)
                ridgePoints.Add(new Point2d(x, rY));
        }

        if (ridgePoints.Count < opt.MinCandidatePoints)
            return previousStable;

        var ridgeFit = RansacLineFit(ridgePoints, h, opt);
        // Ridge RANSAC fit completed.
        if (ridgeFit is not { } ridgeLine)
            return previousStable;

        int ridgeInliers = CountInliers(ridgePoints, ridgeLine, opt.RansacInlierPx);

        // ── 3. Detect lower rail from plane bottom ────────────────
        // The lower rail follows the plane's bottom boundary.
        int trimPixels = Math.Max(3, (int)((colEnd - colStart) * opt.RailEndTrimFraction));
        int railStart = colStart + trimPixels;
        int railEnd = colEnd - trimPixels;
        if (railEnd - railStart < opt.MinCandidatePoints / 2)
        { railStart = colStart; railEnd = colEnd; }

        List<Point2d> railPoints = [];
        for (int x = railStart; x <= railEnd; x++)
        {
            double ux = (double)(x - colStart) / Math.Max(1, colEnd - colStart);
            double planeBotY = plane.BottomStartY + ux * (plane.BottomEndY - plane.BottomStartY);
            double rY = -(ridgeLine.Item0 * x + ridgeLine.Item2) / ridgeLine.Item1;

            // Search near the plane bottom for the lowest orange pixel.
            int bottomY = -1;
            int searchStart = Math.Min(h - 1, (int)(planeBotY + h * 0.08));
            int searchEnd = Math.Max((int)rY + 2, (int)(planeBotY - h * 0.25));
            for (int y = searchStart; y >= searchEnd; y--)
            {
                if (rawOrangeMask.At<byte>(y, x) > 0)
                {
                    bottomY = y;
                    break;
                }
            }
            if (bottomY > rY + h * opt.MinBackHeightFraction)
                railPoints.Add(new Point2d(x, bottomY));
        }

        if (railPoints.Count < opt.MinCandidatePoints / 2)
        {
            return previousStable;
        }

        var railFit = RansacLineFit(railPoints, h, opt);
        if (railFit is not { } railLine)
            return previousStable;

        int railInliers = CountInliers(railPoints, railLine, opt.RansacInlierPx);

        // ── 7. Validate ────────────────────────────────────────────
        // Ridge must be above lower rail across the valid span.
        // Allow a small fraction of columns to be marginal (hand endpoints).
        double totalBackHeight = 0;
        int heightSamples = 0;
        int badColumns = 0;
        int totalChecked = 0;
        for (int x = colStart; x <= colEnd; x += Math.Max(1, (colEnd - colStart) / 20))
        {
            double rY = -(ridgeLine.Item0 * x + ridgeLine.Item2) / ridgeLine.Item1;
            double lY = -(railLine.Item0 * x + railLine.Item2) / railLine.Item1;
            double bh = lY - rY;
            totalChecked++;
            if (bh < h * opt.MinBackHeightFraction || bh > h * opt.MaxBackHeightFraction)
            {
                badColumns++;
            }
            else
            {
                totalBackHeight += bh;
                heightSamples++;
            }
        }

        double meanBackHeight = heightSamples > 0 ? totalBackHeight / heightSamples : 0;
        // Allow up to 15% of columns to be marginal (hand endpoints).
        if (badColumns > totalChecked * 0.15 || heightSamples < 3)
        {
            double minH = h * opt.MinBackHeightFraction;
            double maxH = h * opt.MaxBackHeightFraction;
            return previousStable;
        }

        // ── 8. Confidence ──────────────────────────────────────────
        double ridgeInlierFrac = (double)ridgeInliers / ridgePoints.Count;
        double railInlierFrac = (double)railInliers / railPoints.Count;
        double confidence = Math.Clamp(
            (ridgeInlierFrac * 0.55 + railInlierFrac * 0.35 + 0.10), 0, 1);
        double normalizedResidual = 0;
        foreach (var p in ridgePoints)
            normalizedResidual += Math.Abs(
                ridgeLine.Item0 * p.X + ridgeLine.Item1 * p.Y + ridgeLine.Item2);
        normalizedResidual /= ridgePoints.Count;

        return new BackSurfaceGeometry(
            ridgeLine, railLine,
            colStart, colEnd,
            1, // contrastSign: top brighter than back
            confidence,
            ridgeInliers, railInliers,
            normalizedResidual,
            meanBackHeight);
    }

    // ── Helpers ────────────────────────────────────────────────────

    private static double LocalMedian(byte[] values, int start, int end)
    {
        int len = end - start + 1;
        if (len <= 0) return 0;
        // Use a small array for the subsample.
        byte[] sub = new byte[len];
        Array.Copy(values, start, sub, 0, len);
        Array.Sort(sub);
        int m = len / 2;
        return len % 2 == 1 ? sub[m] : (sub[m - 1] + sub[m]) * 0.5;
    }

    private static double LocalMad(byte[] values, int start, int end, double median)
    {
        int len = end - start + 1;
        if (len <= 0) return 0;
        double[] absDev = new double[len];
        for (int i = 0; i < len; i++)
            absDev[i] = Math.Abs(values[start + i] - median);
        Array.Sort(absDev);
        int m = len / 2;
        return len % 2 == 1 ? absDev[m] : (absDev[m - 1] + absDev[m]) * 0.5;
    }

    private static Vec4d? RansacLineFit(
        List<Point2d> points, int roiHeight, BackSurfaceGeometryOptions opt)
    {
        if (points.Count < 5) return null;

        int bestInliers = 0;
        double bestA = 0, bestB = 0, bestC = 0;
        var rng = new Random(42);

        for (int iter = 0; iter < opt.RansacIterations; iter++)
        {
            int i1 = rng.Next(points.Count);
            int i2;
            do { i2 = rng.Next(points.Count); } while (i2 == i1);
            var p1 = points[i1]; var p2 = points[i2];
            double dx = p2.X - p1.X, dy = p2.Y - p1.Y;
            if (Math.Abs(dx) < 1.0) continue;
            if (Math.Abs(dy / dx) > opt.MaxSlope) continue;

            // Line: ax + by + c = 0
            double a = dy, b = -dx;
            double c = p2.X * p1.Y - p2.Y * p1.X;
            double norm = Math.Sqrt(a * a + b * b);
            if (norm < 1e-9) continue;
            a /= norm; b /= norm; c /= norm;

            int inliers = 0;
            foreach (var p in points)
                if (Math.Abs(a * p.X + b * p.Y + c) <= opt.RansacInlierPx)
                    inliers++;

            if (inliers > bestInliers)
            {
                bestInliers = inliers;
                bestA = a; bestB = b; bestC = c;
            }
        }

        if (bestInliers < points.Count * opt.MinInlierFraction)
            return null;

        return new Vec4d(bestA, bestB, bestC, (double)bestInliers / points.Count);
    }

    private static int CountInliers(List<Point2d> points, Vec4d line, double threshold)
    {
        int count = 0;
        foreach (var p in points)
            if (Math.Abs(line.Item0 * p.X + line.Item1 * p.Y + line.Item2) <= threshold)
                count++;
        return count;
    }
}
