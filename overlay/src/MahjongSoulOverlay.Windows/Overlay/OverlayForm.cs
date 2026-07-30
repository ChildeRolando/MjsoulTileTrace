using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using MahjongSoulOverlay.Core.Pipeline;
using MahjongSoulOverlay.Windows.Capture;

namespace MahjongSoulOverlay.Windows.Overlay;

public sealed record OverlayUpdate(
    nint TargetHandle,
    bool TargetEligible,
    bool ShouldHide,
    IReadOnlyList<OverlayLayer> Layers);

internal static class OverlayWindowContract
{
    internal const int HitTestResult = -1;
    private const int WsExLayered = 0x00080000;
    private const int WsExTransparent = 0x00000020;
    private const int WsExNoActivate = 0x08000000;
    private const int WsExToolWindow = 0x00000080;
    private const int WsExTopmost = 0x00000008;

    internal static int ExtendedStyle(int baseStyle) =>
        baseStyle | WsExLayered | WsExTransparent | WsExNoActivate |
        WsExToolWindow | WsExTopmost;
}

internal interface ITargetClientGeometry
{
    bool TryGetEligibleClientBounds(nint targetHandle, out ScreenRect bounds);
}

internal interface IOverlayDispatcher
{
    bool CheckAccess();
    void Post(Action action);
}

internal interface IOverlaySurface
{
    nint WindowHandle { get; }
    bool Visible { get; }
    bool IsDisposed { get; }
    void ApplyFrame(
        ScreenRect? bounds,
        IReadOnlyList<OverlayLayer>? layers);
    void ShowInactive();
    void HideOverlay();
}

internal sealed class OverlayController : IDisposable
{
    private readonly IOverlaySurface _surface;
    private readonly ITargetClientGeometry _geometry;
    private readonly IOverlayDispatcher _dispatcher;
    private readonly object _sync = new();
    private ScreenRect? _bounds;
    private OverlayLayer[] _layers = [];
    private long _version;
    private bool _disposed;

    internal OverlayController(
        IOverlaySurface surface,
        ITargetClientGeometry geometry,
        IOverlayDispatcher dispatcher)
    {
        _surface = surface ?? throw new ArgumentNullException(nameof(surface));
        _geometry = geometry ?? throw new ArgumentNullException(nameof(geometry));
        _dispatcher = dispatcher ?? throw new ArgumentNullException(nameof(dispatcher));
    }

    internal void Update(OverlayUpdate update)
    {
        ArgumentNullException.ThrowIfNull(update);
        ArgumentNullException.ThrowIfNull(update.Layers);
        var immutableUpdate = update with { Layers = update.Layers.ToArray() };
        long version;
        lock (_sync)
        {
            if (_disposed)
                return;
            version = ++_version;
        }

        Dispatch(() => Apply(immutableUpdate, version));
    }

    public void Dispose()
    {
        long version;
        lock (_sync)
        {
            if (_disposed)
                return;
            _disposed = true;
            version = ++_version;
        }

        Dispatch(() => ApplyDisposed(version));
    }

    private void Apply(OverlayUpdate update, long version)
    {
        lock (_sync)
        {
            if (_disposed || version != _version || _surface.IsDisposed)
                return;
        }

        if (!update.TargetEligible ||
            update.ShouldHide ||
            update.TargetHandle == nint.Zero ||
            update.TargetHandle == _surface.WindowHandle ||
            !_geometry.TryGetEligibleClientBounds(update.TargetHandle, out var bounds) ||
            bounds.Width <= 0 ||
            bounds.Height <= 0)
        {
            HideAndClear();
            return;
        }

        var boundsChanged = _bounds != bounds;
        if (boundsChanged)
        {
            _bounds = bounds;
        }

        var layers = CanonicalCopy(update.Layers);
        var layersChanged = !_layers.SequenceEqual(layers);
        if (layersChanged)
        {
            _layers = layers;
        }

        if (boundsChanged || layersChanged)
            _surface.ApplyFrame(boundsChanged ? bounds : null, layersChanged ? _layers : null);

        if (!_surface.Visible)
            _surface.ShowInactive();
    }

    private void ApplyDisposed(long version)
    {
        lock (_sync)
        {
            if (version != _version)
                return;
        }

        HideAndClear();
    }

    private void HideAndClear()
    {
        _bounds = null;
        if (_layers.Length != 0)
        {
            _layers = [];
            _surface.ApplyFrame(null, _layers);
        }

        if (_surface.Visible)
            _surface.HideOverlay();
    }

    private void Dispatch(Action action)
    {
        if (_dispatcher.CheckAccess())
            action();
        else
            _dispatcher.Post(action);
    }

    private static OverlayLayer[] CanonicalCopy(IReadOnlyList<OverlayLayer> layers) =>
        layers
            .OrderBy(layer => layer.Seat)
            .ThenBy(layer => layer.Quad.TopLeft.Y)
            .ThenBy(layer => layer.Quad.TopLeft.X)
            .ThenBy(layer => layer.TileId)
            .ToArray();
}

