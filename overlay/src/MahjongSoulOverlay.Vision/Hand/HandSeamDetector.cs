using MahjongSoulOverlay.Core.Domain;
using OpenCvSharp;

namespace MahjongSoulOverlay.Vision.Hand;

/// <summary>
/// CALIBRATION-ONLY seam detector.  Finds the 12 internal seams of a stable
/// 13-tile side hand from the raw orange-back mask using u-parameter cross-
/// section scans.  The result is used to build a <see cref="SideHandCalibration"/>.
///
/// This class must NOT be used for runtime tile counting.
/// </summary>
public static class HandSeamDetector
{
    /// <summary>Number of u-samples along the band length.</summary>
    private const int SampleCount = 900;

    /// <summary>Number of cross-samples along each u-line (top→bottom).</summary>
    private const int CrossSamples = 24;

    /// <summary>Margin from top/bottom edges to exclude outline artefacts.</summary>
    private const double EdgeMargin = 0.18;

    /// <summary>Sigma for 1-D Gaussian smoothing of gap signal.</summary>
    private const double SmoothSigma = 1.0;

    /// <summary>
    /// Seam positions expressed as u-parameters in [0, 1] along the band,
    /// plus the corresponding pixel coordinates in the rotated ROI.
    /// </summary>
    public sealed record SeamDetection(
        IReadOnlyList<double> SeamU,   // 12 internal seams as u ∈ [0,1]
        IReadOnlyList<Point2f> SeamTop,
        IReadOnlyList<Point2f> SeamBottom,
        double PitchU,
        double[] GapSignal,
        double Confidence);

    /// <summary>
    /// Detects the 12 internal tile seams from the raw mask using
    /// cross-section scans along the fitted trapezoid.
    /// </summary>
    /// <param name="rawMask">Raw binary orange-back mask (CV_8UC1).
    /// Must NOT be morphologically closed — seams are the black gaps.</param>
    /// <param name="plane">Plane fit result giving column span and
    /// top/bottom boundary lines in rotated-ROI coordinates.</param>
    /// <returns>Detected seams, or null if too few peaks found.</returns>
    public static SeamDetection? Detect(
        Mat rawMask,
        SideHandPlaneFitter.PlaneFitResult plane)
    {
        ArgumentNullException.ThrowIfNull(rawMask);
        ArgumentNullException.ThrowIfNull(plane);

        int w = rawMask.Cols, h = rawMask.Rows;

        // ── 1. Map plane geometry to pixel coordinates ──────────────
        Point2f Top(double u) => new(
            (float)(plane.ColStart + u * (plane.ColEnd - plane.ColStart)),
            (float)(plane.TopStartY + u * (plane.TopEndY - plane.TopStartY)));

        Point2f Bottom(double u) => new(
            (float)(plane.ColStart + u * (plane.ColEnd - plane.ColStart)),
            (float)(plane.BottomStartY + u * (plane.BottomEndY - plane.BottomStartY)));

        // ── 2. Compute gap signal along u ──────────────────────────
        double[] gapSignal = new double[SampleCount];

        for (int i = 0; i < SampleCount; i++)
        {
            double u = (i + 0.5) / SampleCount;
            Point2f top = Top(u);
            Point2f bot = Bottom(u);

            int foreground = 0;
            int valid = 0;

            for (int j = 0; j < CrossSamples; j++)
            {
                double t = EdgeMargin + (1.0 - 2.0 * EdgeMargin) *
                    (j + 0.5) / CrossSamples;

                float px = top.X + (float)((bot.X - top.X) * t);
                float py = top.Y + (float)((bot.Y - top.Y) * t);

                int x = (int)Math.Round(px);
                int y = (int)Math.Round(py);

                if (x < 0 || x >= w || y < 0 || y >= h)
                    continue;

                if (rawMask.At<byte>(y, x) > 0)
                    foreground++;
                valid++;
            }

            // gapSignal: 1.0 = all black (seam), 0.0 = all orange (tile back).
            gapSignal[i] = valid > 0 ? 1.0 - foreground / (double)valid : 0;
        }

        // ── 3. Smooth gap signal ───────────────────────────────────
        double[] smoothed = GaussianSmooth(gapSignal, SmoothSigma);

        // ── 4. Find peaks (seams) ──────────────────────────────────
        double noiseFloor = smoothed.Min();
        double maxVal = smoothed.Max();
        double threshold = noiseFloor + (maxVal - noiseFloor) * 0.12;

        // Find all local maxima above threshold.
        List<int> rawPeaks = [];
        for (int i = 1; i < SampleCount - 1; i++)
        {
            if (smoothed[i] > threshold &&
                smoothed[i] > smoothed[i - 1] &&
                smoothed[i] >= smoothed[i + 1])
            {
                rawPeaks.Add(i);
            }
        }

        if (rawPeaks.Count < 8)
            return null;

        // Non-maximum suppression: min distance ~0.5× pitch.
        double pitchU_est = 1.0 / 13.0;
        int minDist = Math.Max(2, (int)(SampleCount * pitchU_est * 0.3));
        List<int> peaks = Nms(rawPeaks, smoothed, minDist);

        // Exclude peaks near the extreme ends (outer boundaries, not seams).
        int marginSamples = Math.Max(3, (int)(SampleCount * 0.04));
        peaks = peaks.Where(p => p > marginSamples && p < SampleCount - marginSamples).ToList();

        // If we have too many, keep the strongest 12.
        if (peaks.Count > 12)
            peaks = peaks.OrderByDescending(p => smoothed[p]).Take(12).OrderBy(p => p).ToList();

        if (peaks.Count < 8)
            return null;

        // ── 5. Convert to u-parameters and pixel coords ────────────
        List<double> seamU = peaks.Select(p => (p + 0.5) / SampleCount).ToList();
        List<Point2f> seamTop = seamU.Select(u => Top(u)).ToList();
        List<Point2f> seamBottom = seamU.Select(u => Bottom(u)).ToList();

        double pitchU = seamU.Count >= 2
            ? seamU.Zip(seamU.Skip(1), (a, b) => b - a).Average()
            : pitchU_est;

        double confidence = Math.Min(1.0, (double)peaks.Count / 12.0);

        return new SeamDetection(
            seamU, seamTop, seamBottom, pitchU, gapSignal, confidence);
    }

