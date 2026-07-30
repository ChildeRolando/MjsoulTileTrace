using System.Drawing.Drawing2D;
using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.Pipeline;

namespace MahjongSoulOverlay.Windows.Overlay;

public static class OverlayRenderer
{
    private static readonly Color TsumogiriFill = Color.FromArgb(143, 38, 43, 47);
    private static readonly Color TedashiGold = Color.FromArgb(255, 255, 213, 102);
    private static readonly Color TedashiGlow = Color.FromArgb(72, 255, 213, 102);

    public static void Render(
        Graphics graphics,
        Size clientSize,
        IReadOnlyList<OverlayLayer> layers)
    {
        ArgumentNullException.ThrowIfNull(graphics);
        ArgumentNullException.ThrowIfNull(layers);
        if (clientSize.Width <= 0 || clientSize.Height <= 0)
            return;

        var previousMode = graphics.CompositingMode;
        var previousSmoothing = graphics.SmoothingMode;
        try
        {
            graphics.CompositingMode = CompositingMode.SourceOver;
            graphics.SmoothingMode = SmoothingMode.AntiAlias;

            foreach (var layer in Canonical(layers))
            {
                var points = ToPixels(layer.Quad, clientSize);
                switch (layer.Kind)
                {
                    case DiscardKind.Tsumogiri:
                        using (var brush = new SolidBrush(TsumogiriFill))
                            graphics.FillPolygon(brush, points);
                        break;
                    case DiscardKind.Tedashi:
                        using (var glow = new Pen(TedashiGlow, 9f)
                               { LineJoin = LineJoin.Round })
                            graphics.DrawPolygon(glow, points);
                        using (var border = new Pen(TedashiGold, 3f)
                               { LineJoin = LineJoin.Round })
                            graphics.DrawPolygon(border, points);
                        break;
                    case DiscardKind.Unknown:
                        break;
                }
            }
        }
        finally
        {
            graphics.CompositingMode = previousMode;
            graphics.SmoothingMode = previousSmoothing;
        }
    }

    public static void Clear(Graphics graphics, Size clientSize)
    {
        ArgumentNullException.ThrowIfNull(graphics);
        if (clientSize.Width <= 0 || clientSize.Height <= 0)
            return;

        var previousMode = graphics.CompositingMode;
        try
        {
            graphics.CompositingMode = CompositingMode.SourceCopy;
            using var transparent = new SolidBrush(Color.Transparent);
            graphics.FillRectangle(transparent, new Rectangle(Point.Empty, clientSize));
        }
        finally
        {
            graphics.CompositingMode = previousMode;
        }
    }

    private static IEnumerable<OverlayLayer> Canonical(
        IReadOnlyList<OverlayLayer> layers) =>
        layers
            .OrderBy(layer => layer.Seat)
            .ThenBy(layer => layer.Quad.TopLeft.Y)
            .ThenBy(layer => layer.Quad.TopLeft.X)
            .ThenBy(layer => layer.TileId);

    private static PointF[] ToPixels(NormalizedQuad quad, Size clientSize) =>
    [
        Pixel(quad.TopLeft, clientSize),
        Pixel(quad.TopRight, clientSize),
        Pixel(quad.BottomRight, clientSize),
        Pixel(quad.BottomLeft, clientSize),
    ];

    private static PointF Pixel(NormalizedPoint point, Size clientSize) =>
        new((float)(point.X * clientSize.Width), (float)(point.Y * clientSize.Height));
}
