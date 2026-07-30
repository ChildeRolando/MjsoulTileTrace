namespace MahjongSoulOverlay.Vision.Calibration;

public readonly record struct CalibrationCanvasTransform(
    double Left,
    double Top,
    double Width,
    double Height,
    int ImageWidth,
    int ImageHeight)
{
    public static CalibrationCanvasTransform Fit(
        int imageWidth,
        int imageHeight,
        int viewportWidth,
        int viewportHeight)
    {
        if (imageWidth <= 0)
            throw new ArgumentOutOfRangeException(nameof(imageWidth));
        if (imageHeight <= 0)
            throw new ArgumentOutOfRangeException(nameof(imageHeight));
        if (viewportWidth <= 0)
            throw new ArgumentOutOfRangeException(nameof(viewportWidth));
        if (viewportHeight <= 0)
            throw new ArgumentOutOfRangeException(nameof(viewportHeight));

        var scale = Math.Min(
            viewportWidth / (double)imageWidth,
            viewportHeight / (double)imageHeight);
        var width = imageWidth * scale;
        var height = imageHeight * scale;
        return new CalibrationCanvasTransform(
            (viewportWidth - width) / 2d,
            (viewportHeight - height) / 2d,
            width,
            height,
            imageWidth,
            imageHeight);
    }

    public bool ContainsViewportPoint(double x, double y) =>
        x >= Left && x <= Left + Width &&
        y >= Top && y <= Top + Height;

    public CalibrationPoint ToImage(double viewportX, double viewportY) =>
        new(
            (viewportX - Left) * ImageWidth / Width,
            (viewportY - Top) * ImageHeight / Height);

    public CalibrationPoint ToViewport(double imageX, double imageY) =>
        new(
            Left + (imageX * Width / ImageWidth),
            Top + (imageY * Height / ImageHeight));
}
