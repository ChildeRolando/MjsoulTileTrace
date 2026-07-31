using MahjongSoulOverlay.Core.Domain;
using OpenCvSharp;

namespace MahjongSoulOverlay.Vision.Hand;

/// <summary>
/// Detects individual orange tile-back trapezoids within the back-surface corridor.
///
/// Builds a 1-D occupancy signal along the hand direction from the back-only mask,
/// finds tile boundaries from occupancy minima and raw-mask gaps, constructs a
/// <see cref="BackTileInstance"/> for each valid interval, and handles merged
/// (under-segmented) and fragmented (over-segmented) mask regions.
/// </summary>
public static class BackTileInstanceDetector
{
    private static readonly BackTileInstanceOptions Defaults = new();

    /// <summary>
    /// Detects individual tile-back instances within the back-surface corridor.
    /// </summary>
    /// <param name="rawOrangeMask">Broad binary orange mask (CV_8UC1) in rotated-ROI coords.</param>
    /// <param name="geometry">Detected back-surface geometry (ridge + lower rail).</param>
    /// <param name="plane">Coarse plane fit for u↔pixel mapping.</param>
    /// <param name="cropRect">The coarse crop rectangle in frame pixels.</param>
    /// <param name="seat">Seat (Left or Right).</param>
    /// <param name="frameWidth">Original frame width.</param>
    /// <param name="frameHeight">Original frame height.</param>
    /// <param name="options">Optional config overrides.</param>
    /// <returns>Ordered list of detected instances (left→right), or empty if detection fails.</returns>
    public static IReadOnlyList<BackTileInstance> Detect(
        Mat rawOrangeMask,
        BackSurfaceGeometry geometry,
        SideHandPlaneFitter.PlaneFitResult plane,
        Rect cropRect,
        Seat seat,
        int frameWidth,
        int frameHeight,
        BackTileInstanceOptions? options = null)
    {
        ArgumentNullException.ThrowIfNull(rawOrangeMask);
        ArgumentNullException.ThrowIfNull(geometry);
        ArgumentNullException.ThrowIfNull(plane);

        var opt = options ?? Defaults;
        int w = rawOrangeMask.Cols, h = rawOrangeMask.Rows;
        var ridge = geometry.RidgeLine;
        var rail = geometry.LowerRailLine;

        // ── 1. Build back-only corridor mask ────────────────────────
        // Inset from ridge and lower rail to avoid highlights, anti-aliasing,
        // and the top-surface transition.
        using Mat corridorMask = BuildCorridorMask(w, h, ridge, rail, opt);

        // ── 2. Build occupancy signal ───────────────────────────────
        double[] occupancy = BuildOccupancySignal(
            rawOrangeMask, corridorMask, geometry, plane, w, h, opt);

        // ── 3. Find boundary candidates ─────────────────────────────
        List<int> boundaries = FindBoundaries(occupancy, rawOrangeMask,
            geometry, plane, w, h, opt);

        if (boundaries.Count < 2)
            return [];

        // ── 4. Construct instances from intervals ───────────────────
        List<BackTileInstance> instances = [];
        for (int i = 0; i < boundaries.Count - 1; i++)
        {
            int b0 = boundaries[i];
            int b1 = boundaries[i + 1];
            if (b1 - b0 < 2) continue;

            double uLeft = (b0 + 0.5) / opt.OccupancySamples;
            double uRight = (b1 + 0.5) / opt.OccupancySamples;

            // Evaluate ridge and rail at uLeft, uRight.
            double xLeft = plane.ColStart + uLeft * (plane.ColEnd - plane.ColStart);
            double xRight = plane.ColStart + uRight * (plane.ColEnd - plane.ColStart);

            double ridgeYLeft = geometry.RidgeY(xLeft);
            double ridgeYRight = geometry.RidgeY(xRight);
            double railYLeft = geometry.LowerRailY(xLeft);
            double railYRight = geometry.LowerRailY(xRight);

            // Apply corridor inset.
            double insetTop = (railYLeft - ridgeYLeft) * opt.CorridorInsetTop;
            double insetBot = (railYLeft - ridgeYLeft) * opt.CorridorInsetBottom;
            double topLeft = ridgeYLeft + insetTop;
            double topRight = ridgeYRight + (railYRight - ridgeYRight) * opt.CorridorInsetTop;
            double botLeft = railYLeft - insetBot;
            double botRight = railYRight - (railYRight - ridgeYRight) * opt.CorridorInsetBottom;

            // Build quad in rotated-ROI coords.
            Point2f[] rotCorners =
            [
                new((float)xLeft, (float)topLeft),
                new((float)xRight, (float)topRight),
                new((float)xRight, (float)botRight),
                new((float)xLeft, (float)botLeft)
            ];

            // Map to frame-normalised quad.
            Point2f[] framePx = SideHandRectifier.MapToFrame(rotCorners, cropRect, seat);
            NormalizedQuad quad = SideHandRectifier.ToNormalizedQuad(framePx, frameWidth, frameHeight);

            // Compute orange coverage within the instance area.
            double coverage = ComputeCoverage(
                rawOrangeMask, corridorMask, b0, b1, opt.OccupancySamples, plane, w, h);

            // Check ridge and rail support.
            double ridgeSupport = CheckSupport(rawOrangeMask, b0, b1,
                geometry, plane, isRidge: true, opt);
            double railSupport = CheckSupport(rawOrangeMask, b0, b1,
                geometry, plane, isRidge: false, opt);

            // Confidence from coverage and support.
            double confidence = Math.Clamp(
                coverage * 0.5 + (ridgeSupport + railSupport) * 0.25, 0, 1);

            instances.Add(new BackTileInstance(
                uLeft, uRight, quad, coverage,
                ridgeSupport > 0.5, railSupport > 0.5, confidence));
        }

        // ── 5. Post-process: merge fragments, split merged ─────────
        instances = PostProcess(instances, occupancy, opt);

        return instances;
    }

