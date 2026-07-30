using System.Runtime.InteropServices;
using Windows.Graphics.Capture;
using Windows.Graphics.DirectX;
using Windows.Graphics.DirectX.Direct3D11;
using Windows.Graphics.Imaging;
using Windows.Storage.Streams;
using WinRT;

namespace MahjongSoulOverlay.Windows.Capture;

/// <summary>
/// Captures one HWND through Windows Graphics Capture. The native D3D11 device
/// is used only as the backing device for the WinRT capture frame pool.
/// </summary>
public sealed class WindowsGraphicsCaptureBackend : IWindowsCaptureBackend
{
    private readonly object _sync = new();
    private GraphicsCaptureItem? _item;
    private Direct3D11CaptureFramePool? _framePool;
    private GraphicsCaptureSession? _session;
    private IDirect3DDevice? _direct3DDevice;
    private nint _nativeD3DDevice;
    private nint _nativeD3DContext;
    private Task _inFlight = Task.CompletedTask;
    private long _generation;
    private bool _acceptingFrames;
    private nint _windowHandle;
    private int _frameBusy;
    private bool _disposed;

    public event EventHandler<CapturedFrame>? FrameArrived;

    public Task StartAsync(nint windowHandle, CancellationToken cancellationToken)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        cancellationToken.ThrowIfCancellationRequested();

        lock (_sync)
        {
            if (_session is not null)
                return Task.CompletedTask;
            if (!GraphicsCaptureSession.IsSupported())
                throw new PlatformNotSupportedException("Windows Graphics Capture is not supported.");

            try
            {
                _item = CreateItemForWindow(windowHandle);
                _direct3DDevice = CreateDirect3DDevice(
                    out _nativeD3DDevice,
                    out _nativeD3DContext);
                _framePool = Direct3D11CaptureFramePool.CreateFreeThreaded(
                    _direct3DDevice,
                    DirectXPixelFormat.B8G8R8A8UIntNormalized,
                    2,
                    _item.Size);
                _framePool.FrameArrived += OnFrameArrived;
                _session = _framePool.CreateCaptureSession(_item);
                _session.IsCursorCaptureEnabled = false;
                _session.StartCapture();
                _generation++;
                _windowHandle = windowHandle;
                _acceptingFrames = true;
            }
            catch
            {
                ReleaseResources();
                throw;
            }
        }

