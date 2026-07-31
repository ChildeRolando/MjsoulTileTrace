using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.Profiles;
using OpenCvSharp;

namespace MahjongSoulOverlay.Vision.River;

/// <summary>
/// Warps river cells and the full river region into canonical views
/// for classification and visualisation.
/// </summary>
internal static class RiverRectifier
{
    /// <summary>
    /// Width of the canonical patch produced for a single cell.
    /// </summary>
    public const int CellPatchWidth = 48;

    /// <summary>
    /// Height of the canonical patch produced for a single cell.
    /// </summary>
    public const int CellPatchHeight = 64;

    /// <summary>
    /// Warp a single cell's evidence quadrilateral to a canonical
    /// grayscale patch of <see cref="CellPatchWidth"/> x
    /// <see cref="CellPatchHeight"/> pixels.
    /// </summary>
    /// <param name="frame">The source frame (BGRA or grayscale).</param>
    /// <param name="cellQuad">The evidence quadrilateral in normalised coordinates.</param>
    /// <param name="frameWidth">Pixel width of <paramref name="frame"/>.</param>
    /// <param name="frameHeight">Pixel height of <paramref name="frame"/>.</param>
    /// <returns>A new <see cref="Mat"/> containing the warped grayscale patch.
    /// The caller is responsible for disposing it.</returns>
    public static Mat WarpCell(
        Mat frame, NormalizedQuad cellQuad, int frameWidth, int frameHeight)
    {
        ArgumentNullException.ThrowIfNull(frame);
        ArgumentNullException.ThrowIfNull(cellQuad);

        if (frame.Empty())
            throw new ArgumentException("Frame must not be empty.", nameof(frame));
        if (frameWidth <= 0 || frameHeight <= 0)
            throw new ArgumentOutOfRangeException(
                $"Frame dimensions must be positive. Got {frameWidth}x{frameHeight}.");

        if (!IsValidQuad(cellQuad))
            throw new ArgumentException("Cell quad is degenerate.", nameof(cellQuad));

        Point2f[] sourcePoints = ToPixelPoints(cellQuad, frameWidth, frameHeight);
        Point2f[] destinationPoints =
        [
            new(0, 0),
            new(CellPatchWidth - 1, 0),
            new(CellPatchWidth - 1, CellPatchHeight - 1),
            new(0, CellPatchHeight - 1)
        ];

        using Mat grayscale = ToGrayscale(frame);
        using Mat transform = Cv2.GetPerspectiveTransform(
            sourcePoints, destinationPoints);

        Mat patch = new();
        Cv2.WarpPerspective(
            grayscale,
            patch,
            transform,
            new Size(CellPatchWidth, CellPatchHeight),
            InterpolationFlags.Linear,
            BorderTypes.Replicate);

        return patch;
    }

    /// <summary>
    /// Warp the full river region to a top-down view suitable for
    /// debugging or visualisation.
    /// </summary>
    /// <param name="frame">The source frame.</param>
    /// <param name="profile">The seat profile whose river region to warp.</param>
    /// <param name="outputWidth">Desired output width in pixels.</param>
    /// <param name="outputHeight">Desired output height in pixels.</param>
    /// <returns>A new grayscale <see cref="Mat"/> of the warped region.
    /// The caller is responsible for disposing it.</returns>
    public static Mat WarpFullRiver(
        Mat frame, SeatProfile profile, int outputWidth, int outputHeight)
    {
        ArgumentNullException.ThrowIfNull(frame);
        ArgumentNullException.ThrowIfNull(profile);

        if (frame.Empty())
            throw new ArgumentException("Frame must not be empty.", nameof(frame));
        if (outputWidth <= 0 || outputHeight <= 0)
            throw new ArgumentOutOfRangeException(
                $"Output dimensions must be positive. Got {outputWidth}x{outputHeight}.");

        NormalizedQuad region = profile.RiverRegion;
        if (!IsValidQuad(region))
            throw new ArgumentException("River region is degenerate.", nameof(profile));

        Point2f[] sourcePoints = ToPixelPoints(region, frame.Width, frame.Height);
        Point2f[] destinationPoints =
        [
            new(0, 0),
            new(outputWidth - 1, 0),
            new(outputWidth - 1, outputHeight - 1),
            new(0, outputHeight - 1)
        ];

        using Mat grayscale = ToGrayscale(frame);
        using Mat transform = Cv2.GetPerspectiveTransform(
            sourcePoints, destinationPoints);

        Mat warped = new();
        Cv2.WarpPerspective(
            grayscale,
            warped,
            transform,
            new Size(outputWidth, outputHeight),
            InterpolationFlags.Linear,
            BorderTypes.Replicate);

        return warped;
    }

    /// <summary>
    /// Converts a frame to single-channel grayscale, handling BGRA, BGR,
    /// and already-grayscale inputs.
    /// </summary>
    private static Mat ToGrayscale(Mat source)
    {
        Mat grayscale = new();
        switch (source.Channels())
        {
            case 1:
                source.CopyTo(grayscale);
                break;
            case 3:
                Cv2.CvtColor(source, grayscale, ColorConversionCodes.BGR2GRAY);
                break;
            case 4:
                Cv2.CvtColor(source, grayscale, ColorConversionCodes.BGRA2GRAY);
                break;
            default:
                grayscale.Dispose();
                throw new ArgumentException(
                    "Frame must have 1, 3, or 4 channels.", nameof(source));
        }
        return grayscale;
    }

    private static Point2f[] ToPixelPoints(
        NormalizedQuad quad, int width, int height) =>
    [
        PixelPoint(quad.TopLeft, width, height),
        PixelPoint(quad.TopRight, width, height),
        PixelPoint(quad.BottomRight, width, height),
        PixelPoint(quad.BottomLeft, width, height)
    ];

    private static Point2f PixelPoint(
        NormalizedPoint point, int width, int height) =>
        new((float)(point.X * (width - 1)), (float)(point.Y * (height - 1)));

    /// <summary>
    /// Returns true when the quad is non-degenerate (non-zero area and
    /// consistently winding).
    /// </summary>
    private static bool IsValidQuad(NormalizedQuad quad)
    {
        NormalizedPoint[] points =
        [
            quad.TopLeft, quad.TopRight, quad.BottomRight, quad.BottomLeft
        ];

        double twiceArea = 0d;
        double[] crossProducts = new double[points.Length];

        for (int i = 0; i < points.Length; i++)
        {
            NormalizedPoint current = points[i];
            NormalizedPoint next = points[(i + 1) % points.Length];
            NormalizedPoint following = points[(i + 2) % points.Length];

            twiceArea += current.X * next.Y - next.X * current.Y;

            crossProducts[i] =
                (next.X - current.X) * (following.Y - next.Y) -
                (next.Y - current.Y) * (following.X - next.X);
        }

        const double epsilon = 1e-12;
        return Math.Abs(twiceArea) > epsilon
            && (crossProducts.All(v => v > epsilon)
                || crossProducts.All(v => v < -epsilon));
    }
}