    // ── Corridor mask ──────────────────────────────────────────────

    private static Mat BuildCorridorMask(
        int w, int h, Vec4d ridge, Vec4d rail, BackTileInstanceOptions opt)
    {
        Mat mask = new Mat(h, w, MatType.CV_8UC1, Scalar.Black);
        for (int x = 0; x < w; x++)
        {
            double ridgeY = -(ridge.Item0 * x + ridge.Item2) / ridge.Item1;
            double railY = -(rail.Item0 * x + rail.Item2) / rail.Item1;
            if (railY <= ridgeY) continue;

            double height = railY - ridgeY;
            int top = Math.Clamp((int)Math.Ceiling(ridgeY + height * opt.CorridorInsetTop), 0, h - 1);
            int bot = Math.Clamp((int)Math.Floor(railY - height * opt.CorridorInsetBottom), top + 1, h);
            for (int y = top; y < bot; y++)
                mask.At<byte>(y, x) = 255;
        }
        return mask;
    }

    // ── Occupancy signal ───────────────────────────────────────────

    private static double[] BuildOccupancySignal(
        Mat rawMask, Mat corridorMask,
        BackSurfaceGeometry geometry,
        SideHandPlaneFitter.PlaneFitResult plane,
        int w, int h, BackTileInstanceOptions opt)
    {
        int n = opt.OccupancySamples;
        double[] signal = new double[n];

        for (int i = 0; i < n; i++)
        {
            double u = (i + 0.5) / n;
            double x = plane.ColStart + u * (plane.ColEnd - plane.ColStart);
            int xi = (int)Math.Round(x);
            if (xi < 0 || xi >= w) continue;

            double ridgeY = geometry.RidgeY(xi);
            double railY = geometry.LowerRailY(xi);
            if (railY <= ridgeY) continue;

            int top = (int)Math.Ceiling(ridgeY);
            int bot = (int)Math.Floor(railY);
            if (top < 0) top = 0;
            if (bot >= h) bot = h - 1;
            if (bot <= top) continue;

            int orange = 0, total = 0;
            for (int y = top; y <= bot; y++)
            {
                if (corridorMask.At<byte>(y, xi) == 0) continue;
                total++;
                if (rawMask.At<byte>(y, xi) > 0) orange++;
            }

            // Invert: gap signal 1.0 = fully black (seam), 0.0 = fully orange.
            signal[i] = total > 0 ? 1.0 - (double)orange / total : 0.5;
        }

        return signal;
    }

    // ── Boundary detection ─────────────────────────────────────────