    /// <summary>
    /// Builds a <see cref="SideHandCalibration"/> from seam detection on a
    /// stable baseline frame.  Fits a regular lattice to the seams and
    /// derives 13 slot intervals.  Rejects the calibration if seam spacing
    /// variation is too large.
    /// </summary>
    public static SideHandCalibration? BuildCalibration(
        Mat rotatedRoi,
        Mat rawMask,
        SideHandPlaneFitter.PlaneFitResult plane,
        Rect coarseRoi,
        Seat seat,
        RotateFlags rotation,
        SideHandBackMask masker,
        NormalizedQuad profileDrawnSlot,
        int frameWidth,
        int frameHeight)
    {
        var seams = Detect(rawMask, plane);
        // Accept 8+ seams (9–13 tiles) to support post-call recalibration
        // where chi leaves 10 tiles (9 seams) and pon leaves 11 tiles (10 seams).
        if (seams is null || seams.SeamU.Count < 8)
            return null;

        // Fit regular lattice: seam_i ≈ outerStartU + i * pitchU
        // Use median of seam positions minus i*pitch to get outerStartU.
        int nSeams = seams.SeamU.Count;
        double pitchU = seams.PitchU;

        // Refine pitch from median inter-seam gap.
        List<double> gaps = [];
        for (int i = 1; i < nSeams; i++)
            gaps.Add(seams.SeamU[i] - seams.SeamU[i - 1]);
        double medianGap = Median(gaps);
        double mad = Median(gaps.Select(g => Math.Abs(g - medianGap)).ToList());
        // MAD > 25% of median gap → reject as too irregular.
        if (mad > medianGap * 0.25)
            return null;

        pitchU = medianGap;
        // Pitch reasonableness: for 9–13 tiles, pitch should be ~0.07–0.12 u-units.
        // Very small pitch means peaks clumped incorrectly; very large means missed seams.
        if (pitchU < 0.035 || pitchU > 0.18)
            return null;
        double[] offsets = new double[nSeams];
        for (int i = 0; i < nSeams; i++)
            offsets[i] = seams.SeamU[i] - (i + 1) * pitchU;
        double outerStartU = Median(offsets.ToList());

        // Build slot intervals: slot count = detected seams + 1, capped at 13.
        // After calls (chi 10, pon 11) we detect fewer seams and produce
        // a shorter calibration.
        int tileCount = Math.Min(nSeams + 1, 13);
        List<SideHandSlotGeometry> slots = new(tileCount);
        for (int i = 0; i < tileCount; i++)
        {
            double u0 = outerStartU + i * pitchU;
            double u1 = outerStartU + (i + 1) * pitchU;
            slots.Add(new SideHandSlotGeometry(
                u0, u1,
                new Point2f((float)(plane.ColStart + u0 * (plane.ColEnd - plane.ColStart)),
                            (float)(plane.TopStartY + u0 * (plane.TopEndY - plane.TopStartY))),
                new Point2f((float)(plane.ColStart + u1 * (plane.ColEnd - plane.ColStart)),
                            (float)(plane.TopStartY + u1 * (plane.TopEndY - plane.TopStartY))),
                new Point2f((float)(plane.ColStart + u0 * (plane.ColEnd - plane.ColStart)),
                            (float)(plane.BottomStartY + u0 * (plane.BottomEndY - plane.BottomStartY))),
                new Point2f((float)(plane.ColStart + u1 * (plane.ColEnd - plane.ColStart)),
                            (float)(plane.BottomStartY + u1 * (plane.BottomEndY - plane.BottomStartY)))));
        }

        // Determine draw side from profile DrawnSlot centre, mapped into rotated ROI.
        SideHandEnd drawSide = SideHandEnd.Unknown;
        double drawnNormX = (profileDrawnSlot.TopLeft.X + profileDrawnSlot.TopRight.X +
                             profileDrawnSlot.BottomRight.X + profileDrawnSlot.BottomLeft.X) / 4;
        double drawnNormY = (profileDrawnSlot.TopLeft.Y + profileDrawnSlot.TopRight.Y +
                             profileDrawnSlot.BottomRight.Y + profileDrawnSlot.BottomLeft.Y) / 4;

        // Map drawn slot centre to rotated ROI coords by first going to frame px, then to crop, then rotate.
        int dfx = (int)(drawnNormX * frameWidth);
        int dfy = (int)(drawnNormY * frameHeight);
        int dcx = dfx - coarseRoi.X;
        int dcy = dfy - coarseRoi.Y;
        // Forward rotation (same as what we do to the crop).
        Point2f rotDrawn = seat switch
        {
            Seat.Right => new Point2f(coarseRoi.Height - 1 - dcy, dcx),
            Seat.Left => new Point2f(dcy, coarseRoi.Width - 1 - dcx),
            _ => new Point2f(dcx, dcy)
        };
        // Determine which side of the hand the drawn slot is on.
        double midU = outerStartU + tileCount * pitchU * 0.5;
        double rotDrawnX = rotDrawn.X;
        double planeMidX = plane.ColStart + midU * (plane.ColEnd - plane.ColStart);
        drawSide = rotDrawnX > planeMidX ? SideHandEnd.FarEnd : SideHandEnd.NearStart;

        double confidence = Math.Min(1.0, seams.Confidence * (1.0 - mad / Math.Max(medianGap, 0.001)));

        return new SideHandCalibration(
            seat, coarseRoi, rotation, plane,
            masker.HueMin, masker.HueMax,
            masker.SaturationMin, masker.SaturationMax,
            masker.ValueMin, masker.ValueMax,
            outerStartU, pitchU, slots, drawSide, confidence);
    }

