using System.Text.Json;
using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Vision.Hand;
using OpenCvSharp;

namespace MahjongSoulOverlay.Vision.Tests;

/// <summary>
/// Part M production-path tests for the side-hand back-surface pipeline.
///
/// Every test calls the same public production components used by
/// OpenCvSeatDetector:
///   BackSurfaceGeometryDetector.Detect
///   BackTileInstanceDetector.Detect
///   ProjectiveTileSequenceFitter.SelectAndFit / Fit / ParseTopology
///
/// The synthetic fixtures deliberately mimic the real rendering:
/// a lighter orange top surface above the ridge, a darker orange back
/// surface below, vertical seams between tiles, and a table background.
/// Assertions are exact (counts, ordinals, positions) — never smoke checks.
/// </summary>
public sealed class BackSurfacePipelineTests
{
    // ── Test 1: fixed-fraction regression ──────────────────────────────
    [Fact]
    public void Ridge_follows_luminance_boundary_not_a_fixed_45_percent_line()
    {
        const int W = 420, H = 140, topY = 20, railY = 110, tileStart = 25, tileEnd = 395;
        // True ridge at 34 (≈24% of ROI height) — NOT at 45% of the orange run.
        const int ridgeTrue = 34;
        var seamXs = RampSeamXs(tileStart, tileEnd, 13, 3, 1.7);
        using var bgr = BuildBgr(W, H, topY, ridgeTrue, railY, seamXs, tileStart, tileEnd);
        using var mask = BuildMask(W, H, topY, ridgeTrue, railY, seamXs, tileStart, tileEnd);

        var detection = Detect(bgr, mask, W, topY, railY, tileStart, tileEnd);

        Assert.NotNull(detection);
        double detectedRidge = detection!.Geometry.RidgeY((tileStart + tileEnd) / 2);

        // Follows the luminance boundary (within RANSAC tolerance).
        Assert.True(Math.Abs(detectedRidge - ridgeTrue) <= 2.0,
            $"Detected ridge {detectedRidge:F1} should be near true ridge {ridgeTrue}.");

        // NOT the old fixed-fraction line: 45% of the orange run.
        double oldFakeRidge = topY + 0.45 * (railY - topY);
        Assert.True(Math.Abs(detectedRidge - oldFakeRidge) > 8.0,
            $"Detected ridge {detectedRidge:F1} must not return the 45% line {oldFakeRidge:F1}.");
    }

    // ── Test 2: rotatedBgr dependency ──────────────────────────────────
    [Fact]
    public void Ridge_moves_with_local_luminance_boundary_under_identical_mask()
    {
        const int W = 420, H = 140, topY = 20, railY = 110, tileStart = 25, tileEnd = 395;
        var seamXs = RampSeamXs(tileStart, tileEnd, 13, 3, 1.7);

        // Same orange binary mask geometry; only the BGR luminance boundary moves.
        using var bgrA = BuildBgr(W, H, topY, 40, railY, seamXs, tileStart, tileEnd);
        using var bgrB = BuildBgr(W, H, topY, 60, railY, seamXs, tileStart, tileEnd);
        using var mask = BuildMask(W, H, topY, 40, railY, seamXs, tileStart, tileEnd);

        var detA = Detect(bgrA, mask, W, topY, railY, tileStart, tileEnd);
        var detB = Detect(bgrB, mask, W, topY, railY, tileStart, tileEnd);

        Assert.NotNull(detA);
        Assert.NotNull(detB);
        double ridgeA = detA!.Geometry.RidgeY((tileStart + tileEnd) / 2);
        double ridgeB = detB!.Geometry.RidgeY((tileStart + tileEnd) / 2);

        Assert.True(Math.Abs(ridgeA - 40) <= 2.0, $"ridgeA={ridgeA:F1} expected≈40");
        Assert.True(Math.Abs(ridgeB - 60) <= 2.0, $"ridgeB={ridgeB:F1} expected≈60");
        Assert.True(Math.Abs(ridgeB - ridgeA) > 10.0,
            $"Ridge must move with the luminance boundary; A={ridgeA:F1} B={ridgeB:F1}.");
    }