    private static List<int> FindBoundaries(
        double[] occupancy,
        Mat rawMask,
        BackSurfaceGeometry geometry,
        SideHandPlaneFitter.PlaneFitResult plane,
        int w, int h,
        BackTileInstanceOptions opt)
    {
        int n = occupancy.Length;
        if (n < 10) return [];

        // Smooth occupancy for peak finding.
        double[] smooth = SignalHelpers.GaussianSmooth(occupancy, opt.OccupancySmoothSigma);

        // Find local maxima (seams = high gap signal = dark).
        double noiseFloor = smooth.Min();
        double maxVal = smooth.Max();
        double range = maxVal - noiseFloor;
        double threshold = noiseFloor + range * opt.BoundaryMinProminence;

        List<int> peaks = SignalHelpers.FindPeaks(smooth, threshold);

        if (peaks.Count < 1)
        {
            // Fallback: use very weak threshold.
            threshold = noiseFloor + range * 0.03;
            peaks = SignalHelpers.FindPeaks(smooth, threshold);
        }

        // NMS with minimum separation.
        double estimatedTileWidth = n / 14.0; // ~13-14 tiles max
        int minDist = Math.Max(2, (int)(estimatedTileWidth * opt.BoundaryMinSeparation));
        peaks = SignalHelpers.Nms(peaks, smooth, minDist);

        // Add endpoints.
        List<int> boundaries = new() { 0 };
        boundaries.AddRange(peaks);
        boundaries.Add(n - 1);
        boundaries.Sort();

        return boundaries;
    }

    // ── Coverage and support ───────────────────────────────────────

    private static double ComputeCoverage(
        Mat rawMask, Mat corridorMask,
        int i0, int i1, int nSamples,
        SideHandPlaneFitter.PlaneFitResult plane, int w, int h)
    {
        double u0 = (i0 + 0.5) / nSamples;
        double u1 = (i1 + 0.5) / nSamples;

        // Sample a grid of points within the corridor.
        int uSteps = 12, tSteps = 6;
        int orange = 0, total = 0;

        for (int i = 0; i < uSteps; i++)
        {
            double u = u0 + (u1 - u0) * (i + 0.5) / uSteps;
            // Convert u to pixel x using the plane span.
            int x = Math.Clamp((int)(plane.ColStart + u * (plane.ColEnd - plane.ColStart)), 0, w - 1);

            // Find the corridor y-range for this column.
            int colTop = -1, colBot = -1;
            for (int y = 0; y < h; y++)
            {
                if (corridorMask.At<byte>(y, x) > 0)
                {
                    if (colTop < 0) colTop = y;
                    colBot = y;
                }
            }
            if (colTop < 0 || colBot <= colTop) continue;

            int colHeight = colBot - colTop + 1;
            for (int j = 0; j < tSteps; j++)
            {
                double t = 0.05 + 0.90 * (j + 0.5) / tSteps;
                int y = colTop + (int)(t * (colHeight - 1));
                if (y >= 0 && y < h)
                {
                    total++;
                    if (rawMask.At<byte>(y, x) > 0) orange++;
                }
            }
        }

        return total > 0 ? (double)orange / total : 0;
    }

    private static double CheckSupport(
        Mat rawMask, int i0, int i1,
        BackSurfaceGeometry geometry,
        SideHandPlaneFitter.PlaneFitResult plane,
        bool isRidge, BackTileInstanceOptions opt)
    {
        int n = opt.OccupancySamples;
        double u0 = (i0 + 0.5) / n;
        double u1 = (i1 + 0.5) / n;
        int w = rawMask.Cols, h = rawMask.Rows;

        int orange = 0, total = 0;
        int steps = 12;

        for (int i = 0; i < steps; i++)
        {
            double u = u0 + (u1 - u0) * (i + 0.5) / steps;
            double x = plane.ColStart + u * (plane.ColEnd - plane.ColStart);
            int xi = Math.Clamp((int)Math.Round(x), 0, w - 1);

            double ridgeY = geometry.RidgeY(xi);
            double railY = geometry.LowerRailY(xi);
            double height = railY - ridgeY;
            if (height <= 0) continue;

            if (isRidge)
            {
                // Sample strip just below the ridge.
                int y0 = Math.Clamp((int)ridgeY, 0, h - 1);
                int y1 = Math.Clamp((int)(ridgeY + height * 0.15), y0 + 1, h - 1);
                for (int y = y0; y <= y1; y++)
                {
                    total++;
                    if (rawMask.At<byte>(y, xi) > 0) orange++;
                }
            }
            else
            {
                // Sample strip just above the lower rail.
                int y0 = Math.Clamp((int)(railY - height * 0.15), 0, h - 1);
                int y1 = Math.Clamp((int)railY, y0 + 1, h - 1);
                for (int y = y0; y <= y1; y++)
                {
                    total++;
                    if (rawMask.At<byte>(y, xi) > 0) orange++;
                }
            }
        }

        return total > 0 ? (double)orange / total : 0;
    }

    // ── Post-processing ────────────────────────────────────────────

