using MahjongSoulOverlay.Core.Domain;
using OpenCvSharp;

namespace MahjongSoulOverlay.Vision.Hand;

/// <summary>
/// Detects individual orange tile-back trapezoids within the back-surface corridor.
///
/// Builds a 1-D occupancy signal along the hand direction from the back-only mask,
/// finds tile boundaries from occupancy minima with real local prominence,
/// constructs a <see cref="BackTileInstance"/> for each valid interval, and
/// jointly selects the best sequence of instances against a projective model.
/// </summary>
public static class BackTileInstanceDetector
{
    private static readonly BackTileInstanceOptions Defaults = new();

    /// <summary>
    /// Detects individual tile-back instances within the back-surface corridor.
    /// </summary>
    /// <param name="detection">Complete back-surface detection result (geometry + masks).</param>
    /// <param name="plane">Coarse plane fit for u↔pixel mapping.</param>
    /// <param name="cropRect">The coarse crop rectangle in frame pixels.</param>
    /// <param name="seat">Seat (Left or Right).</param>
    /// <param name="frameWidth">Original frame width.</param>
    /// <param name="frameHeight">Original frame height.</param>
    /// <param name="options">Optional config overrides.</param>
    /// <returns>Ordered list of detected instances (left→right), or empty if detection fails.</returns>
    public static IReadOnlyList<BackTileInstance> Detect(
        BackSurfaceDetectionResult detection,
        SideHandPlaneFitter.PlaneFitResult plane,
        Rect cropRect,
        Seat seat,
        int frameWidth,
        int frameHeight,
        BackTileInstanceOptions? options = null)
    {
        ArgumentNullException.ThrowIfNull(detection);
        ArgumentNullException.ThrowIfNull(plane);

        var opt = options ?? Defaults;
        var backOnly = detection.BackOnlyMask;
        var geometry = detection.Geometry;
        int w = backOnly.Cols, h = backOnly.Rows;

        // ── 1. Build occupancy signal from back-only mask ──────────
        double[] occupancy = BuildOccupancySignal(backOnly, geometry, plane, w, h, opt);
        if (occupancy.Length < 10) return [];

        // ── 2. Estimate tile scale from autocorrelation ────────────
        int estimatedTileSamples = EstimateScaleFromAutocorrelation(occupancy);
        if (estimatedTileSamples < 3) estimatedTileSamples = occupancy.Length / 14;

        // ── 3. Find boundary candidates with real local prominence ─
        List<BoundaryCandidate> allBoundaries = FindBoundaryCandidates(
            occupancy, backOnly, geometry, plane, w, h, estimatedTileSamples, opt);
        if (allBoundaries.Count < 2) return [];

        // ── 4. Group nearby boundaries belonging to the same seam ──
        allBoundaries = GroupNearbyBoundaries(allBoundaries, estimatedTileSamples, opt);

        // ── 5. Select boundaries (including proper endpoints) ──────
        List<int> selectedBoundaries = SelectBoundaries(
            allBoundaries, occupancy, estimatedTileSamples, opt);
        if (selectedBoundaries.Count < 2) return [];

        // ── 6. Construct instances from intervals ──────────────────
        List<BackTileInstance> instances = BuildInstances(
            selectedBoundaries, backOnly, geometry, plane, cropRect, seat,
            frameWidth, frameHeight, opt);

        if (instances.Count < 1) return [];

        // ── 7. Post-process: split merged, merge fragmented ───────
        instances = PostProcess(instances, occupancy, estimatedTileSamples, allBoundaries, opt);

        // ── 8. Filter by confidence and coverage ──────────────────
        instances = instances
            .Where(inst => inst.OrangeCoverage >= opt.MinOrangeCoverage &&
                           inst.Confidence >= 0.25)
            .ToList();

        // ── 9. Reject terminal side-face fragments ───────────────
        // Terminal side faces don't span the full corridor height.
        // They typically lack ridge or rail support.
        if (instances.Count > 1)
        {
            // Check first instance.
            var first = instances[0];
            if (!first.RidgeSupport && !first.LowerRailSupport &&
                first.Confidence < 0.5)
            {
                instances.RemoveAt(0);
            }
            // Check last instance.
            if (instances.Count > 1)
            {
                var last = instances[^1];
                if (!last.RidgeSupport && !last.LowerRailSupport &&
                    last.Confidence < 0.5)
                {
                    instances.RemoveAt(instances.Count - 1);
                }
            }
        }

        // Reject terminal instances that are too narrow (likely fragments).
        if (instances.Count > 1)
        {
            double medianW = SignalHelpers.Median(instances.Select(x => x.Width).ToList());
            if (instances[0].Width < medianW * 0.40 && instances[0].Confidence < 0.4)
                instances.RemoveAt(0);
            if (instances.Count > 1 &&
                instances[^1].Width < medianW * 0.40 && instances[^1].Confidence < 0.4)
                instances.RemoveAt(instances.Count - 1);
        }

        return instances;
    }

