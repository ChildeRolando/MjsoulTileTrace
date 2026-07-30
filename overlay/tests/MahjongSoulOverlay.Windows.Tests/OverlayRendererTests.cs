using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.Pipeline;
using MahjongSoulOverlay.Windows.Capture;
using MahjongSoulOverlay.Windows.Overlay;

namespace MahjongSoulOverlay.Windows.Tests;

public sealed class OverlayRendererTests
{
    [Fact]
    public void Tsumogiri_fills_the_quad_with_the_scheme_a_colour()
    {
        using var bitmap = Canvas();
        Render(bitmap, Layer(DiscardKind.Tsumogiri, Quad(.25, .25, .75, .75)));

        AssertColour(bitmap.GetPixel(100, 100), Color.FromArgb(143, 38, 43, 47), 1);
        Assert.Equal(0, bitmap.GetPixel(10, 10).A);
    }

    [Fact]
    public void Tedashi_draws_gold_border_and_glow_but_keeps_centre_transparent()
    {
        using var bitmap = Canvas();
        Render(bitmap, Layer(DiscardKind.Tedashi, Quad(.25, .25, .75, .75)));

        Assert.Equal(0, bitmap.GetPixel(100, 100).A);
        AssertColour(bitmap.GetPixel(50, 100), Color.FromArgb(255, 255, 213, 102), 8);
        Assert.InRange(bitmap.GetPixel(47, 100).A, 1, 254);
    }

    [Fact]
    public void Unknown_does_not_change_any_pixel()
    {
        using var bitmap = Canvas();
        Render(bitmap, Layer(DiscardKind.Unknown, Quad(.25, .25, .75, .75)));

        Assert.All(Pixels(bitmap), pixel => Assert.Equal(0, pixel.A));
    }

    [Fact]
    public void Normalized_rotated_quad_is_scaled_to_client_pixels()
    {
        using var bitmap = new Bitmap(200, 100, PixelFormat.Format32bppArgb);
        var diamond = new NormalizedQuad(
            new(.5, .1), new(.8, .5), new(.5, .9), new(.2, .5));

        Render(bitmap, Layer(DiscardKind.Tsumogiri, diamond));

        Assert.True(bitmap.GetPixel(100, 50).A > 100);
        Assert.Equal(0, bitmap.GetPixel(20, 50).A);
    }

    [Fact]
    public void Rendering_clips_to_the_bitmap_and_invalid_sizes_are_no_ops()
    {
        using var bitmap = Canvas();
        using var graphics = Graphics.FromImage(bitmap);
        var corner = Layer(DiscardKind.Tsumogiri, Quad(0, 0, .2, .2));

        OverlayRenderer.Render(graphics, Size.Empty, [corner]);
        OverlayRenderer.Render(graphics, new Size(-1, 200), [corner]);
        Assert.All(Pixels(bitmap), pixel => Assert.Equal(0, pixel.A));

        OverlayRenderer.Render(graphics, bitmap.Size, [corner]);
        Assert.True(bitmap.GetPixel(0, 0).A > 0);
        Assert.Equal(0, bitmap.GetPixel(100, 100).A);
    }

    [Fact]
    public void Layer_order_is_deterministic_regardless_of_input_order()
    {
        var first = Layer(
            DiscardKind.Tsumogiri, Quad(.2, .2, .8, .8),
            Guid.Parse("00000000-0000-0000-0000-000000000001"));
        var second = Layer(
            DiscardKind.Tedashi, Quad(.2, .2, .8, .8),
            Guid.Parse("00000000-0000-0000-0000-000000000002"));
        using var left = Canvas();
        using var right = Canvas();

        Render(left, first, second);
        Render(right, second, first);

        Assert.Equal(Pixels(left), Pixels(right));
    }

    [Fact]
    public void Clear_is_idempotent_and_removes_every_layer()
    {
        using var bitmap = Canvas();
        using var graphics = Graphics.FromImage(bitmap);
        OverlayRenderer.Render(
            graphics,
            bitmap.Size,
            [Layer(DiscardKind.Tsumogiri, Quad(.1, .1, .9, .9))]);

        OverlayRenderer.Clear(graphics, bitmap.Size);
        OverlayRenderer.Clear(graphics, bitmap.Size);

        Assert.All(Pixels(bitmap), pixel => Assert.Equal(0, pixel.A));
    }

