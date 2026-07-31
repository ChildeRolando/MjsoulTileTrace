using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.Profiles;
using OpenCvSharp;

namespace MahjongSoulOverlay.Vision.Hand;

/// <summary>
/// Warps a seat's hand region into a normalized horizontal strip,
/// making all four hands read left-to-right regardless of the original
/// screen orientation.
/// </summary>
internal static class HandRectifier
{
    /// <summary>
    /// Default output width in pixels for the normalized horizontal strip.
    /// </summary>
    public const int OutputWidth = 900;

    /// <summary>
    /// Default output height in pixels for the normalized horizontal strip.
    /// </summary>
    public const int OutputHeight = 120;

    /// <summary>
    /// Warps the main-hand region of <paramref name="frame"/> into a
    /// grayscale horizontal strip suitable for lattice estimation.
    /// </summary>
    /// <param name="frame">The source frame (BGRA, typically 1920 x 1080).</param>
    /// <param name="profile">The seat profile that defines the main-hand region.</param>
    /// <returns>
    /// A single-channel (grayscale) <see cref="Mat"/> of size
    /// <see cref="OutputWidth"/> x <see cref="OutputHeight"/>.
    /// The caller is responsible for disposing the returned matrix.
    /// </returns>
    public static Mat Warp(Mat frame, SeatProfile profile)
    {
        ArgumentNullException.ThrowIfNull(frame);
        ArgumentNullException.ThrowIfNull(profile);

        Mat homography = GetTransform(profile, frame.Width, frame.Height);
        Mat warped = new Mat();
        try
        {
            Cv2.WarpPerspective(
                frame, warped, homography, new Size(OutputWidth, OutputHeight),
                InterpolationFlags.Linear, BorderTypes.Replicate);

            Mat grayscale = new Mat();
            Cv2.CvtColor(warped, grayscale,
                frame.Channels() == 4
                    ? ColorConversionCodes.BGRA2GRAY
                    : ColorConversionCodes.BGR2GRAY);
            return grayscale;
        }
        finally
        {
            warped.Dispose();
        }
    }

    /// <summary>
    /// Computes the 3 x 3 perspective homography that maps the profile's
    /// main-hand region to the normalized horizontal strip.
    /// </summary>
    /// <param name="profile">The seat profile.</param>
    /// <param name="frameWidth">Width of the source frame in pixels.</param>
    /// <param name="frameHeight">Height of the source frame in pixels.</param>
    /// <returns>A 3 x 3 <see cref="Mat"/> of type <c>CV_64FC1</c>.</returns>
    public static Mat GetTransform(
        SeatProfile profile, int frameWidth, int frameHeight)
    {
        ArgumentNullException.ThrowIfNull(profile);
        if (frameWidth <= 0)
            throw new ArgumentOutOfRangeException(nameof(frameWidth));
        if (frameHeight <= 0)
            throw new ArgumentOutOfRangeException(nameof(frameHeight));

        NormalizedQuad region = profile.MainHandRegion;
        (Point2f[] src, Point2f[] dst) = BuildCorrespondences(
            region, frameWidth, frameHeight, profile.MainHandDirection);

        return Cv2.GetPerspectiveTransform(src, dst);
    }

    /// <summary>
    /// Builds the source-destination point pairs for the perspective
    /// transform so that the first main tile maps to x = 0 and the
    /// direction of tile flow maps to increasing x.
    /// </summary>
    private static (Point2f[] Src, Point2f[] Dst) BuildCorrespondences(
        NormalizedQuad region,
        int frameWidth,
        int frameHeight,
        LayoutDirection direction)
    {
        Point2f tl = Pixel(region.TopLeft, frameWidth, frameHeight);
        Point2f tr = Pixel(region.TopRight, frameWidth, frameHeight);
        Point2f br = Pixel(region.BottomRight, frameWidth, frameHeight);
        Point2f bl = Pixel(region.BottomLeft, frameWidth, frameHeight);

        Point2f[] dst =
        [
            new Point2f(0, 0),
            new Point2f(OutputWidth, 0),
            new Point2f(OutputWidth, OutputHeight),
            new Point2f(0, OutputHeight),
        ];

        Point2f[] src = direction switch
        {
            LayoutDirection.LeftToRight => [tl, tr, br, bl],
            LayoutDirection.RightToLeft => [tr, tl, bl, br],
            LayoutDirection.TopToBottom => [tl, bl, br, tr],
            LayoutDirection.BottomToTop => [bl, tl, tr, br],
            _ => throw new ArgumentOutOfRangeException(
                nameof(direction), direction, "Unsupported layout direction."),
        };

        return (src, dst);
    }

    private static Point2f Pixel(
        NormalizedPoint point, int width, int height)
    {
        return new Point2f(
            (float)(point.X * width),
            (float)(point.Y * height));
    }
}
