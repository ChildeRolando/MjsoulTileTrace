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

    // Clean mask.
    using Mat cK = Cv2.GetStructuringElement(MorphShapes.Rect, new Size(17, 9));
    using Mat closed = new Mat(); Cv2.MorphologyEx(rawMask, closed, MorphTypes.Close, cK);
    using Mat vK = Cv2.GetStructuringElement(MorphShapes.Rect, new Size(1, 3));
    using Mat cleanMask = new Mat(); Cv2.MorphologyEx(closed, cleanMask, MorphTypes.Open, vK);

    // ── 2. Plane fit ─────────────────────────────────────────────────
    var plane = SideHandPlaneFitter.Fit(rawMask, cleanMask);
    if (plane is null) { Console.WriteLine("  Plane REJECTED."); return; }
    Console.WriteLine($"  Plane: cols=[{plane.ColStart},{plane.ColEnd}] conf={plane.Confidence:F2}");

    // ── 3. Back-surface geometry (NEW) ──────────────────────────────
    // Diagnostic: count orange columns and rough back height.
    int orangeCols = 0;
    double totalOrangeH = 0;
    for (int x = plane.ColStart; x <= plane.ColEnd; x++)
    {
        int topO = -1, botO = -1;
        for (int y = 0; y < rawMask.Rows; y++)
        {
            if (rawMask.At<byte>(y, x) > 0) { if (topO < 0) topO = y; botO = y; }
        }
        if (topO >= 0) { orangeCols++; totalOrangeH += botO - topO + 1; }
    }
    double avgOrangeH = orangeCols > 0 ? totalOrangeH / orangeCols : 0;
    Console.WriteLine($"  Diag: {orangeCols}/{plane.ColEnd-plane.ColStart+1} cols have orange, avg orangeH={avgOrangeH:F1}px");

    // Deep diag: trace ridge candidate collection manually.
    using Mat diagLab = new Mat(); Cv2.CvtColor(rotated, diagLab, ColorConversionCodes.BGR2Lab);
    using Mat diagL = new Mat(); Cv2.ExtractChannel(diagLab, diagL, 0);
    int w = rawMask.Cols, h = rawMask.Rows;
    int candCount = 0, skippedOrange = 0, skippedContrast = 0;
    double maxContrastSeen = 0;
    for (int x = plane.ColStart; x <= plane.ColEnd; x++)
    {
        int orangePx = 0;
        for (int y = 0; y < h; y++) if (rawMask.At<byte>(y, x) > 0) orangePx++;
        if (orangePx < h * 0.08) { skippedOrange++; continue; }

        int topOrange = -1, botOrange = -1;
        for (int y = 0; y < h; y++) { if (rawMask.At<byte>(y, x) > 0) { if (topOrange < 0) topOrange = y; botOrange = y; } }
        int orangeHt = botOrange - topOrange + 1;
        if (orangeHt < h * 0.04) { skippedOrange++; continue; }

        int searchStart = topOrange + Math.Max(1, (int)(orangeHt * 0.08));
        int searchEnd = topOrange + Math.Min(orangeHt - 1, (int)(orangeHt * 0.55));
        double bestContrast = 0;
        for (int t = searchStart; t <= searchEnd; t++)
        {
            int halfWin = 5;
            int aS = Math.Max(0, t - halfWin), aE = t - 1;
            int bS = t, bE = Math.Min(h - 1, t + halfWin - 1);
            if (aE - aS < 2 || bE - bS < 2) continue;

            int aboveO = 0, belowO = 0;
            for (int y = aS; y <= aE; y++) if (rawMask.At<byte>(y, x) > 0) aboveO++;
            for (int y = bS; y <= bE; y++) if (rawMask.At<byte>(y, x) > 0) belowO++;
            double aF = (double)aboveO / (aE - aS + 1), bF = (double)belowO / (bE - bS + 1);
            if (aF < 0.15 || bF < 0.15) continue;

            // Local median L
            byte[] vals = new byte[aE - aS + 1 + bE - bS + 1];
            int vi = 0;
            for (int y = aS; y <= aE; y++) vals[vi++] = diagL.At<byte>(y, x);
            int aboveLen = vi;
            for (int y = bS; y <= bE; y++) vals[vi++] = diagL.At<byte>(y, x);
            Array.Sort(vals, 0, aboveLen);
            double aboveMed = aboveLen % 2 == 1 ? vals[aboveLen/2] : (vals[aboveLen/2-1] + vals[aboveLen/2]) * 0.5;
            Array.Sort(vals, aboveLen, vi - aboveLen);
            int belowLen = vi - aboveLen;
            double belowMed = belowLen % 2 == 1 ? vals[aboveLen + belowLen/2] : (vals[aboveLen + belowLen/2 - 1] + vals[aboveLen + belowLen/2]) * 0.5;

            double contrast = (aboveMed - belowMed) / 5.0; // simplified MAD=5
            if (Math.Abs(contrast) > Math.Abs(bestContrast)) bestContrast = contrast;
        }

        if (Math.Abs(bestContrast) > maxContrastSeen) maxContrastSeen = Math.Abs(bestContrast);
        if (Math.Abs(bestContrast) >= 4.0) candCount++;
        else skippedContrast++;
    }
    Console.WriteLine($"  Diag: candCount={candCount} skippedOrange={skippedOrange} skippedContrast={skippedContrast} maxContrast={maxContrastSeen:F2}");

    // Relaxed options for static screenshot.
    var geomOpts = new BackSurfaceGeometryOptions
    {
        MinContrast = 2.0,
        MinCandidatePoints = 8,
        MinOrangeSupportFraction = 0.12,
        MinInlierFraction = 0.20,
        MaxBackHeightFraction = 0.95,
        MinBackHeightFraction = 0.02,
    };
    var geometry = BackSurfaceGeometryDetector.Detect(rotated, rawMask, plane, null, geomOpts);
    if (geometry is null) { Console.WriteLine("  Geometry REJECTED."); return; }
    Console.WriteLine($"  Geometry: ridge inliers={geometry.RidgeInliers} rail inliers={geometry.LowerRailInliers} backH={geometry.MeanBackHeight:F1} conf={geometry.Confidence:F2}");

    // ── 4. Detect tile-back instances (NEW) ─────────────────────────
    var instOpts = new BackTileInstanceOptions
    {
        MinOrangeCoverage = 0.20,
        MinCorridorSpanFraction = 0.40,
        BoundaryMinProminence = 0.04,
    };
    var instances = BackTileInstanceDetector.Detect(
        rawMask, geometry, plane, cropRect, seat, FW, FH, instOpts);
    Console.WriteLine($"  Instances: {instances.Count} detected");
    for (int i = 0; i < instances.Count; i++)
    {
        var inst = instances[i];
        Console.WriteLine($"    [{i}] u=[{inst.ULeft:F4},{inst.URight:F4}] w={inst.Width:F4} cov={inst.OrangeCoverage:F2} ridge={inst.RidgeSupport} rail={inst.LowerRailSupport} conf={inst.Confidence:F2}");
    }

    // ── 5. Projective sequence fit (NEW) ────────────────────────────
    var projModel = ProjectiveTileSequenceFitter.Fit(instances);
    if (projModel is not null)
    {
        Console.WriteLine($"  Projective: A={projModel.A:F4} B={projModel.B:F4} C={projModel.C:F4} resid={projModel.Residual:F4} monotonic={projModel.IsMonotonic} inliers={projModel.InlierCount} conf={projModel.Confidence:F2}");
        for (int i = 0; i < instances.Count; i++)
        {
            double pred = projModel.PredictedUAt(i);
            double obs = instances[i].UCenter;
            Console.WriteLine($"    k={i}: obs={obs:F4} pred={pred:F4} err={Math.Abs(pred-obs):F4}");
        }

        var topology = ProjectiveTileSequenceFitter.ParseTopology(
            instances, projModel, new TemporalTrackerOptions());
        if (topology is not null)
        {
            Console.WriteLine($"  Topology: main={topology.MainCount} extra={topology.ExtraInstance is not null} missing={topology.MissingMainOrdinal} status={topology.Status}");
        }
    }
    else
    {
        Console.WriteLine("  Projective fit FAILED.");
    }

    // ── 6. Build 11-panel debug display ───────────────────────────────
    int pH = 260, pW = Math.Max(rotated.Cols, 350);
    int rows = 4, cols = 3;
    using var dbg = new Mat(rows * pH + 50, cols * pW + 40, MatType.CV_8UC3, new Scalar(40, 40, 40));

    // Row 0: rotated+plane, raw mask, clean mask
    Point2f[] planeCorners = {
        new(plane.ColStart, (float)plane.TopStartY),
        new(plane.ColEnd, (float)plane.TopEndY),
        new(plane.ColEnd, (float)plane.BottomEndY),
        new(plane.ColStart, (float)plane.BottomStartY)
    };
    using var rotViz = rotated.Clone(); DrawQuadPx(rotViz, planeCorners, new Scalar(0, 255, 0), 2);
    Place(rotViz, 0, 0, pW, pH, dbg, "A: Rotated + plane");
    Place(rawMask, 0, 1, pW, pH, dbg, "B: Raw orange mask");
    Place(cleanMask, 0, 2, pW, pH, dbg, "C: Clean mask");

    // Row 1: Lab-L + ridge candidates, ridge+rail lines, back corridor
    using Mat lab = new Mat(); Cv2.CvtColor(rotated, lab, ColorConversionCodes.BGR2Lab);
    using Mat lCh = new Mat(); Cv2.ExtractChannel(lab, lCh, 0);
    using var labViz = new Mat(); Cv2.CvtColor(lCh, labViz, ColorConversionCodes.GRAY2BGR);
    // Draw ridge line.
    for (int x = geometry.ValidStart; x <= geometry.ValidEnd; x += 2)
    {
        double ry = geometry.RidgeY(x);
        int yi = Math.Clamp((int)ry, 0, rotated.Rows - 1);
        Cv2.Circle(labViz, new Point(x, yi), 1, new Scalar(0, 255, 0), -1);
    }
    for (int x = geometry.ValidStart; x <= geometry.ValidEnd; x += 2)
    {
        double ly = geometry.LowerRailY(x);
        int yi = Math.Clamp((int)ly, 0, rotated.Rows - 1);
        Cv2.Circle(labViz, new Point(x, yi), 1, new Scalar(0, 0, 255), -1);
    }
    Place(labViz, 1, 0, pW, pH, dbg, "D: Lab-L + ridge(green) + rail(red)");

    // Ridge+rail on rotated.
    using var rrViz = rotated.Clone();
    for (int x = geometry.ValidStart; x <= geometry.ValidEnd; x += 2)
    {
        double ry = geometry.RidgeY(x);
        double ly = geometry.LowerRailY(x);
        Cv2.Circle(rrViz, new Point(x, Math.Clamp((int)ry, 0, rotated.Rows - 1)), 1, new Scalar(0, 255, 0), -1);
        Cv2.Circle(rrViz, new Point(x, Math.Clamp((int)ly, 0, rotated.Rows - 1)), 1, new Scalar(0, 0, 255), -1);
    }
    Place(rrViz, 1, 1, pW, pH, dbg, "E: Rotated + ridge/rail");

    // Instance quads on rotated.
    using var instViz = rotated.Clone();
    foreach (var inst in instances)
    {
        double xL = plane.ColStart + inst.ULeft * (plane.ColEnd - plane.ColStart);
        double xR = plane.ColStart + inst.URight * (plane.ColEnd - plane.ColStart);
        double rYL = geometry.RidgeY(xL), rYR = geometry.RidgeY(xR);
        double lYL = geometry.LowerRailY(xL), lYR = geometry.LowerRailY(xR);
        Point2f[] q =
        [
            new((float)xL, (float)rYL), new((float)xR, (float)rYR),
            new((float)xR, (float)lYR), new((float)xL, (float)lYL)
        ];
        var color = inst.Confidence > 0.5
            ? new Scalar(0, 255, 0)
            : new Scalar(0, 255, 255);
        DrawQuadPx(instViz, q, color, 1);
        Cv2.PutText(instViz, $"{inst.Confidence:F1}",
            new Point((int)xL + 2, (int)rYL + 14),
            HersheyFonts.HersheySimplex, 0.3, Scalar.White, 1);
    }
    Place(instViz, 1, 2, pW, pH, dbg, "F: Instances (green=high conf)");

    // Row 2: occupancy signal, frame overlay, projective model
    int sigW = 900;
    using var sigImg = new Mat(pH, sigW, MatType.CV_8UC3, Scalar.Black);
    // Build occupancy signal manually.
    int nOcc = 900;
    double[] occ = new double[nOcc];
    for (int i = 0; i < nOcc; i++)
    {
        double u = (i + 0.5) / nOcc;
        double x = plane.ColStart + u * (plane.ColEnd - plane.ColStart);
        int xi = Math.Clamp((int)Math.Round(x), 0, rawMask.Cols - 1);
        double rY = geometry.RidgeY(xi);
        double lY = geometry.LowerRailY(xi);
        int top = Math.Clamp((int)(rY + 2), 0, rawMask.Rows - 1);
        int bot = Math.Clamp((int)(lY - 2), top + 1, rawMask.Rows - 1);
        int fg = 0, tot = 0;
        for (int y = top; y <= bot; y++)
        {
            tot++;
            if (rawMask.At<byte>(y, xi) > 0) fg++;
        }
        occ[i] = tot > 0 ? 1.0 - (double)fg / tot : 0.5;
    }
    double occMax = occ.Max();
    if (occMax > 1e-9)
    {
        for (int x = 1; x < Math.Min(sigW, occ.Length); x++)
        {
            int y0 = pH - 1 - (int)(occ[x - 1] / occMax * (pH - 1));
            int y1 = pH - 1 - (int)(occ[x] / occMax * (pH - 1));
            Cv2.Line(sigImg, new Point(x - 1, y0), new Point(x, y1), new Scalar(200, 200, 200), 1);
        }
    }
    // Mark instance boundaries.
    foreach (var inst in instances)
    {
        int bx = (int)(inst.ULeft * sigW);
        Cv2.Line(sigImg, new Point(bx, 0), new Point(bx, pH), new Scalar(0, 255, 0), 1);
    }
    if (projModel is not null)
    {
        for (int k = 0; k <= instances.Count; k++)
        {
            double pu = projModel.PredictedUAt(k);
            int px = Math.Clamp((int)(pu * sigW), 0, sigW - 1);
            Cv2.Circle(sigImg, new Point(px, pH / 2), 3, new Scalar(0, 0, 255), -1);
        }
    }
    Place(sigImg, 2, 0, Math.Min(sigW, pW), pH, dbg, "G: Occupancy + boundaries(green) + model(red)");

    // Frame overlay with instances mapped back.
    using var frameViz = img.Clone();
    foreach (var inst in instances)
    {
        double xL = plane.ColStart + inst.ULeft * (plane.ColEnd - plane.ColStart);
        double xR = plane.ColStart + inst.URight * (plane.ColEnd - plane.ColStart);
        double rYL = geometry.RidgeY(xL), rYR = geometry.RidgeY(xR);
        double lYL = geometry.LowerRailY(xL), lYR = geometry.LowerRailY(xR);
        Point2f[] rotQ =
        [
            new((float)xL, (float)rYL), new((float)xR, (float)rYR),
            new((float)xR, (float)lYR), new((float)xL, (float)lYL)
        ];
        Point2f[] frameQ = SideHandRectifier.MapToFrame(rotQ, cropRect, seat);
        var pts = frameQ.Select(p => new Point((int)p.X, (int)p.Y)).ToArray();
        Cv2.Polylines(frameViz, new[] { pts }, true, new Scalar(0, 255, 0), 1);
    }
    Place(frameViz, 2, 1, pW, pH, dbg, $"H: Frame overlay ({instances.Count} instances)");

    // Extra info panel.
    using var infoPanel = new Mat(pH, pW, MatType.CV_8UC3, new Scalar(40, 40, 40));
    string info = $"Seat: {name}\nInstances: {instances.Count}\n";
    if (projModel is not null)
    {
        info += $"Model: u(k)=({projModel.A:F3}k+{projModel.B:F3})/({projModel.C:F3}k+1)\n";
        info += $"Residual: {projModel.Residual:F4}  Monotonic: {projModel.IsMonotonic}\n";
    }
    info += $"Geometry conf: {geometry.Confidence:F2}\n";
    info += $"Ridge inliers: {geometry.RidgeInliers}\n";
    info += $"Rail inliers: {geometry.LowerRailInliers}\n";
    info += $"Back height: {geometry.MeanBackHeight:F1}px";
    var infoLines = info.Split('\n');
    for (int li = 0; li < infoLines.Length; li++)
        Cv2.PutText(infoPanel, infoLines[li], new Point(10, 25 + li * 22),
            HersheyFonts.HersheySimplex, 0.45, Scalar.White, 1);
    Place(infoPanel, 2, 2, pW, pH, dbg, "I: Info");

    // Row 3: topo bar
    using var topoPanel = new Mat(pH, pW, MatType.CV_8UC3, new Scalar(40, 40, 40));
    for (int i = 0; i < instances.Count; i++)
    {
        int bx = 10 + i * 24, bw = 22, by = 30, bh = pH - 60;
        var color = instances[i].Confidence > 0.5
            ? new Scalar(0, 200, 0) : new Scalar(80, 80, 200);
        Cv2.Rectangle(topoPanel, new Rect(bx, by, bw, bh), color, -1);
        Cv2.PutText(topoPanel, $"{i}", new Point(bx + 3, by + bh + 16),
            HersheyFonts.HersheySimplex, 0.28, Scalar.White, 1);
    }
    string topoLabel = $"Topology: {instances.Count} instances";
    if (projModel is not null)
        topoLabel += $" | model resid={projModel.Residual:F4}";
    Cv2.PutText(topoPanel, topoLabel, new Point(5, 18),
        HersheyFonts.HersheySimplex, 0.4, Scalar.White, 1);
    Place(topoPanel, 3, 0, pW, pH, dbg, "J: Instance bar chart");

    // Crop + inv-rot region.
    Point2f[] refinedCorners = SideHandRectifier.MapToFrame(planeCorners, cropRect, seat);
    using var cropViz = cropped.Clone();
    Point2f[] cropLocal = planeCorners.Select(p =>
        new Point2f(p.X, p.Y)).ToArray();
    // Actually cropLocal should be the plane corners mapped to crop coords.
    Point2f[] planeInCrop = new Point2f[4];
    for (int i = 0; i < 4; i++)
    {
        Point2f cp = seat switch
        {
            Seat.Right => new Point2f(planeCorners[i].Y, cropped.Height - 1 - planeCorners[i].X),
            Seat.Left => new Point2f(cropped.Width - 1 - planeCorners[i].Y, planeCorners[i].X),
            _ => planeCorners[i]
        };
        planeInCrop[i] = cp;
    }
    DrawQuadPx(cropViz, planeInCrop, new Scalar(255, 0, 0), 2);
    Place(cropViz, 3, 1, pW, pH, dbg, "K: Crop + inv-rot plane");

    // Save.
    string outPath = $@"E:\文档\日麻教学\overlay\artifacts\replay\{name}-debug-v10.png";
    Cv2.ImWrite(outPath, dbg);
    Console.WriteLine($"  -> {outPath}");

    // ── CSV output ──────────────────────────────────────────────────
    string csvPath = $@"E:\文档\日麻教学\overlay\artifacts\replay\{name}-diagnostics-v10.csv";
    using var csv = new StreamWriter(csvPath);
    csv.WriteLine("timestamp,seat,ridgeConf,railConf,instanceCount,mainCount,extraPresent,missingOrdinal,sequenceResidual,topologyConf,trackerState");
    double mainCount = instances.Count;
    bool extraPresent = false;
    if (projModel is not null)
    {
        var topo = ProjectiveTileSequenceFitter.ParseTopology(
            instances, projModel, new TemporalTrackerOptions());
        if (topo is not null)
        {
            mainCount = topo.MainCount;
            extraPresent = topo.ExtraInstance is not null;
        }
    }
    double railConf = geometry.LowerRailInliers > 0 ? 0.85 : 0;
    string missingOrd = projModel is not null ? "-1" : "";
    double seqResidual = projModel?.Residual ?? 0;
    csv.WriteLine($",{name},{geometry.Confidence:F2},{railConf:F2},{instances.Count},{mainCount:F0},{extraPresent},{missingOrd},{seqResidual:F4},{geometry.Confidence:F2},Static");
    Console.WriteLine($"  -> {csvPath}");
}

ProcessSide("right", Seat.Right, RotateFlags.Rotate90Clockwise);
ProcessSide("left", Seat.Left, RotateFlags.Rotate90Counterclockwise);
Console.WriteLine("\nDone.");