    private static List<BackTileInstance> PostProcess(
        List<BackTileInstance> instances,
        double[] occupancy,
        BackTileInstanceOptions opt)
    {
        if (instances.Count == 0) return instances;

        // Estimate expected local tile width.
        double medianWidth = SignalHelpers.Median(
            instances.Select(inst => inst.Width).ToList());

        List<BackTileInstance> result = new(instances.Count);
        int i = 0;

        while (i < instances.Count)
        {
            var inst = instances[i];

            // ── Split under-segmented (merged) regions ──────────
            if (inst.Width > medianWidth * 1.55)
            {
                // Try to split at the strongest internal minimum.
                var split = TrySplit(inst, instances, i, occupancy, medianWidth, opt);
                if (split is not null)
                {
                    result.AddRange(split);
                    i++;
                    continue;
                }
            }

            // ── Merge over-segmented (fragmented) regions ────────
            if (i < instances.Count - 1)
            {
                var merged = TryMerge(
                    inst, instances[i + 1], medianWidth, opt);
                if (merged is not null)
                {
                    result.Add(merged);
                    i += 2;
                    continue;
                }
            }

            result.Add(inst);
            i++;
        }

        // ── Filter by coverage ──────────────────────────────────
        var beforeFilter = result.Count;
        result = result
            .Where(inst => inst.OrangeCoverage >= opt.MinOrangeCoverage)
            .ToList();

        // ── Filter terminal side faces ──────────────────────────
        // Terminal side faces don't span the full corridor height;
        // they typically have low coverage and weak dual support.
        beforeFilter = result.Count;
        result = result
            .Where(inst =>
                inst.OrangeCoverage >= opt.MinOrangeCoverage &&
                inst.Confidence >= 0.25)
            .ToList();

        return result;
    }

    private static List<BackTileInstance>? TrySplit(
        BackTileInstance inst,
        List<BackTileInstance> all,
        int index,
        double[] occupancy,
        double medianWidth,
        BackTileInstanceOptions opt)
    {
        // Find the strongest internal occupancy minimum.
        int n = occupancy.Length;
        int i0 = Math.Clamp((int)(inst.ULeft * n), 0, n - 1);
        int i1 = Math.Clamp((int)(inst.URight * n), i0 + 2, n - 1);
        if (i1 - i0 < 6) return null;

        // Search for the deepest local minimum in the middle portion.
        int bestI = -1;
        double bestVal = double.MaxValue;
        double range = occupancy.Max() - occupancy.Min();
        double threshold = occupancy.Min() + range * opt.SplitMinInternalContrast;

        for (int j = i0 + 3; j < i1 - 3; j++)
        {
            if (occupancy[j] < threshold &&
                occupancy[j] < occupancy[j - 1] &&
                occupancy[j] <= occupancy[j + 1] &&
                occupancy[j] < bestVal)
            {
                bestVal = occupancy[j];
                bestI = j;
            }
        }

        if (bestI < 0) return null;

        double splitU = (bestI + 0.5) / n;
        double w1 = splitU - inst.ULeft;
        double w2 = inst.URight - splitU;

        // Split must produce two reasonable-width instances.
        if (w1 < medianWidth * 0.35 || w2 < medianWidth * 0.35)
            return null;

        // Create two new instances by splitting at the boundary.
        // We approximate with halved properties.
        var half1 = new BackTileInstance(
            inst.ULeft, splitU, inst.Quad,
            inst.OrangeCoverage, inst.RidgeSupport, inst.LowerRailSupport,
            inst.Confidence * 0.85);
        var half2 = new BackTileInstance(
            splitU, inst.URight, inst.Quad,
            inst.OrangeCoverage, inst.RidgeSupport, inst.LowerRailSupport,
            inst.Confidence * 0.85);

        return [half1, half2];
    }

    private static BackTileInstance? TryMerge(
        BackTileInstance left, BackTileInstance right,
        double medianWidth, BackTileInstanceOptions opt)
    {
        double gapWidth = right.ULeft - left.URight;
        if (gapWidth < 0 || gapWidth > medianWidth * opt.MergeMaxGapWidth)
            return null;

        double combinedWidth = right.URight - left.ULeft;
        // Only merge if combined width is plausible for one tile.
        if (combinedWidth > medianWidth * 1.4)
            return null;

        // Merge: use the left instance's quad (approximation).
        double avgCoverage = (left.OrangeCoverage + right.OrangeCoverage) * 0.5;
        double avgConf = (left.Confidence + right.Confidence) * 0.5;

        return new BackTileInstance(
            left.ULeft, right.URight, left.Quad,
            avgCoverage,
            left.RidgeSupport && right.RidgeSupport,
            left.LowerRailSupport && right.LowerRailSupport,
            avgConf);
    }
}
