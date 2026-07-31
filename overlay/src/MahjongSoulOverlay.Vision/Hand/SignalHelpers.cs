namespace MahjongSoulOverlay.Vision.Hand;

/// <summary>
/// Shared signal-processing helpers used by multiple hand-detection components.
/// </summary>
public static class SignalHelpers
{
    /// <summary>
    /// 1-D Gaussian smoothing with reflective boundary handling.
    /// </summary>
    public static double[] GaussianSmooth(double[] signal, double sigma)
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

    /// <summary>
    /// Non-maximum suppression on 1-D peaks.
    /// Returns peaks sorted by position.
    /// </summary>
    public static List<int> Nms(List<int> peaks, double[] signal, int minDist)
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

    /// <summary>
    /// Finds all local maxima in a signal above a threshold.
    /// </summary>
    public static List<int> FindPeaks(double[] signal, double threshold)
    {
        List<int> peaks = [];
        for (int i = 1; i < signal.Length - 1; i++)
        {
            if (signal[i] > threshold &&
                signal[i] > signal[i - 1] &&
                signal[i] >= signal[i + 1])
            {
                peaks.Add(i);
            }
        }
        return peaks;
    }

    /// <summary>
    /// Finds all local minima in a signal below a threshold.
    /// </summary>
    public static List<int> FindValleys(double[] signal, double threshold)
    {
        List<int> valleys = [];
        for (int i = 1; i < signal.Length - 1; i++)
        {
            if (signal[i] < threshold &&
                signal[i] < signal[i - 1] &&
                signal[i] <= signal[i + 1])
            {
                valleys.Add(i);
            }
        }
        return valleys;
    }

    /// <summary>Median of a list of doubles.</summary>
    public static double Median(List<double> values)
    {
        if (values.Count == 0) return 0;
        var sorted = values.OrderBy(v => v).ToList();
        int m = sorted.Count / 2;
        return sorted.Count % 2 == 1 ? sorted[m] : (sorted[m - 1] + sorted[m]) * 0.5;
    }

    /// <summary>Median of an array of doubles.</summary>
    public static double Median(double[] values)
    {
        if (values.Length == 0) return 0;
        var sorted = values.OrderBy(v => v).ToArray();
        int m = sorted.Length / 2;
        return sorted.Length % 2 == 1 ? sorted[m] : (sorted[m - 1] + sorted[m]) * 0.5;
    }

    /// <summary>
    /// Median Absolute Deviation from the median.
    /// </summary>
    public static double Mad(double[] values)
    {
        if (values.Length == 0) return 0;
        double med = Median(values);
        double[] absDeviations = values.Select(v => Math.Abs(v - med)).ToArray();
        return Median(absDeviations);
    }

    /// <summary>
    /// Linear interpolation: returns y at position x, given the line through (x1,y1) and (x2,y2).
    /// </summary>
    public static double Lerp(double x, double x1, double y1, double x2, double y2)
    {
        if (Math.Abs(x2 - x1) < 1e-9) return (y1 + y2) * 0.5;
        double t = (x - x1) / (x2 - x1);
        return y1 + t * (y2 - y1);
    }

    /// <summary>
    /// Clamps a value to [min, max].
    /// </summary>
    public static double Clamp(double value, double min, double max) =>
        Math.Max(min, Math.Min(max, value));
}
