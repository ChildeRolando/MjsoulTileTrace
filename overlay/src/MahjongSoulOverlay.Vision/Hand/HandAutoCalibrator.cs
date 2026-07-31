using System.Runtime.CompilerServices;
using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.Profiles;
using OpenCvSharp;

[assembly: InternalsVisibleTo("MahjongSoulOverlay.Vision.Tests")]

namespace MahjongSoulOverlay.Vision.Hand;

/// <summary>
/// Self-calibrating hand detector that finds the precise 13-tile quadrilateral
/// from a coarse approximate ROI.  Does NOT trust the profile's quadrilateral
/// blindly — instead searches for the periodic tile structure within a
/// slightly expanded region and fits a precise bounding quadrilateral from
/// the detected tile positions.
/// </summary>
public static class HandAutoCalibrator
{
    /// <summary>How much to expand the coarse ROI on each side (fraction).</summary>
    private const double ExpansionFraction = 0.25;

    /// <summary>Expected number of tiles in a concealed hand.</summary>
    private const int ExpectedTileCount = 13;

    /// <summary>Minimum autocorrelation peak height relative to zero-lag.</summary>
    private const double MinPitchPeakRatio = 0.15;

    /// <summary>RANSAC inlier distance threshold in strip pixels.</summary>
    private const double RansacThreshold = 8.0;

    /// <summary>RANSAC iterations.</summary>
    private const int RansacIterations = 200;

    /// <summary>Output strip width for the coarse warp.</summary>
    private const int StripWidth = 1200;

    /// <summary>Output strip height for the coarse warp.</summary>
    private const int StripHeight = 160;

    /// <summary>
    /// Result of auto-calibration: a refined hand quadrilateral and per-tile
    /// slot quadrilaterals in normalised coordinates.
    /// </summary>
    public sealed record AutoCalibrationResult(
        NormalizedQuad RefinedHandRegion,
        IReadOnlyList<NormalizedQuad> RefinedSlots,
        NormalizedQuad? RefinedDrawnSlot,
        double PitchInStrip,
        double Confidence);

