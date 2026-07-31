using System.Text.Json;
using OpenCvSharp;

// Read the image and current profile
using var img = Cv2.ImRead(@"E:\文档\日麻教学\overlay\artifacts\replay\real-0229.png");
using var draw = img.Clone();

int W = draw.Width, H = draw.Height;

Point Px(double x, double y) => new((int)(x * W), (int)(y * H));

void DrawQuad(Point[] pts, Scalar c, int t)
{
    Cv2.Polylines(draw, new[] { pts }, true, c, t, LineTypes.AntiAlias);
}

// Color scheme:
// CURRENT calibration: RED/MAGENTA (what we think is wrong)
// PROPOSED correction: GREEN (what we think is right)
var red = new Scalar(0, 0, 255);
var green = new Scalar(0, 255, 0);
var cyan = new Scalar(255, 255, 0);
var white = new Scalar(255, 255, 255);

// === CURRENT CALIBRATION (in red) ===
var json = File.ReadAllText(
    @"E:\文档\日麻教学\overlay\src\MahjongSoulOverlay.Vision\Profiles\yonma-1920x1080.standard.json");
using var doc = JsonDocument.Parse(json);
var seats = doc.RootElement.GetProperty("seats");

void DrawCurrentQuad(string seatName, string quadName, Scalar color, int thickness)
{
    var s = seats.GetProperty(seatName);
    var q = s.GetProperty(quadName);
    var pts = new[] {
        Px(q.GetProperty("topLeft").GetProperty("x").GetDouble(), q.GetProperty("topLeft").GetProperty("y").GetDouble()),
        Px(q.GetProperty("topRight").GetProperty("x").GetDouble(), q.GetProperty("topRight").GetProperty("y").GetDouble()),
        Px(q.GetProperty("bottomRight").GetProperty("x").GetDouble(), q.GetProperty("bottomRight").GetProperty("y").GetDouble()),
        Px(q.GetProperty("bottomLeft").GetProperty("x").GetDouble(), q.GetProperty("bottomLeft").GetProperty("y").GetDouble())
    };
    DrawQuad(pts, color, thickness);
}

// Draw ALL current regions (thin red for reference)
foreach (var name in new[] { "right", "left", "top", "bottom" })
{
    DrawCurrentQuad(name, "mainHandRegion", red, 2);
    DrawCurrentQuad(name, "drawnSlot", new Scalar(0, 0, 200), 2);
    DrawCurrentQuad(name, "riverRegion", new Scalar(0, 0, 150), 1);
    DrawCurrentQuad(name, "meldRegion", new Scalar(0, 0, 100), 1);
}

// === PROPOSED RIGHT HAND CORRECTION ===
// Based on dark-pixel analysis: dark tiles detected at x=1580..1849, y=150..849
// The current calib is too narrow at the top. We widen it proportionally.
// The table felt is at about (x=1594, y=218) and tile backs extend to about x=1820.
// The current quad shape (trapezoid, wider at bottom) is correct for perspective.
// Proposed: keep the current bottom width, widen the top slightly to better
// capture tile faces near the top.
//
// Based on the detected dark region center, the tiles occupy roughly:
//   top: x=1630..1820 (190px wide)
//   bottom: x=1750..1850 (100px wide)
// But we want a narrower region to avoid overlap.
// Proposed: use 1.5x the current width at the top
//
// Current Right: TL(1594,218) TR(1639,218) BR(1821,767) BL(1754,818)
// Corrected Right: widen top by ~20px on each side
Point[] proposedRight = {
    new(1574, 218),   // TL: shifted left from 1594
    new(1659, 218),   // TR: shifted right from 1639
    new(1831, 767),   // BR: shifted right from 1821
    new(1744, 818)    // BL: shifted left from 1754
};
DrawQuad(proposedRight, green, 3);
Cv2.PutText(draw, "Right-proposed", new Point(1570, 210),
    HersheyFonts.HersheySimplex, 0.5, green, 1);

// === PROPOSED LEFT HAND CORRECTION ===
// Current Left: TL(318,86) TR(363,86) BR(236,612) BL(172,612)
// Detected dark region: x=150..399, y=50..649
// The current calib is too narrow. Widen proportional to the hand.
// For Left (topToBottom), slot 0 is at top, slot 12 at bottom.
// The hand fans out toward the bottom.
// Proposed: widen by ~20px on each side
Point[] proposedLeft = {
    new(298, 86),    // TL: shifted left from 318
    new(383, 86),    // TR: shifted right from 363
    new(256, 612),   // BR: shifted right from 236
    new(152, 612)    // BL: shifted left from 172
};
DrawQuad(proposedLeft, green, 3);
Cv2.PutText(draw, "Left-proposed", new Point(290, 78),
    HersheyFonts.HersheySimplex, 0.5, green, 1);

// === PROPOSED RIGHT DRAWN SLOT ===
// Current: TL(1606,171) TR(1636,171) BR(1636,207) BL(1606,207)
// This is above the main hand. Should be above the top of the proposed hand.
// The drawn tile sits above slot 12 with a gap.
Point[] proposedRightDrawn = {
    new(1600, 145),
    new(1640, 145),
    new(1640, 192),
    new(1600, 192)
};
DrawQuad(proposedRightDrawn, cyan, 2);

// === PROPOSED LEFT DRAWN SLOT ===
// Current: TL(160,625) TR(228,625) BR(216,699) BL(140,699)
// This is below the main hand. Should be below slot 12.
Point[] proposedLeftDrawn = {
    new(155, 628),
    new(235, 628),
    new(225, 700),
    new(135, 700)
};
DrawQuad(proposedLeftDrawn, cyan, 2);

// Label
Cv2.PutText(draw, "RED = current calibration", new Point(10, 30),
    HersheyFonts.HersheySimplex, 0.7, red, 2);
Cv2.PutText(draw, "GREEN = proposed correction", new Point(10, 55),
    HersheyFonts.HersheySimplex, 0.7, green, 2);
Cv2.PutText(draw, "Right: bottomToTop, Left: topToBottom", new Point(10, 80),
    HersheyFonts.HersheySimplex, 0.5, white, 1);

var outPath = @"E:\文档\日麻教学\overlay\artifacts\replay\real-0229.proposed.png";
Cv2.ImWrite(outPath, draw);
Console.WriteLine($"Wrote comparison image to {outPath}");

// Print proposed normalized coordinates
Console.WriteLine("\n=== PROPOSED NORMALIZED COORDINATES ===");
Console.WriteLine("Right mainHandRegion:");
foreach (var (pt, label) in new[] { (proposedRight[0], "TL"), (proposedRight[1], "TR"),
    (proposedRight[2], "BR"), (proposedRight[3], "BL") })
    Console.WriteLine($"  {label}: ({pt.X / 1920.0:F6},{pt.Y / 1080.0:F6})");

Console.WriteLine("Left mainHandRegion:");
foreach (var (pt, label) in new[] { (proposedLeft[0], "TL"), (proposedLeft[1], "TR"),
    (proposedLeft[2], "BR"), (proposedLeft[3], "BL") })
    Console.WriteLine($"  {label}: ({pt.X / 1920.0:F6},{pt.Y / 1080.0:F6})");