    // ── Test 3: global brightness invariance ───────────────────────────
    [Theory]
    [InlineData(0.6)]
    [InlineData(1.4)]
    public void Global_brightness_change_keeps_ridge_within_tolerance(double scale)
    {
        const int W = 420, H = 140, topY = 20, railY = 110, tileStart = 25, tileEnd = 395;
        var seamXs = RampSeamXs(tileStart, tileEnd, 13, 3, 1.7);
        using var baseBgr = BuildBgr(W, H, topY, 50, railY, seamXs, tileStart, tileEnd);
        using var scaled = new Mat();
        Cv2.ConvertScaleAbs(baseBgr, scaled, scale, 0);
        using var mask = BuildMask(W, H, topY, 50, railY, seamXs, tileStart, tileEnd);

        var detection = Detect(scaled, mask, W, topY, railY, tileStart, tileEnd);

        Assert.NotNull(detection);
        double detectedRidge = detection!.Geometry.RidgeY((tileStart + tileEnd) / 2);
        Assert.True(Math.Abs(detectedRidge - 50) <= 2.0,
            $"At ×{scale} brightness, ridge {detectedRidge:F1} should stay ≈50.");
    }

    // ── Test 4: spatial lighting gradient ──────────────────────────────
    [Fact]
    public void Spatial_lighting_gradient_keeps_local_ridge_correct()
    {
        const int W = 420, H = 140, topY = 20, railY = 110, tileStart = 25, tileEnd = 395;
        var seamXs = RampSeamXs(tileStart, tileEnd, 13, 3, 1.7);

        // Per-column luminance scale 0.5 → 1.6: the right-side back surface is
        // brighter in absolute terms than the left-side top surface.
        var img = new Mat(H, W, MatType.CV_8UC3, new Scalar(40, 80, 55));
        for (int x = tileStart; x < tileEnd; x++)
        {
            double u = (double)(x - tileStart) / (tileEnd - tileStart);
            double s = 0.5 + 1.1 * u;
            Cv2.Rectangle(img, new Rect(x, topY, 1, 50 - topY), new Scalar(s * 90, s * 175, s * 235), -1);
            Cv2.Rectangle(img, new Rect(x, 50, 1, railY - 50), new Scalar(s * 45, s * 115, s * 200), -1);
        }
        using var bgr = img;
        using var mask = BuildMask(W, H, topY, 50, railY, seamXs, tileStart, tileEnd);

        var detection = Detect(bgr, mask, W, topY, railY, tileStart, tileEnd);

        Assert.NotNull(detection);
        var g = detection!.Geometry;
        double leftRidge = g.RidgeY(60);
        double rightRidge = g.RidgeY(360);
        Assert.True(Math.Abs(leftRidge - 50) <= 2.0, $"left ridge {leftRidge:F1} expected≈50");
        Assert.True(Math.Abs(rightRidge - 50) <= 2.0, $"right ridge {rightRidge:F1} expected≈50");
        Assert.True(Math.Abs(leftRidge - rightRidge) <= 2.0,
            $"Ridge must stay locally correct under gradient; left={leftRidge:F1} right={rightRidge:F1}.");
    }

    // ── Test 5: contrast-sign reversal ─────────────────────────────────
    [Fact]
    public void Reversed_contrast_still_selects_same_geometric_transition()
    {
        const int W = 420, H = 140, topY = 20, railY = 110, tileStart = 25, tileEnd = 395;
        var seamXs = RampSeamXs(tileStart, tileEnd, 13, 3, 1.7);

        // Back surface brighter than top (reversed local contrast), same geometry.
        var img = new Mat(H, W, MatType.CV_8UC3, new Scalar(40, 80, 55));
        Cv2.Rectangle(img, new Rect(tileStart, topY, tileEnd - tileStart, 50 - topY), new Scalar(45, 115, 200), -1);
        Cv2.Rectangle(img, new Rect(tileStart, 50, tileEnd - tileStart, railY - 50), new Scalar(90, 175, 235), -1);
        using var bgr = img;
        using var mask = BuildMask(W, H, topY, 50, railY, seamXs, tileStart, tileEnd);

        var detection = Detect(bgr, mask, W, topY, railY, tileStart, tileEnd);

        Assert.NotNull(detection);
        Assert.Equal(-1, detection!.Geometry.ContrastSign);
        double detectedRidge = detection.Geometry.RidgeY((tileStart + tileEnd) / 2);
        Assert.True(Math.Abs(detectedRidge - 50) <= 2.0,
            $"Reversed contrast ridge {detectedRidge:F1} should still find the transition at ≈50.");
    }