    /// <summary>
    /// Runs auto-calibration on a single frame.  The <paramref name="profile"/>
    /// provides the current (possibly inaccurate) hand region as a starting
    /// point.  Returns a refined quadrilateral and 13 slot quads.
    /// </summary>
    public static AutoCalibrationResult? Calibrate(
        Mat frame,
        SeatProfile profile)
    {
        ArgumentNullException.ThrowIfNull(frame);
        ArgumentNullException.ThrowIfNull(profile);

        int fw = frame.Width, fh = frame.Height;

        // 1. Expand the coarse ROI.
        NormalizedQuad coarse = ExpandQuad(profile.MainHandRegion, ExpansionFraction);

        // 2. Warp to a horizontal strip.
        Point2f[] srcPts = GetCoarseSourcePoints(coarse, profile.MainHandDirection, fw, fh);
        Point2f[] dstPts =
        [
            new(0, 0), new(StripWidth, 0),
            new(StripWidth, StripHeight), new(0, StripHeight)
        ];
        using Mat homography = Cv2.GetPerspectiveTransform(srcPts, dstPts);

        using Mat strip = new Mat();
        Cv2.WarpPerspective(
            frame, strip, homography, new Size(StripWidth, StripHeight),
            InterpolationFlags.Linear, BorderTypes.Replicate);
        using Mat gray = ToGray(strip);

        // 3. Vertical edge projection → periodic signal.
        using Mat edges = new Mat();
        Cv2.Canny(gray, edges, 30, 90);

        double[] edgeProj = VerticalProject(edges);
        SmoothInPlace(edgeProj, 3);

        // 4. Autocorrelation to find pitch.
        double pitch = FindPitch(edgeProj, StripWidth);
        if (pitch < 10 || pitch > StripWidth / 4)
            return null; // Could not find reliable pitch.

        // 5. Find tile centres by matched-filter cross-correlation.
        List<double> tileCenters = FindTileCenters(edgeProj, pitch, ExpectedTileCount);
        if (tileCenters.Count < 8)
            return null; // Too few tiles found.

        // 6. For each tile centre, find the top and bottom edges in the strip.
        List<Point2d> topEdges = [];
        List<Point2d> bottomEdges = [];
        double halfPitch = pitch * 0.45;

        foreach (double cx in tileCenters)
        {
            int left = Math.Max(0, (int)(cx - halfPitch));
            int right = Math.Min(StripWidth - 1, (int)(cx + halfPitch));

            double? topY = FindVerticalEdge(gray, left, right, direction: -1); // upward
            double? bottomY = FindVerticalEdge(gray, left, right, direction: 1); // downward

            if (topY.HasValue && bottomY.HasValue)
            {
                topEdges.Add(new Point2d(cx, topY.Value));
                bottomEdges.Add(new Point2d(cx, bottomY.Value));
            }
        }

        if (topEdges.Count < 6)
            return null;

        // 7. RANSAC line fit to top and bottom edges.
        Vec4d? topLine = RansacLineFit(topEdges);
        Vec4d? bottomLine = RansacLineFit(bottomEdges);

        if (topLine is not { } tl || bottomLine is not { } bl)
            return null;

        // Top line: ax + by + c = 0  →  y = -(a*x + c) / b
        // Evaluate at the strip boundaries.
        double topY_left = LineY(tl, 0);
        double topY_right = LineY(tl, StripWidth);
        double botY_left = LineY(bl, 0);
        double botY_right = LineY(bl, StripWidth);

        // Clamp to strip bounds.
        topY_left = Math.Clamp(topY_left, 0, StripHeight);
        topY_right = Math.Clamp(topY_right, 0, StripHeight);
        botY_left = Math.Clamp(botY_left, 0, StripHeight);
        botY_right = Math.Clamp(botY_right, 0, StripHeight);

        // 8. Map back to original normalised coordinates.
        using Mat invH = new Mat();
        Cv2.Invert(homography, invH, DecompTypes.LU);

        Point2f[] stripCorners =
        [
            new((float)0, (float)topY_left),         // TL
            new((float)StripWidth, (float)topY_right), // TR
            new((float)StripWidth, (float)botY_right), // BR
            new((float)0, (float)botY_left)           // BL
        ];
        Point2f[] frameCorners = Cv2.PerspectiveTransform(stripCorners, invH);

        NormalizedQuad refinedHand = new(
            Norm(frameCorners[0], fw, fh),
            Norm(frameCorners[1], fw, fh),
            Norm(frameCorners[2], fw, fh),
            Norm(frameCorners[3], fw, fh));

        // 9. Generate refined per-tile slot quads.
        List<NormalizedQuad> slots = [];
        foreach (double cx in tileCenters)
        {
            double topY = LineY(tl, cx);
            double botY = LineY(bl, cx);
            double leftX = cx - halfPitch;
            double rightX = cx + halfPitch;

            Point2f[] slotCorners =
            [
                new((float)leftX, (float)topY),
                new((float)rightX, (float)topY),
                new((float)rightX, (float)botY),
                new((float)leftX, (float)botY)
            ];
            Point2f[] slotFrame = Cv2.PerspectiveTransform(slotCorners, invH);
            slots.Add(new NormalizedQuad(
                Norm(slotFrame[0], fw, fh),
                Norm(slotFrame[1], fw, fh),
                Norm(slotFrame[2], fw, fh),
                Norm(slotFrame[3], fw, fh)));
        }

        // 10. Check for drawn slot: a tile beyond the main hand with a larger gap.
        NormalizedQuad? drawn = null;
        if (tileCenters.Count > ExpectedTileCount)
        {
            // The extra tile beyond the 13 main tiles is the drawn tile.
            double? drawnCx = tileCenters.Count > ExpectedTileCount
                ? tileCenters[^1] : null;
            if (drawnCx.HasValue)
            {
                double drawnTop = LineY(tl, drawnCx.Value);
                double drawnBot = LineY(bl, drawnCx.Value);
                double drawnLeft = drawnCx.Value - halfPitch;
                double drawnRight = drawnCx.Value + halfPitch;
                Point2f[] dCorners =
                [
                    new((float)drawnLeft, (float)drawnTop),
                    new((float)drawnRight, (float)drawnTop),
                    new((float)drawnRight, (float)drawnBot),
                    new((float)drawnLeft, (float)drawnBot)
                ];
                Point2f[] dFrame = Cv2.PerspectiveTransform(dCorners, invH);
                drawn = new NormalizedQuad(
                    Norm(dFrame[0], fw, fh),
                    Norm(dFrame[1], fw, fh),
                    Norm(dFrame[2], fw, fh),
                    Norm(dFrame[3], fw, fh));
            }
        }

        double confidence = Math.Min(1.0, (double)tileCenters.Count / ExpectedTileCount);

        return new AutoCalibrationResult(
            refinedHand,
            slots.Take(ExpectedTileCount).ToList().AsReadOnly(),
            drawn,
            pitch,
            confidence);
    }