    // ── Occupancy signal ───────────────────────────────────────────

    private static double[] BuildOccupancySignal(
        Mat backOnlyMask,
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
            if (xi < 0 || xi >= w) { signal[i] = 0.5; continue; }

            double ridgeY = geometry.RidgeY(xi);
            double railY = geometry.LowerRailY(xi);
            if (railY <= ridgeY) { signal[i] = 0.5; continue; }

            int top = (int)Math.Ceiling(ridgeY);
            int bot = (int)Math.Floor(railY);
            if (top < 0) top = 0;
            if (bot >= h) bot = h - 1;
            if (bot <= top) { signal[i] = 0.5; continue; }

            int orange = 0, total = 0;
            for (int y = top; y <= bot; y++)
            {
                total++;
                if (backOnlyMask.At<byte>(y, xi) > 0) orange++;
            }

            // Signal: 1.0 = fully black (seam), 0.0 = fully orange (tile).
            // Use 0.5 for samples with no data (neutral).
            signal[i] = total > 0 ? 1.0 - (double)orange / total : 0.5;
        }

        return signal;
    }

    // ── Scale estimation ──────────────────────────────────────────

    private static int EstimateScaleFromAutocorrelation(double[] signal)
    {
        int n = signal.Length;

        // Use only central portion (avoid endpoints).
        int cStart = n / 6;
        int cEnd = n - n / 6;
        int cLen = cEnd - cStart;
        if (cLen < 30) return n / 14;

        double mean = 0;
        for (int i = cStart; i < cEnd; i++) mean += signal[i];
        mean /= cLen;

        double[] centered = new double[n];
        for (int i = cStart; i < cEnd; i++) centered[i] = signal[i] - mean;
        for (int i = 0; i < cStart; i++) centered[i] = 0;
        for (int i = cEnd; i < n; i++) centered[i] = 0;

        // Autocorrelation over plausible tile-width range.
        int minLag = Math.Max(5, n / 30);   // ~30 samples minimum
        int maxLag = Math.Min(n / 3, n / 6); // ~150 samples maximum
        double[] ac = new double[maxLag];
        double maxAc = 0;
        int bestLag = n / 14;

        for (int lag = minLag; lag < maxLag; lag++)
        {
            double sum = 0;
            int count = 0;
            for (int i = cStart; i < cEnd - lag; i++)
            {
                sum += centered[i] * centered[i + lag];
                count++;
            }
            if (count > 10)
            {
                ac[lag] = sum / count;
                if (ac[lag] > maxAc)
                {
                    maxAc = ac[lag];
                    bestLag = lag;
                }
            }
        }

        return bestLag;
    }

    // ── Boundary candidate type ───────────────────────────────────

    private sealed record BoundaryCandidate(
        int Index,
        double Prominence,
        double LeftBaseline,
        double RightBaseline,
        double LocalWidth,
        double GapEvidence,  // 0-1, how strong the dark-gap evidence is
        bool IsFromSeam);

    // ── Boundary detection with real local prominence ─────────────

    private static List<BoundaryCandidate> FindBoundaryCandidates(
        double[] occupancy,
        Mat backOnlyMask,
        BackSurfaceGeometry geometry,
        SideHandPlaneFitter.PlaneFitResult plane,
        int w, int h,
        int estimatedTileSamples,
        BackTileInstanceOptions opt)
    {
        int n = occupancy.Length;
        List<BoundaryCandidate> candidates = [];

        // Smooth occupancy for peak finding.
        double[] smooth = SignalHelpers.GaussianSmooth(occupancy, opt.OccupancySmoothSigma);

        // Find local maxima (seams = high signal = dark).
        // But instead of global threshold, use local prominence.
        double noiseFloor = smooth.Min();
        double maxVal = smooth.Max();
        double range = maxVal - noiseFloor;

        // Use a very low initial threshold to catch all candidates.
        double weakThreshold = noiseFloor + range * 0.02;
        List<int> peaks = SignalHelpers.FindPeaks(smooth, weakThreshold);

        // For each peak, compute real local prominence.
        int minSep = Math.Max(2, estimatedTileSamples / 3);
        peaks = SignalHelpers.Nms(peaks, smooth, minSep);

        foreach (int peak in peaks)
        {
            // Find left baseline: lowest point to the left before a higher peak.
            double leftBaseline = FindLeftBaseline(smooth, peak, estimatedTileSamples);

            // Find right baseline: lowest point to the right before a higher peak.
            double rightBaseline = FindRightBaseline(smooth, peak, estimatedTileSamples);

            double prominence = smooth[peak] - Math.Max(leftBaseline, rightBaseline);
            double localWidth = Math.Max(1, estimatedTileSamples);

            // Gap evidence: check the narrow region around the peak in backOnlyMask.
            double gapEvidence = ComputeGapEvidence(backOnlyMask, geometry, plane,
                peak, n, w, h);

            if (prominence > 0)
            {
                candidates.Add(new BoundaryCandidate(
                    peak, prominence, leftBaseline, rightBaseline,
                    localWidth, gapEvidence, IsFromSeam: true));
            }
        }

        // Sort by index.
        candidates.Sort((a, b) => a.Index.CompareTo(b.Index));

        return candidates;
    }

    private static double FindLeftBaseline(double[] smooth, int peak, int window)
    {
        int searchStart = Math.Max(0, peak - window * 2);
        int searchEnd = Math.Max(0, peak - window / 4);
        double minVal = smooth[peak];
        for (int i = searchEnd; i >= searchStart; i--)
        {
            if (smooth[i] < minVal) minVal = smooth[i];
        }
        return minVal;
    }

    private static double FindRightBaseline(double[] smooth, int peak, int window)
    {
        int searchStart = Math.Min(smooth.Length - 1, peak + window / 4);
        int searchEnd = Math.Min(smooth.Length - 1, peak + window * 2);
        double minVal = smooth[peak];
        for (int i = searchStart; i <= searchEnd; i++)
        {
            if (smooth[i] < minVal) minVal = smooth[i];
        }
        return minVal;
    }

    private static double ComputeGapEvidence(
        Mat backOnlyMask,
        BackSurfaceGeometry geometry,
        SideHandPlaneFitter.PlaneFitResult plane,
        int peakIndex, int nSamples, int w, int h)
    {
        // Sample a narrow vertical strip at the peak position.
        double u = (peakIndex + 0.5) / nSamples;
        double x = plane.ColStart + u * (plane.ColEnd - plane.ColStart);
        int xi = Math.Clamp((int)Math.Round(x), 0, w - 1);

        double ridgeY = geometry.RidgeY(xi);
        double railY = geometry.LowerRailY(xi);
        double height = railY - ridgeY;
        if (height < 5) return 0;

        // The geometry lines can fall outside the ROI on degenerate frames;
        // clamp each bound independently and bail when the band is empty.
        int top = Math.Max(0, (int)(ridgeY + height * 0.1));
        int bot = Math.Min(h - 1, (int)(railY - height * 0.1));
        if (bot <= top) return 0;

        int orange = 0, total = 0;
        // Check a few columns around the peak.
        for (int dx = -2; dx <= 2; dx++)
        {
            int xc = Math.Clamp(xi + dx, 0, w - 1);
            for (int y = top; y <= bot; y++)
            {
                total++;
                if (backOnlyMask.At<byte>(y, xc) > 0) orange++;
            }
        }

        // Gap evidence: 1.0 = fully black (strong gap), 0.0 = fully orange.
        return total > 0 ? 1.0 - (double)orange / total : 0;
    }

    // ── Boundary grouping ─────────────────────────────────────────

    private static List<BoundaryCandidate> GroupNearbyBoundaries(
        List<BoundaryCandidate> candidates,
        int estimatedTileSamples,
        BackTileInstanceOptions opt)
    {
        if (candidates.Count <= 1) return candidates;

        // Minimum separation between distinct seams: ~55-70% of local tile width.
        int groupRadius = Math.Max(1, (int)(estimatedTileSamples * 0.55));

        List<BoundaryCandidate> grouped = [];
        int i = 0;
        while (i < candidates.Count)
        {
            // Find all candidates within groupRadius.
            int j = i + 1;
            while (j < candidates.Count &&
                   candidates[j].Index - candidates[i].Index <= groupRadius)
                j++;

            // Keep the one with highest prominence in each group.
            var best = candidates[i];
            for (int k = i + 1; k < j; k++)
            {
                if (candidates[k].Prominence > best.Prominence)
                    best = candidates[k];
                else if (Math.Abs(candidates[k].Prominence - best.Prominence) < 0.01 &&
                         candidates[k].GapEvidence > best.GapEvidence)
                    best = candidates[k];
            }

            // Use the median index (observed gap centre) as the final coordinate.
            var medianIdx = SignalHelpers.Median(
                candidates.Skip(i).Take(j - i).Select(c => (double)c.Index).ToList());
            int finalIdx = (int)Math.Round(medianIdx);

            grouped.Add(best with { Index = finalIdx });
            i = j;
        }

        return grouped;
    }

    // ── Boundary selection (including endpoints) ──────────────────

    private static List<int> SelectBoundaries(
        List<BoundaryCandidate> allBoundaries,
        double[] occupancy,
        int estimatedTileSamples,
        BackTileInstanceOptions opt)
    {
        int n = occupancy.Length;

        // Filter by prominence: use a threshold relative to the median prominence.
        if (allBoundaries.Count == 0) return [0, n - 1];

        double medianProminence = SignalHelpers.Median(
            allBoundaries.Select(b => b.Prominence).ToArray());
        double minProminence = Math.Max(0.01, medianProminence * 0.25);

        var strongBoundaries = allBoundaries
            .Where(b => b.Prominence >= minProminence)
            .Select(b => b.Index)
            .OrderBy(i => i)
            .ToList();

        // ── Find active extent (endpoints from occupancy, not plane edges) ──
        int activeStart = FindActiveStart(occupancy, estimatedTileSamples);
        int activeEnd = FindActiveEnd(occupancy, estimatedTileSamples);

        // Validate active extent is plausible.
        int activeLen = activeEnd - activeStart;
        if (activeLen < estimatedTileSamples * 3)
        {
            // Too narrow — use plane span with padding removed.
            activeStart = estimatedTileSamples / 4;
            activeEnd = n - 1 - estimatedTileSamples / 4;
        }

        // Add boundaries outside active extent to reject list.
        strongBoundaries = strongBoundaries
            .Where(i => i >= activeStart && i <= activeEnd)
            .ToList();

        // ── Build final boundary list ──
        List<int> final = [];

        // Start endpoint: only include activeStart if there's evidence of a tile
        // boundary there (not just plane edge).
        if (IsEndpointValid(occupancy, activeStart, isLeft: true, estimatedTileSamples))
        {
            final.Add(activeStart);
        }

        // Only add a boundary if it has sufficient minimum separation from previous.
        int minSep = Math.Max(2, (int)(estimatedTileSamples * 0.55));
        foreach (int b in strongBoundaries)
        {
            if (final.Count == 0 || b - final[^1] >= minSep)
                final.Add(b);
        }

        // End endpoint: similar validation.
        if (IsEndpointValid(occupancy, activeEnd, isLeft: false, estimatedTileSamples))
        {
            if (final.Count == 0 || activeEnd - final[^1] >= minSep)
                final.Add(activeEnd);
        }

        // Ensure at least start and end.
        if (final.Count == 0)
        {
            final.Add(activeStart);
            final.Add(activeEnd);
        }
        else if (final.Count == 1)
        {
            if (final[0] > n / 2)
                final.Insert(0, activeStart);
            else
                final.Add(activeEnd);
        }

        final.Sort();
        return final;
    }

    private static int FindActiveStart(double[] occupancy, int estTileSamples)
    {
        int n = occupancy.Length;
        // Walk from left until occupancy drops below a threshold for a sustained run.
        double noiseLevel = occupancy.Min();
        double signalRange = occupancy.Max() - noiseLevel;
        double occThreshold = noiseLevel + signalRange * 0.30;

        int runLength = 0;
        for (int i = 0; i < n; i++)
        {
            if (occupancy[i] < occThreshold) // orange (low signal = tile)
            {
                runLength++;
                if (runLength >= estTileSamples / 3)
                    return Math.Max(0, i - runLength);
            }
            else
            {
                runLength = 0;
            }
        }
        return 0;
    }

    private static int FindActiveEnd(double[] occupancy, int estTileSamples)
    {
        int n = occupancy.Length;
        double noiseLevel = occupancy.Min();
        double signalRange = occupancy.Max() - noiseLevel;
        double occThreshold = noiseLevel + signalRange * 0.30;

        int runLength = 0;
        for (int i = n - 1; i >= 0; i--)
        {
            if (occupancy[i] < occThreshold)
            {
                runLength++;
                if (runLength >= estTileSamples / 3)
                    return Math.Min(n - 1, i + runLength);
            }
            else
            {
                runLength = 0;
            }
        }
        return n - 1;
    }

    private static bool IsEndpointValid(
        double[] occupancy, int index, bool isLeft, int estTileSamples)
    {
        int n = occupancy.Length;
        if (index < 0 || index >= n) return false;

        // Check that the region inside the endpoint has plausible tile coverage.
        int checkStart, checkEnd;
        if (isLeft)
        {
            checkStart = index;
            checkEnd = Math.Min(n - 1, index + estTileSamples);
        }
        else
        {
            checkStart = Math.Max(0, index - estTileSamples);
            checkEnd = index;
        }

        if (checkEnd - checkStart < 3) return false;

        double noiseLevel = occupancy.Min();
        double signalRange = occupancy.Max() - noiseLevel;
        double occThreshold = noiseLevel + signalRange * 0.30;

        int orangeSamples = 0, total = 0;
        for (int i = checkStart; i <= checkEnd; i++)
        {
            total++;
            if (occupancy[i] < occThreshold) orangeSamples++;
        }

        double orangeFrac = total > 0 ? (double)orangeSamples / total : 0;
        // Endpoint is valid if the adjacent region has substantial orange (tile) content.
        return orangeFrac >= 0.25;
    }

    // ── Instance construction ────────────────────────────────────

    private static List<BackTileInstance> BuildInstances(
        List<int> boundaries,
        Mat backOnlyMask,
        BackSurfaceGeometry geometry,
        SideHandPlaneFitter.PlaneFitResult plane,
        Rect cropRect,
        Seat seat,
        int frameWidth,
        int frameHeight,
        BackTileInstanceOptions opt)
    {
        int w = backOnlyMask.Cols, h = backOnlyMask.Rows;
        int n = opt.OccupancySamples;
        List<BackTileInstance> instances = [];

        for (int i = 0; i < boundaries.Count - 1; i++)
        {
            int b0 = boundaries[i];
            int b1 = boundaries[i + 1];
            if (b1 - b0 < 2) continue;

            double uLeft = (b0 + 0.5) / n;
            double uRight = (b1 + 0.5) / n;

            // Evaluate ridge and rail at uLeft, uRight.
            double xLeft = plane.ColStart + uLeft * (plane.ColEnd - plane.ColStart);
            double xRight = plane.ColStart + uRight * (plane.ColEnd - plane.ColStart);

            double ridgeYLeft = geometry.RidgeY(xLeft);
            double ridgeYRight = geometry.RidgeY(xRight);
            double railYLeft = geometry.LowerRailY(xLeft);
            double railYRight = geometry.LowerRailY(xRight);

            // Apply corridor inset from ridge and rail.
            double heightL = railYLeft - ridgeYLeft;
            double heightR = railYRight - ridgeYRight;
            double insetTop = opt.CorridorInsetTop;
            double insetBot = opt.CorridorInsetBottom;

            double topLeft = ridgeYLeft + heightL * insetTop;
            double topRight = ridgeYRight + heightR * insetTop;
            double botLeft = railYLeft - heightL * insetBot;
            double botRight = railYRight - heightR * insetBot;

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

            // Compute orange coverage using backOnlyMask.
            double coverage = ComputeCoverage(backOnlyMask, b0, b1, n, plane, w, h);
            double ridgeSupport = CheckSupport(backOnlyMask, b0, b1, geometry, plane, n, w, h, isRidge: true, opt);
            double railSupport = CheckSupport(backOnlyMask, b0, b1, geometry, plane, n, w, h, isRidge: false, opt);

            double confidence = Math.Clamp(
                coverage * 0.5 + (ridgeSupport + railSupport) * 0.25, 0, 1);

            instances.Add(new BackTileInstance(
                uLeft, uRight, quad, coverage,
                ridgeSupport > 0.5, railSupport > 0.5, confidence));
        }

        return instances;
    }

    // ── Coverage and support ───────────────────────────────────────

    private static double ComputeCoverage(
        Mat backOnlyMask,
        int i0, int i1, int nSamples,
        SideHandPlaneFitter.PlaneFitResult plane, int w, int h)
    {
        double u0 = (i0 + 0.5) / nSamples;
        double u1 = (i1 + 0.5) / nSamples;

        int uSteps = 12, tSteps = 6;
        int orange = 0, total = 0;

        for (int i = 0; i < uSteps; i++)
        {
            double u = u0 + (u1 - u0) * (i + 0.5) / uSteps;
            int x = Math.Clamp((int)(plane.ColStart + u * (plane.ColEnd - plane.ColStart)), 0, w - 1);

            int colTop = -1, colBot = -1;
            for (int y = 0; y < h; y++)
            {
                if (backOnlyMask.At<byte>(y, x) > 0)
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
                    if (backOnlyMask.At<byte>(y, x) > 0) orange++;
                }
            }
        }

        return total > 0 ? (double)orange / total : 0;
    }

    private static double CheckSupport(
        Mat backOnlyMask, int i0, int i1,
        BackSurfaceGeometry geometry,
        SideHandPlaneFitter.PlaneFitResult plane,
        int nSamples, int w, int h,
        bool isRidge, BackTileInstanceOptions opt)
    {
        double u0 = (i0 + 0.5) / nSamples;
        double u1 = (i1 + 0.5) / nSamples;

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

            // The detected ridge/rail lines can fall outside the ROI on
            // degenerate frames (hand animating, partial occlusion).  Skip the
            // column when the sample band has no overlap with the image.
            int bandTop, bandBot;
            if (isRidge)
            {
                // Sample the upper portion of the corridor, starting just
                // inside the ridge boundary (past the corridor inset).
                bandTop = (int)ridgeY + 2;
                bandBot = (int)(ridgeY + height * 0.30);
            }
            else
            {
                // Sample the lower portion of the corridor, ending just
                // inside the rail boundary.
                bandTop = (int)(railY - height * 0.30);
                bandBot = (int)railY - 2;
            }

            if (bandBot <= bandTop) continue;
            int y0 = Math.Max(0, bandTop);
            int y1 = Math.Min(h - 1, bandBot);
            if (y1 <= y0) continue; // band lies entirely outside the image
            for (int y = y0; y <= y1; y++)
            {
                total++;
                if (backOnlyMask.At<byte>(y, xi) > 0) orange++;
            }
        }

        return total > 0 ? (double)orange / total : 0;
    }

    // ── Post-processing ────────────────────────────────────────────

    private static List<BackTileInstance> PostProcess(
        List<BackTileInstance> instances,
        double[] occupancy,
        int estimatedTileSamples,
        List<BoundaryCandidate> allBoundaries,
        BackTileInstanceOptions opt)
    {
        if (instances.Count == 0) return instances;

        // Estimate local tile width from boundary spacing rather than instance widths.
        // This breaks the circular dependency.
        double expectedWidth = (double)estimatedTileSamples / opt.OccupancySamples;

        // Refine with the strongest boundary candidates.
        if (allBoundaries.Count >= 3)
        {
            // Use median spacing between strong boundaries.
            var strong = allBoundaries
                .Where(b => b.Prominence > 0)
                .OrderBy(b => b.Index)
                .ToList();
            if (strong.Count >= 3)
            {
                var spacings = new List<double>();
                for (int si = 1; si < strong.Count; si++)
                {
                    double s = (double)(strong[si].Index - strong[si - 1].Index) / opt.OccupancySamples;
                    if (s > expectedWidth * 0.3 && s < expectedWidth * 2.0)
                        spacings.Add(s);
                }
                if (spacings.Count > 0)
                {
                    double medianSpacing = SignalHelpers.Median(spacings);
                    expectedWidth = medianSpacing > 0 ? medianSpacing : expectedWidth;
                }
            }
        }

        List<BackTileInstance> result = new(instances.Count);
        int i = 0;

        while (i < instances.Count)
        {
            var inst = instances[i];

            // ── Split under-segmented (merged) regions ──────────
            if (inst.Width > expectedWidth * 1.55)
            {
                var split = TrySplit(inst, instances, i, occupancy, expectedWidth, opt);
                if (split is not null)
                {
                    result.AddRange(split);
                    i++;
                    continue;
                }
            }

            // ── Merge over-segmented (fragmented) regions ──────
            if (i < instances.Count - 1)
            {
                var merged = TryMerge(inst, instances[i + 1], expectedWidth, opt);
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

        return result;
    }

    private static List<BackTileInstance>? TrySplit(
        BackTileInstance inst,
        List<BackTileInstance> all,
        int index,
        double[] occupancy,
        double expectedWidth,
        BackTileInstanceOptions opt)
    {
        int n = occupancy.Length;
        int i0 = Math.Clamp((int)(inst.ULeft * n), 0, n - 1);
        int i1 = Math.Clamp((int)(inst.URight * n), i0 + 2, n - 1);
        if (i1 - i0 < 6) return null;

        // Search for the deepest local minimum in the middle portion.
        int bestI = -1;
        double bestVal = double.MaxValue;
        double range = occupancy.Max() - occupancy.Min();
        double threshold = occupancy.Min() + range * opt.SplitMinInternalContrast;

        // Also check local prominence at candidates.
        for (int j = i0 + 3; j < i1 - 3; j++)
        {
            if (occupancy[j] < threshold &&
                occupancy[j] < occupancy[j - 1] &&
                occupancy[j] <= occupancy[j + 1] &&
                occupancy[j] < bestVal)
            {
                // Check local prominence.
                double leftMin = double.MaxValue;
                for (int k = Math.Max(0, j - 5); k < j; k++)
                    if (occupancy[k] < leftMin) leftMin = occupancy[k];
                double rightMin = double.MaxValue;
                for (int k = j + 1; k < Math.Min(n, j + 6); k++)
                    if (occupancy[k] < rightMin) rightMin = occupancy[k];

                double prominence = occupancy[j] - Math.Max(leftMin, rightMin);
                if (prominence > range * 0.05)
                {
                    bestVal = occupancy[j];
                    bestI = j;
                }
            }
        }

        if (bestI < 0) return null;

        double splitU = (bestI + 0.5) / n;
        double w1 = splitU - inst.ULeft;
        double w2 = inst.URight - splitU;

        // Split must produce two reasonable-width instances.
        if (w1 < expectedWidth * 0.35 || w2 < expectedWidth * 0.35)
            return null;

        // Rebuild both quads with proper boundaries.
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
        double expectedWidth, BackTileInstanceOptions opt)
    {
        double gapWidth = right.ULeft - left.URight;
        if (gapWidth < 0 || gapWidth > expectedWidth * opt.MergeMaxGapWidth)
            return null;

        double combinedWidth = right.URight - left.ULeft;
        if (combinedWidth > expectedWidth * 1.4)
            return null;

        // Recompute: average coverage, recompute quad from combined boundaries.
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
