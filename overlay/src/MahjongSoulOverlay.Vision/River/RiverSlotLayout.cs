using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.Profiles;

namespace MahjongSoulOverlay.Vision.River;

/// <summary>
/// A single logical cell in a 3x6 river grid, identified by its canonical
/// ID and 0-based index in discard order.
/// </summary>
public sealed record RiverSlot
{
    /// <summary>
    /// Canonical identifier such as "bottom-river-05".
    /// </summary>
    public string LogicalId { get; }

    /// <summary>
    /// Zero-based index (0-17) in discard order. Cell 0 is the first
    /// discarded tile; cell 17 is the most recent.
    /// </summary>
    public int Index { get; }

    /// <summary>
    /// The full quadrilateral of this cell in normalized coordinates.
    /// </summary>
    public NormalizedQuad Quad { get; }

    /// <summary>
    /// Inner sub-region of the cell used for feature extraction,
    /// typically 60-70% of the cell area to exclude visible tile sides.
    /// </summary>
    public NormalizedQuad EvidenceQuad { get; }

    internal RiverSlot(
        string logicalId, int index, NormalizedQuad quad, NormalizedQuad evidenceQuad)
    {
        ArgumentNullException.ThrowIfNull(logicalId);
        if (index is < 0 or >= RiverSlotLayout.CellCount)
            throw new ArgumentOutOfRangeException(nameof(index), index,
                $"Cell index must be within [0, {RiverSlotLayout.CellCount - 1}].");

        LogicalId = logicalId;
        Index = index;
        Quad = quad;
        EvidenceQuad = evidenceQuad;
    }
}

/// <summary>
/// Generates the fixed 3x6 logical grid for a seat's river region.
/// Each cell keeps its original quadrilateral rather than an axis-aligned
/// bounding box, and carries an evidence sub-region that excludes the
/// visible sides of 3D tiles.
/// </summary>
internal static class RiverSlotLayout
{
    public const int Rows = 3;
    public const int Columns = 6;
    public const int CellCount = Rows * Columns;

    /// <summary>
    /// Generate all 18 slots for a seat in discard order.
    /// </summary>
    /// <param name="seat">The seat whose river is being subdivided.</param>
    /// <param name="profile">The seat profile containing the river region and flow direction.</param>
    /// <returns>An ordered list of 18 <see cref="RiverSlot"/> values.</returns>
    public static IReadOnlyList<RiverSlot> Generate(Seat seat, SeatProfile profile)
    {
        if (profile is null)
            throw new ArgumentNullException(nameof(profile));

        NormalizedQuad region = profile.RiverRegion;
        LayoutDirection direction = profile.RiverFlowDirection;

        bool horizontal = direction is LayoutDirection.LeftToRight
            or LayoutDirection.RightToLeft;
        List<RiverSlot> slots = new(CellCount);
        string seatPrefix = seat.ToString().ToLowerInvariant();
        int index = 0;

        for (int crossIndex = 0; crossIndex < Rows; crossIndex++)
        {
            // For Top/Left seats the cross-axis runs opposite to the
            // screen coordinate, so reverse to keep logical order.
            int cross = seat is Seat.Top or Seat.Left
                ? (Rows - 1) - crossIndex
                : crossIndex;

            for (int along = 0; along < Columns; along++)
            {
                int flowIndex = direction is LayoutDirection.RightToLeft
                    or LayoutDirection.BottomToTop
                    ? (Columns - 1) - along
                    : along;

                int column = horizontal ? flowIndex : cross;
                int row = horizontal ? cross : flowIndex;

                double columns = horizontal ? (double)Columns : (double)Rows;
                double rows = horizontal ? (double)Rows : (double)Columns;

                NormalizedQuad cellQuad = Subdivide(
                    region,
                    column / columns,
                    row / rows,
                    (column + 1) / columns,
                    (row + 1) / rows);

                NormalizedQuad evidenceQuad = EvidenceSubRegion(cellQuad, seat);

                string logicalId = FormattableString.Invariant(
                    $"{seatPrefix}-river-{index:D2}");

                slots.Add(new RiverSlot(
                    logicalId, index, cellQuad, evidenceQuad));

                index++;
            }
        }

        return slots.AsReadOnly();
    }

    /// <summary>
    /// Returns the evidence sub-region for a single cell, shrunk to
    /// exclude the visible sides of 3D tiles. The exact shrinkage
    /// factors are tuned per seat so that the sub-region captures the
    /// tile face while avoiding the tile edges and the gap between tiles.
    /// </summary>
    private static NormalizedQuad EvidenceSubRegion(
        NormalizedQuad cell, Seat seat) =>
        seat switch
        {
            // (left, top, right, bottom) shrinkage in [0,1]
            Seat.Bottom => Subdivide(cell, 0.15, 0.40, 0.85, 0.95),
            Seat.Right  => Subdivide(cell, 0.40, 0.15, 0.95, 0.85),
            Seat.Top    => Subdivide(cell, 0.15, 0.05, 0.85, 0.60),
            Seat.Left   => Subdivide(cell, 0.05, 0.15, 0.60, 0.85),
            _           => throw new ArgumentOutOfRangeException(nameof(seat))
        };

    /// <summary>
    /// Subdivide a quadrilateral using bilinear interpolation.
    /// The parameters (left, top) and (right, bottom) are normalized
    /// coordinates in the [0,1]x[0,1] parameter space of the quad.
    /// </summary>
    private static NormalizedQuad Subdivide(
        NormalizedQuad region, double left, double top, double right, double bottom) =>
        new(
            Bilinear(region, left, top),
            Bilinear(region, right, top),
            Bilinear(region, right, bottom),
            Bilinear(region, left, bottom));

    /// <summary>
    /// Bilinear interpolation on a quadrilateral. <paramref name="x"/>
    /// interpolates along the top/bottom edges; <paramref name="y"/>
    /// interpolates vertically between those edges.
    /// </summary>
    private static NormalizedPoint Bilinear(
        NormalizedQuad region, double x, double y)
    {
        double topX = region.TopLeft.X + (region.TopRight.X - region.TopLeft.X) * x;
        double topY = region.TopLeft.Y + (region.TopRight.Y - region.TopLeft.Y) * x;
        double bottomX =
            region.BottomLeft.X + (region.BottomRight.X - region.BottomLeft.X) * x;
        double bottomY =
            region.BottomLeft.Y + (region.BottomRight.Y - region.BottomLeft.Y) * x;
        return new NormalizedPoint(
            topX + (bottomX - topX) * y,
            topY + (bottomY - topY) * y);
    }
}