    // ── Test 6: wrong-side rejection ───────────────────────────────────
    [Fact]
    public void Back_side_selected_when_top_corridor_lacks_seam_structure()
    {
        const int W = 420, H = 140, topY = 20, railY = 110, tileStart = 25, tileEnd = 395;
        var seamXs = RampSeamXs(tileStart, tileEnd, 13, 3, 1.7);

        // Top surface uniform orange (no seam structure); back surface has
        // the repeated seams.  The detector must select the back side.
        using var bgr = BuildBgr(W, H, topY, 50, railY, seamXs, tileStart, tileEnd);
        using var mask = BuildMask(W, H, topY, 50, railY, seamXs, tileStart, tileEnd);

        var detection = Detect(bgr, mask, W, topY, railY, tileStart, tileEnd);

        Assert.NotNull(detection);
        Assert.Equal(BackSurfaceSide.BottomOfRidge, detection!.SelectedSide);
    }

    // ── Test 7: terminal side-face ─────────────────────────────────────
    [Fact]
    public void Terminal_side_face_does_not_become_an_instance_or_move_ridge()
    {
        const int W = 420, H = 140, topY = 20, railY = 110, tileStart = 25, tileEnd = 395;
        var seamXs = RampSeamXs(tileStart, tileEnd, 13, 3, 1.7);
        using var bgr = BuildBgr(W, H, topY, 50, railY, seamXs, tileStart, tileEnd);
        using var mask = BuildMask(W, H, topY, 50, railY, seamXs, tileStart, tileEnd);

        // A terminal side-face blob shares the orange hue and similar luminance
        // but is short in height (does not span the full back corridor).
        Cv2.Rectangle(bgr, new Rect(5, 30, 14, 40), new Scalar(70, 140, 215), -1);
        Cv2.Rectangle(mask, new Rect(5, 30, 14, 40), Scalar.All(255), -1);

        var detection = Detect(bgr, mask, W, topY, railY, tileStart, tileEnd);
        Assert.NotNull(detection);

        // Ridge/rail unaffected by the side face.
        Assert.True(Math.Abs(detection!.Geometry.RidgeY(200) - 50) <= 2.0,
            $"Side face must not move the ridge; got {detection.Geometry.RidgeY(200):F1}.");

        // The side face must not become a full back instance.
        var instances = BackTileInstanceDetector.Detect(
            detection, Plane(W, topY, railY, tileStart, tileEnd), new Rect(0, 0, W, H), Seat.Right, W, H);
        Assert.Equal(13, instances.Count);
    }

    // ── Test 8: back-only mask ─────────────────────────────────────────
    [Fact]
    public void Back_only_mask_excludes_top_keeps_backs_and_internal_seams()
    {
        const int W = 420, H = 140, topY = 20, railY = 110, tileStart = 25, tileEnd = 395;
        var seamXs = RampSeamXs(tileStart, tileEnd, 13, 3, 1.7);
        using var bgr = BuildBgr(W, H, topY, 50, railY, seamXs, tileStart, tileEnd);
        using var mask = BuildMask(W, H, topY, 50, railY, seamXs, tileStart, tileEnd);

        var detection = Detect(bgr, mask, W, topY, railY, tileStart, tileEnd);
        Assert.NotNull(detection);
        var backOnly = detection!.BackOnlyMask;

        // Top surface (rows above the ridge) must be excluded.
        using var topBand = backOnly[new Rect(tileStart, topY, tileEnd - tileStart, 50 - topY)];
        Assert.Equal(0, Cv2.CountNonZero(topBand));

        // Back corridor (between ridge+inset and rail-inset) must retain orange.
        using var backBand = backOnly[new Rect(tileStart, 55, tileEnd - tileStart, 40)];
        int backOrange = Cv2.CountNonZero(backBand);
        Assert.True(backOrange > 1000, $"Back corridor should retain orange; got {backOrange} px.");

        // Internal seams must be preserved as dark columns in the mask.
        int seamCol = seamXs[5]; // a real internal seam (3px wide, starts here)
        using var seamBand = backOnly[new Rect(seamCol, 55, 3, 40)];
        Assert.True(Cv2.CountNonZero(seamBand) < 5,
            "Internal seam should be dark in the back-only mask.");
    }

