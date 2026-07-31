using MahjongSoulOverlay.Core.Domain;
using OpenCvSharp;

namespace MahjongSoulOverlay.Vision.Hand;

/// <summary>Tri-state slot occupancy.</summary>
public enum SlotState { Occupied, Empty, Unknown }

/// <summary>A contiguous run of slots with the same state.</summary>
public sealed record HandSegment(SlotState State, int StartIndex, int EndIndex);

/// <summary>
/// Runtime slot-occupancy topology for one side-hand frame.
/// Produced by sampling the raw orange-back mask within each calibrated slot.
/// </summary>
public sealed record SideHandTopology
{
    /// <summary>13-element list, aligned to logical slot index 0..12.</summary>
    public IReadOnlyList<SlotState> MainSlotStates { get; }
    /// <summary>13 raw occupancy scores, aligned to logical slot index.</summary>
    public IReadOnlyList<double> MainSlotScores { get; }
    /// <summary>13 frame-normalised quads, one per logical slot.</summary>
    public IReadOnlyList<NormalizedQuad> MainSlotQuads { get; }
    public IReadOnlyList<HandSegment> MainSegments { get; }
    public int? InternalHoleIndex { get; }
    public bool DrawPresent { get; }
    public double DrawScore { get; }
    public NormalizedQuad? DrawQuad { get; }
    /// <summary>Derived: MainSlotQuads filtered to Occupied slots only.</summary>
    public IReadOnlyList<NormalizedQuad> OccupiedMainQuads { get; }
    public double Confidence { get; }

    public int OccupiedCount => MainSlotStates.Count(s => s == SlotState.Occupied);

    public SideHandTopology(
        IReadOnlyList<SlotState> mainSlotStates,
        IReadOnlyList<double> mainSlotScores,
        IReadOnlyList<NormalizedQuad> mainSlotQuads,
        IReadOnlyList<HandSegment> mainSegments,
        int? internalHoleIndex,
        bool drawPresent,
        double drawScore,
        NormalizedQuad? drawQuad,
        double confidence)
    {
        MainSlotStates = mainSlotStates;
        MainSlotScores = mainSlotScores;
        MainSlotQuads = mainSlotQuads;
        MainSegments = mainSegments;
        InternalHoleIndex = internalHoleIndex;
        DrawPresent = drawPresent;
        DrawScore = drawScore;
        DrawQuad = drawQuad;
        OccupiedMainQuads = mainSlotQuads
            .Zip(mainSlotStates, (q, s) => (Quad: q, State: s))
            .Where(p => p.State == SlotState.Occupied)
            .Select(p => p.Quad)
            .ToArray();
        Confidence = confidence;
    }
}

/// <summary>
/// Detects per-slot occupancy from the raw orange-back mask using the
/// frozen calibration.  Does NOT use WarpPerspective or Sobel.
///
/// For each calibrated main slot, samples the central ~60% width and
/// middle ~65% height of the back plane to produce an orange occupancy
/// ratio.  Applies hysteresis and never emits a false Empty from noise.
/// </summary>
public static class SideHandTopologyDetector
{
    /// <summary>Fraction of slot width to sample (central portion).</summary>
    private const double SampleWidthFraction = 0.60;

    /// <summary>Margin from top/bottom of the back plane (fraction).</summary>
    private const double SampleHeightMargin = 0.18;

    /// <summary>Number of sample points per slot.</summary>
    private const int SamplesPerSlot = 40;

    /// <summary>Occupancy threshold below which a slot is clearly empty.</summary>
    private const double EmptyThreshold = 0.15;

    /// <summary>Occupancy threshold above which a slot is clearly occupied.</summary>
    private const double OccupiedThreshold = 0.40;

    /// <summary>Draw search range in pitch units beyond the main hand.</summary>
    private const double DrawSearchRangePitch = 1.8;

    /// <summary>Draw separation minimum in pitch units.</summary>
    private const double DrawSeparationPitch = 0.30;

