using MahjongSoulOverlay.Core.Domain;
using OpenCvSharp;

namespace MahjongSoulOverlay.Vision.Detection;

public static class OccupancyScorer
{
    private const int PatchWidth = 96;
    private const int PatchHeight = 128;

    public static double Score(Mat frame, NormalizedQuad region, Mat? baseline)
    {
        ArgumentNullException.ThrowIfNull(frame);
        ArgumentNullException.ThrowIfNull(region);

        if (frame.Empty() || !IsValid(region))
            return 0d;
        if (baseline is not null &&
            (baseline.Empty() || baseline.Width != frame.Width || baseline.Height != frame.Height))
        {
            return 0d;
        }

        using var framePatch = WarpGrayscale(frame, region);
        using var blurred = new Mat();
        using var edges = new Mat();
        Cv2.GaussianBlur(framePatch, blurred, new Size(5, 5), 0);
        Cv2.Canny(blurred, edges, 50, 150);

        var edgeRatio = Cv2.CountNonZero(edges) / (double)(edges.Rows * edges.Cols);
        var contrast = 0d;
        if (baseline is not null)
        {
            using var baselinePatch = WarpGrayscale(baseline, region);
            using var difference = new Mat();
            Cv2.Absdiff(framePatch, baselinePatch, difference);
            contrast = Cv2.Mean(difference).Val0 / 255d;
        }

        return Math.Clamp(0.65d * edgeRatio + 0.35d * contrast, 0d, 1d);
    }

    private static Mat WarpGrayscale(Mat source, NormalizedQuad region)
    {
        using var grayscale = new Mat();
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
                throw new ArgumentException(
                    "Frame must have one, three, or four channels.", nameof(source));
        }

        var sourcePoints = ToPixelPoints(region, source.Width, source.Height);
        Point2f[] destinationPoints =
        [
            new(0, 0),
            new(PatchWidth - 1, 0),
            new(PatchWidth - 1, PatchHeight - 1),
            new(0, PatchHeight - 1)
        ];
        using var transform = Cv2.GetPerspectiveTransform(sourcePoints, destinationPoints);
        var patch = new Mat();
        Cv2.WarpPerspective(
            grayscale,
            patch,
            transform,
            new Size(PatchWidth, PatchHeight),
            InterpolationFlags.Linear,
            BorderTypes.Replicate);
        return patch;
    }

    private static Point2f[] ToPixelPoints(
        NormalizedQuad region, int width, int height) =>
    [
        Point(region.TopLeft, width, height),
        Point(region.TopRight, width, height),
        Point(region.BottomRight, width, height),
        Point(region.BottomLeft, width, height)
    ];

    private static Point2f Point(NormalizedPoint point, int width, int height) =>
        new((float)(point.X * (width - 1)), (float)(point.Y * (height - 1)));

    private static bool IsValid(NormalizedQuad region)
    {
        var points = new[]
        {
            region.TopLeft, region.TopRight, region.BottomRight, region.BottomLeft
        };
        var crossProducts = new double[points.Length];
        var twiceArea = 0d;
        for (var index = 0; index < points.Length; index++)
        {
            var current = points[index];
            var next = points[(index + 1) % points.Length];
            var following = points[(index + 2) % points.Length];
            twiceArea += current.X * next.Y - next.X * current.Y;
            crossProducts[index] =
                (next.X - current.X) * (following.Y - next.Y) -
                (next.Y - current.Y) * (following.X - next.X);
        }

        const double epsilon = 1e-12;
        return Math.Abs(twiceArea) > epsilon &&
            (crossProducts.All(value => value > epsilon) ||
             crossProducts.All(value => value < -epsilon));
    }
}
