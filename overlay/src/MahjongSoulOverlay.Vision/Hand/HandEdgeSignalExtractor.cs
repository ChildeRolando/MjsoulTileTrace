using OpenCvSharp;

namespace MahjongSoulOverlay.Vision.Hand;

/// <summary>
/// Extracts a 1-D vertical-edge signal from a warped back-band strip.
/// The signal peaks at tile seams (vertical boundaries between adjacent
/// tiles) and is the input to pitch estimation and lattice fitting.
/// </summary>
public static class HandEdgeSignalExtractor
{
    /// <summary>
    /// Fraction from top of strip to start the analysis band (skip top edge).
    /// </summary>
    private const double BandTopFraction = 0.15;

    /// <summary>
    /// Fraction from top of strip to end the analysis band (skip bottom edge).
    /// </summary>
    private const double BandBottomFraction = 0.80;

    /// <summary>
    /// Smoothing window radius for peak-snapping signal.
    /// </summary>
    private const int SmoothRadius = 2;

    /// <summary>
    /// Additional smoothing radius for autocorrelation (wider to suppress
    /// tile-texture noise while preserving pitch periodicity).
    /// </summary>
    private const int AcSmoothRadius = 5;

    /// <summary>
    /// Extracts a smoothed 1-D vertical-edge signal from a warped
    /// grayscale back-band strip.
    /// </summary>
    /// <param name="warpedBand">Grayscale warped back-band (e.g. 900 × 60).</param>
    /// <returns>Edge signal array, length = band width.  Higher values
    /// indicate stronger vertical edges (tile seams).</returns>
    public static double[] Extract(Mat warpedBand)
    {
        ArgumentNullException.ThrowIfNull(warpedBand);
        if (warpedBand.Empty())
            throw new ArgumentException("Band must not be empty.", nameof(warpedBand));

        int w = warpedBand.Cols, h = warpedBand.Rows;

        // Restrict to middle-height band to avoid top/bottom edges.
        int y0 = (int)(h * BandTopFraction);
        int y1 = (int)(h * BandBottomFraction);
        if (y1 - y0 < 3)
        { y0 = 1; y1 = Math.Max(h - 1, 2); }

        using Mat roi = new Mat(warpedBand, new Rect(0, y0, w, y1 - y0));

        // Scharr X gradient (stronger response to vertical edges than Sobel).
        using Mat gradX = new Mat();
        Cv2.Scharr(roi, gradX, MatType.CV_32F, 1, 0);
        // gradX is CV_32F with negative and positive values.

        // Absolute value → vertical edge magnitude per pixel.
        // Then sum along y to get a 1-D edge signal.
        double[] edgeSignal = new double[w];
        for (int x = 0; x < w; x++)
        {
            using Mat col = new Mat(gradX, new Rect(x, 0, 1, gradX.Rows));
            edgeSignal[x] = Cv2.Sum(col).Val0;
        }

        // Smooth with a moving-average window.
        SmoothInPlace(edgeSignal, SmoothRadius);

        return edgeSignal;
    }

    private static void SmoothInPlace(double[] signal, int radius)
    {
        double[] tmp = (double[])signal.Clone();
        int n = signal.Length;
        for (int i = 0; i < n; i++)
        {
            double sum = 0;
            int count = 0;
            int start = Math.Max(0, i - radius);
            int end = Math.Min(n - 1, i + radius);
            for (int j = start; j <= end; j++)
            { sum += tmp[j]; count++; }
            signal[i] = sum / count;
        }
    }
}