    // ─── helpers ────────────────────────────────────────────────────────

    private static NormalizedQuad ExpandQuad(NormalizedQuad quad, double fraction)
    {
        double cx = (quad.TopLeft.X + quad.TopRight.X + quad.BottomRight.X + quad.BottomLeft.X) / 4.0;
        double cy = (quad.TopLeft.Y + quad.TopRight.Y + quad.BottomRight.Y + quad.BottomLeft.Y) / 4.0;

        NormalizedPoint Expand(NormalizedPoint p) =>
            new(
                Math.Clamp(p.X + (p.X - cx) * fraction, 0.0, 1.0),
                Math.Clamp(p.Y + (p.Y - cy) * fraction, 0.0, 1.0));

        return new NormalizedQuad(
            Expand(quad.TopLeft), Expand(quad.TopRight),
            Expand(quad.BottomRight), Expand(quad.BottomLeft));
    }

    private static Point2f[] GetCoarseSourcePoints(
        NormalizedQuad quad, LayoutDirection dir, int fw, int fh)
    {
        Point2f tl = Px(quad.TopLeft, fw, fh);
        Point2f tr = Px(quad.TopRight, fw, fh);
        Point2f br = Px(quad.BottomRight, fw, fh);
        Point2f bl = Px(quad.BottomLeft, fw, fh);

        return dir switch
        {
            LayoutDirection.LeftToRight => new[] { tl, tr, br, bl },
            LayoutDirection.RightToLeft => new[] { tr, tl, bl, br },
            LayoutDirection.TopToBottom => new[] { tl, bl, br, tr },
            LayoutDirection.BottomToTop => new[] { bl, tl, tr, br },
            _ => throw new ArgumentOutOfRangeException(nameof(dir))
        };
    }

    private static Mat ToGray(Mat src)
    {
        Mat g = new();
        Cv2.CvtColor(src, g, src.Channels() == 4
            ? ColorConversionCodes.BGRA2GRAY : ColorConversionCodes.BGR2GRAY);
        return g;
    }

    private static double[] VerticalProject(Mat edges)
    {
        int w = edges.Cols, h = edges.Rows;
        double[] proj = new double[w];
        for (int x = 0; x < w; x++)
        {
            double sum = 0;
            for (int y = 0; y < h; y++)
                if (edges.At<byte>(y, x) != 0) sum++;
            proj[x] = sum;
        }
        return proj;
    }

    private static void SmoothInPlace(double[] signal, int radius)
    {
        double[] tmp = (double[])signal.Clone();
        int n = signal.Length;
        for (int i = 0; i < n; i++)
        {
            double sum = 0; int count = 0;
            for (int j = Math.Max(0, i - radius); j <= Math.Min(n - 1, i + radius); j++)
            { sum += tmp[j]; count++; }
            signal[i] = sum / count;
        }
    }

    /// <summary>
    /// Finds the tile pitch from autocorrelation of the edge projection.
    /// </summary>
    private static double FindPitch(double[] signal, int width)
    {
        int n = signal.Length;
        double mean = signal.Average();
        double[] centered = signal.Select(v => v - mean).ToArray();

        // Autocorrelation for lags in [10, width/3]
        int maxLag = Math.Min(width / 3, n / 3);
        double[] ac = new double[maxLag];
        for (int lag = 10; lag < maxLag; lag++)
        {
            double sum = 0;
            for (int i = 0; i < n - lag; i++)
                sum += centered[i] * centered[i + lag];
            ac[lag] = sum / (n - lag);
        }

        // Find the first strong peak (the tile pitch).
        double maxAc = ac.Skip(10).Max();
        double threshold = maxAc * MinPitchPeakRatio;

        // Find first peak above threshold.
        for (int lag = 15; lag < maxLag - 1; lag++)
        {
            if (ac[lag] > threshold &&
                ac[lag] > ac[lag - 1] &&
                ac[lag] > ac[lag + 1])
            {
                return lag;
            }
        }

        // Fallback: assume ~StripWidth/13
        return (double)StripWidth / ExpectedTileCount;
    }

