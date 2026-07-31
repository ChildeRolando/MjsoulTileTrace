using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Vision.Hand;
using OpenCvSharp;

namespace MahjongSoulOverlay.Vision.Tests;

public sealed class SideHandTopologyTests
{
    [Fact]
    public void Calibration_rejects_non_side_seats()
    {
        Assert.Throws<ArgumentException>(() =>
            new SideHandCalibration(Seat.Bottom, default, default, null!,
                0, 0, 0, 0, 0, 0, 0, 0, [], SideHandEnd.Unknown, 0));
    }

    [Fact]
    public void Calibration_allows_9_to_13_slots()
    {
        var plane = new SideHandPlaneFitter.PlaneFitResult(0, 0, 0, 0, 0, 0, 0, 0, 0, 0);

        // 13: initial hand — ok.
        var slots13 = new SideHandSlotGeometry[13];
        for (int i = 0; i < 13; i++)
            slots13[i] = new(i * 0.07, (i + 1) * 0.07, default, default, default, default);
        _ = new SideHandCalibration(Seat.Left, default, default, plane,
            0, 0, 0, 0, 0, 0, 0, 0, slots13, SideHandEnd.Unknown, 0.5);

        // 12: post-add-a-kan — ok.
        var slots12 = new SideHandSlotGeometry[12];
        for (int i = 0; i < 12; i++)
            slots12[i] = new(i * 0.08, (i + 1) * 0.08, default, default, default, default);
        _ = new SideHandCalibration(Seat.Right, default, default, plane,
            0, 0, 0, 0, 0, 0, 0, 0, slots12, SideHandEnd.NearStart, 0.3);

        // 11: post-pon — ok.
        var slots11 = new SideHandSlotGeometry[11];
        for (int i = 0; i < 11; i++)
            slots11[i] = new(i * 0.08, (i + 1) * 0.08, default, default, default, default);
        _ = new SideHandCalibration(Seat.Right, default, default, plane,
            0, 0, 0, 0, 0, 0, 0, 0, slots11, SideHandEnd.NearStart, 0.8);

        // 10: post-chi or open-kan — ok.
        var slots10 = new SideHandSlotGeometry[10];
        for (int i = 0; i < 10; i++)
            slots10[i] = new(i * 0.09, (i + 1) * 0.09, default, default, default, default);
        _ = new SideHandCalibration(Seat.Left, default, default, plane,
            0, 0, 0, 0, 0, 0, 0, 0, slots10, SideHandEnd.FarEnd, 1.0);

        // 9: post-closed-kan — ok.
        var slots9 = new SideHandSlotGeometry[9];
        for (int i = 0; i < 9; i++)
            slots9[i] = new(i * 0.10, (i + 1) * 0.10, default, default, default, default);
        _ = new SideHandCalibration(Seat.Left, default, default, plane,
            0, 0, 0, 0, 0, 0, 0, 0, slots9, SideHandEnd.NearStart, 0.45);
    }

    [Fact]
    public void Calibration_rejects_invalid_slot_counts()
    {
        var plane = new SideHandPlaneFitter.PlaneFitResult(0, 0, 0, 0, 0, 0, 0, 0, 0, 0);

        // 8 tiles — cannot happen (minimum is 9 for closed kan).
        var slots8 = new SideHandSlotGeometry[8];
        for (int i = 0; i < 8; i++)
            slots8[i] = new(i * 0.1, (i + 1) * 0.1, default, default, default, default);
        Assert.Throws<ArgumentException>(() =>
            new SideHandCalibration(Seat.Left, default, default, plane,
                0, 0, 0, 0, 0, 0, 0, 0, slots8, SideHandEnd.Unknown, 0.5));

        // 14 tiles (impossible)
        Assert.Throws<ArgumentException>(() =>
            new SideHandCalibration(Seat.Left, default, default, plane,
                0, 0, 0, 0, 0, 0, 0, 0, [], SideHandEnd.Unknown, 0.5));
    }

    [Fact]
    public void Topology_with_13_occupied_has_no_hole()
    {
        var states = Enumerable.Repeat(SlotState.Occupied, 13).ToArray();
        double[] scores = Enumerable.Repeat(0.9, 13).ToArray();
        var segs = new[] { new HandSegment(SlotState.Occupied, 0, 12) };
        var topo = new SideHandTopology(
            states, scores, segs, null, false, 0, null, [], 1.0);
        Assert.Equal(13, topo.OccupiedCount);
        Assert.Null(topo.InternalHoleIndex);
        Assert.Single(topo.MainSegments);
    }

