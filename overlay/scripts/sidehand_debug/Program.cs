using System.Text.Json;
using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.Profiles;
using MahjongSoulOverlay.Vision.Hand;
using OpenCvSharp;

using var img = Cv2.ImRead(@"E:\文档\日麻教学\overlay\artifacts\replay\real-0229.png");
int FW = img.Width, FH = img.Height;

var jsonText = File.ReadAllText(
    @"E:\文档\日麻教学\overlay\src\MahjongSoulOverlay.Vision\Profiles\yonma-1920x1080.standard.json");
using var doc = JsonDocument.Parse(jsonText);
var seats = doc.RootElement.GetProperty("seats");

NormalizedQuad ReadQuad(JsonElement q) => new(
    new(q.GetProperty("topLeft").GetProperty("x").GetDouble(), q.GetProperty("topLeft").GetProperty("y").GetDouble()),
    new(q.GetProperty("topRight").GetProperty("x").GetDouble(), q.GetProperty("topRight").GetProperty("y").GetDouble()),
    new(q.GetProperty("bottomRight").GetProperty("x").GetDouble(), q.GetProperty("bottomRight").GetProperty("y").GetDouble()),
    new(q.GetProperty("bottomLeft").GetProperty("x").GetDouble(), q.GetProperty("bottomLeft").GetProperty("y").GetDouble()));

Point Px(double x, double y) => new((int)(x * FW), (int)(y * FH));
Point PxN(NormalizedPoint p) => Px(p.X, p.Y);

void DrawQuadPx(Mat canvas, Point2f[] corners, Scalar c, int t)
{
    var pts = corners.Select(p => new Point((int)p.X, (int)p.Y)).ToArray();
    Cv2.Polylines(canvas, new[] { pts }, true, c, t, LineTypes.AntiAlias);
    foreach (var p in pts) Cv2.Circle(canvas, p, 4, c, -1, LineTypes.AntiAlias);
}

// ── Expand coarse ROI ──────────────────────────────────────────────
Rect ExpandSideHandRoi(NormalizedQuad quad, int fw, int fh)
{
    var pts = new[] { PxN(quad.TopLeft), PxN(quad.TopRight), PxN(quad.BottomRight), PxN(quad.BottomLeft) };
    Rect r = Cv2.BoundingRect(pts);
    int alongPad = (int)(r.Height * 0.12);
    int crossPad = (int)(r.Width * 0.22);
    return new Rect(
        Math.Max(0, r.X - crossPad),
        Math.Max(0, r.Y - alongPad),
        Math.Min(fw - Math.Max(0, r.X - crossPad), r.Width + 2 * crossPad),
        Math.Min(fh - Math.Max(0, r.Y - alongPad), r.Height + 2 * alongPad));
}

