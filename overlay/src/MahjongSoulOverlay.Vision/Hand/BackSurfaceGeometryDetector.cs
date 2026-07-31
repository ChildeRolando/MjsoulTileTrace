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
///
/// The detector:
///   1. Converts BGR → Lab, extracts the L channel.
///   2. For each column within the coarse hand span, searches for the
///      strongest local L contrast within the orange vertical run.
///   3. Infers a globally consistent contrast sign from reliable columns.
///   4. Fits a RANSAC line through accepted ridge candidates.
///   5. Scores both sides of the ridge and selects the back-surface side.
///   6. Detects the lower rail as a coherent boundary of the back surface.
/// </summary>
public static class BackSurfaceGeometryDetector
{
    private static readonly BackSurfaceGeometryOptions Defaults = new();

    /// <summary>
    /// Detects back-surface geometry from the rotated BGR ROI and broad orange mask.
    /// Returns a complete detection result including masks and diagnostic candidates.
    /// </summary>
    public static BackSurfaceDetectionResult? Detect(
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

        // ── 2. Convert BGR → Lab, extract L channel ─────────────
        using Mat lab = new Mat();
        Cv2.CvtColor(rotatedBgr, lab, ColorConversionCodes.BGR2Lab);
        using Mat lChannel = new Mat();
        Cv2.ExtractChannel(lab, lChannel, 0);

        // Smooth L channel for stable gradient computation.
        using Mat lSmooth = new Mat();
        Cv2.GaussianBlur(lChannel, lSmooth, new Size(1, 3), 1.0);

        // Compute vertical gradient (horizontal edges in the image).
        using Mat gradY = new Mat();
        Cv2.Sobel(lSmooth, gradY, MatType.CV_32F, 0, 1, ksize: 3);

        // ── 3. Collect ridge candidates from gradient peaks ─────
        List<RidgeCandidate> allCandidates = [];
        CollectRidgeCandidatesGradient(gradY, lChannel, rawOrangeMask, plane,
            colStart, colEnd, opt, allCandidates);

        if (allCandidates.Count < opt.MinCandidatePoints)
        {
            if (previousStable is { } prev &&
                IsGeometryCompatible(prev, colStart, colEnd, h))
            {
                return BuildFallbackResult(prev, rawOrangeMask, allCandidates, opt);
            }
            return null;
        }

        // ── 4. Infer dominant contrast sign ──────────────────────
        int dominantSign = InferContrastSign(allCandidates, opt);
        if (dominantSign == 0)
        {
            if (previousStable is { } prev2)
                return BuildFallbackResult(prev2, rawOrangeMask, allCandidates, opt);
            return null;
        }

        // ── 5. Select candidates matching dominant sign ──────────
        var accepted = new List<RidgeCandidate>();
        var rejected = new List<RidgeCandidate>();
        foreach (var c in allCandidates)
        {
            if (Math.Sign(c.SignedContrast) == dominantSign &&
                Math.Abs(c.SignedContrast) >= opt.MinContrast &&
                c.OrangeSupportAbove >= opt.MinOrangeSupportFraction &&
                c.OrangeSupportBelow >= opt.MinOrangeSupportFraction)
            {
                accepted.Add(c with { Accepted = true });
            }
            else
            {
                string reason = Math.Sign(c.SignedContrast) != dominantSign
                    ? "Wrong contrast sign"
                    : Math.Abs(c.SignedContrast) < opt.MinContrast
                        ? "Below min contrast"
                        : c.OrangeSupportAbove < opt.MinOrangeSupportFraction
                            ? "Insufficient orange above"
                            : "Insufficient orange below";
                rejected.Add(c with { Accepted = false, RejectionReason = reason });
            }
        }

        if (accepted.Count < opt.MinCandidatePoints)
        {
            if (previousStable is { } prev3 &&
                IsGeometryCompatible(prev3, colStart, colEnd, h))
            {
                return BuildFallbackResult(prev3, rawOrangeMask,
                    accepted.Concat(rejected).ToList(), opt);
            }
            return null;
        }

        // ── 6. RANSAC ridge line fit ─────────────────────────────
        var ridgePoints = accepted.Select(c => new Point2d(c.X, c.Y)).ToList();
        var ridgeFit = RansacLineFit(ridgePoints, h, opt);
        if (ridgeFit is not { } ridgeLine)
        {
            if (previousStable is { } prev4)
                return BuildFallbackResult(prev4, rawOrangeMask,
                    accepted.Concat(rejected).ToList(), opt);
            return null;
        }

        int ridgeInliers = CountInliers(ridgePoints, ridgeLine, opt.RansacInlierPx);
        double ridgeInlierFrac = (double)ridgeInliers / ridgePoints.Count;
        if (ridgeInlierFrac < opt.MinInlierFraction)
        {
            if (previousStable is { } prev5)
                return BuildFallbackResult(prev5, rawOrangeMask,
                    accepted.Concat(rejected).ToList(), opt);
            return null;
        }

        // Compute ridge residual.
        double ridgeResidual = 0;
        foreach (var p in ridgePoints)
            ridgeResidual += Math.Abs(ridgeLine.Item0 * p.X + ridgeLine.Item1 * p.Y + ridgeLine.Item2);
        ridgeResidual /= ridgePoints.Count;

        // ── 7. Score both sides and select back surface ──────────
        var sideScore = ScoreSides(rawOrangeMask, ridgeLine, plane, colStart, colEnd, w, h, opt);
        BackSurfaceSide selectedSide = sideScore.Side;

        // ── 8. Detect lower rail ─────────────────────────────────
        var railResult = DetectLowerRail(rawOrangeMask, ridgeLine, plane,
            colStart, colEnd, selectedSide, h, opt);
        Vec4d? railLineOpt = railResult.Line;
        int railInliers = railResult.Inliers;

        if (!railLineOpt.HasValue)
        {
            if (previousStable is { } prev6)
                return BuildFallbackResult(prev6, rawOrangeMask,
                    accepted.Concat(rejected).ToList(), opt);
            return null;
        }
        Vec4d railLine = railLineOpt.Value;

        // ── 9. Validate geometry ─────────────────────────────────
        double totalBackHeight = 0;
        int heightSamples = 0;
        int badColumns = 0;
        int totalChecked = 0;
        for (int x = colStart; x <= colEnd; x += Math.Max(1, (colEnd - colStart) / 20))
        {
            double rY = -(ridgeLine.Item0 * x + ridgeLine.Item2) / ridgeLine.Item1;
            double lY = -(railLine.Item0 * x + railLine.Item2) / railLine.Item1;
            double bh = selectedSide == BackSurfaceSide.BottomOfRidge
                ? lY - rY
                : rY - lY;
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
        if (badColumns > totalChecked * 0.15 || heightSamples < 3)
        {
            if (previousStable is { } prev7)
                return BuildFallbackResult(prev7, rawOrangeMask,
                    accepted.Concat(rejected).ToList(), opt);
            return null;
        }

        // ── 10. Build geometry ───────────────────────────────────
        double railInlierFrac = railResult.TotalPoints > 0
            ? (double)railInliers / railResult.TotalPoints
            : 0;
        double confidence = Math.Clamp(
            ridgeInlierFrac * 0.55 + railInlierFrac * 0.35 + 0.10, 0, 1);

        var geometry = new BackSurfaceGeometry(
            ridgeLine, railLine,
            colStart, colEnd,
            dominantSign,
            confidence,
            ridgeInliers, railInliers,
            ridgeResidual,
            meanBackHeight);

        // ── 11. Build corridor and back-only masks ───────────────
        Mat corridorMask = BuildCorridorMask(
            w, h, ridgeLine, railLine, selectedSide, opt);
        Mat backOnlyMask = new Mat();
        Cv2.BitwiseAnd(rawOrangeMask, corridorMask, backOnlyMask);

        var allCandidatesOut = accepted.Concat(rejected).ToList();

        return new BackSurfaceDetectionResult(
            geometry, corridorMask, backOnlyMask,
            allCandidatesOut, selectedSide, confidence);
    }

    // ── Candidate collection ─────────────────────────────────────

    private static void CollectRidgeCandidatesGradient(
        Mat gradY,
        Mat lChannel,
        Mat rawOrangeMask,
        SideHandPlaneFitter.PlaneFitResult plane,
        int colStart, int colEnd,
        BackSurfaceGeometryOptions opt,
        List<RidgeCandidate> candidates)
    {
        int h = rawOrangeMask.Rows;
        int halfWin = opt.ContrastWindowRadius;

        for (int x = colStart; x <= colEnd; x++)
        {
            // Find orange vertical run for this column.
            int topOrange = -1, botOrange = -1;
            for (int y = 0; y < h; y++)
            {
                if (rawOrangeMask.At<byte>(y, x) > 0)
                {
                    if (topOrange < 0) topOrange = y;
                    botOrange = y;
                }
            }
            if (topOrange < 0) continue;

            int orangeHt = botOrange - topOrange + 1;
            if (orangeHt < h * 0.04) continue;

            // Search within internal band: avoid exterior silhouette and lower transition.
            int searchStart = topOrange + Math.Max(2, (int)(orangeHt * 0.15));
            int searchEnd = topOrange + Math.Min(orangeHt - 2, (int)(orangeHt * 0.50));

            if (searchEnd - searchStart < 3) continue;

            // Find the gradient peak in this band with orange support on both sides.
            int bestY = -1;
            float bestAbsGrad = 0;
            double bestAboveSupport = 0, bestBelowSupport = 0;

            for (int y = searchStart; y <= searchEnd; y++)
            {
                float gVal = gradY.At<float>(y, x);
                float absGrad = Math.Abs(gVal);

                int aS = Math.Max(0, y - halfWin);
                int aE = y - 1;
                int bS = y;
                int bE = Math.Min(h - 1, y + halfWin - 1);

                if (aE - aS < 2 || bE - bS < 2) continue;

                int aboveO = 0, belowO = 0;
                for (int yy = aS; yy <= aE; yy++)
                    if (rawOrangeMask.At<byte>(yy, x) > 0) aboveO++;
                for (int yy = bS; yy <= bE; yy++)
                    if (rawOrangeMask.At<byte>(yy, x) > 0) belowO++;

                double aboveFrac = (double)aboveO / (aE - aS + 1);
                double belowFrac = (double)belowO / (bE - bS + 1);

                if (aboveFrac < 0.10 || belowFrac < 0.10) continue;

                if (absGrad > bestAbsGrad)
                {
                    bestAbsGrad = absGrad;
                    bestY = y;
                    bestAboveSupport = aboveFrac;
                    bestBelowSupport = belowFrac;
                }
            }

            if (bestY < 0) continue;

            double aboveMed = WindowMedian(lChannel, x,
                Math.Max(0, bestY - halfWin), bestY - 1);
            double belowMed = WindowMedian(lChannel, x,
                bestY, Math.Min(h - 1, bestY + halfWin - 1));
            double mad = WindowMad(lChannel, x,
                Math.Max(0, bestY - halfWin), Math.Min(h - 1, bestY + halfWin - 1));
            double signedContrast = (aboveMed - belowMed) / (mad + opt.ContrastMadEpsilon);

            candidates.Add(new RidgeCandidate
            {
                X = x,
                Y = bestY,
                SignedContrast = signedContrast,
                OrangeSupportAbove = bestAboveSupport,
                OrangeSupportBelow = bestBelowSupport,
                Accepted = false,
                RejectionReason = null,
            });
        }
    }

    // ── Contrast sign inference ──────────────────────────────────

    private static int InferContrastSign(
        List<RidgeCandidate> candidates,
        BackSurfaceGeometryOptions opt)
    {
        // Collect strong candidates of each sign.
        double strongThreshold = opt.MinContrast * 0.5;
        var posCands = candidates
            .Where(c => c.SignedContrast > strongThreshold)
            .OrderBy(c => c.X).ToList();
        var negCands = candidates
            .Where(c => c.SignedContrast < -strongThreshold)
            .OrderBy(c => c.X).ToList();

        // Score each sign: count + spatial continuity bonus.
        double ScoreSign(List<RidgeCandidate> cands)
        {
            if (cands.Count == 0) return 0;
            double continuity = 0;
            for (int i = 1; i < cands.Count; i++)
            {
                int gap = cands[i].X - cands[i - 1].X;
                if (gap <= 3) continuity += 1.0;
                else if (gap <= 10) continuity += 0.5;
            }
            return cands.Count + continuity * 2.0;
        }

        double posScore = ScoreSign(posCands);
        double negScore = ScoreSign(negCands);

        if (posScore > negScore * 1.3) return +1;
        if (negScore > posScore * 1.3) return -1;

        // If scores are close, prefer the sign with more candidates.
        if (posCands.Count > negCands.Count) return +1;
        if (negCands.Count > posCands.Count) return -1;

        // Default: positive (top brighter than back).
        return +1;
    }

    // ── Side scoring ─────────────────────────────────────────────

    private sealed record SideScoreResult(BackSurfaceSide Side, double Score);

    private static SideScoreResult ScoreSides(
        Mat rawOrangeMask,
        Vec4d ridgeLine,
        SideHandPlaneFitter.PlaneFitResult plane,
        int colStart, int colEnd,
        int w, int h,
        BackSurfaceGeometryOptions opt)
    {
        // Score side A: above ridge (top surface).
        double scoreA = ScoreOneSide(rawOrangeMask, ridgeLine, plane,
            colStart, colEnd, w, h, isAbove: true);

        // Score side B: below ridge (back surface).
        double scoreB = ScoreOneSide(rawOrangeMask, ridgeLine, plane,
            colStart, colEnd, w, h, isAbove: false);

        // The back surface is typically below the ridge (darker back faces).
        // The game's fixed camera angle consistently places the back surface
        // below the ridge in rotated coordinates.
        // Prefer BottomOfRidge unless TopOfRidge scores significantly higher.
        if (scoreB >= scoreA * 0.5)
            return new SideScoreResult(BackSurfaceSide.BottomOfRidge, scoreB);
        else
            return new SideScoreResult(BackSurfaceSide.TopOfRidge, scoreA);
    }

    private static double ScoreOneSide(
        Mat rawOrangeMask,
        Vec4d ridgeLine,
        SideHandPlaneFitter.PlaneFitResult plane,
        int colStart, int colEnd,
        int w, int h,
        bool isAbove)
    {
        int nSamples = 600;
        double[] occupancy = new double[nSamples];
        int validSamples = 0;

        for (int i = 0; i < nSamples; i++)
        {
            double u = (i + 0.5) / nSamples;
            double x = colStart + u * (colEnd - colStart);
            int xi = Math.Clamp((int)Math.Round(x), 0, w - 1);

            double ridgeY = -(ridgeLine.Item0 * xi + ridgeLine.Item2) / ridgeLine.Item1;

            double ux = (double)(xi - colStart) / Math.Max(1, colEnd - colStart);
            double planeTopY = plane.TopStartY + ux * (plane.TopEndY - plane.TopStartY);
            double planeBotY = plane.BottomStartY + ux * (plane.BottomEndY - plane.BottomStartY);

            int top, bot;
            if (isAbove)
            {
                top = Math.Clamp((int)planeTopY, 0, h - 1);
                bot = Math.Clamp((int)ridgeY, top + 2, h - 1);
            }
            else
            {
                top = Math.Clamp((int)ridgeY, 0, h - 1);
                bot = Math.Clamp((int)planeBotY, top + 2, h - 1);
            }

            if (bot - top < 5) continue;

            int orange = 0, total = 0;
            int inset = Math.Max(1, (bot - top) / 10);
            for (int y = top + inset; y <= bot - inset; y++)
            {
                total++;
                if (rawOrangeMask.At<byte>(y, xi) > 0) orange++;
            }

            if (total > 0)
            {
                occupancy[i] = 1.0 - (double)orange / total;
                validSamples++;
            }
        }

        if (validSamples < 20) return 0;

        // Score based on seam structure:
        // 1. Variance of the occupancy signal (high variance = strong seams).
        // 2. Peak-to-valley depth of the strongest 5 valley/peak pairs.
        double meanOcc = occupancy.Where(o => o > 0).DefaultIfEmpty(0).Average();
        double variance = 0;
        int varCount = 0;
        for (int i = 0; i < nSamples; i++)
        {
            if (occupancy[i] >= 0)
            {
                double diff = occupancy[i] - meanOcc;
                variance += diff * diff;
                varCount++;
            }
        }
        variance = varCount > 0 ? variance / varCount : 0;
        double stdScore = Math.Sqrt(variance); // 0 to ~0.5

        // Find the 3 strongest peaks in the smoothed signal.
        double[] smooth = SignalHelpers.GaussianSmooth(occupancy, 2.0);
        double[] validOcc = occupancy.Where(o => o >= 0).ToArray();
        double noiseFloor = validOcc.Length > 0 ? validOcc.Min() : 0;
        double maxVal = validOcc.Length > 0 ? validOcc.Max() : 0;
        double range = maxVal - noiseFloor;

        if (range < 0.05) return stdScore * 0.5; // no meaningful structure

        var peaks = SignalHelpers.FindPeaks(smooth, noiseFloor + range * 0.15);
        if (peaks.Count < 2) return stdScore * 0.3;

        // Measure average peak prominence.
        double totalProminence = 0;
        int promCount = 0;
        foreach (int p in peaks)
        {
            // Local left baseline.
            double leftMin = smooth[p];
            for (int j = Math.Max(0, p - 30); j < p; j++)
                if (smooth[j] < leftMin) leftMin = smooth[j];
            // Local right baseline.
            double rightMin = smooth[p];
            for (int j = p + 1; j < Math.Min(smooth.Length, p + 31); j++)
                if (smooth[j] < rightMin) rightMin = smooth[j];

            double prominence = smooth[p] - Math.Max(leftMin, rightMin);
            if (prominence > 0)
            {
                totalProminence += prominence;
                promCount++;
            }
        }

        double avgProminence = promCount > 0 ? totalProminence / promCount : 0;
        double peakScore = Math.Min(1.0, avgProminence / 0.15); // Normalize

        // Also: average orange coverage (higher for back surface, lower if dominated by seams).
        double avgCoverage = validSamples > 0 ? 1.0 - meanOcc : 0;

        // Height score: prefer taller regions.
        double avgHeight = 0;
        int heightCount = 0;
        for (int i = 0; i < nSamples; i++)
        {
            if (occupancy[i] >= 0)
            {
                double u = (i + 0.5) / nSamples;
                double x = colStart + u * (colEnd - colStart);
                int xi = Math.Clamp((int)Math.Round(x), 0, w - 1);
                double rY = -(ridgeLine.Item0 * xi + ridgeLine.Item2) / ridgeLine.Item1;
                double ux2 = (double)(xi - colStart) / Math.Max(1, colEnd - colStart);
                double pTop = plane.TopStartY + ux2 * (plane.TopEndY - plane.TopStartY);
                double pBot = plane.BottomStartY + ux2 * (plane.BottomEndY - plane.BottomStartY);
                double ht = isAbove ? rY - pTop : pBot - rY;
                avgHeight += ht;
                heightCount++;
            }
        }
        double heightScore = heightCount > 0
            ? Math.Min(1.0, (avgHeight / heightCount) / (h * 0.15))
            : 0;

        // Combine: strong peaks + high variance + good coverage + plausible height.
        return peakScore * 0.35 + stdScore * 0.25 + avgCoverage * 0.20 + heightScore * 0.20;
    }

    // ── Lower rail detection ─────────────────────────────────────

    private sealed record RailResult(Vec4d? Line, int Inliers, int TotalPoints);

    private static RailResult DetectLowerRail(
        Mat rawOrangeMask,
        Vec4d ridgeLine,
        SideHandPlaneFitter.PlaneFitResult plane,
        int colStart, int colEnd,
        BackSurfaceSide selectedSide,
        int h,
        BackSurfaceGeometryOptions opt)
    {
        // Trim unreliable endpoints before fitting.
        int trimPixels = Math.Max(3, (int)((colEnd - colStart) * opt.RailEndTrimFraction));
        int railStart = colStart + trimPixels;
        int railEnd = colEnd - trimPixels;
        if (railEnd - railStart < opt.MinCandidatePoints / 2)
        { railStart = colStart; railEnd = colEnd; }

        List<Point2d> railPoints = [];

        for (int x = railStart; x <= railEnd; x++)
        {
            double rY = -(ridgeLine.Item0 * x + ridgeLine.Item2) / ridgeLine.Item1;

            double ux = (double)(x - colStart) / Math.Max(1, colEnd - colStart);
            double planeBotY = plane.BottomStartY + ux * (plane.BottomEndY - plane.BottomStartY);

            if (selectedSide == BackSurfaceSide.BottomOfRidge)
            {
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
            else
            {
                // Back surface is above the ridge (unusual but supported).
                double planeTopY = plane.TopStartY + ux * (plane.TopEndY - plane.TopStartY);
                int topY = -1;
                int searchStart = Math.Max(0, (int)(planeTopY - h * 0.08));
                int searchEnd = Math.Min((int)rY - 2, (int)(planeTopY + h * 0.25));
                for (int y = searchStart; y <= searchEnd; y++)
                {
                    if (rawOrangeMask.At<byte>(y, x) > 0)
                    {
                        topY = y;
                        break;
                    }
                }
                if (topY >= 0 && rY - topY > h * opt.MinBackHeightFraction)
                    railPoints.Add(new Point2d(x, topY));
            }
        }

        if (railPoints.Count < opt.MinCandidatePoints / 2)
            return new RailResult(null, 0, railPoints.Count);

        var fit = RansacLineFit(railPoints, h, opt);
        int inliers = fit is { } line ? CountInliers(railPoints, line, opt.RansacInlierPx) : 0;

        return new RailResult(fit, inliers, railPoints.Count);
    }

    // ── Corridor mask builder ─────────────────────────────────────

    private static Mat BuildCorridorMask(
        int w, int h,
        Vec4d ridge, Vec4d rail,
        BackSurfaceSide selectedSide,
        BackSurfaceGeometryOptions opt)
    {
        Mat mask = new Mat(h, w, MatType.CV_8UC1, Scalar.Black);
        double insetFraction = 0.05; // small inset to avoid anti-aliasing at boundaries

        for (int x = 0; x < w; x++)
        {
            double ridgeY = -(ridge.Item0 * x + ridge.Item2) / ridge.Item1;
            double railY = -(rail.Item0 * x + rail.Item2) / rail.Item1;

            double top, bot;
            if (selectedSide == BackSurfaceSide.BottomOfRidge)
            {
                top = ridgeY;
                bot = railY;
            }
            else
            {
                top = railY;
                bot = ridgeY;
            }

            if (bot <= top) continue;

            double height = bot - top;
            int y0 = Math.Clamp((int)Math.Ceiling(top + height * insetFraction), 0, h - 1);
            int y1 = Math.Clamp((int)Math.Floor(bot - height * insetFraction), y0 + 1, h);

            for (int y = y0; y < y1; y++)
                mask.At<byte>(y, x) = 255;
        }
        return mask;
    }

    // ── Helpers ──────────────────────────────────────────────────

    private static double WindowMedian(Mat lChannel, int x, int yStart, int yEnd)
    {
        yStart = Math.Max(0, yStart);
        yEnd = Math.Min(lChannel.Rows - 1, yEnd);
        if (yEnd < yStart) return 0;

        int len = yEnd - yStart + 1;
        byte[] vals = new byte[len];
        for (int i = 0; i < len; i++)
            vals[i] = lChannel.At<byte>(yStart + i, x);
        Array.Sort(vals);
        int m = len / 2;
        return len % 2 == 1 ? vals[m] : (vals[m - 1] + vals[m]) * 0.5;
    }

    private static double WindowMad(Mat lChannel, int x, int yStart, int yEnd)
    {
        yStart = Math.Max(0, yStart);
        yEnd = Math.Min(lChannel.Rows - 1, yEnd);
        if (yEnd <= yStart) return 1.0;

        int len = yEnd - yStart + 1;
        byte[] vals = new byte[len];
        for (int i = 0; i < len; i++)
            vals[i] = lChannel.At<byte>(yStart + i, x);

        // Median.
        byte[] sorted = (byte[])vals.Clone();
        Array.Sort(sorted);
        int m = len / 2;
        double median = len % 2 == 1 ? sorted[m] : (sorted[m - 1] + sorted[m]) * 0.5;

        // MAD.
        double[] absDevs = vals.Select(v => Math.Abs(v - median)).ToArray();
        Array.Sort(absDevs);
        return len % 2 == 1 ? absDevs[m] : (absDevs[m - 1] + absDevs[m]) * 0.5;
    }

    private static bool IsGeometryCompatible(
        BackSurfaceGeometry prev,
        int colStart, int colEnd,
        int h)
    {
        if (prev.ValidStart < 0 || prev.ValidEnd <= prev.ValidStart) return false;
        // Check that the previous geometry's span overlaps with the current span.
        int overlapStart = Math.Max(prev.ValidStart, colStart);
        int overlapEnd = Math.Min(prev.ValidEnd, colEnd);
        double overlapFrac = (double)(overlapEnd - overlapStart) / (colEnd - colStart);
        return overlapFrac >= 0.5 && prev.MeanBackHeight >= h * 0.02;
    }

    private static BackSurfaceDetectionResult? BuildFallbackResult(
        BackSurfaceGeometry prevGeometry,
        Mat rawOrangeMask,
        List<RidgeCandidate> candidates,
        BackSurfaceGeometryOptions opt)
    {
        int w = rawOrangeMask.Cols, h = rawOrangeMask.Rows;
        var selectedSide = BackSurfaceSide.BottomOfRidge;

        Mat corridorMask = BuildCorridorMask(
            w, h, prevGeometry.RidgeLine, prevGeometry.LowerRailLine,
            selectedSide, opt);
        Mat backOnlyMask = new Mat();
        Cv2.BitwiseAnd(rawOrangeMask, corridorMask, backOnlyMask);

        return new BackSurfaceDetectionResult(
            new BackSurfaceGeometry(
                prevGeometry.RidgeLine, prevGeometry.LowerRailLine,
                prevGeometry.ValidStart, prevGeometry.ValidEnd,
                prevGeometry.ContrastSign,
                prevGeometry.Confidence * 0.7,
                prevGeometry.RidgeInliers, prevGeometry.LowerRailInliers,
                prevGeometry.NormalizedResidual, prevGeometry.MeanBackHeight),
            corridorMask, backOnlyMask,
            candidates, selectedSide,
            prevGeometry.Confidence * 0.7);
    }

    // ── RANSAC ───────────────────────────────────────────────────

    private static double LocalMedian(byte[] values, int start, int end)
    {
        int len = end - start + 1;
        if (len <= 0) return 0;
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
