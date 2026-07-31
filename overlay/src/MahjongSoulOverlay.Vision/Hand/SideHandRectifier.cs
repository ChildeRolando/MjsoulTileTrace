using MahjongSoulOverlay.Core.Domain;
using OpenCvSharp;

namespace MahjongSoulOverlay.Vision.Hand;

/// <summary>
/// Warps the extracted tile-back plane to a horizontal strip, and maps
/// coordinates from rotated-ROI space back to the original frame.
/// </summary>
public static class SideHandRectifier
{
    public const int StripWidth = 900;
    public const int StripHeight = 60;

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
            new(0, 0), new(StripWidth, 0),
            new(StripWidth, StripHeight), new(0, StripHeight)
        ];
        using Mat homography = Cv2.GetPerspectiveTransform(src, dst);
        using Mat warpedColor = new Mat();
        Cv2.WarpPerspective(rotatedRoi, warpedColor, homography,
            new Size(StripWidth, StripHeight),
            InterpolationFlags.Linear, BorderTypes.Replicate);
        Mat gray = new Mat();
        Cv2.CvtColor(warpedColor, gray, ColorConversionCodes.BGR2GRAY);
        return gray;
    }

    /// <summary>
    /// Maps arbitrary rotated-ROI points to frame pixel coords.
    /// Chain:  rotated-local → inverse rotation → crop-local → +cropRect offset → frame.
    /// </summary>
    public static Point2f[] MapToFrame(
        IReadOnlyList<Point2f> rotatedPoints, Rect cropRect, Seat seat)
    {
        Point2f[] frame = new Point2f[rotatedPoints.Count];
        for (int i = 0; i < rotatedPoints.Count; i++)
        {
            Point2f cp = InverseRotate(rotatedPoints[i], cropRect, seat);
            frame[i] = new Point2f(cp.X + cropRect.X, cp.Y + cropRect.Y);
        }
        return frame;
    }

    /// <summary>Four plane corners to frame pixels.</summary>
    public static Point2f[] MapToFrame(
        SideHandPlaneFitter.PlaneFitResult plane, Rect cropRect, Seat seat)
    {
        Point2f[] rc = {
            new(plane.ColStart, (float)plane.TopStartY),
            new(plane.ColEnd, (float)plane.TopEndY),
            new(plane.ColEnd, (float)plane.BottomEndY),
            new(plane.ColStart, (float)plane.BottomStartY)
        };
        return MapToFrame(rc, cropRect, seat);
    }

    public static NormalizedQuad ToNormalizedQuad(
        Point2f[] frameCorners, int fw, int fh) =>
        new(Norm(frameCorners[0], fw, fh), Norm(frameCorners[1], fw, fh),
            Norm(frameCorners[2], fw, fh), Norm(frameCorners[3], fw, fh));

    private static Point2f InverseRotate(Point2f rp, Rect cr, Seat seat) => seat switch
    {
        Seat.Right => new Point2f(rp.Y, cr.Height - 1 - rp.X),
        Seat.Left => new Point2f(cr.Width - 1 - rp.Y, rp.X),
        _ => throw new ArgumentException($"SideHandRectifier only supports Right/Left, got {seat}.")
    };

    private static NormalizedPoint Norm(Point2f p, int fw, int fh) =>
        new(Math.Clamp(p.X / fw, 0.0, 1.0), Math.Clamp(p.Y / fh, 0.0, 1.0));
}
