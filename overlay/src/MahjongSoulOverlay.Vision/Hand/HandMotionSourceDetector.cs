using OpenCvSharp;

namespace MahjongSoulOverlay.Vision.Hand;

/// <summary>
/// Classifies the source of motion during a discard animation as
/// originating from the drawn tile (tsumogiri) or the main hand (tedashi).
/// </summary>
public enum MotionSource
{
    /// <summary>Tsumogiri — the moving tile came from the draw area.</summary>
    Draw,

    /// <summary>Tedashi — the moving tile came from the main hand.</summary>
    MainHand,

    /// <summary>
    /// The motion source could not be determined (too little motion, or
    /// motion everywhere).
    /// </summary>
    Unknown,
}

/// <summary>
/// Tracks hand-strip frames across time and detects whether a discard
/// motion originated from the draw area or from the main hand.
/// </summary>
internal sealed class HandMotionSourceDetector : IDisposable
{
    private Mat? _previousStrip;
    private bool _disposed;

    /// <summary>
    /// Initializes a new instance of <see cref="HandMotionSourceDetector"/>.
    /// </summary>
    public HandMotionSourceDetector()
    {
    }

    /// <summary>
    /// Compares <paramref name="currentHandStrip"/> against the previously
    /// stored frame and classifies the source of inter-frame motion.
    /// </summary>
    /// <param name="currentHandStrip">
    /// The current grayscale hand strip (ownership is not transferred).
    /// </param>
    /// <param name="lattice">The hand lattice estimate for this frame.</param>
    /// <returns>
    /// <see cref="MotionSource.Draw"/> when the motion centroid lies beyond
    /// <see cref="HandLatticeEstimate.MainHandEndX"/>;
    /// <see cref="MotionSource.MainHand"/> when it lies within the main hand;
    /// <see cref="MotionSource.Unknown"/> otherwise.
    /// </returns>
    public MotionSource Detect(
        Mat currentHandStrip, HandLatticeEstimate lattice)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        ArgumentNullException.ThrowIfNull(currentHandStrip);
        ArgumentNullException.ThrowIfNull(lattice);

        if (_previousStrip is null || _previousStrip.Empty())
            return MotionSource.Unknown;

        if (currentHandStrip.Size() != _previousStrip.Size() ||
            currentHandStrip.Type() != _previousStrip.Type())
        {
            return MotionSource.Unknown;
        }

        using Mat diff = new Mat();
        Cv2.Absdiff(currentHandStrip, _previousStrip, diff);

        // Horizontal projection of the absolute difference (manual, to avoid
        // OpenCV Reduce type mismatch across CV_8U → CV_32F).
        int height = diff.Rows;
        int width = diff.Cols;
        double totalWeight = 0.0;
        double weightedSum = 0.0;

        for (int x = 0; x < width; x++)
        {
            double columnSum = 0;
            for (int y = 0; y < height; y++)
                columnSum += diff.At<byte>(y, x);
            weightedSum += columnSum * x;
            totalWeight += columnSum;
        }

        if (totalWeight <= 0.0)
            return MotionSource.Unknown;

        double motionCentroidX = weightedSum / totalWeight;

        if (motionCentroidX <= lattice.MainHandEndX)
            return MotionSource.MainHand;

        if (motionCentroidX >= lattice.DrawGapStartX)
            return MotionSource.Draw;

        return MotionSource.Unknown;
    }

    /// <summary>
    /// Stores <paramref name="handStrip"/> as the previous frame for the
    /// next call to <see cref="Detect"/>.  The caller retains ownership;
    /// a clone is kept internally.
    /// </summary>
    /// <param name="handStrip">The current grayscale hand strip to remember.</param>
    public void StoreFrame(Mat handStrip)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        ArgumentNullException.ThrowIfNull(handStrip);

        Mat? old = Interlocked.Exchange(ref _previousStrip, handStrip.Clone());
        old?.Dispose();
    }

    /// <summary>
    /// Releases the stored previous frame.
    /// </summary>
    public void Dispose()
    {
        if (_disposed)
            return;

        _disposed = true;
        Mat? old = Interlocked.Exchange(ref _previousStrip, null);
        old?.Dispose();
    }
}