    /// <summary>
    /// Finds tile centres by cross-correlating with a pitch-sized kernel
    /// and picking the 13 strongest peaks.
    /// </summary>
    private static List<double> FindTileCenters(
        double[] signal, double pitch, int expectedCount)
    {
        int kernelWidth = Math.Max(3, (int)(pitch * 0.6));
        double[] kernel = new double[kernelWidth];
        int halfK = kernelWidth / 2;
        for (int i = 0; i < kernelWidth; i++)
        {
            double d = (i - halfK) / (halfK + 1.0);
            kernel[i] = 1.0 - d * d; // parabolic kernel
        }

        int n = signal.Length;
        double[] response = new double[n];
        for (int i = halfK; i < n - halfK; i++)
        {
            double sum = 0;
            for (int k = 0; k < kernelWidth; k++)
                sum += signal[i - halfK + k] * kernel[k];
            response[i] = sum;
        }

        // Find local maxima.
        List<(int pos, double val)> peaks = [];
        for (int i = halfK + 1; i < n - halfK - 1; i++)
        {
            if (response[i] > response[i - 1] &&
                response[i] > response[i + 1] &&
                response[i] > 0)
            {
                peaks.Add((i, response[i]));
            }
        }

        // Sort by response strength, keep top expectedCount * 2,
        // then sort by position and greedily pick with minimum spacing.
        var topPeaks = peaks
            .OrderByDescending(p => p.val)
            .Take(expectedCount * 2)
            .OrderBy(p => p.pos)
            .ToList();

        List<double> selected = [];
        double minSpacing = pitch * 0.6;
        foreach (var (pos, _) in topPeaks)
        {
            if (selected.Count == 0 || pos - selected[^1] >= minSpacing)
                selected.Add(pos);
        }

        // Keep only up to expectedCount + 1 (for possible drawn tile).
        return selected.Take(expectedCount + 1).Select(p => (double)p).ToList();
    }

    /// <summary>
    /// Finds the top (direction=-1) or bottom (direction=1) edge of a tile
    /// by scanning vertically from the centre of the strip.
    /// </summary>
    private static double? FindVerticalEdge(
        Mat gray, int left, int right, int direction)
    {
        int h = gray.Rows;
        int startY = direction < 0 ? h / 2 : h / 2;
        int endY = direction < 0 ? 5 : h - 5;

        // Compute horizontal gradient (Sobel X) and project vertically.
        double bestVal = 0;
        int bestY = -1;

        for (int y = startY; direction < 0 ? y >= endY : y <= endY; y += direction)
        {
            double edgeSum = 0;
            for (int x = left; x <= right; x++)
            {
                if (x > 0 && x < gray.Cols - 1)
                {
                    int gx = gray.At<byte>(y, x + 1) - gray.At<byte>(y, x - 1);
                    edgeSum += Math.Abs(gx);
                }
            }
            if (edgeSum > bestVal)
            {
                bestVal = edgeSum;
                bestY = y;
            }
        }

        return bestY >= 0 ? bestY : null;
    }

    /// <summary>
    /// RANSAC line fit.  Returns (a, b, c) for ax + by + c = 0.
    /// </summary>
    private static Vec4d? RansacLineFit(List<Point2d> points)
    {
        if (points.Count < 3)
            return null;

        int bestInliers = 0;
        Vec4d bestLine = default;
        var rng = new Random(42);

        for (int iter = 0; iter < RansacIterations; iter++)
        {
            // Pick 2 random points.
            int i1 = rng.Next(points.Count);
            int i2;
            do { i2 = rng.Next(points.Count); } while (i2 == i1);

            var p1 = points[i1];
            var p2 = points[i2];

            // Line: (y2-y1)*x - (x2-x1)*y + (x2*y1 - y2*x1) = 0
            double a = p2.Y - p1.Y;
            double b = -(p2.X - p1.X);
            double c = p2.X * p1.Y - p2.Y * p1.X;
            double norm = Math.Sqrt(a * a + b * b);
            if (norm < 1e-9) continue;
            a /= norm; b /= norm; c /= norm;

            // Count inliers.
            int inliers = 0;
            foreach (var p in points)
            {
                double dist = Math.Abs(a * p.X + b * p.Y + c);
                if (dist <= RansacThreshold)
                    inliers++;
            }

            if (inliers > bestInliers)
            {
                bestInliers = inliers;
                bestLine = new Vec4d(a, b, c, (double)inliers / points.Count);
            }
        }

        if (bestInliers < points.Count * 0.5)
            return null;

        return bestLine;
    }

    private static double LineY(Vec4d line, double x) =>
        -(line.Item0 * x + line.Item2) / line.Item1;

    private static Point2f Px(NormalizedPoint p, int w, int h) =>
        new((float)(p.X * w), (float)(p.Y * h));

    private static NormalizedPoint Norm(Point2f p, int w, int h) =>
        new(Math.Clamp(p.X / w, 0.0, 1.0), Math.Clamp(p.Y / h, 0.0, 1.0));
}
