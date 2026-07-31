using MahjongSoulOverlay.Core.Domain;
using OpenCvSharp;

namespace MahjongSoulOverlay.Vision.Hand;

/// <summary>
/// Warps the extracted tile-back plane of a side hand (Right / Left) to a
/// normalised horizontal strip, and maps plane-fit coordinates back to the
/// original frame through the full chain:
///
///   RotatedRoiPx  →  inverse rotation  →  CropPx  →  +coarseRoi offset  →  FramePx
/// </summary>
public static class SideHandRectifier
{
    public const int StripWidth = 900;
    public const int StripHeight = 60;

    /// <summary>
    /// Warps the tile-back plane to a horizontal grayscale strip.
    /// </summary>
    public static Mat Warp(Mat rotatedRoi, SideHandPlaneFitter.PlaneFitResult plane)
    {
        ArgumentNullException.ThrowIfNull(rotatedRoi);
        ArgumentNullException.ThrowIfNull(plane);

        Point2f[] src =
        [
            new(plane.ColStart, (float)plane.TopStartY),
            new(plane.ColEnd, (float)plane.TopEndY),
            new(plane.ColEnd, (float)plane.BottomEndY),
            new(plane.ColStart, (float)plane.BottomStartY)
        ];

        Point2f[] dst =
        [
            new(0, 0),
            new(StripWidth, 0),
            new(StripWidth, StripHeight),
            new(0, StripHeight)
        ];

        using Mat homography = Cv2.GetPerspectiveTransform(src, dst);
        using Mat warpedColor = new Mat();
        Cv2.WarpPerspective(
            rotatedRoi, warpedColor, homography,
            new Size(StripWidth, StripHeight),
            InterpolationFlags.Linear, BorderTypes.Replicate);

        Mat gray = new Mat();
        Cv2.CvtColor(warpedColor, gray, ColorConversionCodes.BGR2GRAY);
        return gray;
    }

    /// <summary>
    /// Maps the four plane corners back to the original (un-rotated, un-cropped)
    /// frame pixel coordinates.  The chain is:
    ///
    ///   rotated-local pixel
    ///       ↓ inverse rotation
    ///   crop-local pixel
    ///       ↓ + coarseRoi offset
    ///   frame pixel
    /// </summary>
    /// <param name="plane">The fitted plane in rotated-ROI pixel coordinates.</param>
    /// <param name="cropRect">The coarse ROI rectangle in frame pixel coords.</param>
    /// <param name="seat">Which seat (determines rotation direction).</param>
    /// <returns>Four corner points in frame pixel coordinates.</returns>
    public static Point2f[] MapToFrame(
        SideHandPlaneFitter.PlaneFitResult plane,
        Rect cropRect,
        Seat seat)
    {
        // Four corners in rotated-ROI pixel coords.
        Point2f[] rotatedCorners =
        [
            new(plane.ColStart, (float)plane.TopStartY),
            new(plane.ColEnd, (float)plane.TopEndY),
            new(plane.ColEnd, (float)plane.BottomEndY),
            new(plane.ColStart, (float)plane.BottomStartY)
        ];

        Point2f[] frameCorners = new Point2f[4];
        for (int i = 0; i < 4; i++)
        {
            Point2f cropPoint = InverseRotate(rotatedCorners[i], cropRect, seat);
            frameCorners[i] = new Point2f(
                cropPoint.X + cropRect.X,
                cropPoint.Y + cropRect.Y);
        }

        return frameCorners;
    }

    /// <summary>
    /// Converts frame-pixel corners to a normalised quad.
    /// </summary>
    public static NormalizedQuad ToNormalizedQuad(
        Point2f[] frameCorners, int frameWidth, int frameHeight)
    {
        return new NormalizedQuad(
            Norm(frameCorners[0], frameWidth, frameHeight),
            Norm(frameCorners[1], frameWidth, frameHeight),
            Norm(frameCorners[2], frameWidth, frameHeight),
            Norm(frameCorners[3], frameWidth, frameHeight));
    }

    // ─── inverse rotation ──────────────────────────────────────────────

    /// <summary>
    /// Inverse rotation from rotated-ROI coordinates back to crop-local
    /// coordinates (before the coarse ROI offset).
    ///
    /// Right seat: original is rotated 90° CW  → inverse is 90° CCW.
    ///   Forward:  (x, y) → (H-1-y, x)         where H = crop height
    ///   Inverse:  (x_r, y_r) → (y_r, H-1-x_r)
    ///
    /// Left seat: original is rotated 90° CCW → inverse is 90° CW.
    ///   Forward:  (x, y) → (y, W-1-x)         where W = crop width
    ///   Inverse:  (x_r, y_r) → (W-1-y_r, x_r)
    /// </summary>
    private static Point2f InverseRotate(
        Point2f rotatedPoint, Rect cropRect, Seat seat)
    {
        return seat switch
        {
            Seat.Right =>
                // Forward: 90° CW  →  Inverse: 90° CCW
                new Point2f(
                    rotatedPoint.Y,
                    cropRect.Height - 1 - rotatedPoint.X),

            Seat.Left =>
                // Forward: 90° CCW →  Inverse: 90° CW
                new Point2f(
                    cropRect.Width - 1 - rotatedPoint.Y,
                    rotatedPoint.X),

            _ => throw new ArgumentException(
                $"SideHandRectifier only supports Right and Left seats, got {seat}.")
        };
    }

    private static NormalizedPoint Norm(Point2f p, int fw, int fh) =>
        new(Math.Clamp(p.X / fw, 0.0, 1.0), Math.Clamp(p.Y / fh, 0.0, 1.0));
}
