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

Point PxN(NormalizedPoint p) => new((int)(p.X * FW), (int)(p.Y * FH));
void DrawQuadPx(Mat canvas, Point2f[] corners, Scalar c, int t) {
    var pts = corners.Select(p => new Point((int)p.X, (int)p.Y)).ToArray();
    Cv2.Polylines(canvas, new[] { pts }, true, c, t, LineTypes.AntiAlias);
}

Rect ExpandRoi(NormalizedQuad quad) {
    var pts = new[] { PxN(quad.TopLeft), PxN(quad.TopRight), PxN(quad.BottomRight), PxN(quad.BottomLeft) };
    Rect r = Cv2.BoundingRect(pts);
    int ap = (int)(r.Height * 0.12), cp = (int)(r.Width * 0.22);
    return new Rect(Math.Max(0, r.X - cp), Math.Max(0, r.Y - ap),
        Math.Min(FW - Math.Max(0, r.X - cp), r.Width + 2 * cp),
        Math.Min(FH - Math.Max(0, r.Y - ap), r.Height + 2 * ap));
}

void Place(Mat src, int r, int c, int pW, int pH, Mat dbg, string label) {
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

void ProcessSide(string name, Seat seatFlag, RotateFlags rotFlag) {
    Console.WriteLine($"\n{'='*60}\n=== {name} ===\n{'='*60}");
    var s = seats.GetProperty(name);
    Rect cropRect = ExpandRoi(ReadQuad(s.GetProperty("mainHandRegion")));
    Console.WriteLine($"  Coarse ROI: {cropRect}");

    using Mat cropped = new Mat(img, cropRect);
    using Mat rotated = new Mat(); Cv2.Rotate(cropped, rotated, rotFlag);
    Console.WriteLine($"  Crop {cropped.Width}x{cropped.Height} -> Rot {rotated.Width}x{rotated.Height}");

    // ── Orange mask ───────────────────────────────────────────────
    var masker = new SideHandBackMask(); masker.Calibrate(rotated);
    var (rawM, hsv) = masker.ExtractWithHsv(rotated);
    using Mat rawMask = rawM, hsvImg = hsv;
    Console.WriteLine($"  HSV: H=[{masker.HueMin},{masker.HueMax}] S>={masker.SaturationMin}");

    // Clean mask: close + vertical open
    using Mat cK = Cv2.GetStructuringElement(MorphShapes.Rect, new Size(17, 9));
    using Mat closed = new Mat(); Cv2.MorphologyEx(rawMask, closed, MorphTypes.Close, cK);
    using Mat vK = Cv2.GetStructuringElement(MorphShapes.Rect, new Size(1, 3));
    using Mat cleanMask = new Mat(); Cv2.MorphologyEx(closed, cleanMask, MorphTypes.Open, vK);

    // ── Plane fit ─────────────────────────────────────────────────
    var plane = SideHandPlaneFitter.Fit(rawMask, cleanMask);
    if (plane is null) { Console.WriteLine("  Plane REJECTED."); return; }
    Console.WriteLine($"  Plane: cols=[{plane.ColStart},{plane.ColEnd}] conf={plane.Confidence:F2}");

    // ── Map back ──────────────────────────────────────────────────
    Point2f[] rotCorners = { new(plane.ColStart, (float)plane.TopStartY), new(plane.ColEnd, (float)plane.TopEndY),
        new(plane.ColEnd, (float)plane.BottomEndY), new(plane.ColStart, (float)plane.BottomStartY) };
    Point2f[] cropCorners = new Point2f[4];
    for (int i = 0; i < 4; i++) cropCorners[i] = seatFlag switch {
        Seat.Right => new Point2f(rotCorners[i].Y, cropped.Height - 1 - rotCorners[i].X),
        Seat.Left => new Point2f(cropped.Width - 1 - rotCorners[i].Y, rotCorners[i].X), _ => rotCorners[i] };
    Point2f[] frameCorners = cropCorners.Select(p => new Point2f(p.X + cropRect.X, p.Y + cropRect.Y)).ToArray();
    NormalizedQuad refinedQuad = new(
        new(frameCorners[0].X / FW, frameCorners[0].Y / FH), new(frameCorners[1].X / FW, frameCorners[1].Y / FH),
        new(frameCorners[2].X / FW, frameCorners[2].Y / FH), new(frameCorners[3].X / FW, frameCorners[3].Y / FH));

    // ── Compute gap signal directly from raw mask ──────────────────
    const int GS = 900;
    double[] gapSig = new double[GS];
    for (int i = 0; i < GS; i++) {
        double u = (i + 0.5) / GS;
        float tx = (float)(plane.ColStart + u * (plane.ColEnd - plane.ColStart));
        float ty = (float)(plane.TopStartY + u * (plane.TopEndY - plane.TopStartY));
        float bx = (float)(plane.ColStart + u * (plane.ColEnd - plane.ColStart));
        float by = (float)(plane.BottomStartY + u * (plane.BottomEndY - plane.BottomStartY));
        int fg = 0, total = 0;
        for (int j = 0; j < 24; j++) {
            double t = 0.18 + 0.64 * (j + 0.5) / 24;
            int sx = (int)Math.Round(tx + (bx - tx) * t);
            int sy = (int)Math.Round(ty + (by - ty) * t);
            if (sx >= 0 && sx < rawMask.Cols && sy >= 0 && sy < rawMask.Rows) {
                if (rawMask.At<byte>(sy, sx) > 0) fg++;
                total++;
            }
        }
        gapSig[i] = total > 0 ? 1.0 - fg / (double)total : 0;
    }

    // Light Gaussian smooth
    double[] smoothed = new double[GS];
    int radius = 3; double sigma = 1.0;
    double[] kernel = new double[2*radius+1]; double ksum = 0;
    for (int k = -radius; k <= radius; k++) { kernel[k+radius] = Math.Exp(-0.5*k*k/(sigma*sigma)); ksum += kernel[k+radius]; }
    for (int k = 0; k < kernel.Length; k++) kernel[k] /= ksum;
    for (int i = 0; i < GS; i++) { double acc = 0; for (int k = Math.Max(0,i-radius); k <= Math.Min(GS-1,i+radius); k++) acc += gapSig[k]*kernel[k-i+radius]; smoothed[i] = acc; }

    // Find peaks
    double nf = smoothed.Min(), mv = smoothed.Max();
    double thresh = nf + (mv - nf) * 0.12;
    var peaks = new List<int>();
    for (int i = 1; i < GS-1; i++)
        if (smoothed[i] > thresh && smoothed[i] > smoothed[i-1] && smoothed[i] >= smoothed[i+1])
            peaks.Add(i);

    // NMS with min dist ~0.4 * expected pitch
    int minD = Math.Max(2, (int)(GS / 13.0 * 0.3));
    bool[] supp = new bool[GS];
    var nmsPeaks = new List<int>();
    foreach (int p in peaks.OrderByDescending(p => smoothed[p])) {
        if (supp[p]) continue;
        nmsPeaks.Add(p);
        for (int x = Math.Max(0,p-minD); x <= Math.Min(GS-1,p+minD); x++) supp[x] = true;
    }
    nmsPeaks.Sort();

    // Exclude ends, keep 12 strongest
    int marg = Math.Max(3, GS/25);
    nmsPeaks = nmsPeaks.Where(p => p > marg && p < GS - marg).ToList();
    if (nmsPeaks.Count > 12)
        nmsPeaks = nmsPeaks.OrderByDescending(p => smoothed[p]).Take(12).OrderBy(p => p).ToList();

    int tileCount = nmsPeaks.Count >= 8 ? nmsPeaks.Count + 1 : 0;
    Console.WriteLine($"  Gap signal: min={nf:F3} max={mv:F3} thresh={thresh:F3} rawPeaks={peaks.Count} afterNMS={nmsPeaks.Count} -> {tileCount} tiles");

    // ── Warped band (visual ref only) ─────────────────────────────
    using var backStrip = SideHandRectifier.Warp(rotated, plane);

    // Build seam top/bottom coords for drawing
    Point2f SeamTopAt(int peakIdx) {
        double u = (nmsPeaks[peakIdx] + 0.5) / GS;
        return new Point2f((float)(plane.ColStart + u*(plane.ColEnd-plane.ColStart)),
                           (float)(plane.TopStartY + u*(plane.TopEndY-plane.TopStartY))); }
    Point2f SeamBotAt(int peakIdx) {
        double u = (nmsPeaks[peakIdx] + 0.5) / GS;
        return new Point2f((float)(plane.ColStart + u*(plane.ColEnd-plane.ColStart)),
                           (float)(plane.BottomStartY + u*(plane.BottomEndY-plane.BottomStartY))); }

    // ── Build debug panels ────────────────────────────────────────
    int pH = 260, pW = Math.Max(rotated.Cols, 350);
    int rows = 3, cols = 3;
    using var dbg = new Mat(rows * pH + 40, cols * pW + 40, MatType.CV_8UC3, new Scalar(40, 40, 40));

    // Row 0
    using var rotViz = rotated.Clone(); DrawQuadPx(rotViz, rotCorners, new Scalar(0,255,0), 2);
    Place(rotViz, 0, 0, pW, pH, dbg, "A: Rotated + plane (green)");
    Place(rawMask, 0, 1, pW, pH, dbg, "B: Raw mask (no close)");
    Place(cleanMask, 0, 2, pW, pH, dbg, "C: Clean mask (close+open)");

    // Row 1
    using var cropViz = cropped.Clone(); DrawQuadPx(cropViz, cropCorners, new Scalar(255,0,0), 2);
    Place(cropViz, 1, 0, pW, pH, dbg, "D: Crop + inv-rot (blue)");
    using var frameViz = img.Clone(); DrawQuadPx(frameViz, frameCorners, new Scalar(0,255,255), 2); Cv2.Rectangle(frameViz, cropRect, new Scalar(0,0,255), 2);
    Place(frameViz, 1, 1, pW, pH, dbg, "E: Frame (red=coarse yellow=refined)");

    // Raw mask + red diagonal seam lines
    using var seamViz = new Mat(); Cv2.CvtColor(rawMask, seamViz, ColorConversionCodes.GRAY2BGR);
    for (int i = 0; i < nmsPeaks.Count; i++) {
        var t = SeamTopAt(i); var b = SeamBotAt(i);
        Cv2.Line(seamViz, new Point((int)t.X, (int)t.Y), new Point((int)b.X, (int)b.Y), new Scalar(0,0,255), 1);
    }
    Cv2.PutText(seamViz, $"{nmsPeaks.Count} seams ({tileCount} tiles)", new Point(5,12), HersheyFonts.HersheySimplex, 0.35, Scalar.White, 1);
    Place(seamViz, 1, 2, pW, pH, dbg, "F: Raw mask + seams (red diagonals)");

    // Row 2: Gap signal, Warped band, (empty)
    int sigW2 = 900; using var sigImg2 = new Mat(pH, sigW2, MatType.CV_8UC3, Scalar.Black);
    if (gapSig.Length > 0) { double m2 = gapSig.Max(); if (m2>1e-9) for (int x=1; x<Math.Min(sigW2,gapSig.Length); x++) { int y0=pH-1-(int)(gapSig[x-1]/m2*(pH-1)); int y1=pH-1-(int)(gapSig[x]/m2*(pH-1)); Cv2.Line(sigImg2, new Point(x-1,y0), new Point(x,y1), new Scalar(200,200,200), 1); }
        foreach (int pi in nmsPeaks) { int sx=pi*sigW2/GS; if(sx>=0&&sx<sigW2) Cv2.Line(sigImg2, new Point(sx,0), new Point(sx,pH), new Scalar(0,255,0), 2); } }
    Cv2.PutText(sigImg2, $"Gap signal + {nmsPeaks.Count} seams (green)", new Point(5,15), HersheyFonts.HersheySimplex, 0.35, Scalar.White, 1);
    Place(sigImg2, 2, 0, Math.Min(sigW2,pW), pH, dbg, "G: Raw-mask gap signal");

    using var bandViz2 = new Mat(); Cv2.CvtColor(backStrip, bandViz2, ColorConversionCodes.GRAY2BGR);
    Cv2.PutText(bandViz2, $"Warped band (ref)  tiles={tileCount}", new Point(5,12), HersheyFonts.HersheySimplex, 0.35, Scalar.White, 1);
    Place(bandViz2, 2, 1, pW, pH, dbg, "H: Warped band (visual ref)");
    Place(rotViz, 2, 2, pW, pH, dbg, "I: (dup)");

    string outPath = $@"E:\文档\日麻教学\overlay\artifacts\replay\{name}-debug-v3.png";
    Cv2.ImWrite(outPath, dbg);
    Console.WriteLine($"  -> {outPath}");
    Console.WriteLine($"  Refined quad norm: TL({refinedQuad.TopLeft.X:F4},{refinedQuad.TopLeft.Y:F4}) TR({refinedQuad.TopRight.X:F4},{refinedQuad.TopRight.Y:F4}) BR({refinedQuad.BottomRight.X:F4},{refinedQuad.BottomRight.Y:F4}) BL({refinedQuad.BottomLeft.X:F4},{refinedQuad.BottomLeft.Y:F4})");
}

ProcessSide("right", Seat.Right, RotateFlags.Rotate90Clockwise);
ProcessSide("left", Seat.Left, RotateFlags.Rotate90Counterclockwise);
Console.WriteLine("\nDone.");