    [Fact]
    public void Repeated_rendering_releases_gdi_resources()
    {
        using var bitmap = Canvas();
        using var graphics = Graphics.FromImage(bitmap);
        var layers = new[] { Layer(DiscardKind.Tedashi, Quad(.1, .1, .9, .9)) };
        var process = Process.GetCurrentProcess();
        var before = GetGuiResources(process.Handle, 0);

        for (var index = 0; index < 500; index++)
        {
            OverlayRenderer.Clear(graphics, bitmap.Size);
            OverlayRenderer.Render(graphics, bitmap.Size, layers);
        }

        GC.Collect();
        GC.WaitForPendingFinalizers();
        var after = GetGuiResources(process.Handle, 0);
        Assert.InRange(after - before, 0, 4);
    }

    private static Bitmap Canvas() => new(200, 200, PixelFormat.Format32bppArgb);

    private static void Render(Bitmap bitmap, params OverlayLayer[] layers)
    {
        using var graphics = Graphics.FromImage(bitmap);
        OverlayRenderer.Render(graphics, bitmap.Size, layers);
    }

    private static OverlayLayer Layer(
        DiscardKind kind,
        NormalizedQuad quad,
        Guid? id = null) =>
        new(id ?? Guid.NewGuid(), Seat.Bottom, quad, kind);

    private static NormalizedQuad Quad(
        double left, double top, double right, double bottom) =>
        new(new(left, top), new(right, top), new(right, bottom), new(left, bottom));

    private static Color[] Pixels(Bitmap bitmap)
    {
        var pixels = new Color[bitmap.Width * bitmap.Height];
        for (var y = 0; y < bitmap.Height; y++)
        for (var x = 0; x < bitmap.Width; x++)
            pixels[(y * bitmap.Width) + x] = bitmap.GetPixel(x, y);
        return pixels;
    }

    private static void AssertColour(Color actual, Color expected, int tolerance)
    {
        Assert.InRange(actual.A, expected.A - tolerance, expected.A + tolerance);
        Assert.InRange(actual.R, expected.R - tolerance, expected.R + tolerance);
        Assert.InRange(actual.G, expected.G - tolerance, expected.G + tolerance);
        Assert.InRange(actual.B, expected.B - tolerance, expected.B + tolerance);
    }

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    private static extern int GetGuiResources(nint process, int flags);
}

public sealed class OverlayFormContractTests
{
    [Fact]
    public void Extended_style_contains_every_click_through_nonactivating_flag()
    {
        const int layered = 0x00080000;
        const int transparent = 0x00000020;
        const int noActivate = 0x08000000;
        const int toolWindow = 0x00000080;

        var style = OverlayWindowContract.ExtendedStyle(0x10);

        Assert.Equal(
            layered | transparent | noActivate | toolWindow,
            style & (layered | transparent | noActivate | toolWindow));
        Assert.Equal(0x10, style & 0x10);
    }

    [Fact]
    public void Hit_testing_is_always_transparent()
    {
        Assert.Equal(-1, OverlayWindowContract.HitTestResult);
    }

    [Fact]
    public void Geometry_seam_preserves_negative_monitor_coordinates()
    {
        var geometry = new FakeGeometry
        {
            Bounds = new ScreenRect(-1920, -30, 1920, 1080),
        };
        var controller = Controller(geometry, out var surface, out _);

        controller.Update(new OverlayUpdate(42, true, false, []));

        Assert.Equal(geometry.Bounds, surface.Bounds);
    }

    [Fact]
    public void Equivalent_updates_do_not_repeat_geometry_layers_show_or_invalidation()
    {
        var geometry = new FakeGeometry();
        var controller = Controller(geometry, out var surface, out _);
        var layers = new[] { Layer(DiscardKind.Tedashi) };
        var update = new OverlayUpdate(42, true, false, layers);

        controller.Update(update);
        controller.Update(update with { Layers = layers.ToArray() });

        Assert.Equal(2, geometry.QueryCount);
        Assert.Equal(1, surface.BoundsChanges);
        Assert.Equal(1, surface.LayerChanges);
        Assert.Equal(1, surface.ShowCalls);
        Assert.Equal(1, surface.Invalidations);
    }

    [Theory]
    [InlineData(false, false)]
    [InlineData(true, true)]
    public void Ineligible_or_engine_hide_clears_and_hides(bool eligible, bool engineHide)
    {
        var controller = Controller(new FakeGeometry(), out var surface, out _);
        controller.Update(new OverlayUpdate(42, true, false, [Layer(DiscardKind.Tsumogiri)]));

        controller.Update(new OverlayUpdate(42, eligible, engineHide, []));
        controller.Update(new OverlayUpdate(42, eligible, engineHide, []));

        Assert.False(surface.Visible);
        Assert.Empty(surface.Layers);
        Assert.Equal(1, surface.HideCalls);
    }