    // ── Test 9/10: real fixtures via the full production pipeline ─────
    [Fact]
    public void Real_left_fixture_exactly_13_instances_12_seams_no_extra_no_missing()
    {
        var result = RunRealSide("left", Seat.Left, RotateFlags.Rotate90Counterclockwise);
        AssertRealFixture(result);
    }

    [Fact]
    public void Real_right_fixture_exactly_13_instances_12_seams_no_extra_no_missing()
    {
        var result = RunRealSide("right", Seat.Right, RotateFlags.Rotate90Clockwise);
        AssertRealFixture(result);
    }

    private static void AssertRealFixture(RealSideResult result)
    {
        Assert.NotNull(result.Detection);
        Assert.NotNull(result.Selection);
        Assert.NotNull(result.Selection.Value.Model);
        var model = result.Selection.Value.Model!;
        var topo = ProjectiveTileSequenceFitter.ParseTopology(
            result.Selection.Value.SelectedInstances, model, new TemporalTrackerOptions());
        Assert.NotNull(topo);

        // Exactly 13 instances and 12 internal seams.
        Assert.Equal(13, result.Selection.Value.SelectedInstances.Count);
        Assert.Equal(13, topo!.MainCount);
        Assert.Equal(12, topo.MainCount - 1);

        // No extra, no missing ordinal.
        Assert.Null(topo.ExtraInstance);
        Assert.Null(topo.MissingMainOrdinal);
        Assert.Equal(TopologyStatus.Valid, topo.Status);

        // Selected back side, both supports present.
        Assert.Equal(BackSurfaceSide.BottomOfRidge, result.Detection!.SelectedSide);
        Assert.All(result.Selection.Value.SelectedInstances, inst =>
        {
            Assert.True(inst.RidgeSupport && inst.LowerRailSupport);
            Assert.True(inst.OrangeCoverage >= 0.5);
        });
    }

    // ── Test 11: endpoint padding ──────────────────────────────────────
    [Fact]
    public void Endpoint_padding_plane_wider_than_hand_creates_no_artificial_endpoints()
    {
        const int W = 420, H = 140, ridgeY = 50, railY = 110;
        var b = RampBounds(13, 1.5, 0.15, 0.85); // tiles occupy only the middle
        using var backOnly = TileMask(W, H, ridgeY, railY, b);
        // Plane spans the full width — wider than the actual hand.
        var plane = Plane(W, 20, railY);

        var detection = MakeDetection(backOnly, ridgeY, railY, plane, W, H);
        var instances = BackTileInstanceDetector.Detect(
            detection, plane, new Rect(0, 0, W, H), Seat.Right, W, H);

        Assert.Equal(13, instances.Count);
        Assert.True(instances[0].ULeft > 0.10, $"First instance should start inside the hand, got {instances[0].ULeft:F3}.");
        Assert.True(instances[^1].URight < 0.90, $"Last instance should end inside the hand, got {instances[^1].URight:F3}.");
    }

    // ── Test 12: double-edge seam ──────────────────────────────────────
    [Fact]
    public void Double_edge_seam_groups_to_exactly_one_selected_boundary()
    {
        const int W = 420, H = 140, ridgeY = 50, railY = 110;
        var b = RampBounds(13, 1.5);
        using var backOnly = TileMask(W, H, ridgeY, railY, b);
        // One physical seam rendered as two nearby dark lines.
        int bx = (int)(b[6] * W);
        for (int dx = -4; dx <= 4; dx += 8)
            Cv2.Rectangle(backOnly, new Rect(bx + dx, 51, 2, 58), Scalar.All(0), -1);

        var plane = Plane(W, 20, railY);
        var detection = MakeDetection(backOnly, ridgeY, railY, plane, W, H);
        var instances = BackTileInstanceDetector.Detect(
            detection, plane, new Rect(0, 0, W, H), Seat.Right, W, H);

        // Two nearby peaks from one seam → still exactly 13 instances (12 seams).
        Assert.Equal(13, instances.Count);
    }