public sealed class OverlayForm : Form, IOverlaySurface
{
    private const int WmNcHitTest = 0x0084;
    private readonly OverlayController _controller;
    private OverlayLayer[] _layers = [];
    private bool _controllerDisposed;

    public OverlayForm()
    {
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        _controller = new OverlayController(
            this,
            new Win32TargetClientGeometry(),
            new ControlOverlayDispatcher(this));
        _ = Handle;
    }

    protected override bool ShowWithoutActivation => true;

    protected override CreateParams CreateParams
    {
        get
        {
            var parameters = base.CreateParams;
            parameters.ExStyle = OverlayWindowContract.ExtendedStyle(parameters.ExStyle);
            return parameters;
        }
    }

    public void UpdateOverlay(OverlayUpdate update) => _controller.Update(update);

    nint IOverlaySurface.WindowHandle => Handle;

    bool IOverlaySurface.Visible => Visible;

    bool IOverlaySurface.IsDisposed => IsDisposed || Disposing;

    void IOverlaySurface.ApplyFrame(
        ScreenRect? bounds,
        IReadOnlyList<OverlayLayer>? layers)
    {
        if (bounds is { } geometry)
            SetBounds(geometry.X, geometry.Y, geometry.Width, geometry.Height);
        if (layers is not null)
            _layers = layers.ToArray();
        Present();
    }

    void IOverlaySurface.ShowInactive()
    {
        if (!IsHandleCreated)
            _ = Handle;
        _ = NativeMethods.ShowWindow(Handle, NativeMethods.SwShowNoActivate);
    }

    void IOverlaySurface.HideOverlay() => Hide();

    protected override void WndProc(ref Message message)
    {
        if (message.Msg == WmNcHitTest)
        {
            message.Result = OverlayWindowContract.HitTestResult;
            return;
        }

        base.WndProc(ref message);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing && !_controllerDisposed)
        {
            _controllerDisposed = true;
            _controller.Dispose();
        }