    /// <summary>
    /// Computes slot occupancy from the raw mask using frozen calibration.
    /// </summary>
    /// <param name="rawMask">Raw binary orange-back mask (not closed).</param>
    /// <param name="calib">Frozen calibration.</param>
    /// <param name="previous">Previous topology for hysteresis, or null.</param>
    /// <param name="frameWidth">Original frame width for normalising quads.</param>
    /// <param name="frameHeight">Original frame height.</param>
    public static SideHandTopology Detect(
        Mat rawMask,
        SideHandCalibration calib,
        SideHandTopology? previous,
        int frameWidth,
        int frameHeight)
    {
        ArgumentNullException.ThrowIfNull(rawMask);
        ArgumentNullException.ThrowIfNull(calib);

        int n = calib.TileCount; // always 13 for initial calibration

        // ── 1. Score each calibrated main slot ────────────────────
        double[] scores = new double[n];
        for (int i = 0; i < n; i++)
            scores[i] = ScoreSlot(rawMask, calib, i);

        // ── 2. Build all 13 MainSlotQuads (one per logical slot) ──
        NormalizedQuad[] slotQuads = new NormalizedQuad[n];
        for (int i = 0; i < n; i++)
        {
            var geo = calib.MainSlots[i];
            Point2f[] corners = [geo.TopStart, geo.TopEnd, geo.BottomEnd, geo.BottomStart];
            Point2f[] framePx = SideHandRectifier.MapToFrame(corners, calib.CoarseRoi, calib.Seat);
            slotQuads[i] = SideHandRectifier.ToNormalizedQuad(framePx, frameWidth, frameHeight);
        }

        // ── 3. Baseline-relative classification with hysteresis ───
        SlotState[] states = new SlotState[n];
        for (int i = 0; i < n; i++)
        {
            double baselineScore = calib.BaselineSlotScores[i];
            double normalizedScore = baselineScore > 0.01
                ? scores[i] / baselineScore
                : scores[i];
            double prevNormalized = previous?.MainSlotScores.ElementAtOrDefault(i) ?? -1;
            double prevBaseline = i < calib.BaselineSlotScores.Count
                ? calib.BaselineSlotScores[i] : 0.2;
            double prevNorm = prevBaseline > 0.01 && previous is not null
                ? (previous.MainSlotScores.ElementAtOrDefault(i) / prevBaseline)
                : -1;

            // Occupied: normalized score ≥ 0.65 of baseline.
            double occThresh = 0.65;
            // Empty: score below 0.08 absolute, or normalized < 0.20 of baseline.
            double emptyAbsThresh = 0.08;

            if (normalizedScore >= occThresh || scores[i] >= 0.45)
            {
                states[i] = SlotState.Occupied;
            }
            else if (scores[i] < emptyAbsThresh || normalizedScore < 0.20)
            {
                states[i] = SlotState.Empty;
            }
            else if (prevNorm >= 0)
            {
                // Hysteresis: preserve previous known state in ambiguous range.
                if (prevNorm >= occThresh && normalizedScore >= occThresh * 0.55)
                    states[i] = SlotState.Occupied;
                else if (prevNorm < 0.20 && normalizedScore < 0.30)
                    states[i] = SlotState.Empty;
                else
                    states[i] = SlotState.Unknown;
            }
            else
            {
                states[i] = SlotState.Unknown;
            }
        }

        // ── 4. Find occupied segments ────────────────────────────
        List<HandSegment> segments = [];
        int segStart = -1;
        SlotState currentSeg = SlotState.Unknown;
        for (int i = 0; i < n; i++)
        {
            if (states[i] == currentSeg && currentSeg != SlotState.Unknown)
                continue;
            if (segStart >= 0 && currentSeg != SlotState.Unknown)
                segments.Add(new HandSegment(currentSeg, segStart, i - 1));
            if (states[i] != SlotState.Unknown)
            { segStart = i; currentSeg = states[i]; }
            else { segStart = -1; currentSeg = SlotState.Unknown; }
        }
        if (segStart >= 0 && currentSeg != SlotState.Unknown)
            segments.Add(new HandSegment(currentSeg, segStart, n - 1));

        // ── 5. Internal hole detection ──────────────────────────
        // Only a confidently Empty slot between two confidently Occupied
        // segments qualifies as an internal hole.
        int? holeIdx = null;
        var occSegs = segments.Where(s => s.State == SlotState.Occupied).ToList();
        if (occSegs.Count == 2)
        {
            int gapStart = occSegs[0].EndIndex + 1;
            int gapEnd = occSegs[1].StartIndex - 1;
            // Must be a single Empty slot (not Unknown).
            if (gapEnd == gapStart && states[gapStart] == SlotState.Empty)
                holeIdx = gapStart;
        }

        // ── 6. Draw detection ────────────────────────────────────
        bool drawPresent = false;
        double drawScore = 0;
        NormalizedQuad? drawQuad = null;

        if (calib.DrawSide != SideHandEnd.Unknown && n > 0)
        {
            bool searchFar = calib.DrawSide == SideHandEnd.FarEnd;
            int refIdx = searchFar ? n - 1 : 0;
            var refGeo = calib.MainSlots[refIdx];
            double pitchU = calib.PitchU;

            // G: don't clamp u to [0,1]; search outside the main-hand interval
            double gapStartU, gapEndU;
            if (searchFar)
            {
                gapStartU = refGeo.UEnd + DrawSeparationPitch * pitchU;
                gapEndU = gapStartU + DrawSearchRangePitch * pitchU;
            }
            else
            {
                gapEndU = refGeo.UStart - DrawSeparationPitch * pitchU;
                gapStartU = gapEndU - DrawSearchRangePitch * pitchU;
            }
            // Only reject if completely outside the rotated ROI bounds,
            // not based on [0,1] clamp.
            gapStartU = Math.Max(gapStartU, -0.2);
            gapEndU = Math.Min(gapEndU, 1.2);

            double bestScore = 0;
            double bestU = gapStartU;
            int searchSteps = 20;
            for (int s = 0; s < searchSteps; s++)
            {
                double u = gapStartU + (gapEndU - gapStartU) * (s + 0.5) / searchSteps;
                // Reject sample points outside the rotated ROI.
                if (u < -0.2 || u > 1.2) continue;
                double sc = ScoreAt(rawMask, calib, u, pitchU);
                if (sc > bestScore) { bestScore = sc; bestU = u; }
            }

            // G: require draw score to be clearly above empty and the
            // draw u to be well-separated from the terminal main slot.
            double terminalMidU = searchFar
                ? (calib.MainSlots[n - 1].UStart + calib.MainSlots[n - 1].UEnd) * 0.5
                : (calib.MainSlots[0].UStart + calib.MainSlots[0].UEnd) * 0.5;
            double sepFromTerminal = Math.Abs(bestU - terminalMidU);

            if (bestScore > 0.35 && sepFromTerminal > pitchU * 0.5)
            {
                drawPresent = true;
                drawScore = bestScore;

                double u0 = bestU - pitchU * 0.4;
                double u1 = bestU + pitchU * 0.4;
                Point2f[] dc = [
                    Top(calib, u0), Top(calib, u1),
                    Bottom(calib, u1), Bottom(calib, u0)];
                Point2f[] fpx = SideHandRectifier.MapToFrame(dc, calib.CoarseRoi, calib.Seat);
                drawQuad = SideHandRectifier.ToNormalizedQuad(fpx, frameWidth, frameHeight);
            }
        }

        double confidence = scores.Average() * 0.7 + 0.3;

        return new SideHandTopology(
            states, scores, slotQuads, segments, holeIdx,
            drawPresent, drawScore, drawQuad,
            Math.Clamp(confidence, 0, 1));
    }

