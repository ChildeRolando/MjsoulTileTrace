using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.Profiles;
using OpenCvSharp;

namespace MahjongSoulOverlay.Vision.Hand;

/// <summary>
/// Maps the drawn-tile position from the rectified hand strip back to the
/// original frame's normalized coordinates, producing a dynamic replacement
/// for the fixed <c>DrawnSlot</c> quad.
/// </summary>
internal static class DynamicDrawEstimator
{
    /// <summary>
    /// Estimates the drawn-tile quad in the original frame's normalized
    /// coordinates.
    /// </summary>
    /// <param name="lattice">The hand lattice estimate.</param>
    /// <param name="homography">
    /// The 3 x 3 perspective transform returned by
    /// <see cref="HandRectifier.GetTransform"/> (forward: frame -> strip).
    /// </param>
    /// <param name="frameWidth">Width of the source frame in pixels.</param>
    /// <param name="frameHeight">Height of the source frame in pixels.</param>
    /// <param name="mainTileScale">
    /// The expected tile scale for the main-hand region.
    /// </param>
    /// <returns>
    /// A <see cref="NormalizedQuad"/> in [0, 1] coordinates locating the
    /// drawn tile, or <c>null</c> when no draw is present or the lattice
    /// cannot be mapped back.
    /// </returns>
    public static NormalizedQuad? EstimateDrawQuad(
        HandLatticeEstimate lattice,
        Mat homography,
        int frameWidth,
        int frameHeight,
        TileScale mainTileScale)
    {
        ArgumentNullException.ThrowIfNull(lattice);
        ArgumentNullException.ThrowIfNull(homography);
        ArgumentNullException.ThrowIfNull(mainTileScale);
        if (frameWidth <= 0)
            throw new ArgumentOutOfRangeException(nameof(frameWidth));
        if (frameHeight <= 0)
            throw new ArgumentOutOfRangeException(nameof(frameHeight));

        if (!lattice.DrawPresent || lattice.DrawTileCenter is not { } drawCenterX)
            return null;

        // Build the draw-tile rectangle in strip coordinates.
        double halfWidth = lattice.Pitch * 0.5;
        double stripHeight = HandRectifier.OutputHeight;

        Point2f[] stripCorners =
        [
            new Point2f((float)(drawCenterX - halfWidth), 0),
            new Point2f((float)(drawCenterX + halfWidth), 0),
            new Point2f((float)(drawCenterX + halfWidth), (float)stripHeight),
            new Point2f((float)(drawCenterX - halfWidth), (float)stripHeight),
        ];

        // Invert the forward homography to map strip -> frame pixels.
        Mat inverse = new Mat();
        Cv2.Invert(homography, inverse, DecompTypes.LU);

        try
        {
            Point2f[] frameCorners =
                Cv2.PerspectiveTransform(stripCorners, inverse);

            // Convert pixel coords to normalized [0, 1].
            NormalizedPoint[] normalized =
            [
                Normalize(frameCorners[0], frameWidth, frameHeight),
                Normalize(frameCorners[1], frameWidth, frameHeight),
                Normalize(frameCorners[2], frameWidth, frameHeight),
                Normalize(frameCorners[3], frameWidth, frameHeight),
            ];

            return new NormalizedQuad(
                normalized[0], normalized[1],
                normalized[2], normalized[3]);
        }
        finally
        {
            inverse.Dispose();
        }
    }

    private static NormalizedPoint Normalize(
        Point2f pixel, int width, int height)
    {
        return new NormalizedPoint(
            Math.Clamp(pixel.X / width, 0.0, 1.0),
            Math.Clamp(pixel.Y / height, 0.0, 1.0));
    }
}