    // ── Test 13: weak false boundary ───────────────────────────────────
    [Fact]
    public void Weak_false_boundary_does_not_add_an_instance()
    {
        const int W = 420, H = 140, ridgeY = 50, railY = 110;
        var b = RampBounds(13, 1.5);
        using var backOnly = TileMask(W, H, ridgeY, railY, b);
        // Faint internal shading inside one tile (short dark band).
        int cx = (int)((b[7] + b[8]) * 0.5 * W);
        Cv2.Rectangle(backOnly, new Rect(cx - 1, 60, 2, 20), Scalar.All(0), -1);

        var plane = Plane(W, 20, railY);
        var detection = MakeDetection(backOnly, ridgeY, railY, plane, W, H);
        var instances = BackTileInstanceDetector.Detect(
            detection, plane, new Rect(0, 0, W, H), Seat.Right, W, H);

        Assert.Equal(13, instances.Count);
    }

    // ── Test 14: merged two-tile mask ──────────────────────────────────
    [Fact]
    public void Merged_two_tile_mask_with_seam_evidence_splits_into_two()
    {
        const int W = 420, H = 140, ridgeY = 50, railY = 110;
        var b = RampBounds(13, 1.5);
        using var backOnly = TileMask(W, H, ridgeY, railY, b);
        int bx = (int)(b[6] * W);
        // Fuse the two tiles (erase the seam) but leave faint internal seam evidence.
        Cv2.Rectangle(backOnly, new Rect(bx - 3, 51, 7, 58), Scalar.All(255), -1);
        Cv2.Rectangle(backOnly, new Rect(bx - 1, 60, 3, 25), Scalar.All(0), -1);

        var plane = Plane(W, 20, railY);
        var detection = MakeDetection(backOnly, ridgeY, railY, plane, W, H);
        var instances = BackTileInstanceDetector.Detect(
            detection, plane, new Rect(0, 0, W, H), Seat.Right, W, H);

        // The fused pair must split back into two instances → 13 total.
        Assert.Equal(13, instances.Count);
        double medianW = SignalHelpers.Median(instances.Select(i => i.Width).ToList());
        Assert.All(instances, inst => Assert.True(inst.Width < medianW * 1.5,
            $"No instance should remain merged-wide; got width {inst.Width:F4} vs median {medianW:F4}."));
    }

    // ── Test 15: fragmented one-tile mask ──────────────────────────────
    [Fact]
    public void Fragmented_one_tile_mask_merges_back_into_one_quad()
    {
        const int W = 420, H = 140, ridgeY = 50, railY = 110;
        var b = RampBounds(13, 1.5);
        using var backOnly = TileMask(W, H, ridgeY, railY, b);
        // Weak artificial gap splitting one tile.
        int cx = (int)((b[7] + b[8]) * 0.5 * W);
        Cv2.Rectangle(backOnly, new Rect(cx - 2, 51, 4, 58), Scalar.All(0), -1);

        var plane = Plane(W, 20, railY);
        var detection = MakeDetection(backOnly, ridgeY, railY, plane, W, H);
        var instances = BackTileInstanceDetector.Detect(
            detection, plane, new Rect(0, 0, W, H), Seat.Right, W, H);

        // The weak split must not create a 14th instance → merged back to 13.
        Assert.Equal(13, instances.Count);
        double medianW = SignalHelpers.Median(instances.Select(i => i.Width).ToList());
        Assert.All(instances, inst => Assert.True(inst.Width > medianW * 0.5,
            $"No instance should remain a fragment; got width {inst.Width:F4} vs median {medianW:F4}."));
    }

    // ── Test 16: perspective fixture (no n/14 assumption) ──────────────
    [Fact]
    public void Perspective_width_variation_yields_13_instances_without_n14_assumption()
    {
        const int W = 420, H = 140, topY = 20, railY = 110, tileStart = 25, tileEnd = 395;
        // First-to-last width ratio 1.7 — substantial perspective.
        var seamXs = RampSeamXs(tileStart, tileEnd, 13, 3, 1.7);
        using var bgr = BuildBgr(W, H, topY, 50, railY, seamXs, tileStart, tileEnd);
        using var mask = BuildMask(W, H, topY, 50, railY, seamXs, tileStart, tileEnd);

        var detection = Detect(bgr, mask, W, topY, railY, tileStart, tileEnd);
        Assert.NotNull(detection);

        var plane = Plane(W, topY, railY, tileStart, tileEnd);
        var instances = BackTileInstanceDetector.Detect(
            detection!, plane, new Rect(0, 0, W, H), Seat.Right, W, H);

        Assert.Equal(13, instances.Count);
        double first = instances[0].Width;
        double last = instances[^1].Width;
        Assert.True(last / first > 1.3,
            $"First-to-last width ratio {last / first:F2} must show perspective (ramp 1.7).");

        var selection = ProjectiveTileSequenceFitter.SelectAndFit(instances);
        Assert.NotNull(selection);
        Assert.NotNull(selection.Value.Model);
        Assert.True(selection.Value.Model!.IsMonotonic);
    }

