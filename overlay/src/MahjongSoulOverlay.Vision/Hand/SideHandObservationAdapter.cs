using MahjongSoulOverlay.Core.Domain;
using OpenCvSharp;

namespace MahjongSoulOverlay.Vision.Hand;

/// <summary>
/// Adapts the instance-based side-hand topology and temporal tracking result
/// to the Core API's fixed 13-element <see cref="SeatObservation"/> contract.
///
/// Maintains logical ordinal alignment during one action window: a confirmed
/// missing tile at ordinal k produces <c>false</c> at position k (a "hole"),
/// and later ordinals are NOT compressed left.  After the discard is resolved
/// and a new layout is stably formed, ordinals are rebased.
/// </summary>
public static class SideHandObservationAdapter
{
    /// <summary>Maximum number of logical main slots for side seats.</summary>
    public const int MaxMainSlots = 13;

    /// <summary>
    /// Adapts instance-based topology and tracking to Core API format.
    /// </summary>
    /// <param name="topology">Current frame's parsed instance topology.</param>
    /// <param name="tracking">Temporal tracking result.</param>
    /// <param name="previousResolvedSlots">
    /// Previous frame's resolved 13-element slot array, or null on first frame.
    /// </param>
    /// <param name="frameWidth">Original frame width for normalising quads.</param>
    /// <param name="frameHeight">Original frame height.</param>
    /// <param name="cropRect">Coarse crop rectangle in frame pixels.</param>
    /// <param name="seat">Seat (Left or Right).</param>
    /// <returns>Adapted output ready for SeatObservation construction.</returns>
    public static AdapterOutput Adapt(
        SideHandInstanceTopology topology,
        TrackingResult tracking,
        IReadOnlyList<bool>? previousResolvedSlots,
        int frameWidth,
        int frameHeight,
        Rect cropRect,
        Seat seat)
    {
        ArgumentNullException.ThrowIfNull(topology);
        ArgumentNullException.ThrowIfNull(tracking);

        var mainInstances = tracking.OrderedMainInstances;
        int n = mainInstances.Count;

        // ── 1. Build 13-element resolved slot array ───────────────
        bool[] resolved = new bool[MaxMainSlots];

        // Map instances to their logical positions.
        // If we have a projective model, use predicted positions.
        // Otherwise, use index order (simple left-to-right mapping).
        var model = topology.ProjectiveModel;

        for (int i = 0; i < MaxMainSlots; i++)
        {
            if (i < n)
            {
                // Slot i corresponds to main instance at position i.
                // Check if this ordinal is confirmed missing.
                bool isMissing = tracking.MissingMainOrdinal == i;
                resolved[i] = !isMissing;
            }
            else if (tracking.MissingMainOrdinal is { } missingOrd &&
                     missingOrd < MaxMainSlots && i == missingOrd)
            {
                // Missing ordinal within 13-slot range, beyond detected instances.
                resolved[i] = false;
            }
            else
            {
                // Inactive trailing positions.
                resolved[i] = false;
            }
        }

        // If tracking says occluded, preserve previous resolved state.
        if (tracking.IsOccluded && previousResolvedSlots is { } prev &&
            prev.Count == MaxMainSlots)
        {
            for (int i = 0; i < MaxMainSlots; i++)
                resolved[i] = prev[i];
        }

        // ── 2. MainHandCount ──────────────────────────────────────
        int mainHandCount = resolved.Count(b => b);

        // ── 3. DrawnSlotOccupied ──────────────────────────────────
        bool drawnSlotOccupied = tracking.ExtraInstance is not null;

        // ── 4. OccupiedMainQuads ──────────────────────────────────
        // Build frame-normalised quads for each occupied main slot.
        List<NormalizedQuad> occupiedQuads = new(MaxMainSlots);
        for (int i = 0; i < MaxMainSlots; i++)
        {
            if (resolved[i] && i < mainInstances.Count)
            {
                occupiedQuads.Add(mainInstances[i].Quad);
            }
        }

        // If still empty, use raw topology instances.
        if (occupiedQuads.Count == 0 && topology.OrderedMainInstances.Count > 0)
        {
            foreach (var inst in topology.OrderedMainInstances)
                occupiedQuads.Add(inst.Quad);
        }

        // ── 5. MainSlotRemoved ────────────────────────────────────
        bool mainSlotRemoved = tracking.MissingMainOrdinal is not null ||
                               tracking.TedashiEvidence;

        // ── 6. Confidence ─────────────────────────────────────────
        double confidence = Math.Clamp(
            (topology.Confidence * 0.5 + tracking.Confidence * 0.5), 0, 1);

        return new AdapterOutput(
            mainHandCount,
            resolved,
            drawnSlotOccupied,
            occupiedQuads,
            mainSlotRemoved,
            confidence,
            resolved);
    }

    /// <summary>
    /// Maps a rotated-ROI quad (from instance detection) to a frame-normalised quad.
    /// </summary>
    public static NormalizedQuad MapQuadToFrame(
        Point2f[] rotatedCorners,
        Rect cropRect,
        Seat seat,
        int frameWidth,
        int frameHeight)
    {
        ArgumentNullException.ThrowIfNull(rotatedCorners);
        if (rotatedCorners.Length != 4)
            throw new ArgumentException("Must have exactly 4 corners.", nameof(rotatedCorners));

        Point2f[] framePx = SideHandRectifier.MapToFrame(rotatedCorners, cropRect, seat);
        return SideHandRectifier.ToNormalizedQuad(framePx, frameWidth, frameHeight);
    }
}
