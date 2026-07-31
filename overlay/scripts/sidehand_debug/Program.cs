using System.Text.Json;
using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Vision.Hand;
using OpenCvSharp;

using var img = Cv2.ImRead(@"E:\文档\日麻教学\overlay\artifacts\replay\real-0229.png");
int FW = img.Width, FH = img.Height;

var jsonText = File.ReadAllText(
    @"E:\文档\日麻教学\overlay\src\MahjongSoulOverlay.Vision\Profiles\yonma-1920x1080.standard.json");
using var doc = JsonDocument.Parse(jsonText);
var seats = doc.RootElement.GetProperty("seats");

NormalizedQuad ReadQuad(JsonElement q) => new(
    new(q.GetProperty("topLeft").GetProperty("x").GetDouble(),
        q.GetProperty("topLeft").GetProperty("y").GetDouble()),
    new(q.GetProperty("topRight").GetProperty("x").GetDouble(),
        q.GetProperty("topRight").GetProperty("y").GetDouble()),
    new(q.GetProperty("bottomRight").GetProperty("x").GetDouble(),
        q.GetProperty("bottomRight").GetProperty("y").GetDouble()),
    new(q.GetProperty("bottomLeft").GetProperty("x").GetDouble(),
        q.GetProperty("bottomLeft").GetProperty("y").GetDouble()));

Rect ExpandRoi(NormalizedQuad quad)
{
    Point PxN(NormalizedPoint p) => new((int)(p.X * FW), (int)(p.Y * FH));
    var pts = new[] { PxN(quad.TopLeft), PxN(quad.TopRight), PxN(quad.BottomRight), PxN(quad.BottomLeft) };
    Rect r = Cv2.BoundingRect(pts);
    int ap = (int)(r.Height * 0.12), cp = (int)(r.Width * 0.22);
    return new Rect(Math.Max(0, r.X - cp), Math.Max(0, r.Y - ap),
        Math.Min(FW - Math.Max(0, r.X - cp), r.Width + 2 * cp),
        Math.Min(FH - Math.Max(0, r.Y - ap), r.Height + 2 * ap));
}

void Place(Mat src, int r, int c, int pW, int pH, Mat dbg, string label)
{
    int x0 = 10 + c * (pW + 10), y0 = 10 + r * (pH + 10);
    Mat disp;
    Mat? temp = null;
    if (src.Channels() == 1) { temp = new Mat(); Cv2.CvtColor(src, temp, ColorConversionCodes.GRAY2BGR); disp = temp; }
    else disp = src;
    using var rs = new Mat(); Cv2.Resize(disp, rs, new Size(pW, pH), 0, 0, InterpolationFlags.Linear);
    temp?.Dispose();
    int cw = Math.Min(rs.Cols, dbg.Cols - x0), ch = Math.Min(rs.Rows, dbg.Rows - y0);
    rs[new Rect(0, 0, cw, ch)].CopyTo(dbg[new Rect(x0, y0, cw, ch)]);
    Cv2.PutText(dbg, label, new Point(x0 + 4, y0 + 18), HersheyFonts.HersheySimplex, 0.4, Scalar.White, 1);
}

void DrawQuadPx(Mat canvas, Point2f[] corners, Scalar c, int t)
{
    var pts = corners.Select(p => new Point((int)p.X, (int)p.Y)).ToArray();
    Cv2.Polylines(canvas, new[] { pts }, true, c, t, LineTypes.AntiAlias);
}