    // ── Test 17: one internal missing tile ─────────────────────────────
    [Fact]
    public void One_internal_missing_tile_preserves_missing_ordinal()
    {
        // 13-slot projective hand with slot 6 missing → 12 observed instances.
        const double A = 0.075, B = 0.02, C = 0.012;
        var instances = new List<BackTileInstance>();
        for (int k = 0; k <= 12; k++)
        {
            if (k == 6) continue;
            double u = ProjU(k, A, B, C);
            double w = ProjU(k + 0.5, A, B, C) - ProjU(k - 0.5, A, B, C);
            instances.Add(Mk(u - w / 2, u + w / 2));
        }

        var model = ProjectiveTileSequenceFitter.Fit(instances);
        Assert.NotNull(model);
        var topo = ProjectiveTileSequenceFitter.ParseTopology(
            instances, model!, new TemporalTrackerOptions());

        Assert.NotNull(topo);
        // One missing ordinal preserved — not compressed into a contiguous 12-row.
        Assert.Equal(6, topo!.MissingMainOrdinal);
        Assert.Equal(12, topo.MainCount);
        Assert.True(topo.MainSegments.Count >= 2,
            "Missing tile must not be compressed into a single 12-tile segment.");
    }

    // ── Test 18: main sequence plus terminal extra ─────────────────────
    [Fact]
    public void Terminal_extra_inferred_from_gap_main_count_remains_exact()
    {
        const double A = 0.075, B = 0.02, C = 0.012;
        var instances = new List<BackTileInstance>();
        for (int k = 0; k <= 12; k++)
        {
            double u = ProjU(k, A, B, C);
            double w = ProjU(k + 0.5, A, B, C) - ProjU(k - 0.5, A, B, C);
            instances.Add(Mk(u - w / 2, u + w / 2));
        }
        // Terminal extra separated by a larger gap.
        double ue = ProjU(13, A, B, C) + 0.07;
        double we = ProjU(13.5, A, B, C) - ProjU(12.5, A, B, C);
        instances.Add(Mk(ue - we / 2, ue + we / 2));

        var model = ProjectiveTileSequenceFitter.Fit(instances);
        Assert.NotNull(model);
        var topo = ProjectiveTileSequenceFitter.ParseTopology(
            instances, model!, new TemporalTrackerOptions());

        Assert.NotNull(topo);
        Assert.NotNull(topo!.ExtraInstance);
        Assert.Equal(13, topo.MainCount);
        Assert.Null(topo.MissingMainOrdinal);
    }

    // ── Shared helpers ─────────────────────────────────────────────────

    private static BackSurfaceDetectionResult? Detect(
        Mat bgr, Mat mask, int w, int topY, int railY, int tileStart = 0, int tileEnd = -1)
    {
        var plane = Plane(w, topY, railY, tileStart, tileEnd);
        return BackSurfaceGeometryDetector.Detect(bgr, mask, plane);
    }

    private static SideHandPlaneFitter.PlaneFitResult Plane(
        int w, int topY, int railY, int colStart = 0, int colEnd = -1) =>
        new(topY, topY, railY, railY, colStart, colEnd < 0 ? w - 1 : colEnd, 0, 0, 1.0, 1.0);

    private static Mat BuildBgr(
        int w, int h, int topY, int ridgeY, int railY,
        IReadOnlyList<int> seamXs, int tileStart, int tileEnd)
    {
        var img = new Mat(h, w, MatType.CV_8UC3, new Scalar(40, 80, 55)); // table
        Cv2.Rectangle(img, new Rect(tileStart, topY, tileEnd - tileStart, ridgeY - topY), new Scalar(90, 175, 235), -1);
        Cv2.Rectangle(img, new Rect(tileStart, ridgeY, tileEnd - tileStart, railY - ridgeY), new Scalar(45, 115, 200), -1);
        foreach (int x in seamXs)
            Cv2.Rectangle(img, new Rect(x, ridgeY + 2, 3, railY - ridgeY - 4), new Scalar(25, 30, 35), -1);
        return img;
    }

