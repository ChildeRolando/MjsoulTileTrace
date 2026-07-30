using OpenCvSharp;

namespace MahjongSoulOverlay.Vision.Frames;

public sealed class PixelFrame : IDisposable
{
    private Mat? _mat;

    public PixelFrame(Mat mat)
    {
        ArgumentNullException.ThrowIfNull(mat);
        if (mat.Empty())
            throw new ArgumentException("Pixel frame cannot own an empty matrix.", nameof(mat));

        _mat = mat;
    }

    public Mat Mat => _mat ?? throw new ObjectDisposedException(nameof(PixelFrame));

    public int Width => Mat.Width;

    public int Height => Mat.Height;

    public void Dispose()
    {
        var owned = Interlocked.Exchange(ref _mat, null);
        owned?.Dispose();
    }
}