    // ── Helpers ────────────────────────────────────────────────────

    private static double Median(List<double> values)
    {
        if (values.Count == 0) return 0;
        var sorted = values.OrderBy(v => v).ToList();
        int m = sorted.Count / 2;
        return sorted.Count % 2 == 1 ? sorted[m] : (sorted[m - 1] + sorted[m]) * 0.5;
    }

    private static double[] GaussianSmooth(double[] signal, double sigma)
    {
        int radius = (int)Math.Ceiling(sigma * 3);
        double[] kernel = new double[2 * radius + 1];
        double sum = 0;
        for (int i = -radius; i <= radius; i++)
        {
            kernel[i + radius] = Math.Exp(-0.5 * i * i / (sigma * sigma));
            sum += kernel[i + radius];
        }
        for (int i = 0; i < kernel.Length; i++)
            kernel[i] /= sum;

        int n = signal.Length;
        double[] result = new double[n];
        for (int i = 0; i < n; i++)
        {
            double s = 0;
            for (int k = Math.Max(0, i - radius); k <= Math.Min(n - 1, i + radius); k++)
                s += signal[k] * kernel[k - i + radius];
            result[i] = s;
        }
        return result;
    }

    private static List<int> Nms(List<int> peaks, double[] signal, int minDist)
    {
        bool[] suppressed = new bool[signal.Length];
        List<int> selected = [];
        foreach (int p in peaks.OrderByDescending(p => signal[p]))
        {
            if (suppressed[p]) continue;
            selected.Add(p);
            for (int x = Math.Max(0, p - minDist); x <= Math.Min(signal.Length - 1, p + minDist); x++)
                suppressed[x] = true;
        }
        selected.Sort();
        return selected;
    }
}