    private static Mat BuildMask(
        int w, int h, int topY, int ridgeY, int railY,
        IReadOnlyList<int> seamXs, int tileStart, int tileEnd)
    {
        var mask = new Mat(h, w, MatType.CV_8UC1, Scalar.All(0));
        Cv2.Rectangle(mask, new Rect(tileStart, topY, tileEnd - tileStart, railY - topY), Scalar.All(255), -1);
        foreach (int x in seamXs)
            Cv2.Rectangle(mask, new Rect(x, ridgeY + 2, 3, railY - ridgeY - 4), Scalar.All(0), -1);
        return mask;
    }

    /// <summary>Internal seams (12) for a 13-tile hand with linearly growing widths.</summary>
    private static List<int> RampSeamXs(int tileStart, int tileEnd, int count, int widthPx, double ratio)
    {
        double span = tileEnd - tileStart;
        double s = (ratio - 1.0) / (count - 1);
        double sum = 0; for (int k = 0; k < count; k++) sum += (1 + s * k);
        double w0 = span / sum;
        var xs = new List<int>();
        double pos = tileStart;
        for (int k = 0; k < count; k++)
        {
            pos += w0 * (1 + s * k);
            if (k < count - 1) xs.Add((int)pos - widthPx / 2);
        }
        return xs;
    }

    /// <summary>Tile boundaries for a hand of <paramref name="count"/> tiles with a width ramp.</summary>
    private static List<double> RampBounds(int count, double ratio, double lo = 0.03, double hi = 0.97)
    {
        var b = new List<double> { lo };
        double span = hi - lo;
        double s = (ratio - 1.0) / (count - 1);
        double sum = 0; for (int k = 0; k < count; k++) sum += (1 + s * k);
        double w0 = span / sum;
        double pos = lo;
        for (int k = 0; k < count - 1; k++) { pos += w0 * (1 + s * k); b.Add(pos); }
        b.Add(hi);
        return b;
    }

    /// <summary>Back-only mask with orange tiles between boundaries and dark seams at internal boundaries.</summary>
    private static Mat TileMask(int w, int h, int ridgeY, int railY, IReadOnlyList<double> uBounds, int seamPx = 3)
    {
        var m = new Mat(h, w, MatType.CV_8UC1, Scalar.All(0));
        int n = uBounds.Count;
        for (int i = 0; i < n - 1; i++)
        {
            int x0 = (int)(uBounds[i] * w), x1 = (int)(uBounds[i + 1] * w);
            Cv2.Rectangle(m, new Rect(x0, ridgeY + 1, x1 - x0, railY - ridgeY - 2), Scalar.All(255), -1);
        }
        for (int i = 1; i < n - 1; i++)
        {
            int x = (int)(uBounds[i] * w);
            Cv2.Rectangle(m, new Rect(x - seamPx / 2, ridgeY + 1, seamPx, railY - ridgeY - 2), Scalar.All(0), -1);
        }
        return m;
    }

    private static BackSurfaceDetectionResult MakeDetection(
        Mat backOnly, double ridgeY, double railY,
        SideHandPlaneFitter.PlaneFitResult plane, int w, int h)
    {
        var geom = new BackSurfaceGeometry(
            new Vec4d(0, 1, -ridgeY, 0), new Vec4d(0, 1, -railY, 0),
            plane.ColStart, plane.ColEnd, +1, 0.95, 200, 200, 0.1, railY - ridgeY);
        using var corridor = new Mat(h, w, MatType.CV_8UC1, Scalar.All(255));
        return new BackSurfaceDetectionResult(
            geom, corridor, backOnly, [], BackSurfaceSide.BottomOfRidge, 0.95);
    }

    private static BackTileInstance Mk(double uLeft, double uRight, double conf = 0.9) =>
        new(uLeft, uRight,
            new NormalizedQuad(new(0, 0), new(0, 0), new(0, 0), new(0, 0)),
            1.0, true, true, conf);

    private static double ProjU(double k, double A, double B, double C) =>
        (A * k + B) / (C * k + 1);

