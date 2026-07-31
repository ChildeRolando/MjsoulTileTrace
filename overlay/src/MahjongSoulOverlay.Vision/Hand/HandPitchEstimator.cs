namespace MahjongSoulOverlay.Vision.Hand;

/// <summary>
/// Estimates tile pitch (distance between adjacent tile seams) from a 1-D
/// vertical-edge signal via autocorrelation.
/// </summary>
public static class HandPitchEstimator
{
    /// <summary>Minimum pitch to consider (in pixels of the warped band).</summary>
    public const int MinPitch = 35;

    /// <summary>Maximum pitch to consider.</summary>
    public const int MaxPitch = 95;

    /// <summary>
    /// Result of pitch estimation.
    /// </summary>
    public sealed record PitchEstimate(
        double Pitch,
        double Confidence,
        double[] Autocorrelation);

    /// <summary>
    /// Estimates the tile pitch from the edge signal using autocorrelation.
    /// </summary>
    public static PitchEstimate Estimate(double[] edgeSignal)
    {
        ArgumentNullException.ThrowIfNull(edgeSignal);
        if (edgeSignal.Length < MaxPitch * 2)
            throw new ArgumentException("Edge signal is too short.", nameof(edgeSignal));

        int n = edgeSignal.Length;
        double mean = edgeSignal.Average();
        double[] centered = edgeSignal.Select(v => v - mean).ToArray();

        int maxLag = Math.Min(MaxPitch + 10, n / 2);
        double[] ac = new double[maxLag];

        for (int lag = MinPitch; lag < maxLag; lag++)
        {
            double sum = 0;
            int count = 0;
            for (int i = 0; i < n - lag; i++)
            {
                sum += centered[i] * centered[i + lag];
                count++;
            }
            ac[lag] = count > 0 ? sum / count : 0;
        }

        // Find the strongest peak in the allowed pitch range.
        double bestScore = double.MinValue;
        int bestPitch = MinPitch;

        for (int lag = MinPitch; lag < maxLag - 1; lag++)
        {
            if (ac[lag] > ac[lag - 1] &&
                ac[lag] > ac[lag + 1] &&
                ac[lag] > bestScore)
            {
                bestScore = ac[lag];
                bestPitch = lag;
            }
        }

        // If no clear peak, use the maximum value in range.
        if (bestScore <= 0)
        {
            for (int lag = MinPitch; lag < maxLag; lag++)
            {
                if (ac[lag] > bestScore)
                {
                    bestScore = ac[lag];
                    bestPitch = lag;
                }
            }
        }

        // Confidence: peak height relative to the mean of other lags.
        double otherMean = ac.Skip(MinPitch).Where((_, i) => i + MinPitch != bestPitch).Average();
        double confidence = otherMean > 1e-9
            ? Math.Clamp((bestScore - otherMean) / (bestScore + 1e-9), 0.0, 1.0)
            : 0.5;

        return new PitchEstimate(bestPitch, confidence, ac);
    }
}