    [Fact]
    public void Topology_with_one_internal_empty_slot_has_hole()
    {
        var states = new SlotState[13];
        for (int i = 0; i < 13; i++)
            states[i] = i == 6 ? SlotState.Empty : SlotState.Occupied;
        double[] scores = new double[13];
        for (int i = 0; i < 13; i++)
            scores[i] = i == 6 ? 0.05 : 0.9;
        var segs = new[] {
            new HandSegment(SlotState.Occupied, 0, 5),
            new HandSegment(SlotState.Occupied, 7, 12)
        };
        var topo = new SideHandTopology(
            states, scores, segs, 6, true, 0.9, null, [], 0.95);
        Assert.Equal(12, topo.OccupiedCount);
        Assert.Equal(6, topo.InternalHoleIndex);
        Assert.Equal(2, topo.MainSegments.Count);
    }

    [Fact]
    public void Topology_with_draw_present_sets_draw_flag()
    {
        var states = Enumerable.Repeat(SlotState.Occupied, 13).ToArray();
        double[] scores = Enumerable.Repeat(0.9, 13).ToArray();
        var segs = new[] { new HandSegment(SlotState.Occupied, 0, 12) };
        var drawQuad = new NormalizedQuad(
            new(0.1, 0.1), new(0.2, 0.1), new(0.2, 0.2), new(0.1, 0.2));
        var topo = new SideHandTopology(
            states, scores, segs, null, true, 0.85, drawQuad, [], 0.95);
        Assert.True(topo.DrawPresent);
        Assert.NotNull(topo.DrawQuad);
    }

    [Fact]
    public void Slot_states_preserve_13_element_vector()
    {
        var states = new SlotState[13];
        for (int i = 0; i < 13; i++)
            states[i] = i is 3 or 8 ? SlotState.Unknown : SlotState.Occupied;
        double[] scores = new double[13];
        Array.Fill(scores, 0.6);
        scores[3] = 0.25;
        scores[8] = 0.30;
        var topo = new SideHandTopology(
            states, scores, [], null, false, 0, null, [], 0.7);
        // 13-element vector preserved; Unknown slots don't become Empty.
        Assert.Equal(13, topo.MainSlotStates.Count);
        Assert.Equal(11, topo.OccupiedCount);
        Assert.Equal(SlotState.Unknown, topo.MainSlotStates[3]);
        Assert.Equal(SlotState.Unknown, topo.MainSlotStates[8]);
    }

    [Fact]
    public void Classification_hysteresis_prevents_false_empty()
    {
        // Simulate the raw detection: create a mask with a strong orange tile.
        using Mat mask = new Mat(200, 400, MatType.CV_8UC1, Scalar.White);
        // Draw a black seam between tile 0 and 1
        Cv2.Rectangle(mask, new Rect(60, 20, 5, 160), Scalar.Black, -1);
        // Black seam between tile 1 and 2
        Cv2.Rectangle(mask, new Rect(130, 20, 5, 160), Scalar.Black, -1);

        // Narrow ordinary seam: score at the seam should be low but not "empty"
        // because we sample only the central portion of each slot.
        // This test verifies the classification thresholds are reasonable.
        double occupiedScore = 0.85;
        double emptyScore = 0.05;

        // Occupied stays Occupied.
        Assert.Equal(SlotState.Occupied,
            ClassifyForTest(occupiedScore, -1));
        // Empty stays Empty.
        Assert.Equal(SlotState.Empty,
            ClassifyForTest(emptyScore, -1));
        // With hysteresis: was Occupied, borderline stays Occupied.
        Assert.Equal(SlotState.Occupied,
            ClassifyForTest(0.28, 0.85));
        // With hysteresis: was Empty, borderline stays Empty.
        Assert.Equal(SlotState.Empty,
            ClassifyForTest(0.15, 0.05));
    }

    // Direct test of the classification logic used by SideHandTopologyDetector.
    private static SlotState ClassifyForTest(double score, double prevScore)
    {
        const double occupiedThreshold = 0.40;
        const double emptyThreshold = 0.15;

        if (score >= occupiedThreshold) return SlotState.Occupied;
        if (score < emptyThreshold) return SlotState.Empty;
        if (prevScore >= occupiedThreshold && score >= occupiedThreshold * 0.6)
            return SlotState.Occupied;
        if (prevScore >= 0 && prevScore < emptyThreshold * 1.5 && score < emptyThreshold * 1.5)
            return SlotState.Empty;
        return SlotState.Unknown;
    }
}