void ProcessSide(string name, Seat seat, RotateFlags rot)
{
    Console.WriteLine($"\n{'='*60}\n=== {name} ===\n{'='*60}");
    var s = seats.GetProperty(name);
    Rect cropRect = ExpandRoi(ReadQuad(s.GetProperty("mainHandRegion")));
    NormalizedQuad drawnSlot = ReadQuad(s.GetProperty("drawnSlot"));
    Console.WriteLine($"  Coarse ROI: {cropRect}");

    using Mat cropped = new Mat(img, cropRect);
    using Mat rotated = new Mat(); Cv2.Rotate(cropped, rotated, rot);
    Console.WriteLine($"  Crop {cropped.Width}x{cropped.Height} -> Rot {rotated.Width}x{rotated.Height}");

    // ── 1. Calibrate HSV mask ───────────────────────────────────────
    var masker = new SideHandBackMask(); masker.Calibrate(rotated);
    var (rawM, hsv) = masker.ExtractWithHsv(rotated);
    using Mat rawMask = rawM, hsvImg = hsv;
    Console.WriteLine($"  HSV: H=[{masker.HueMin},{masker.HueMax}] S>={masker.SaturationMin} V>={masker.ValueMin}");

    // Clean mask: close + vertical open.
    using Mat cK = Cv2.GetStructuringElement(MorphShapes.Rect, new Size(17, 9));
    using Mat closed = new Mat(); Cv2.MorphologyEx(rawMask, closed, MorphTypes.Close, cK);
    using Mat vK = Cv2.GetStructuringElement(MorphShapes.Rect, new Size(1, 3));
    using Mat cleanMask = new Mat(); Cv2.MorphologyEx(closed, cleanMask, MorphTypes.Open, vK);

    // ── 2. Plane fit ─────────────────────────────────────────────────
    var plane = SideHandPlaneFitter.Fit(rawMask, cleanMask);
    if (plane is null) { Console.WriteLine("  Plane REJECTED."); return; }
    Console.WriteLine($"  Plane: cols=[{plane.ColStart},{plane.ColEnd}] conf={plane.Confidence:F2}");

    // ── 3. Seam detection (production class) ─────────────────────────
    var seams = HandSeamDetector.Detect(rawMask, plane);
    int tileCount = 0;
    if (seams is not null)
    {
        tileCount = seams.SeamU.Count >= 8 ? seams.SeamU.Count + 1 : 0;
        Console.WriteLine($"  Seams: nSeams={seams.SeamU.Count} pitchU={seams.PitchU:F4} conf={seams.Confidence:F2} -> {tileCount} tiles");
    }
    else
    {
        Console.WriteLine("  Seam detection FAILED.");
    }

    // ── 4. Build calibration (production factory) ────────────────────
    var calib = HandSeamDetector.BuildCalibration(
        rotated, rawMask, plane, cropRect, seat, rot, masker,
        drawnSlot, FW, FH);
    SideHandTopology? topology = null;
    if (calib is not null)
    {
        Console.WriteLine($"  Calibration: seat={calib.Seat} drawSide={calib.DrawSide} pitchU={calib.PitchU:F4} outerStartU={calib.OuterStartU:F4} conf={calib.Confidence:F2}");

        // ── 5. Runtime topology (production class) ────────────────────
        using Mat frozenMask = masker.Extract(rotated);
        topology = SideHandTopologyDetector.Detect(
            frozenMask, calib, previous: null, FW, FH);

        var stateStr = string.Join("", topology.MainSlotStates.Select(s =>
            s == SlotState.Occupied ? 'O' : s == SlotState.Empty ? 'E' : '?'));
        Console.WriteLine($"  Topology: slots=[{stateStr}] occupied={topology.OccupiedCount} holeIdx={topology.InternalHoleIndex} draw={topology.DrawPresent} conf={topology.Confidence:F2}");

        // ── 6. Draw topology overlay on frame ─────────────────────────
        using var topoViz = img.Clone();
        for (int i = 0; i < topology.MainSlotStates.Count; i++)
        {
            if (i >= topology.OccupiedMainQuads.Count) break;
            var q = topology.OccupiedMainQuads[i];
            Point2f[] quadPx = [
                new((float)(q.TopLeft.X * FW), (float)(q.TopLeft.Y * FH)),
                new((float)(q.TopRight.X * FW), (float)(q.TopRight.Y * FH)),
                new((float)(q.BottomRight.X * FW), (float)(q.BottomRight.Y * FH)),
                new((float)(q.BottomLeft.X * FW), (float)(q.BottomLeft.Y * FH))
            ];
            var color = topology.MainSlotStates[i] == SlotState.Occupied
                ? new Scalar(0, 255, 0)
                : new Scalar(0, 0, 255);
            DrawQuadPx(topoViz, quadPx, color, 1);
            // Label slot index
            var center = new Point(
                (int)(quadPx.Average(p => p.X)),
                (int)(quadPx.Average(p => p.Y)));
            Cv2.PutText(topoViz, $"{i}", center, HersheyFonts.HersheySimplex, 0.3, Scalar.White, 1);
        }
        if (topology.InternalHoleIndex is { } hole && hole < topology.OccupiedMainQuads.Count)
        {
            var hq = topology.OccupiedMainQuads[hole];
            Point2f[] hPx = [
                new((float)(hq.TopLeft.X * FW), (float)(hq.TopLeft.Y * FH)),
                new((float)(hq.TopRight.X * FW), (float)(hq.TopRight.Y * FH)),
                new((float)(hq.BottomRight.X * FW), (float)(hq.BottomRight.Y * FH)),
                new((float)(hq.BottomLeft.X * FW), (float)(hq.BottomLeft.Y * FH))
            ];
            DrawQuadPx(topoViz, hPx, new Scalar(255, 0, 255), 2);
        }
        string topoOutPath = $@"E:\文档\日麻教学\overlay\artifacts\replay\{name}-topology-v4.png";
        Cv2.ImWrite(topoOutPath, topoViz);
        Console.WriteLine($"  -> {topoOutPath}");
    }
    else
    {
        Console.WriteLine("  Calibration FAILED.");
    }

    // ── 7. Map plane corners to frame (production class) ─────────────────
    Point2f[] frameCorners = SideHandRectifier.MapToFrame(plane, cropRect, seat);
    NormalizedQuad refinedQuad = SideHandRectifier.ToNormalizedQuad(frameCorners, FW, FH);

    // ── 8. Build 9-panel debug display ───────────────────────────────
    int pH = 260, pW = Math.Max(rotated.Cols, 350);
    int rows = 3, cols = 3;
    using var dbg = new Mat(rows * pH + 40, cols * pW + 40, MatType.CV_8UC3, new Scalar(40, 40, 40));

    // Row 0: rotated+plane, raw mask, clean mask
    Point2f[] rotCorners = {
        new(plane.ColStart, (float)plane.TopStartY),
        new(plane.ColEnd, (float)plane.TopEndY),
        new(plane.ColEnd, (float)plane.BottomEndY),
        new(plane.ColStart, (float)plane.BottomStartY)
    };
    using var rotViz = rotated.Clone(); DrawQuadPx(rotViz, rotCorners, new Scalar(0, 255, 0), 2);
    Place(rotViz, 0, 0, pW, pH, dbg, "A: Rotated + plane (green)");
    Place(rawMask, 0, 1, pW, pH, dbg, "B: Raw mask (no close)");
    Place(cleanMask, 0, 2, pW, pH, dbg, "C: Clean mask (close+open)");

    // Row 1: crop+inv-rot, frame+ROIs, raw mask+seams
    Point2f[] cropCorners = SideHandRectifier.MapToFrame(rotCorners, cropRect, seat);
    // Adjust for display in crop coords
    Point2f[] cropLocal = cropCorners.Select(p => new Point2f(p.X - cropRect.X, p.Y - cropRect.Y)).ToArray();
    using var cropViz = cropped.Clone(); DrawQuadPx(cropViz, cropLocal, new Scalar(255, 0, 0), 2);
    Place(cropViz, 1, 0, pW, pH, dbg, "D: Crop + inv-rot (blue)");
    using var frameViz = img.Clone();
    DrawQuadPx(frameViz, frameCorners, new Scalar(0, 255, 255), 2);
    Cv2.Rectangle(frameViz, cropRect, new Scalar(0, 0, 255), 2);
    Place(frameViz, 1, 1, pW, pH, dbg, "E: Frame (red=coarse yellow=refined)");

    // Raw mask + red seam lines
    using var seamViz = new Mat(); Cv2.CvtColor(rawMask, seamViz, ColorConversionCodes.GRAY2BGR);
    if (seams is not null)
    {
        for (int i = 0; i < seams.SeamU.Count; i++)
        {
            var t = seams.SeamTop[i]; var b = seams.SeamBottom[i];
            Cv2.Line(seamViz, new Point((int)t.X, (int)t.Y), new Point((int)b.X, (int)b.Y),
                new Scalar(0, 0, 255), 1);
        }
        Cv2.PutText(seamViz, $"{seams.SeamU.Count} seams ({tileCount} tiles)",
            new Point(5, 12), HersheyFonts.HersheySimplex, 0.35, Scalar.White, 1);
    }
    else
    {
        Cv2.PutText(seamViz, "DETECTION FAILED", new Point(5, 12),
            HersheyFonts.HersheySimplex, 0.35, new Scalar(0, 0, 255), 1);
    }
    Place(seamViz, 1, 2, pW, pH, dbg, "F: Raw mask + seams (red diagonals)");

    // Row 2: gap signal, warped band, topology overview
    int sigW = 900;
    using var sigImg = new Mat(pH, sigW, MatType.CV_8UC3, Scalar.Black);
    if (seams is not null && seams.GapSignal.Length > 0)
    {
        double[] gapSig = seams.GapSignal;
        double m = gapSig.Max();
        if (m > 1e-9)
        {
            for (int x = 1; x < Math.Min(sigW, gapSig.Length); x++)
            {
                int y0 = pH - 1 - (int)(gapSig[x - 1] / m * (pH - 1));
                int y1 = pH - 1 - (int)(gapSig[x] / m * (pH - 1));
                Cv2.Line(sigImg, new Point(x - 1, y0), new Point(x, y1), new Scalar(200, 200, 200), 1);
            }
        }
        int gs = seams.GapSignal.Length;
        foreach (double u in seams.SeamU)
        {
            int sx = (int)(u * sigW);
            if (sx >= 0 && sx < sigW)
                Cv2.Line(sigImg, new Point(sx, 0), new Point(sx, pH), new Scalar(0, 255, 0), 2);
        }
        Cv2.PutText(sigImg, $"Gap signal + {seams.SeamU.Count} seams (green)",
            new Point(5, 15), HersheyFonts.HersheySimplex, 0.35, Scalar.White, 1);
    }
    else
    {
        Cv2.PutText(sigImg, "No gap signal (detection failed)",
            new Point(5, 15), HersheyFonts.HersheySimplex, 0.35, new Scalar(0, 0, 255), 1);
    }
    Place(sigImg, 2, 0, Math.Min(sigW, pW), pH, dbg, "G: Gap signal (HandSeamDetector)");

    // Warped band
    using var backStrip = SideHandRectifier.Warp(rotated, plane);
    using var bandViz = new Mat(); Cv2.CvtColor(backStrip, bandViz, ColorConversionCodes.GRAY2BGR);
    string bandLabel = calib is not null
        ? $"Warped band | {calib.TileCount} slots | conf={calib.Confidence:F2}"
        : $"Warped band | {tileCount} tiles (no calib)";
    Cv2.PutText(bandViz, bandLabel, new Point(5, 12), HersheyFonts.HersheySimplex, 0.35, Scalar.White, 1);
    Place(bandViz, 2, 1, pW, pH, dbg, "H: Warped band (ref)");

    // Topology summary panel
    using var topoPanel = new Mat(pH, pW, MatType.CV_8UC3, new Scalar(40, 40, 40));
    if (topology is not null)
    {
        for (int i = 0; i < topology.MainSlotStates.Count; i++)
        {
            int bx = 10 + i * 24, bw = 22, by = 30, bh = pH - 60;
            var color = topology.MainSlotStates[i] switch
            {
                SlotState.Occupied => new Scalar(0, 200, 0),
                SlotState.Empty => new Scalar(50, 50, 200),
                _ => new Scalar(80, 80, 80)
            };
            Cv2.Rectangle(topoPanel, new Rect(bx, by, bw, bh), color, -1);
            Cv2.PutText(topoPanel, $"{i}", new Point(bx + 3, by + bh + 16),
                HersheyFonts.HersheySimplex, 0.28, Scalar.White, 1);
            // Score bar
            double score = topology.MainSlotScores[i];
            int scoreH = (int)(score * bh);
            Cv2.Rectangle(topoPanel, new Rect(bx + 2, by + bh - scoreH, bw - 4, scoreH),
                new Scalar(255, 255, 255), 1);
        }
        string topoLabel = $"Topology: {topology.OccupiedCount}/13 tiles";
        if (topology.InternalHoleIndex is { } hi)
            topoLabel += $" | hole@{hi}";
        if (topology.DrawPresent)
            topoLabel += $" | draw";
        Cv2.PutText(topoPanel, topoLabel, new Point(5, 18),
            HersheyFonts.HersheySimplex, 0.4, Scalar.White, 1);
    }
    else
    {
        Cv2.PutText(topoPanel, "No topology (calibration failed)",
            new Point(10, 100), HersheyFonts.HersheySimplex, 0.5, new Scalar(0, 0, 255), 1);
    }
    Place(topoPanel, 2, 2, pW, pH, dbg, "I: Slot occupancy (SideHandTopologyDetector)");

    string outPath = $@"E:\文档\日麻教学\overlay\artifacts\replay\{name}-debug-v4.png";
    Cv2.ImWrite(outPath, dbg);
    Console.WriteLine($"  -> {outPath}");
    Console.WriteLine($"  Refined quad norm: TL({refinedQuad.TopLeft.X:F4},{refinedQuad.TopLeft.Y:F4}) TR({refinedQuad.TopRight.X:F4},{refinedQuad.TopRight.Y:F4}) BR({refinedQuad.BottomRight.X:F4},{refinedQuad.BottomRight.Y:F4}) BL({refinedQuad.BottomLeft.X:F4},{refinedQuad.BottomLeft.Y:F4})");
}

ProcessSide("right", Seat.Right, RotateFlags.Rotate90Clockwise);
ProcessSide("left", Seat.Left, RotateFlags.Rotate90Counterclockwise);
Console.WriteLine("\nDone.");
