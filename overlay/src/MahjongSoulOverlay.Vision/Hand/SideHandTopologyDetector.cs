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
    public IReadOnlyList<SlotState> MainSlotStates { get; }
    public IReadOnlyList<double> MainSlotScores { get; }
    public IReadOnlyList<HandSegment> MainSegments { get; }
    public int? InternalHoleIndex { get; }
    public bool DrawPresent { get; }
    public double DrawScore { get; }
    public NormalizedQuad? DrawQuad { get; }
    public IReadOnlyList<NormalizedQuad> OccupiedMainQuads { get; }
    public double Confidence { get; }

    public int OccupiedCount => MainSlotStates.Count(s => s == SlotState.Occupied);

    public SideHandTopology(
        IReadOnlyList<SlotState> mainSlotStates,
        IReadOnlyList<double> mainSlotScores,
        IReadOnlyList<HandSegment> mainSegments,
        int? internalHoleIndex,
        bool drawPresent,
        double drawScore,
        NormalizedQuad? drawQuad,
        IReadOnlyList<NormalizedQuad> occupiedMainQuads,
        double confidence)
    {
        MainSlotStates = mainSlotStates;
        MainSlotScores = mainSlotScores;
        MainSegments = mainSegments;
        InternalHoleIndex = internalHoleIndex;
        DrawPresent = drawPresent;
        DrawScore = drawScore;
        DrawQuad = drawQuad;
        OccupiedMainQuads = occupiedMainQuads;
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

        int n = calib.TileCount; // 13

        // ── 1. Score each calibrated main slot ────────────────────
        double[] scores = new double[n];
        for (int i = 0; i < n; i++)
            scores[i] = ScoreSlot(rawMask, calib, i);

        // ── 2. Convert scores to states with hysteresis ───────────
        SlotState[] states = new SlotState[n];
        for (int i = 0; i < n; i++)
        {
            double prevScore = previous?.MainSlotScores.ElementAtOrDefault(i) ?? -1;
            states[i] = Classify(scores[i], prevScore);
        }

        // ── 3. Find occupied segments ────────────────────────────
        List<HandSegment> segments = [];
        int segStart = -1;
        SlotState currentSeg = SlotState.Unknown;
        for (int i = 0; i < n; i++)
        {
            if (states[i] == currentSeg && currentSeg != SlotState.Unknown)
            {
                continue; // extend current segment
            }
            if (segStart >= 0 && currentSeg != SlotState.Unknown)
                segments.Add(new HandSegment(currentSeg, segStart, i - 1));

            if (states[i] != SlotState.Unknown)
            {
                segStart = i;
                currentSeg = states[i];
            }
            else
            {
                segStart = -1;
                currentSeg = SlotState.Unknown;
            }
        }
        if (segStart >= 0 && currentSeg != SlotState.Unknown)
            segments.Add(new HandSegment(currentSeg, segStart, n - 1));

        // ── 4. Internal hole detection ──────────────────────────
        int? holeIdx = null;
        var occSegs = segments.Where(s => s.State == SlotState.Occupied).ToList();
        if (occSegs.Count == 2)
        {
            int gapStart = occSegs[0].EndIndex + 1;
            int gapEnd = occSegs[1].StartIndex - 1;
            if (gapEnd == gapStart && states[gapStart] == SlotState.Empty)
                holeIdx = gapStart;
        }

        // ── 5. Build occupied main quads ─────────────────────────
        List<NormalizedQuad> occQuads = [];
        for (int i = 0; i < n; i++)
        {
            if (states[i] != SlotState.Occupied) continue;
            var geo = calib.MainSlots[i];
            Point2f[] corners = [geo.TopStart, geo.TopEnd, geo.BottomEnd, geo.BottomStart];
            Point2f[] framePx = SideHandRectifier.MapToFrame(corners, calib.CoarseRoi, calib.Seat);
            occQuads.Add(SideHandRectifier.ToNormalizedQuad(framePx, frameWidth, frameHeight));
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
            gapStartU = Math.Clamp(gapStartU, 0, 1);
            gapEndU = Math.Clamp(gapEndU, 0, 1);

            double bestScore = 0;
            double bestU = gapStartU;
            int searchSteps = 20;
            for (int s = 0; s < searchSteps; s++)
            {
                double u = gapStartU + (gapEndU - gapStartU) * (s + 0.5) / searchSteps;
                double sc = ScoreAt(rawMask, calib, u, pitchU);
                if (sc > bestScore) { bestScore = sc; bestU = u; }
            }

            if (bestScore > OccupiedThreshold)
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
            states, scores, segments, holeIdx,
            drawPresent, drawScore, drawQuad,
            occQuads, Math.Clamp(confidence, 0, 1));
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

    // ── Classification with hysteresis ──────────────────────────────

    private static SlotState Classify(double score, double previousScore)
    {
        if (score >= OccupiedThreshold)
            return SlotState.Occupied;

        if (score < EmptyThreshold)
            return SlotState.Empty;

        // Hysteresis: if previous was Occupied and we're close, keep Occupied.
        if (previousScore >= OccupiedThreshold && score >= OccupiedThreshold * 0.6)
            return SlotState.Occupied;

        // If previous was Empty and we're still low, keep Empty.
        if (previousScore >= 0 && previousScore < EmptyThreshold * 1.5 && score < EmptyThreshold * 1.5)
            return SlotState.Empty;

        return SlotState.Unknown;
    }

    // ── Geometry helpers ─────────────────────────────────────────────

    private static Point2f Top(SideHandCalibration calib, double u) => new(
        (float)(calib.Plane.ColStart + u * (calib.Plane.ColEnd - calib.Plane.ColStart)),
        (float)(calib.Plane.TopStartY + u * (calib.Plane.TopEndY - calib.Plane.TopStartY)));

    private static Point2f Bottom(SideHandCalibration calib, double u) => new(
        (float)(calib.Plane.ColStart + u * (calib.Plane.ColEnd - calib.Plane.ColStart)),
        (float)(calib.Plane.BottomStartY + u * (calib.Plane.BottomEndY - calib.Plane.BottomStartY)));
}