        return Task.CompletedTask;
    }

    public async Task StopAsync()
    {
        Task inFlight;
        lock (_sync)
        {
            _acceptingFrames = false;
            _generation++;
            if (_framePool is not null)
                _framePool.FrameArrived -= OnFrameArrived;
            _session?.Dispose();
            _session = null;
            inFlight = _inFlight;
        }

        await inFlight.ConfigureAwait(false);
        lock (_sync)
            ReleaseResources();
    }

    public async ValueTask DisposeAsync()
    {
        if (_disposed)
            return;
        await StopAsync().ConfigureAwait(false);
        lock (_sync)
            _disposed = true;
    }

    private void OnFrameArrived(
        Direct3D11CaptureFramePool sender,
        object args)
    {
        if (Interlocked.Exchange(ref _frameBusy, 1) != 0)
        {
            try
            {
                lock (_sync)
                {
                    if (_acceptingFrames && _framePool == sender)
                    {
                        using var dropped = sender.TryGetNextFrame();
                    }
                }
            }
            catch (Exception)
            {
            }
            return;
        }

        try
        {
            lock (_sync)
            {
                if (!_acceptingFrames || _framePool != sender)
                {
                    Volatile.Write(ref _frameBusy, 0);
                    return;
                }

                var frame = sender.TryGetNextFrame();
                if (frame is null)
                {
                    Volatile.Write(ref _frameBusy, 0);
                    return;
                }

                _inFlight = ProcessFrameAsync(frame, _generation);
            }
        }
        catch (Exception)
        {
            Volatile.Write(ref _frameBusy, 0);
        }
    }

    private async Task ProcessFrameAsync(
        Direct3D11CaptureFrame frame,
        long generation)
    {
        try
        {
            CapturedFrame captured;
            using (frame)
            {
                var size = frame.ContentSize;
                using var bitmap = await SoftwareBitmap.CreateCopyFromSurfaceAsync(
                    frame.Surface,
                    BitmapAlphaMode.Premultiplied);
                var stride = checked(size.Width * 4);
                var pixels = new byte[checked(stride * size.Height)];
                var buffer = new global::Windows.Storage.Streams.Buffer((uint)pixels.Length);
                bitmap.CopyToBuffer(buffer);
                using var reader = DataReader.FromBuffer(buffer);
                reader.ReadBytes(pixels);

                var crop = GetClientCrop(_windowHandle, size.Width, size.Height);
                if (crop.Width != size.Width || crop.Height != size.Height)
                {
                    var croppedStride = checked(crop.Width * 4);
                    var cropped = new byte[checked(croppedStride * crop.Height)];
                    for (var y = 0; y < crop.Height; y++)
                    {
                        System.Buffer.BlockCopy(
                            pixels,
                            checked((crop.Y + y) * stride + crop.X * 4),
                            cropped,
                            y * croppedStride,
                            croppedStride);
                    }

                    pixels = cropped;
                    stride = croppedStride;
                }

                captured = CapturedFrame.TakeOwnership(
                    crop.Width,
                    crop.Height,
                    stride,
                    pixels,
                    DateTimeOffset.UtcNow);
            }

            lock (_sync)
            {
                if (generation != _generation)
                    return;
            }

            FrameArrived?.Invoke(this, captured);
        }
        catch (Exception)
        {
            // Target/device loss and subscriber failures must not escape the
            // native frame callback. The locator drives resynchronization.
        }
        finally
        {
            Volatile.Write(ref _frameBusy, 0);
        }
    }

    private void ReleaseResources()
    {
        if (_framePool is not null)
            _framePool.FrameArrived -= OnFrameArrived;
        _session?.Dispose();
        _framePool?.Dispose();
        (_direct3DDevice as IDisposable)?.Dispose();
        _session = null;
        _framePool = null;
        _item = null;
        _direct3DDevice = null;
        _windowHandle = nint.Zero;
        if (_nativeD3DContext != nint.Zero)
        {
            Marshal.Release(_nativeD3DContext);
            _nativeD3DContext = nint.Zero;
        }
        if (_nativeD3DDevice != nint.Zero)
        {
            Marshal.Release(_nativeD3DDevice);
            _nativeD3DDevice = nint.Zero;
        }
    }

    private static GraphicsCaptureItem CreateItemForWindow(nint windowHandle)
    {
        var interop = GraphicsCaptureItem.As<IGraphicsCaptureItemInterop>();
        var iid = new Guid("79C3F95B-31F7-4EC2-A464-632EF5D30760");
        var result = interop.CreateForWindow(windowHandle, ref iid, out var pointer);
        Marshal.ThrowExceptionForHR(result);
        try
        {
            return MarshalInterface<GraphicsCaptureItem>.FromAbi(pointer);
        }
        finally
        {
            Marshal.Release(pointer);
        }
    }

    private static IDirect3DDevice CreateDirect3DDevice(
        out nint nativeDevice,
        out nint nativeContext)
    {
        var result = NativeMethods.D3D11CreateDevice(
            nint.Zero,
            D3DDriverType.Hardware,
            nint.Zero,
            D3D11CreateDeviceBgraSupport,
            nint.Zero,
            0,
            D3D11SdkVersion,
            out nativeDevice,
            out _,
            out nativeContext);
        Marshal.ThrowExceptionForHR(result);

        nint dxgiDevice = nint.Zero;
        try
        {
            var dxgiDeviceIid = new Guid("54ec77fa-1377-44e6-8c32-88fd5f44c84c");
            result = Marshal.QueryInterface(nativeDevice, ref dxgiDeviceIid, out dxgiDevice);
            Marshal.ThrowExceptionForHR(result);
            result = NativeMethods.CreateDirect3D11DeviceFromDXGIDevice(
                dxgiDevice,
                out var inspectable);
            Marshal.ThrowExceptionForHR(result);
            try
            {
                return MarshalInterface<IDirect3DDevice>.FromAbi(inspectable);
            }
            finally
            {
                Marshal.Release(inspectable);
            }
        }
        catch
        {
            Marshal.Release(nativeContext);
            Marshal.Release(nativeDevice);
            nativeContext = nint.Zero;
            nativeDevice = nint.Zero;
            throw;
        }
        finally
        {
            if (dxgiDevice != nint.Zero)
                Marshal.Release(dxgiDevice);
        }
    }

    private static ScreenRect GetClientCrop(nint windowHandle, int frameWidth, int frameHeight)
    {
        if (!NativeMethods.GetClientRect(windowHandle, out var client))
            return new ScreenRect(0, 0, frameWidth, frameHeight);
        var origin = new NativePoint();
        if (!NativeMethods.ClientToScreen(windowHandle, ref origin))
            return new ScreenRect(0, 0, frameWidth, frameHeight);

        NativeRect captureBounds;
        var result = NativeMethods.DwmGetWindowAttribute(
            windowHandle,
            DwmWindowAttributeExtendedFrameBounds,
            out captureBounds,
            Marshal.SizeOf<NativeRect>());
        if (result < 0 && !NativeMethods.GetWindowRect(windowHandle, out captureBounds))
            return new ScreenRect(0, 0, frameWidth, frameHeight);

        var x = Math.Clamp(origin.X - captureBounds.Left, 0, frameWidth);
        var y = Math.Clamp(origin.Y - captureBounds.Top, 0, frameHeight);
        var width = Math.Clamp(client.Right - client.Left, 1, frameWidth - x);
        var height = Math.Clamp(client.Bottom - client.Top, 1, frameHeight - y);
        return new ScreenRect(x, y, width, height);
    }

    private const uint D3D11CreateDeviceBgraSupport = 0x20;
    private const uint D3D11SdkVersion = 7;
    private const uint DwmWindowAttributeExtendedFrameBounds = 9;

    [StructLayout(LayoutKind.Sequential)]
    private struct NativePoint
    {
        internal int X;
        internal int Y;
    }

    private enum D3DDriverType
    {
        Hardware = 1,
    }

    [ComImport]
    [Guid("3628E81B-3CAC-4C60-B7F4-23CE0E0C3356")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IGraphicsCaptureItemInterop
    {
        [PreserveSig]
        int CreateForWindow(nint windowHandle, ref Guid iid, out nint result);
    }

    private static class NativeMethods
    {
        [DllImport("d3d11.dll")]
        internal static extern int D3D11CreateDevice(
            nint adapter,
            D3DDriverType driverType,
            nint software,
            uint flags,
            nint featureLevels,
            uint featureLevelsCount,
            uint sdkVersion,
            out nint device,
            out int selectedFeatureLevel,
            out nint immediateContext);

        [DllImport("d3d11.dll")]
        internal static extern int CreateDirect3D11DeviceFromDXGIDevice(
            nint dxgiDevice,
            out nint graphicsDevice);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool GetClientRect(nint windowHandle, out NativeRect rect);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool ClientToScreen(nint windowHandle, ref NativePoint point);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool GetWindowRect(nint windowHandle, out NativeRect rect);

        [DllImport("dwmapi.dll")]
        internal static extern int DwmGetWindowAttribute(
            nint windowHandle,
            uint attribute,
            out NativeRect value,
            int valueSize);
    }
}