    // ── Slot scoring ────────────────────────────────────────────────

    private static double ScoreSlot(
        Mat rawMask, SideHandCalibration calib, int slotIndex)
    {
        var geo = calib.MainSlots[slotIndex];
        double uMid = (geo.UStart + geo.UEnd) * 0.5;
        double uWidth = (geo.UEnd - geo.UStart) * SampleWidthFraction;
        double u0 = uMid - uWidth * 0.5;
        double u1 = uMid + uWidth * 0.5;

        int fg = 0, total = 0;
        int w = rawMask.Cols, h = rawMask.Rows;

        for (int j = 0; j < SamplesPerSlot; j++)
        {
            double u = u0 + uWidth * (j + 0.5) / SamplesPerSlot;
            Point2f top = Top(calib, u);
            Point2f bot = Bottom(calib, u);

            for (int k = 0; k < 4; k++)
            {
                double t = SampleHeightMargin + (1 - 2 * SampleHeightMargin) * (k + 0.5) / 4;
                int px = (int)Math.Round(top.X + (bot.X - top.X) * t);
                int py = (int)Math.Round(top.Y + (bot.Y - top.Y) * t);
                if (px >= 0 && px < w && py >= 0 && py < h)
                {
                    if (rawMask.At<byte>(py, px) > 0) fg++;
                    total++;
                }
            }
        }

        return total > 0 ? fg / (double)total : 0;
    }

    private static double ScoreAt(
        Mat rawMask, SideHandCalibration calib, double u, double uWidth)
    {
        double u0 = u - uWidth * 0.3;
        double u1 = u + uWidth * 0.3;
        int fg = 0, total = 0;
        int w = rawMask.Cols, h = rawMask.Rows;

        for (int j = 0; j < 10; j++)
        {
            double uu = u0 + (u1 - u0) * (j + 0.5) / 10;
            Point2f top = Top(calib, uu);
            Point2f bot = Bottom(calib, uu);
            for (int k = 0; k < 3; k++)
            {
                double t = SampleHeightMargin + (1 - 2 * SampleHeightMargin) * (k + 0.5) / 3;
                int px = (int)Math.Round(top.X + (bot.X - top.X) * t);
                int py = (int)Math.Round(top.Y + (bot.Y - top.Y) * t);
                if (px >= 0 && px < w && py >= 0 && py < h)
                {
                    if (rawMask.At<byte>(py, px) > 0) fg++;
                    total++;
                }
            }
        }
        return total > 0 ? fg / (double)total : 0;
    }

    // ── Geometry helpers ─────────────────────────────────────────────

    private static Point2f Top(SideHandCalibration calib, double u) => new(
        (float)(calib.Plane.ColStart + u * (calib.Plane.ColEnd - calib.Plane.ColStart)),
        (float)(calib.Plane.TopStartY + u * (calib.Plane.TopEndY - calib.Plane.TopStartY)));

    private static Point2f Bottom(SideHandCalibration calib, double u) => new(
        (float)(calib.Plane.ColStart + u * (calib.Plane.ColEnd - calib.Plane.ColStart)),
        (float)(calib.Plane.BottomStartY + u * (calib.Plane.BottomEndY - calib.Plane.BottomStartY)));
}