    // ── Real fixture (production path, mirroring OpenCvSeatDetector) ──

    private sealed record RealSideResult(
        BackSurfaceDetectionResult? Detection,
        IReadOnlyList<BackTileInstance> Instances,
        (IReadOnlyList<BackTileInstance> SelectedInstances, ProjectiveTileSequenceModel? Model)? Selection);

    private static RealSideResult RunRealSide(string name, Seat seat, RotateFlags rot)
    {
        string fixturePath = Path.Combine(AppContext.BaseDirectory, "Fixtures", "real-0229.png");
        using var img = Cv2.ImRead(fixturePath);
        Assert.False(img.Empty(), $"Fixture not found at {fixturePath}");
        int fw = img.Width, fh = img.Height;

        using var doc = JsonDocument.Parse(File.ReadAllText(StandardProfilePath()));
        var seatJson = doc.RootElement.GetProperty("seats").GetProperty(name);
        Rect cropRect = ExpandRoi(ReadQuad(seatJson.GetProperty("mainHandRegion")), fw, fh);

        using Mat cropped = new Mat(img, cropRect);
        using Mat rotated = new Mat();
        Cv2.Rotate(cropped, rotated, rot);

        var masker = new SideHandBackMask();
        masker.Calibrate(rotated);
        using Mat rawMask = masker.Extract(rotated);
        Assert.True(Cv2.CountNonZero(rawMask) >= 500, "Raw orange mask too small for real fixture.");

        using Mat cK = Cv2.GetStructuringElement(MorphShapes.Rect, new Size(17, 9));
        using Mat closed = new Mat();
        Cv2.MorphologyEx(rawMask, closed, MorphTypes.Close, cK);
        using Mat vK = Cv2.GetStructuringElement(MorphShapes.Rect, new Size(1, 3));
        using Mat cleanMask = new Mat();
        Cv2.MorphologyEx(closed, cleanMask, MorphTypes.Open, vK);

        var plane = SideHandPlaneFitter.Fit(rawMask, cleanMask);
        Assert.NotNull(plane);

        var detection = BackSurfaceGeometryDetector.Detect(rotated, rawMask, plane!);
        Assert.NotNull(detection);

        var instances = BackTileInstanceDetector.Detect(
            detection!, plane!, cropRect, seat, fw, fh);

        var selection = ProjectiveTileSequenceFitter.SelectAndFit(instances);

        return new RealSideResult(detection, instances, selection);
    }

    private static string StandardProfilePath()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidate = Path.Combine(
                dir.FullName, "overlay", "src", "MahjongSoulOverlay.Vision",
                "Profiles", "yonma-1920x1080.standard.json");
            if (File.Exists(candidate))
                return candidate;
            dir = dir.Parent;
        }
        throw new FileNotFoundException("Could not locate the standard profile.");
    }

    private static NormalizedQuad ReadQuad(JsonElement q) => new(
        new(q.GetProperty("topLeft").GetProperty("x").GetDouble(),
            q.GetProperty("topLeft").GetProperty("y").GetDouble()),
        new(q.GetProperty("topRight").GetProperty("x").GetDouble(),
            q.GetProperty("topRight").GetProperty("y").GetDouble()),
        new(q.GetProperty("bottomRight").GetProperty("x").GetDouble(),
            q.GetProperty("bottomRight").GetProperty("y").GetDouble()),
        new(q.GetProperty("bottomLeft").GetProperty("x").GetDouble(),
            q.GetProperty("bottomLeft").GetProperty("y").GetDouble()));

    private static Rect ExpandRoi(NormalizedQuad quad, int fw, int fh)
    {
        Point PxN(NormalizedPoint p) => new((int)(p.X * fw), (int)(p.Y * fh));
        var pts = new[] { PxN(quad.TopLeft), PxN(quad.TopRight), PxN(quad.BottomRight), PxN(quad.BottomLeft) };
        Rect r = Cv2.BoundingRect(pts);
        int ap = (int)(r.Height * 0.12), cp = (int)(r.Width * 0.22);
        return new Rect(
            Math.Max(0, r.X - cp), Math.Max(0, r.Y - ap),
            Math.Min(fw - Math.Max(0, r.X - cp), r.Width + 2 * cp),
            Math.Min(fh - Math.Max(0, r.Y - ap), r.Height + 2 * ap));
    }
}