        base.Dispose(disposing);
    }

    private void Present()
    {
        if (!IsHandleCreated || IsDisposed || ClientSize.Width <= 0 || ClientSize.Height <= 0)
            return;

        using var bitmap = new Bitmap(
            ClientSize.Width,
            ClientSize.Height,
            PixelFormat.Format32bppPArgb);
        using (var graphics = Graphics.FromImage(bitmap))
        {
            OverlayRenderer.Clear(graphics, bitmap.Size);
            OverlayRenderer.Render(graphics, bitmap.Size, _layers);
        }

        NativeMethods.PresentLayeredWindow(Handle, Location, bitmap);
    }

    private sealed class ControlOverlayDispatcher : IOverlayDispatcher
    {
        private readonly Control _control;
        private readonly int _ownerThreadId;

        internal ControlOverlayDispatcher(Control control)
        {
            _control = control;
            _ownerThreadId = Environment.CurrentManagedThreadId;
        }

        public bool CheckAccess() =>
            Environment.CurrentManagedThreadId == _ownerThreadId;

        public void Post(Action action)
        {
            if (_control.IsDisposed || _control.Disposing)
                return;
            try
            {
                _ = _control.BeginInvoke(action);
            }
            catch (InvalidOperationException) when (
                _control.IsDisposed || !_control.IsHandleCreated)
            {
            }
        }
    }

    private sealed class Win32TargetClientGeometry : ITargetClientGeometry
    {
        public bool TryGetEligibleClientBounds(nint targetHandle, out ScreenRect bounds)
        {
            bounds = default;
            if (!NativeMethods.IsWindow(targetHandle) ||
                !NativeMethods.IsWindowVisible(targetHandle) ||
                NativeMethods.IsIconic(targetHandle) ||
                !NativeMethods.GetClientRect(targetHandle, out var rectangle))
            {
                return false;
            }

            var origin = new NativeMethods.NativePoint();
            if (!NativeMethods.ClientToScreen(targetHandle, ref origin))
                return false;

            bounds = ClientGeometry.ToScreen(
                new NativeRect(
                    rectangle.Left,
                    rectangle.Top,
                    rectangle.Right,
                    rectangle.Bottom),
                new ScreenPoint(origin.X, origin.Y));
            return bounds.Width > 0 && bounds.Height > 0;
        }
    }

    private static class NativeMethods
    {
        internal const int SwShowNoActivate = 4;
        private const byte AcSrcOver = 0;
        private const byte AcSrcAlpha = 1;
        private const int UlwAlpha = 2;

        [StructLayout(LayoutKind.Sequential)]
        internal struct NativeRectData
        {
            internal int Left;
            internal int Top;
            internal int Right;
            internal int Bottom;
        }

        [StructLayout(LayoutKind.Sequential)]
        internal struct NativePoint
        {
            internal int X;
            internal int Y;

            internal NativePoint(int x, int y)
            {
                X = x;
                Y = y;
            }
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct NativeSize(int width, int height)
        {
            internal int Width = width;
            internal int Height = height;
        }

        [StructLayout(LayoutKind.Sequential, Pack = 1)]
        private struct BlendFunction
        {
            internal byte BlendOp;
            internal byte BlendFlags;
            internal byte SourceConstantAlpha;
            internal byte AlphaFormat;
        }

        internal static void PresentLayeredWindow(
            nint windowHandle,
            Point screenLocation,
            Bitmap bitmap)
        {
            LayeredWindowResourceGuard.Use(
                Win32LayeredWindowResources.Instance,
                () => bitmap.GetHbitmap(Color.FromArgb(0)),
                (screenDc, memoryDc) =>
                {
                    var destination = new NativePoint(screenLocation.X, screenLocation.Y);
                    var source = new NativePoint(0, 0);
                    var size = new NativeSize(bitmap.Width, bitmap.Height);
                    var blend = new BlendFunction
                    {
                        BlendOp = AcSrcOver,
                        SourceConstantAlpha = 255,
                        AlphaFormat = AcSrcAlpha,
                    };
                    if (!UpdateLayeredWindow(
                            windowHandle,
                            screenDc,
                            ref destination,
                            ref size,
                            memoryDc,
                            ref source,
                            0,
                            ref blend,
                            UlwAlpha))
                    {
                        throw new InvalidOperationException(
                            "Unable to update the overlay window.");
                    }
                });
        }

        private sealed class Win32LayeredWindowResources : ILayeredWindowResources
        {
            internal static Win32LayeredWindowResources Instance { get; } = new();

            public nint AcquireScreen() => GetDC(nint.Zero);

            public nint CreateMemory(nint screen) => CreateCompatibleDC(screen);

            public nint Select(nint memory, nint drawingObject) =>
                SelectObject(memory, drawingObject);

            public void ReleaseScreen(nint screen)
            {
                _ = ReleaseDC(nint.Zero, screen);
            }

            public void DeleteMemory(nint memory)
            {
                _ = DeleteDC(memory);
            }

            public void DeleteObject(nint drawingObject)
            {
                _ = NativeMethods.DeleteObject(drawingObject);
            }
        }

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool ShowWindow(nint windowHandle, int command);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool IsWindow(nint windowHandle);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool IsWindowVisible(nint windowHandle);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool IsIconic(nint windowHandle);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool GetClientRect(
            nint windowHandle,
            out NativeRectData rectangle);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool ClientToScreen(
            nint windowHandle,
            ref NativePoint point);

        [DllImport("user32.dll")]
        private static extern nint GetDC(nint windowHandle);

        [DllImport("user32.dll")]
        private static extern int ReleaseDC(nint windowHandle, nint deviceContext);

        [DllImport("gdi32.dll")]
        private static extern nint CreateCompatibleDC(nint deviceContext);

        [DllImport("gdi32.dll")]
        private static extern nint SelectObject(nint deviceContext, nint drawingObject);

        [DllImport("gdi32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool DeleteObject(nint drawingObject);

        [DllImport("gdi32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool DeleteDC(nint deviceContext);

        [DllImport("user32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool UpdateLayeredWindow(
            nint windowHandle,
            nint destinationDc,
            ref NativePoint destination,
            ref NativeSize size,
            nint sourceDc,
            ref NativePoint source,
            int colourKey,
            ref BlendFunction blend,
            int flags);
    }
}

internal interface ILayeredWindowResources
{
    nint AcquireScreen();
    nint CreateMemory(nint screen);
    nint Select(nint memory, nint drawingObject);
    void ReleaseScreen(nint screen);
    void DeleteMemory(nint memory);
    void DeleteObject(nint drawingObject);
}

internal static class LayeredWindowResourceGuard
{
    internal static void Use(
        ILayeredWindowResources resources,
        Func<nint> bitmapHandleFactory,
        Action<nint, nint> present)
    {
        ArgumentNullException.ThrowIfNull(resources);
        ArgumentNullException.ThrowIfNull(bitmapHandleFactory);
        ArgumentNullException.ThrowIfNull(present);

        nint screen = 0;
        nint memory = 0;
        nint bitmap = 0;
        nint previous = 0;
        try
        {
            screen = resources.AcquireScreen();
            if (screen == nint.Zero)
                throw new InvalidOperationException("Unable to acquire the screen device context.");
            memory = resources.CreateMemory(screen);
            if (memory == nint.Zero)
                throw new InvalidOperationException("Unable to create a memory device context.");
            bitmap = bitmapHandleFactory();
            if (bitmap == nint.Zero)
                throw new InvalidOperationException("Unable to create the overlay bitmap handle.");
            previous = resources.Select(memory, bitmap);
            if (previous == nint.Zero || previous == new nint(-1))
                throw new InvalidOperationException("Unable to select the overlay bitmap.");

            present(screen, memory);
        }
        finally
        {
            if (previous != nint.Zero && previous != new nint(-1) && memory != nint.Zero)
                _ = resources.Select(memory, previous);
            if (bitmap != nint.Zero)
                resources.DeleteObject(bitmap);
            if (memory != nint.Zero)
                resources.DeleteMemory(memory);
            if (screen != nint.Zero)
                resources.ReleaseScreen(screen);
        }
    }
}
