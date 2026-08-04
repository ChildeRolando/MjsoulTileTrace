using OpenCvSharp;

namespace MahjongSoulOverlay.Vision.Hand;

/// <summary>
/// Extracts the orange tile-back plane mask from a side-hand (Right / Left)
/// coarse ROI that has already been rotated so tiles run left-to-right.
///
/// Uses HSV colour space with saturation and value gates in addition to hue,
/// because the white/grey side faces of end tiles have low saturation and
/// must be excluded.
/// </summary>
public sealed class SideHandBackMask
{
    // ── HSV thresholds for orange tile back ────────────────────────────

    /// <summary>Default hue lower bound (orange-yellow range in OpenCV HSV, 0-179).</summary>
    public const int DefaultHueMin = 5;

    /// <summary>Default hue upper bound.</summary>
    public const int DefaultHueMax = 35;

    /// <summary>
    /// Default saturation minimum.  White/grey side faces have very low
    /// saturation; raising this threshold excludes them.
    /// </summary>
    public const int DefaultSaturationMin = 85;

    /// <summary>Default saturation maximum.</summary>
    public const int DefaultSaturationMax = 255;

    /// <summary>Default value (brightness) minimum.</summary>
    public const int DefaultValueMin = 70;

    /// <summary>Default value maximum.</summary>
    public const int DefaultValueMax = 255;

    /// <summary>Hue lower bound (orange-yellow range in OpenCV HSV, 0-179).</summary>
    public int HueMin { get; set; } = DefaultHueMin;

    /// <summary>Hue upper bound.</summary>
    public int HueMax { get; set; } = DefaultHueMax;

    /// <summary>
    /// Saturation minimum.  White/grey side faces have very low saturation;
    /// raising this threshold excludes them.
    /// </summary>
    public int SaturationMin { get; set; } = DefaultSaturationMin;

    /// <summary>Saturation maximum.</summary>
    public int SaturationMax { get; set; } = DefaultSaturationMax;

    /// <summary>Value (brightness) minimum.</summary>
    public int ValueMin { get; set; } = DefaultValueMin;

    /// <summary>Value maximum.</summary>
    public int ValueMax { get; set; } = DefaultValueMax;

    /// <summary>
    /// Whether the back colour range has been auto-calibrated from the image.
    /// </summary>
    public bool IsCalibrated { get; set; }

    /// <summary>
    /// Auto-calibrates the HSV range from the centre of the rotated ROI.
    /// Samples the middle 20 % and computes per-channel medians, then sets
    /// ranges as ±delta around those medians.
    ///
    /// The calibration is validated against the same ROI: if the derived range
    /// fails to extract a meaningful orange mask (e.g. the ROI centre is empty
    /// on an early frame before the hand is dealt), the default range is kept
    /// so the masker still works once the hand appears.
    /// </summary>
    public void Calibrate(Mat rotatedRoiBgr)
    {
        int cx = rotatedRoiBgr.Cols / 2, cy = rotatedRoiBgr.Rows / 2;
        int hw = Math.Max(5, rotatedRoiBgr.Cols / 6);
        int hh = Math.Max(3, rotatedRoiBgr.Rows / 8);
        Rect sampleRect = new(
            Math.Max(0, cx - hw),
            Math.Max(0, cy - hh),
            Math.Min(rotatedRoiBgr.Cols - Math.Max(0, cx - hw), 2 * hw),
            Math.Min(rotatedRoiBgr.Rows - Math.Max(0, cy - hh), 2 * hh));
        using Mat sample = new Mat(rotatedRoiBgr, sampleRect);

        using Mat hsv = new Mat();
        Cv2.CvtColor(sample, hsv, ColorConversionCodes.BGR2HSV);

        // Per-channel medians over the sample region.
        double[] hVals = new double[hsv.Rows * hsv.Cols];
        double[] sVals = new double[hsv.Rows * hsv.Cols];
        double[] vVals = new double[hsv.Rows * hsv.Cols];
        int idx = 0;
        for (int y = 0; y < hsv.Rows; y++)
        {
            for (int x = 0; x < hsv.Cols; x++)
            {
                Vec3b p = hsv.At<Vec3b>(y, x);
                hVals[idx] = p.Item0;
                sVals[idx] = p.Item1;
                vVals[idx] = p.Item2;
                idx++;
            }
        }
        Array.Sort(hVals); Array.Sort(sVals); Array.Sort(vVals);
        int m = idx / 2;

        int hMed = (int)hVals[m];
        int sMed = (int)sVals[m];
        int vMed = (int)vVals[m];

        HueMin = Math.Max(0, hMed - 15);
        HueMax = Math.Min(179, hMed + 15);
        SaturationMin = Math.Max(50, sMed - 40);
        SaturationMax = 255;
        ValueMin = Math.Max(30, vMed - 60);
        ValueMax = 255;

        IsCalibrated = true;

        // Validation: the calibrated range must actually isolate the orange
        // tile backs.  If it yields almost nothing, the sample region was not
        // on the hand — keep the default range rather than poisoning the
        // persistent masker used across replay frames.
        using Mat probe = Extract(rotatedRoiBgr);
        if (Cv2.CountNonZero(probe) < 500)
        {
            HueMin = DefaultHueMin;
            HueMax = DefaultHueMax;
            SaturationMin = DefaultSaturationMin;
            SaturationMax = DefaultSaturationMax;
            ValueMin = DefaultValueMin;
            ValueMax = DefaultValueMax;
        }
    }

    /// <summary>
    /// Produces a binary mask of orange tile-back pixels.
    /// A pixel passes when:  hue ∈ [HueMin, HueMax] AND sat ∈ [SaturationMin, SaturationMax]
    /// AND val ∈ [ValueMin, ValueMax].
    /// </summary>
    public Mat Extract(Mat rotatedRoiBgr)
    {
        ArgumentNullException.ThrowIfNull(rotatedRoiBgr);

        using Mat hsv = new Mat();
        Cv2.CvtColor(rotatedRoiBgr, hsv, ColorConversionCodes.BGR2HSV);

        Scalar lower = new(HueMin, SaturationMin, ValueMin);
        Scalar upper = new(HueMax, SaturationMax, ValueMax);

        Mat mask = new Mat();
        Cv2.InRange(hsv, lower, upper, mask);
        return mask;
    }

    /// <summary>
    /// Returns the mask plus the HSV image for debugging.
    /// </summary>
    public (Mat Mask, Mat Hsv) ExtractWithHsv(Mat rotatedRoiBgr)
    {
        Mat hsv = new Mat();
        Cv2.CvtColor(rotatedRoiBgr, hsv, ColorConversionCodes.BGR2HSV);

        Scalar lower = new(HueMin, SaturationMin, ValueMin);
        Scalar upper = new(HueMax, SaturationMax, ValueMax);

        Mat mask = new Mat();
        Cv2.InRange(hsv, lower, upper, mask);
        return (mask, hsv);
    }
}