// ── Process one seat ────────────────────────────────────────────────
void ProcessSide(string name, Seat seatFlag, RotateFlags rotFlag)
{
    Console.WriteLine($"\n{'='*60}");
    Console.WriteLine($"=== {name} ===");
    Console.WriteLine($"{'='*60}");

    var s = seats.GetProperty(name);
    var quad = ReadQuad(s.GetProperty("mainHandRegion"));
    Rect cropRect = ExpandSideHandRoi(quad, FW, FH);
    Console.WriteLine($"  Coarse ROI: {cropRect}");

    using Mat cropped = new Mat(img, cropRect);
    using Mat rotated = new Mat();
    Cv2.Rotate(cropped, rotated, rotFlag);
    Console.WriteLine($"  Cropped: {cropped.Width}x{cropped.Height} -> Rotated: {rotated.Width}x{rotated.Height}");

    // ── Orange mask ───────────────────────────────────────────────
    var masker = new SideHandBackMask();
    masker.Calibrate(rotated);
    Console.WriteLine($"  HSV range: H=[{masker.HueMin},{masker.HueMax}] S=[{masker.SaturationMin},{masker.SaturationMax}] V=[{masker.ValueMin},{masker.ValueMax}]");

    var (rawMask, hsv) = masker.ExtractWithHsv(rotated);
    using Mat rawM = rawMask;
    using Mat hsvImg = hsv;

    // ── Pipeline: cleanMask for boundary fitting, rawMask for extent ─
    int w = rawM.Cols, hM = rawM.Rows;

    // Clean mask: close to bridge tile gaps.
    // Use a tall kernel (11×9) to bridge runs at slightly different y-positions
    // caused by perspective tilt, but NOT connect to dora tiles (~40px away).
    // Then vertical-only open to denoise without shortening x-extent.
    using Mat closeK = Cv2.GetStructuringElement(MorphShapes.Rect, new Size(17, 9));
    using Mat closed = new Mat();
    Cv2.MorphologyEx(rawM, closed, MorphTypes.Close, closeK);

    using Mat vOpenK = Cv2.GetStructuringElement(MorphShapes.Rect, new Size(1, 3));
    using Mat cleanMask = new Mat();
    Cv2.MorphologyEx(closed, cleanMask, MorphTypes.Open, vOpenK);

    int rawPx = Cv2.CountNonZero(rawM), cleanPx = Cv2.CountNonZero(cleanMask);
    Console.WriteLine($"  Mask: raw={rawPx}  closed+vertOpen={cleanPx}");

    // Debug: connected components analysis
    using Mat labels = new Mat();
    using Mat stats = new Mat();
    using Mat centroids = new Mat();
    int nLabels = Cv2.ConnectedComponentsWithStats(cleanMask, labels, stats, centroids, PixelConnectivity.Connectivity8);
    Console.WriteLine($"  CCs: {nLabels - 1} components");
    for (int i = 1; i < nLabels; i++)
    {
        int sx = stats.At<int>(i, (int)ConnectedComponentsTypes.Left);
        int sy = stats.At<int>(i, (int)ConnectedComponentsTypes.Top);
        int sw = stats.At<int>(i, (int)ConnectedComponentsTypes.Width);
        int sh = stats.At<int>(i, (int)ConnectedComponentsTypes.Height);
        int sa = stats.At<int>(i, (int)ConnectedComponentsTypes.Area);
        double cy = centroids.At<double>(i, 1);
        Console.WriteLine($"    [{i}] x={sx} y={sy} w={sw} h={sh} area={sa} aspect={sw/(double)Math.Max(sh,1):F1} centerY={cy:F0}");
    }

    // ── Plane fit (raw for extent, clean for boundaries) ────────────
    var plane = SideHandPlaneFitter.Fit(rawM, cleanMask);
    if (plane is null)
    {
        Console.WriteLine("  Plane fit REJECTED.");
        return;
    }
    Console.WriteLine($"  Plane: cols=[{plane.ColStart},{plane.ColEnd}] " +
        $"top=[{plane.TopStartY:F1},{plane.TopEndY:F1}] " +
        $"bot=[{plane.BottomStartY:F1},{plane.BottomEndY:F1}] " +
        $"conf={plane.Confidence:F2}");

    // ── Map back through coordinate chain ─────────────────────────
    // (A) Rotated-local green quad
    Point2f[] rotatedCorners =
    [
        new(plane.ColStart, (float)plane.TopStartY),
        new(plane.ColEnd, (float)plane.TopEndY),
        new(plane.ColEnd, (float)plane.BottomEndY),
        new(plane.ColStart, (float)plane.BottomStartY)
    ];

    // (B) Crop-local blue quad (inverse rotation)
    Point2f[] cropCorners = new Point2f[4];
    for (int i = 0; i < 4; i++)
    {
        cropCorners[i] = seatFlag switch
        {
            Seat.Right => new Point2f(rotatedCorners[i].Y, cropped.Height - 1 - rotatedCorners[i].X),
            Seat.Left => new Point2f(cropped.Width - 1 - rotatedCorners[i].Y, rotatedCorners[i].X),
            _ => rotatedCorners[i]
        };
    }

    // (C) Frame-global yellow quad (+ crop offset)
    Point2f[] frameCorners = cropCorners.Select(p =>
        new Point2f(p.X + cropRect.X, p.Y + cropRect.Y)).ToArray();

    NormalizedQuad refinedQuad = new(
        new(frameCorners[0].X / FW, frameCorners[0].Y / FH),
        new(frameCorners[1].X / FW, frameCorners[1].Y / FH),
        new(frameCorners[2].X / FW, frameCorners[2].Y / FH),
        new(frameCorners[3].X / FW, frameCorners[3].Y / FH));

    Console.WriteLine($"  Refined frame px:");
    for (int i = 0; i < 4; i++)
        Console.WriteLine($"    [{i}]: ({frameCorners[i].X:F0},{frameCorners[i].Y:F0})");

    // ── Warp back-band ────────────────────────────────────────────
    using var backStrip = SideHandRectifier.Warp(rotated, plane);

    // ── Tile counting: edge signal → pitch → snapped lattice ───────
    double[] edgeSignal = HandEdgeSignalExtractor.Extract(backStrip);
    var pitchEst = HandPitchEstimator.Estimate(edgeSignal);
    var lattice = HandLatticeFitter.Fit(edgeSignal, pitchEst.Pitch, 13);

    int tileCount = lattice?.TileCount ?? 0;
    var snappedSeams = lattice?.SnappedSeams ?? Array.Empty<int>();
    Console.WriteLine($"  Pitch estimate: {pitchEst.Pitch:F1}px conf={pitchEst.Confidence:F2}");
    Console.WriteLine($"  Lattice: {tileCount} tiles pitch={lattice?.Pitch ?? 0:F1} score={lattice?.Score ?? 0:F0}");
    if (snappedSeams.Count > 0)
        Console.WriteLine($"  Snapped seams ({snappedSeams.Count}): [{string.Join(", ", snappedSeams)}]");

    // Edge signal + autocorrelation visualisations
    int sigW = Math.Min(backStrip.Width, 900);
    int sigH = 120;
    using var sigImg = new Mat(sigH, sigW, MatType.CV_8UC3, Scalar.Black);
    double sigMax = edgeSignal.Max();
    if (sigMax > 0)
    {
        for (int x = 1; x < sigW && x < edgeSignal.Length; x++)
        {
            int y0 = sigH - 1 - (int)(edgeSignal[x - 1] / sigMax * (sigH - 1));
            int y1 = sigH - 1 - (int)(edgeSignal[x] / sigMax * (sigH - 1));
            Cv2.Line(sigImg, new Point(x - 1, y0), new Point(x, y1), new Scalar(0, 255, 0), 1);
        }
        // Draw snapped seam positions as red lines
        if (lattice is not null && snappedSeams.Count > 0)
        {
            foreach (int sx in snappedSeams)
            {
                int drawX = sx * sigW / backStrip.Width;
                if (drawX >= 0 && drawX < sigW)
                    Cv2.Line(sigImg, new Point(drawX, 0), new Point(drawX, sigH), new Scalar(0, 0, 255), 1);
            }
        }
        Cv2.PutText(sigImg, $"Edge signal (green) + snapped seams (red, {snappedSeams.Count})", new Point(5, 15),
            HersheyFonts.HersheySimplex, 0.4, Scalar.White, 1);
    }

    // Autocorrelation plot
    int acW = Math.Min(sigW, pitchEst.Autocorrelation.Length);
    int acH = 120;
    using var acImg = new Mat(acH, acW, MatType.CV_8UC3, Scalar.Black);
    double acMax = pitchEst.Autocorrelation.Skip(10).Max();
    double acMin = pitchEst.Autocorrelation.Skip(10).Min();
    double acRange = Math.Max(acMax - acMin, 1);
    for (int x = 1; x < acW; x++)
    {
        int y0 = acH - 1 - (int)((pitchEst.Autocorrelation[x - 1] - acMin) / acRange * (acH - 1));
        int y1 = acH - 1 - (int)((pitchEst.Autocorrelation[x] - acMin) / acRange * (acH - 1));
        Cv2.Line(acImg, new Point(x - 1, y0), new Point(x, y1), new Scalar(255, 255, 0), 1);
    }
    // Mark estimated pitch
    int px = (int)pitchEst.Pitch;
    if (px < acW)
        Cv2.Line(acImg, new Point(px, 0), new Point(px, acH), new Scalar(0, 0, 255), 2);
    Cv2.PutText(acImg, $"Autocorr  pitch={pitchEst.Pitch:F1} (red)", new Point(5, 15),
        HersheyFonts.HersheySimplex, 0.4, Scalar.White, 1);

    // Warped band with snapped seam overlay
    using var bandViz = new Mat();
    Cv2.CvtColor(backStrip, bandViz, ColorConversionCodes.GRAY2BGR);
    if (lattice is not null && snappedSeams.Count > 0)
    {
        foreach (int sx in snappedSeams)
        {
            if (sx >= 0 && sx < bandViz.Cols)
                Cv2.Line(bandViz, new Point(sx, 0), new Point(sx, bandViz.Rows),
                    new Scalar(0, 0, 255), 1);
        }
    }
    Cv2.PutText(bandViz, $"Band + snapped seams ({snappedSeams.Count}) count={tileCount}", new Point(5, 12),
        HersheyFonts.HersheySimplex, 0.35, Scalar.White, 1);

    // ── Build debug canvas ────────────────────────────────────────
    int pH = 280, pW = Math.Max(rotated.Cols, 360);
    int cols = 3, rows = 3;
    using var dbg = new Mat(rows * pH + 40, cols * pW + 40, MatType.CV_8UC3, new Scalar(40, 40, 40));

    void Place(Mat src, int r, int c, string label)
    {
        int x0 = 10 + c * (pW + 10), y0 = 10 + r * (pH + 10);
        Mat display;
        Mat? temp = null;
        if (src.Channels() == 1)
        {
            temp = new Mat();
            Cv2.CvtColor(src, temp, ColorConversionCodes.GRAY2BGR);
            display = temp;
        }
        else
        {
            display = src;
        }
        using var rs = new Mat();
        Cv2.Resize(display, rs, new Size(pW, pH), 0, 0, InterpolationFlags.Linear);
        temp?.Dispose();
        int cw = Math.Min(rs.Cols, dbg.Cols - x0), ch = Math.Min(rs.Rows, dbg.Rows - y0);
        rs[new Rect(0, 0, cw, ch)].CopyTo(dbg[new Rect(x0, y0, cw, ch)]);
        Cv2.PutText(dbg, label, new Point(x0 + 4, y0 + 18), HersheyFonts.HersheySimplex, 0.45, Scalar.White, 1);
    }

    // Row 0: Rotated ROI (with plane in green), raw mask, cleaned mask
    using var rotViz = rotated.Clone();
    DrawQuadPx(rotViz, rotatedCorners, new Scalar(0, 255, 0), 2);
    Cv2.PutText(rotViz, "GREEN = plane (rotated-local)", new Point(5, 15),
        HersheyFonts.HersheySimplex, 0.4, new Scalar(0, 255, 0), 1);
    Place(rotViz, 0, 0, "A: Rotated ROI + plane (green)");

    Place(rawM, 0, 1, $"Raw mask (HSV H=[{masker.HueMin},{masker.HueMax}] S>={masker.SaturationMin})");
    Place(cleanMask, 0, 2, "Clean mask (close 11x3, v-open 1x3)");

    // Row 1: Crop-local (blue), Frame-global (yellow), Warped back-band
    using var cropViz = cropped.Clone();
    DrawQuadPx(cropViz, cropCorners, new Scalar(255, 0, 0), 2);
    Cv2.PutText(cropViz, "BLUE = plane (crop-local)", new Point(5, 15),
        HersheyFonts.HersheySimplex, 0.4, new Scalar(255, 0, 0), 1);
    Place(cropViz, 1, 0, "B: Crop + inv-rot (blue)");

    using var frameViz = img.Clone();
    DrawQuadPx(frameViz, frameCorners, new Scalar(0, 255, 255), 2);
    Cv2.PutText(frameViz, $"YELLOW = refined  RED = coarse", new Point(5, 15),
        HersheyFonts.HersheySimplex, 0.4, new Scalar(0, 255, 255), 1);
    // Also draw coarse ROI in red
    Cv2.Rectangle(frameViz, cropRect, new Scalar(0, 0, 255), 2);
    Place(frameViz, 1, 1, "C: Frame + coarse(red) + refine(yellow)");

    Place(backStrip, 1, 2, $"Warped back-band ({backStrip.Width}x{backStrip.Height})");

    // Row 2: Counting pipeline diagnostics
    Place(sigImg, 2, 0, $"Edge signal + lattice ({tileCount} tiles)");
    Place(acImg, 2, 1, $"Autocorrelation (pitch={pitchEst.Pitch:F1})");
    Place(bandViz, 2, 2, $"Band + seams (count={tileCount})");

    string outPath = $@"E:\文档\日麻教学\overlay\artifacts\replay\{name}-debug-v2.png";
    Cv2.ImWrite(outPath, dbg);
    Console.WriteLine($"  -> {outPath}");

    // Print normalised coords
    Console.WriteLine($"  Normalised refined quad:");
    Console.WriteLine($"    TL: ({refinedQuad.TopLeft.X:F6},{refinedQuad.TopLeft.Y:F6})");
    Console.WriteLine($"    TR: ({refinedQuad.TopRight.X:F6},{refinedQuad.TopRight.Y:F6})");
    Console.WriteLine($"    BR: ({refinedQuad.BottomRight.X:F6},{refinedQuad.BottomRight.Y:F6})");
    Console.WriteLine($"    BL: ({refinedQuad.BottomLeft.X:F6},{refinedQuad.BottomLeft.Y:F6})");

}

ProcessSide("right", Seat.Right, RotateFlags.Rotate90Clockwise);
ProcessSide("left", Seat.Left, RotateFlags.Rotate90Counterclockwise);
Console.WriteLine("\nDone.");
