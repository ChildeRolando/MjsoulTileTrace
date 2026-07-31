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
    Console.WriteLine($"  Coarse ROI: {cropRect}");

    using Mat cropped = new Mat(img, cropRect);
    using Mat rotated = new Mat(); Cv2.Rotate(cropped, rotated, rot);
    Console.WriteLine($"  Crop {cropped.Width}x{cropped.Height} -> Rot {rotated.Width}x{rotated.Height}");

    // ── 1. HSV calibration (production flow) ─────────────────────
    var masker = new SideHandBackMask(); masker.Calibrate(rotated);
    var (rawM, hsv) = masker.ExtractWithHsv(rotated);
    using Mat rawMask = rawM, hsvImg = hsv;
    Console.WriteLine($"  HSV: H=[{masker.HueMin},{masker.HueMax}] S>={masker.SaturationMin} V>={masker.ValueMin}");

    // Clean mask.
    using Mat cK = Cv2.GetStructuringElement(MorphShapes.Rect, new Size(17, 9));
    using Mat closed = new Mat(); Cv2.MorphologyEx(rawMask, closed, MorphTypes.Close, cK);
    using Mat vK = Cv2.GetStructuringElement(MorphShapes.Rect, new Size(1, 3));
    using Mat cleanMask = new Mat(); Cv2.MorphologyEx(closed, cleanMask, MorphTypes.Open, vK);

    // ── 2. Plane fit ─────────────────────────────────────────────
    var plane = SideHandPlaneFitter.Fit(rawMask, cleanMask);
    if (plane is null) { Console.WriteLine("  Plane REJECTED."); return; }
    Console.WriteLine($"  Plane: cols=[{plane.ColStart},{plane.ColEnd}] conf={plane.Confidence:F2}");

    int broadOrangeArea = Cv2.CountNonZero(rawMask);
    Console.WriteLine($"  Broad orange area: {broadOrangeArea}");

    // ── 3. Back-surface detection (PRODUCTION — no relaxed opts) ─
    var detection = BackSurfaceGeometryDetector.Detect(rotated, rawMask, plane);
    if (detection is null) { Console.WriteLine("  Geometry REJECTED."); return; }

    var geometry = detection.Geometry;
    Console.WriteLine($"  Geometry: ridge inliers={geometry.RidgeInliers} rail inliers={geometry.LowerRailInliers} backH={geometry.MeanBackHeight:F1} conf={geometry.Confidence:F2}");
    Console.WriteLine($"  Ridge candidate count: {detection.RidgeCandidates.Count}");
    Console.WriteLine($"  Ridge inlier count: {geometry.RidgeInliers}");
    Console.WriteLine($"  Dominant contrast sign: {geometry.ContrastSign}");
    Console.WriteLine($"  Selected ridge side: {detection.SelectedSide}");
    Console.WriteLine($"  Ridge residual: {geometry.NormalizedResidual:F2}");

    // Accepted/rejected candidates.
    int acceptedCount = detection.RidgeCandidates.Count(c => c.Accepted);
    int rejectedCount = detection.RidgeCandidates.Count(c => !c.Accepted);
    var rejectReasons = detection.RidgeCandidates
        .Where(c => !c.Accepted && c.RejectionReason is not null)
        .GroupBy(c => c.RejectionReason!)
        .Select(g => $"  {g.Key}: {g.Count()}")
        .ToList();
    Console.WriteLine($"  Accepted candidates: {acceptedCount}");
    Console.WriteLine($"  Rejected candidates: {rejectedCount}");
    foreach (var reason in rejectReasons)
        Console.WriteLine(reason);

    // ── 4. Detect tile-back instances (PRODUCTION — no relaxed opts) ──
    var candidateInstances = BackTileInstanceDetector.Detect(
        detection, plane, cropRect, seat, FW, FH);
    Console.WriteLine($"  Candidate instances: {candidateInstances.Count}");
    for (int i = 0; i < candidateInstances.Count; i++)
    {
        var inst = candidateInstances[i];
        Console.WriteLine($"    [{i}] u=[{inst.ULeft:F4},{inst.URight:F4}] w={inst.Width:F4} cov={inst.OrangeCoverage:F2} ridge={inst.RidgeSupport} rail={inst.LowerRailSupport} conf={inst.Confidence:F2}");
    }

    // ── 5. Joint selection + projective fit ──────────────────────
    var selection = ProjectiveTileSequenceFitter.SelectAndFit(candidateInstances);
    IReadOnlyList<BackTileInstance> selectedInstances;
    ProjectiveTileSequenceModel? projModel;

    if (selection is { } sel)
    {
        selectedInstances = sel.SelectedInstances;
        projModel = sel.Model;
        Console.WriteLine($"  Selected instances: {selectedInstances.Count} (was {candidateInstances.Count} candidates)");
    }
    else
    {
        selectedInstances = candidateInstances;
        projModel = ProjectiveTileSequenceFitter.Fit(candidateInstances);
        Console.WriteLine($"  Using all {selectedInstances.Count} instances (no selection)");
    }

    if (projModel is not null)
    {
        Console.WriteLine($"  Projective: A={projModel.A:F4} B={projModel.B:F4} C={projModel.C:F4} resid={projModel.Residual:F4} monotonic={projModel.IsMonotonic} inliers={projModel.InlierCount} conf={projModel.Confidence:F2}");
        for (int i = 0; i < selectedInstances.Count; i++)
        {
            double pred = projModel.PredictedUAt(i);
            double obs = selectedInstances[i].UCenter;
            Console.WriteLine($"    k={i}: obs={obs:F4} pred={pred:F4} err={Math.Abs(pred-obs):F4}");
        }

        var topology = ProjectiveTileSequenceFitter.ParseTopology(
            selectedInstances, projModel, new TemporalTrackerOptions());
        if (topology is not null)
        {
            Console.WriteLine($"  Topology: main={topology.MainCount} extra={topology.ExtraInstance is not null} missing={topology.MissingMainOrdinal} status={topology.Status}");
            Console.WriteLine($"  Final instance count: {topology.InstanceCount}");
            Console.WriteLine($"  Internal seams: {Math.Max(0, topology.InstanceCount - 1)}");
        }
    }
    else
    {
        Console.WriteLine("  Projective fit FAILED.");
        if (selectedInstances.Count > 0)
        {
            var topology = new SideHandInstanceTopology(
                selectedInstances, [selectedInstances], null, null, null,
                selectedInstances.Average(i => i.Confidence),
                selectedInstances.Count >= 5 ? TopologyStatus.LowConfidence : TopologyStatus.GeometryFailure);
        }
    }

    // ── 6. Build debug display ───────────────────────────────────
    int pH = 240, pW = Math.Max(rotated.Cols, 340);
    int rows = 4, cols = 3;
    using var dbg = new Mat(rows * pH + 50, cols * pW + 40, MatType.CV_8UC3, new Scalar(40, 40, 40));

    // Row 0: A) Rotated BGR, B) Broad raw orange mask, C) Lab-L with candidates
    Point2f[] planeCorners = {
        new(plane.ColStart, (float)plane.TopStartY),
        new(plane.ColEnd, (float)plane.TopEndY),
        new(plane.ColEnd, (float)plane.BottomEndY),
        new(plane.ColStart, (float)plane.BottomStartY)
    };
    using var rotViz = rotated.Clone();
    DrawQuadPx(rotViz, planeCorners, new Scalar(0, 255, 0), 2);
    Place(rotViz, 0, 0, pW, pH, dbg, "A: Rotated BGR + plane");

    Place(rawMask, 0, 1, pW, pH, dbg, "B: Broad raw orange mask");

    // C) Lab-L with candidate ridge points.
    using Mat lab = new Mat(); Cv2.CvtColor(rotated, lab, ColorConversionCodes.BGR2Lab);
    using Mat lCh = new Mat(); Cv2.ExtractChannel(lab, lCh, 0);
    using var labViz = new Mat(); Cv2.CvtColor(lCh, labViz, ColorConversionCodes.GRAY2BGR);

    foreach (var cand in detection.RidgeCandidates)
    {
        var color = cand.Accepted
            ? new Scalar(0, 255, 0)   // green = accepted inlier
            : cand.RejectionReason?.Contains("sign") == true
                ? new Scalar(255, 0, 255) // magenta = wrong sign
                : cand.RejectionReason?.Contains("contrast") == true
                    ? new Scalar(255, 255, 0) // cyan = weak contrast
                    : new Scalar(0, 165, 255); // orange = other rejection
        Cv2.Circle(labViz, new Point(cand.X, cand.Y), 2, color, -1);
    }
    // Draw fitted ridge and rail lines.
    for (int x = geometry.ValidStart; x <= geometry.ValidEnd; x += 2)
    {
        double ry = geometry.RidgeY(x);
        double ly = geometry.LowerRailY(x);
        int yiR = Math.Clamp((int)ry, 0, rotated.Rows - 1);
        int yiL = Math.Clamp((int)ly, 0, rotated.Rows - 1);
        Cv2.Circle(labViz, new Point(x, yiR), 1, new Scalar(0, 255, 128), -1);
        Cv2.Circle(labViz, new Point(x, yiL), 1, new Scalar(0, 128, 255), -1);
    }
    Place(labViz, 0, 2, pW, pH, dbg, "C: Lab-L + candidates (green=acc, magenta=sign, cyan=contrast, orange=other)");

    // Row 1: D) Ridge+rail on rotated, E) Both side corridors with scores, F) Back-only mask
    using var rrViz = rotated.Clone();
    for (int x = geometry.ValidStart; x <= geometry.ValidEnd; x += 2)
    {
        double ry = geometry.RidgeY(x);
        double ly = geometry.LowerRailY(x);
        Cv2.Circle(rrViz, new Point(x, Math.Clamp((int)ry, 0, rotated.Rows - 1)), 1, new Scalar(0, 255, 0), -1);
        Cv2.Circle(rrViz, new Point(x, Math.Clamp((int)ly, 0, rotated.Rows - 1)), 1, new Scalar(0, 0, 255), -1);
    }
    Place(rrViz, 1, 0, pW, pH, dbg, $"D: Ridge(green)+Rail(red) side={detection.SelectedSide}");

    // E) Both candidate side corridors with visual overlay.
    using var sideViz = rotated.Clone();
    // Show the selected side as a green overlay, rejected side as red.
    for (int y = 0; y < rotated.Rows; y++)
    {
        for (int x = geometry.ValidStart; x <= geometry.ValidEnd; x += 4)
        {
            double rY = geometry.RidgeY(x);
            double lY = geometry.LowerRailY(x);
            if (detection.SelectedSide == BackSurfaceSide.BottomOfRidge)
            {
                // Selected: below ridge (back surface)
                if (y > rY && y < lY)
                    sideViz.At<Vec3b>(y, x) = new Vec3b(
                        (byte)(sideViz.At<Vec3b>(y, x).Item0 / 2 + 64),
                        (byte)sideViz.At<Vec3b>(y, x).Item1,
                        (byte)(sideViz.At<Vec3b>(y, x).Item2 / 2));
                // Rejected: above ridge
                else if (y < rY)
                    sideViz.At<Vec3b>(y, x) = new Vec3b(
                        (byte)sideViz.At<Vec3b>(y, x).Item0,
                        (byte)(sideViz.At<Vec3b>(y, x).Item1 / 2),
                        (byte)(sideViz.At<Vec3b>(y, x).Item2 / 2));
            }
            else
            {
                if (y < rY && y > lY)
                    sideViz.At<Vec3b>(y, x) = new Vec3b(
                        (byte)(sideViz.At<Vec3b>(y, x).Item0 / 2 + 64),
                        (byte)sideViz.At<Vec3b>(y, x).Item1,
                        (byte)(sideViz.At<Vec3b>(y, x).Item2 / 2));
                else if (y > rY)
                    sideViz.At<Vec3b>(y, x) = new Vec3b(
                        (byte)sideViz.At<Vec3b>(y, x).Item0,
                        (byte)(sideViz.At<Vec3b>(y, x).Item1 / 2),
                        (byte)(sideViz.At<Vec3b>(y, x).Item2 / 2));
            }
        }
    }
    Place(sideViz, 1, 1, pW, pH, dbg, $"E: Side select (green=back, red=rejected) side={detection.SelectedSide}");

    // F) Selected back-only mask.
    Place(detection.BackOnlyMask, 1, 2, pW, pH, dbg, $"F: Back-only mask ({detection.SelectedSide})");

    // Row 2: G) Occupancy signal + all boundaries, H) Selected boundaries only, I) Selected instances
    int sigW = 900;
    using var sigImg = new Mat(pH, sigW, MatType.CV_8UC3, Scalar.Black);

    // Build occupancy signal from back-only mask.
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
            if (detection.BackOnlyMask.At<byte>(y, xi) > 0) fg++;
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

    // Mark all candidate boundaries with their status.
    // Find active extent.
    int activeStart = 0, activeEnd = nOcc - 1;
    double noiseFloor = occ.Min();
    double signalRange = occMax - noiseFloor;
    double occThreshold = noiseFloor + signalRange * 0.30;
    {
        int run = 0;
        for (int i = 0; i < nOcc; i++)
        {
            if (occ[i] < occThreshold) { run++; if (run >= 7) { activeStart = Math.Max(0, i - run); break; } }
            else run = 0;
        }
        run = 0;
        for (int i = nOcc - 1; i >= 0; i--)
        {
            if (occ[i] < occThreshold) { run++; if (run >= 7) { activeEnd = Math.Min(nOcc - 1, i + run); break; } }
            else run = 0;
        }
    }

    // Draw active extent lines.
    Cv2.Line(sigImg, new Point(activeStart, 0), new Point(activeStart, pH), new Scalar(255, 255, 0), 1);
    Cv2.Line(sigImg, new Point(activeEnd, 0), new Point(activeEnd, pH), new Scalar(255, 255, 0), 1);

    // Mark selected instance boundaries.
    foreach (var inst in selectedInstances)
    {
        int bx = (int)(inst.ULeft * sigW);
        Cv2.Line(sigImg, new Point(bx, 0), new Point(bx, pH), new Scalar(0, 255, 0), 1);
    }
    // Mark rightmost boundary.
    if (selectedInstances.Count > 0)
    {
        int bx = (int)(selectedInstances[^1].URight * sigW);
        Cv2.Line(sigImg, new Point(bx, 0), new Point(bx, pH), new Scalar(0, 255, 0), 1);
    }

    // Mark model-predicted positions.
    if (projModel is not null)
    {
        for (int k = 0; k <= selectedInstances.Count; k++)
        {
            double pu = projModel.PredictedUAt(k);
            int px = Math.Clamp((int)(pu * sigW), 0, sigW - 1);
            Cv2.Circle(sigImg, new Point(px, pH / 2), 3, new Scalar(0, 0, 255), -1);
        }
    }

    Place(sigImg, 2, 0, Math.Min(sigW, pW), pH, dbg,
        $"G: Occupancy + boundaries({selectedInstances.Count}) + model");

    // H) Selected boundaries only (close-up of occupancy signal).
    using var selSigImg = new Mat(pH, sigW, MatType.CV_8UC3, Scalar.Black);
    if (occMax > 1e-9)
    {
        for (int x = 1; x < Math.Min(sigW, occ.Length); x++)
        {
            int y0 = pH - 1 - (int)(occ[x - 1] / occMax * (pH - 1));
            int y1 = pH - 1 - (int)(occ[x] / occMax * (pH - 1));
            Cv2.Line(selSigImg, new Point(x - 1, y0), new Point(x, y1), new Scalar(200, 200, 200), 1);
        }
    }
    // Draw only selected boundaries (with index labels).
    foreach (var inst in selectedInstances)
    {
        int bx = (int)(inst.ULeft * sigW);
        Cv2.Line(selSigImg, new Point(bx, 0), new Point(bx, pH), new Scalar(0, 255, 0), 2);
    }
    if (selectedInstances.Count > 0)
    {
        int bx = (int)(selectedInstances[^1].URight * sigW);
        Cv2.Line(selSigImg, new Point(bx, 0), new Point(bx, pH), new Scalar(0, 255, 0), 2);
    }
    Place(selSigImg, 2, 1, Math.Min(sigW, pW), pH, dbg,
        $"H: Selected boundaries ({selectedInstances.Count + 1})");

    // I) Selected instance trapezoids on rotated.
    using var instViz = rotated.Clone();
    foreach (var inst in selectedInstances)
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
    Place(instViz, 2, 2, pW, pH, dbg, $"I: {selectedInstances.Count} selected instances");

    // Row 3: J) Projective model + observed vs predicted, K) Frame overlay, L) Info panel
    // K) Frame overlay with instances mapped back.
    using var frameViz = img.Clone();
    foreach (var inst in selectedInstances)
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
    Place(frameViz, 3, 0, pW, pH, dbg, $"K: Frame overlay ({selectedInstances.Count} instances)");

    // J) Projective model chart.
    using var modelImg = new Mat(pH, pW, MatType.CV_8UC3, new Scalar(40, 40, 40));
    if (projModel is not null)
    {
        // Draw u-axis.
        double uMin = selectedInstances.Count > 0 ? selectedInstances[0].UCenter - 0.05 : 0;
        double uMax = selectedInstances.Count > 0 ? selectedInstances[^1].UCenter + 0.05 : 1;
        double uRange = uMax - uMin;

        for (int i = 0; i < selectedInstances.Count; i++)
        {
            double obsU = selectedInstances[i].UCenter;
            double predU = projModel.PredictedUAt(i);

            int xObs = (int)(20 + (obsU - uMin) / uRange * (pW - 40));
            int xPred = (int)(20 + (predU - uMin) / uRange * (pW - 40));
            int yObs = pH / 3;
            int yPred = 2 * pH / 3;

            Cv2.Circle(modelImg, new Point(xObs, yObs), 3, new Scalar(0, 255, 0), -1);
            Cv2.Circle(modelImg, new Point(xPred, yPred), 3, new Scalar(0, 0, 255), -1);
            Cv2.Line(modelImg, new Point(xObs, yObs), new Point(xPred, yPred),
                new Scalar(128, 128, 128), 1, LineTypes.AntiAlias);
        }
        Cv2.PutText(modelImg, "o=green(obs) x=red(pred)",
            new Point(5, pH - 10), HersheyFonts.HersheySimplex, 0.35, Scalar.White, 1);
    }
    Place(modelImg, 3, 1, pW, pH, dbg, "J: Projective model (obs vs pred)");

    // L) Summary info panel.
    using var infoPanel = new Mat(pH, pW, MatType.CV_8UC3, new Scalar(40, 40, 40));
    int extraCount = candidateInstances.Count - selectedInstances.Count;
    var topo = projModel is not null
        ? ProjectiveTileSequenceFitter.ParseTopology(selectedInstances, projModel, new TemporalTrackerOptions())
        : null;

    string info = $"Seat: {name}\n";
    info += $"Broad orange area: {broadOrangeArea}\n";
    info += $"Ridge candidate count: {detection.RidgeCandidates.Count}\n";
    info += $"Ridge inlier count: {geometry.RidgeInliers}\n";
    info += $"Dominant contrast sign: {geometry.ContrastSign}\n";
    info += $"Selected ridge side: {detection.SelectedSide}\n";
    info += $"Ridge residual: {geometry.NormalizedResidual:F2}\n";
    info += $"Rail inliers: {geometry.LowerRailInliers}\n";
    info += $"Active occupancy extent: [{activeStart},{activeEnd}]\n";
    info += $"Raw boundary candidates: (see console)\n";
    info += $"Selected boundary count: {selectedInstances.Count + 1}\n";
    info += $"Selected instance count: {selectedInstances.Count}\n";
    info += $"Rejected endpoints/side-faces: {extraCount}\n";
    info += $"Projective residual: {projModel?.Residual ?? 0:F4}\n";
    info += $"Final topology: main={topo?.MainCount ?? selectedInstances.Count} extra={topo?.ExtraInstance is not null} missing={topo?.MissingMainOrdinal}";

    var infoLines = info.Split('\n');
    for (int li = 0; li < infoLines.Length; li++)
        Cv2.PutText(infoPanel, infoLines[li], new Point(5, 16 + li * 15),
            HersheyFonts.HersheySimplex, 0.32, Scalar.White, 1);

    Place(infoPanel, 3, 2, pW, pH, dbg, "L: Summary");

    // Save.
    string outPath = $@"E:\文档\日麻教学\overlay\artifacts\replay\{name}-debug-v11.png";
    Cv2.ImWrite(outPath, dbg);
    Console.WriteLine($"  -> {outPath}");

    // ── CSV output ──────────────────────────────────────────────────
    string csvPath = $@"E:\文档\日麻教学\overlay\artifacts\replay\{name}-diagnostics-v11.csv";
    using var csv = new StreamWriter(csvPath);
    csv.WriteLine("timestamp,seat,ridgeCandidates,ridgeInliers,contrastSign,selectedSide,ridgeResidual,railInliers,activeExtentStart,activeExtentEnd,selectedBoundaryCount,selectedInstanceCount,rejectedEndpointCount,projectiveResidual,topologyMain,topologyExtra,topologyMissing");
    csv.WriteLine($",{name},{detection.RidgeCandidates.Count},{geometry.RidgeInliers},{geometry.ContrastSign},{detection.SelectedSide},{geometry.NormalizedResidual:F4},{geometry.LowerRailInliers},{activeStart},{activeEnd},{selectedInstances.Count + 1},{selectedInstances.Count},{extraCount},{projModel?.Residual ?? 0:F4},{topo?.MainCount ?? selectedInstances.Count},{topo?.ExtraInstance is not null},{topo?.MissingMainOrdinal?.ToString() ?? "null"}");
    Console.WriteLine($"  -> {csvPath}");
}

ProcessSide("right", Seat.Right, RotateFlags.Rotate90Clockwise);
ProcessSide("left", Seat.Left, RotateFlags.Rotate90Counterclockwise);
Console.WriteLine("\nDone.");
