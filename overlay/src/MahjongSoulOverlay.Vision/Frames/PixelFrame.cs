using OpenCvSharp;
using System.Runtime.InteropServices;

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

    public static PixelFrame CopyFromBgra(
        int width,
        int height,
        int stride,
        ReadOnlySpan<byte> bgra)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(width);
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(height);
        if (stride < checked(width * 4))
            throw new ArgumentOutOfRangeException(nameof(stride));
        if (bgra.Length < checked(stride * height))
            throw new ArgumentException("The BGRA buffer is smaller than the frame.", nameof(bgra));

        var owned = new Mat(height, width, MatType.CV_8UC4);
        try
        {
            var pixels = bgra[..checked(stride * height)].ToArray();
            for (var row = 0; row < height; row++)
            {
                Marshal.Copy(
                    pixels,
                    row * stride,
                    owned.Data + checked((nint)(row * owned.Step())),
                    width * 4);
            }

            return new PixelFrame(owned);
        }
        catch
        {
            owned.Dispose();
            throw;
        }
    }

    public void Dispose()
    {
        var owned = Interlocked.Exchange(ref _mat, null);
        owned?.Dispose();
    }
}