    [Fact]
    public void Lost_minimized_or_self_target_never_shows()
    {
        var geometry = new FakeGeometry { Available = false };
        var controller = Controller(geometry, out var surface, out _);

        controller.Update(new OverlayUpdate(42, true, false, []));
        geometry.Available = true;
        controller.Update(new OverlayUpdate(surface.WindowHandle, true, false, []));
        controller.Update(new OverlayUpdate(0, true, false, []));

        Assert.False(surface.Visible);
        Assert.Equal(0, surface.ShowCalls);
    }

    [Fact]
    public void Off_thread_updates_are_marshaled_and_only_latest_pending_update_applies()
    {
        var dispatcher = new FakeDispatcher { HasAccess = false };
        var controller = Controller(new FakeGeometry(), out var surface, out _, dispatcher);

        controller.Update(new OverlayUpdate(42, true, false, [Layer(DiscardKind.Tsumogiri)]));
        controller.Update(new OverlayUpdate(42, true, true, []));
        Assert.Equal(2, dispatcher.PendingCount);
        Assert.Equal(0, surface.ShowCalls);

        dispatcher.RunAll();

        Assert.False(surface.Visible);
        Assert.Equal(0, surface.ShowCalls);
        Assert.Empty(surface.Layers);
    }

    [Fact]
    public void Dispose_is_idempotent_and_pending_updates_cannot_resurrect_overlay()
    {
        var dispatcher = new FakeDispatcher { HasAccess = false };
        var controller = Controller(new FakeGeometry(), out var surface, out _, dispatcher);
        controller.Update(new OverlayUpdate(42, true, false, [Layer(DiscardKind.Tsumogiri)]));

        controller.Dispose();
        controller.Dispose();
        dispatcher.RunAll();
        controller.Update(new OverlayUpdate(42, true, false, [Layer(DiscardKind.Tedashi)]));

        Assert.False(surface.Visible);
        Assert.Empty(surface.Layers);
        Assert.Equal(0, surface.HideCalls);
    }

    private static OverlayController Controller(
        FakeGeometry geometry,
        out FakeSurface surface,
        out FakeDispatcher dispatcher,
        FakeDispatcher? suppliedDispatcher = null)
    {
        surface = new FakeSurface();
        dispatcher = suppliedDispatcher ?? new FakeDispatcher();
        return new OverlayController(surface, geometry, dispatcher);
    }

    private static OverlayLayer Layer(DiscardKind kind) =>
        new(
            Guid.Parse("00000000-0000-0000-0000-000000000001"),
            Seat.Bottom,
            new NormalizedQuad(new(.1, .1), new(.2, .1), new(.2, .2), new(.1, .2)),
            kind);

    private sealed class FakeGeometry : ITargetClientGeometry
    {
        public bool Available { get; set; } = true;
        public ScreenRect Bounds { get; set; } = new(5, 6, 1920, 1080);
        public int QueryCount { get; private set; }

        public bool TryGetEligibleClientBounds(nint targetHandle, out ScreenRect bounds)
        {
            QueryCount++;
            bounds = Bounds;
            return Available;
        }
    }

    private sealed class FakeSurface : IOverlaySurface
    {
        public nint WindowHandle { get; } = 99;
        public bool Visible { get; private set; }
        public bool IsDisposed { get; private set; }
        public ScreenRect? Bounds { get; private set; }
        public IReadOnlyList<OverlayLayer> Layers { get; private set; } = [];
        public int BoundsChanges { get; private set; }
        public int LayerChanges { get; private set; }
        public int ShowCalls { get; private set; }
        public int HideCalls { get; private set; }
        public int Invalidations { get; private set; }

        public void SetBounds(ScreenRect bounds)
        {
            Bounds = bounds;
            BoundsChanges++;
        }

        public void SetLayers(IReadOnlyList<OverlayLayer> layers)
        {
            Layers = layers.ToArray();
            LayerChanges++;
            Invalidations++;
        }

        public void ShowInactive()
        {
            Visible = true;
            ShowCalls++;
        }

        public void HideOverlay()
        {
            Visible = false;
            HideCalls++;
        }

    }

    private sealed class FakeDispatcher : IOverlayDispatcher
    {
        private readonly Queue<Action> _pending = new();
        public bool HasAccess { get; set; } = true;
        public int PendingCount => _pending.Count;

        public bool CheckAccess() => HasAccess;

        public void Post(Action action) => _pending.Enqueue(action);

        public void RunAll()
        {
            HasAccess = true;
            while (_pending.TryDequeue(out var action))
                action();
        }
    }
}
