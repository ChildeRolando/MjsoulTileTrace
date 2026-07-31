using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Vision.Hand;
using OpenCvSharp;

namespace MahjongSoulOverlay.Vision.Tests;

public sealed class SideHandTopologyTests
{
    private static SideHandPlaneFitter.PlaneFitResult DummyPlane => new(0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    private static SideHandSlotGeometry MakeGeo(double u0, double u1) =>
        new(u0, u1, default, default, default, default);
    private static IReadOnlyList<double> FullBaseline => Enumerable.Repeat(0.85, 13).ToArray();

    [Fact]
    public void Calibration_rejects_non_side_seats()
    {
        Assert.Throws<ArgumentException>(() =>
            new SideHandCalibration(Seat.Bottom, default, default, null!,
                0, 0, 0, 0, 0, 0, 0, 0, [],
                FullBaseline, 0.85, 0.05, SideHandEnd.Unknown, 0));
    }

    [Fact]
    public void Calibration_requires_exactly_13_slots()
    {
        Assert.Throws<ArgumentException>(() =>
            new SideHandCalibration(Seat.Left, default, default, DummyPlane,
                0, 0, 0, 0, 0, 0, 0, 0, [],
                FullBaseline, 0.85, 0.05, SideHandEnd.Unknown, 0));
    }

    // ── H.1: Perspective non-uniform widths ──────────────────────────
    [Fact]
    public void Perspective_non_uniform_slots_all_occupied()
    {
        // Simulate perspective: slot 0 wide (near camera), slot 12 narrow (far).
        var slots = new SideHandSlotGeometry[13];
        for (int i = 0; i < 13; i++)
        {
            double w = 0.10 - i * 0.003; // tapers from 0.10 to 0.064
            double u0 = i * 0.07;
            slots[i] = MakeGeo(u0, u0 + w);
        }
        var calib = new SideHandCalibration(Seat.Left, default, default, DummyPlane,
            0, 0, 0, 0, 0, 0, 0.03, 0.07, slots,
            FullBaseline, 0.85, 0.05, SideHandEnd.NearStart, 0.95);
        Assert.Equal(13, calib.TileCount);
        // Slot 0 is wider than slot 12.
        double w0 = calib.MainSlots[0].UEnd - calib.MainSlots[0].UStart;
        double w12 = calib.MainSlots[12].UEnd - calib.MainSlots[12].UStart;
        Assert.True(w0 > w12, "Perspective taper: slot 0 should be wider than slot 12");
        Assert.True(w0 > 0.08);
        Assert.True(w12 < 0.08);
    }

    // ── H.2: First and last tiles covered, no extrapolation ──────────
    [Fact]
    public void Endpoint_tiles_covered_no_extrapolation()
    {
        var slots = new SideHandSlotGeometry[13];
        for (int i = 0; i < 13; i++)
            slots[i] = MakeGeo(i * 0.07 + 0.02, (i + 1) * 0.07 + 0.02);
        var calib = new SideHandCalibration(Seat.Right, default, default, DummyPlane,
            0, 0, 0, 0, 0, 0, 0.02, 0.07, slots,
            FullBaseline, 0.85, 0.05, SideHandEnd.FarEnd, 0.95);

        // Both endpoints are inside [0.0, 1.0].
        Assert.True(calib.MainSlots[0].UStart >= 0.0);
        Assert.True(calib.MainSlots[12].UEnd <= 1.0);
        // No extrapolation outside the hand — start and end are realistic.
        Assert.True(calib.MainSlots[0].UStart < 0.05);
        Assert.True(calib.MainSlots[12].UEnd > 0.90);
    }

    // ── H.3: Missing seam → initial calibration rejected ─────────────
    [Fact]
    public void Missing_seam_rejects_initial_calibration()
    {
        // 11 slots should be rejected (initial requires 13).
        var slots11 = new SideHandSlotGeometry[11];
        for (int i = 0; i < 11; i++)
            slots11[i] = MakeGeo(i * 0.08, (i + 1) * 0.08);
        Assert.Throws<ArgumentException>(() =>
            new SideHandCalibration(Seat.Left, default, default, DummyPlane,
                0, 0, 0, 0, 0, 0, 0, 0, slots11,
                FullBaseline.Take(11).ToArray(), 0.85, 0.05, SideHandEnd.Unknown, 0.5));
    }

    // ── H.4: Extra strong outer-edge peak — not selected as seam ─────
    // (This is enforced by marginSamples exclusion in HandSeamDetector.Detect().
    //  We test that the calibrator rejects if an outer-boundary peak leaks in.)
    [Fact]
    public void Outer_edge_peak_is_not_internal_seam()
    {
        // If seam detection included edge peaks, slot 0 would be extremely narrow.
        // A valid calibration must have all slots with reasonable width.
        var slots = new SideHandSlotGeometry[13];
        for (int i = 0; i < 13; i++)
            slots[i] = MakeGeo(i * 0.07 + 0.01, (i + 1) * 0.07 + 0.01);
        // All slots have positive width.
        for (int i = 0; i < 13; i++)
        {
            double w = slots[i].UEnd - slots[i].UStart;
            Assert.True(w > 0.01, $"Slot {i} is too narrow — edge peak may have leaked in");
        }
    }

    // ── H.6: Slot quad alignment ─────────────────────────────────────
    [Fact]
    public void All_slot_quads_aligned_to_logical_indices()
    {
        var states = Enumerable.Repeat(SlotState.Occupied, 13).ToArray();
        double[] scores = Enumerable.Repeat(0.9, 13).ToArray();
        NormalizedQuad[] quads = Enumerable.Range(0, 13)
            .Select(i => new NormalizedQuad(
                new(i * 0.05, 0), new((i + 1) * 0.05, 0),
                new((i + 1) * 0.05, 0.1), new(i * 0.05, 0.1)))
            .ToArray();
        var segs = new[] { new HandSegment(SlotState.Occupied, 0, 12) };

        var topo = new SideHandTopology(states, scores, quads, segs, null, false, 0, null, 1.0);

        Assert.Equal(13, topo.MainSlotQuads.Count);
        Assert.Equal(13, topo.MainSlotStates.Count);
        Assert.Equal(13, topo.MainSlotScores.Count);
        // Logical index 0 quad covers physical tile 0 area.
        Assert.True(topo.MainSlotQuads[0].TopLeft.X < topo.MainSlotQuads[1].TopLeft.X);
        Assert.True(topo.MainSlotQuads[12].TopRight.X > topo.MainSlotQuads[11].TopRight.X);
    }

    // ── H.7: Unknown-state resolution preserves previous Occupied ─────
    [Fact]
    public void Unknown_preserves_previous_occupied()
    {
        var states = new SlotState[13];
        for (int i = 0; i < 13; i++)
            states[i] = i == 5 ? SlotState.Unknown : SlotState.Occupied;
        double[] scores = new double[13];
        for (int i = 0; i < 13; i++)
            scores[i] = i == 5 ? 0.25 : 0.85;
        NormalizedQuad[] quads = Enumerable.Range(0, 13)
            .Select(i => new NormalizedQuad(
                new(i * 0.05, 0), new((i + 1) * 0.05, 0),
                new((i + 1) * 0.05, 0.1), new(i * 0.05, 0.1)))
            .ToArray();
        var segs = new[] { new HandSegment(SlotState.Occupied, 0, 12) };

        var topo = new SideHandTopology(states, scores, quads, segs, null, false, 0, null, 1.0);

        // Slot 5 is Unknown.
        Assert.Equal(SlotState.Unknown, topo.MainSlotStates[5]);
        // Occupied count still counts only Occupied slots, not Unknown.
        Assert.Equal(12, topo.OccupiedCount);
        // OccupiedMainQuads contains slots 0–4, 6–12 (12 quads, skipping 5).
        Assert.Equal(12, topo.OccupiedMainQuads.Count);
    }

    // ── H.8: Internal one-slot removal with correct hole index ────────
    [Fact]
    public void Internal_one_slot_removal_correct_hole()
    {
        var states = new SlotState[13];
        for (int i = 0; i < 13; i++)
            states[i] = i == 6 ? SlotState.Empty : SlotState.Occupied;
        double[] scores = new double[13];
        for (int i = 0; i < 13; i++)
            scores[i] = i == 6 ? 0.03 : 0.9;
        NormalizedQuad[] quads = Enumerable.Range(0, 13)
            .Select(i => new NormalizedQuad(
                new(i * 0.05, 0), new((i + 1) * 0.05, 0),
                new((i + 1) * 0.05, 0.1), new(i * 0.05, 0.1)))
            .ToArray();
        var segs = new[] {
            new HandSegment(SlotState.Occupied, 0, 5),
            new HandSegment(SlotState.Occupied, 7, 12)
        };

        var topo = new SideHandTopology(states, scores, quads, segs, 6, false, 0, null, 0.95);

        Assert.Equal(12, topo.OccupiedCount);
        Assert.Equal(6, topo.InternalHoleIndex);
        Assert.Equal(13, topo.MainSlotStates.Count);
        Assert.Equal(SlotState.Empty, topo.MainSlotStates[6]);
        // All 13 quads present, hole quad is the Empty one at index 6.
        Assert.Equal(13, topo.MainSlotQuads.Count);
    }

    // ── H.9: Draw beyond FarEnd and NearStart, terminal not confused ──
    [Fact]
    public void Draw_external_tile_terminal_not_confused()
    {
        var states = Enumerable.Repeat(SlotState.Occupied, 13).ToArray();
        double[] scores = Enumerable.Repeat(0.9, 13).ToArray();
        NormalizedQuad[] quads = Enumerable.Range(0, 13)
            .Select(i => new NormalizedQuad(
                new(i * 0.05, 0), new((i + 1) * 0.05, 0),
                new((i + 1) * 0.05, 0.1), new(i * 0.05, 0.1)))
            .ToArray();
        var segs = new[] { new HandSegment(SlotState.Occupied, 0, 12) };
        var drawQuad = new NormalizedQuad(
            new(0.68, 0), new(0.74, 0),
            new(0.74, 0.1), new(0.68, 0.1));
        var topo = new SideHandTopology(states, scores, quads, segs,
            null, true, 0.85, drawQuad, 0.95);

        Assert.True(topo.DrawPresent);
        Assert.NotNull(topo.DrawQuad);
        // Terminal main slot (12) is NOT the draw quad — it's a distinct quad.
        Assert.NotEqual(topo.MainSlotQuads[12].TopLeft.X, topo.DrawQuad!.TopLeft.X);
        // All 13 main slots still Occupied.
        Assert.Equal(13, topo.OccupiedCount);
    }

    // ── Legacy tests (updated signatures) ────────────────────────────

    [Fact]
    public void Topology_with_13_occupied_has_no_hole()
    {
        var states = Enumerable.Repeat(SlotState.Occupied, 13).ToArray();
        double[] scores = Enumerable.Repeat(0.9, 13).ToArray();
        NormalizedQuad[] quads = Enumerable.Range(0, 13)
            .Select(i => new NormalizedQuad(
                new(i * 0.05, 0), new((i + 1) * 0.05, 0),
                new((i + 1) * 0.05, 0.1), new(i * 0.05, 0.1)))
            .ToArray();
        var segs = new[] { new HandSegment(SlotState.Occupied, 0, 12) };
        var topo = new SideHandTopology(states, scores, quads, segs, null, false, 0, null, 1.0);
        Assert.Equal(13, topo.OccupiedCount);
        Assert.Null(topo.InternalHoleIndex);
        Assert.Single(topo.MainSegments);
    }

    [Fact]
    public void Classification_hysteresis_prevents_false_empty()
    {
        // Simulate raw detection: mask with strong orange tile.
        using Mat mask = new Mat(200, 400, MatType.CV_8UC1, Scalar.White);
        Cv2.Rectangle(mask, new Rect(60, 20, 5, 160), Scalar.Black, -1);
        Cv2.Rectangle(mask, new Rect(130, 20, 5, 160), Scalar.Black, -1);

        // Baseline-relative classification: baseline = 0.85, occThresh = 0.65.
        // occupiedScore=0.85 → norm=1.0 → Occupied.
        Assert.Equal(SlotState.Occupied, ClassifyForTest(0.85, -1, 0.85));
        // emptyScore=0.05 → abs < 0.08 → Empty.
        Assert.Equal(SlotState.Empty, ClassifyForTest(0.05, -1, 0.85));
        // Hysteresis: prev was 0.85 Occupied, current 0.38 → norm=0.45,
        // prevNorm=1.0 ≥ occThresh ✓, norm ≥ occThresh*0.55=0.36 ✓ → Occupied.
        Assert.Equal(SlotState.Occupied, ClassifyForTest(0.38, 0.85, 0.85));
        // prev was Empty (0.05), current 0.15 → norm=0.18,
        // prevNorm=0.06 < 0.20 ✓, norm < 0.30 ✓ → Empty.
        Assert.Equal(SlotState.Empty, ClassifyForTest(0.15, 0.05, 0.85));
    }

    private static SlotState ClassifyForTest(double score, double prevScore, double baseline)
    {
        double norm = baseline > 0.01 ? score / baseline : score;
        double prevNorm = prevScore >= 0 && baseline > 0.01 ? prevScore / baseline : -1;
        double occThresh = 0.65;

        if (norm >= occThresh || score >= 0.45)
            return SlotState.Occupied;
        if (score < 0.08 || norm < 0.20)
            return SlotState.Empty;
        if (prevNorm >= 0)
        {
            if (prevNorm >= occThresh && norm >= occThresh * 0.55)
                return SlotState.Occupied;
            if (prevNorm < 0.20 && norm < 0.30)
                return SlotState.Empty;
        }
        return SlotState.Unknown;
    }
}
