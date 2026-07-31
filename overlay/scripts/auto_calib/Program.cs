using System.Text.Json;
using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.Profiles;
using MahjongSoulOverlay.Vision.Hand;
using OpenCvSharp;

using var img = Cv2.ImRead(@"E:\文档\日麻教学\overlay\artifacts\replay\real-0229.png");
using var draw = img.Clone();
int W = img.Width, H = img.Height;

var jsonText = File.ReadAllText(
    @"E:\文档\日麻教学\overlay\src\MahjongSoulOverlay.Vision\Profiles\yonma-1920x1080.standard.json");
using var doc = JsonDocument.Parse(jsonText);
var seats = doc.RootElement.GetProperty("seats");

NormalizedQuad ReadQuad(JsonElement q) => new(
    new(q.GetProperty("topLeft").GetProperty("x").GetDouble(), q.GetProperty("topLeft").GetProperty("y").GetDouble()),
    new(q.GetProperty("topRight").GetProperty("x").GetDouble(), q.GetProperty("topRight").GetProperty("y").GetDouble()),
    new(q.GetProperty("bottomRight").GetProperty("x").GetDouble(), q.GetProperty("bottomRight").GetProperty("y").GetDouble()),
    new(q.GetProperty("bottomLeft").GetProperty("x").GetDouble(), q.GetProperty("bottomLeft").GetProperty("y").GetDouble()));

SeatProfile LoadSeat(string name)
{
    var s = seats.GetProperty(name);
    var seat = Enum.Parse<Seat>(name, ignoreCase: true);
    var handDir = Enum.Parse<LayoutDirection>(s.GetProperty("mainHandDirection").GetString()!, ignoreCase: true);
    var riverDir = Enum.Parse<LayoutDirection>(s.GetProperty("riverFlowDirection").GetString()!, ignoreCase: true);
    var meldDir = Enum.Parse<LayoutDirection>(s.GetProperty("meldExpansionDirection").GetString()!, ignoreCase: true);

    var slots = s.GetProperty("mainSlots").EnumerateArray().Select(ReadQuad).ToList();

    return new SeatProfile(
        seat,
        ReadQuad(s.GetProperty("mainHandRegion")),
        slots, handDir,
        ReadQuad(s.GetProperty("drawnSlot")),
        ReadQuad(s.GetProperty("riverRegion")),
        riverDir,
        ReadQuad(s.GetProperty("meldRegion")),
        meldDir,
        new TileScale(0.05, 0.14), new TileScale(0.03, 0.07), new TileScale(0.04, 0.09),
        0.25, 4.0, -180, 180, 0.35,
        new RegionThresholds(0.15, 0.25), new RegionThresholds(0.15, 0.25),
        new RegionThresholds(0.15, 0.25), new RegionThresholds(0.15, 0.25), 0.4);
}

Point Px(double x, double y) => new((int)(x * W), (int)(y * H));
Point PxN(NormalizedPoint p) => Px(p.X, p.Y);
Scalar green = new(0, 255, 0), red = new(0, 0, 255), cyan = new(255, 255, 0), yellow = new(0, 255, 255);

void DrawQuadN(NormalizedQuad q, Scalar c, int t)
{
    var pts = new[] { PxN(q.TopLeft), PxN(q.TopRight), PxN(q.BottomRight), PxN(q.BottomLeft) };
    Cv2.Polylines(draw, new[] { pts }, true, c, t, LineTypes.AntiAlias);
}

Console.WriteLine("=== Auto-calibrating Right and Left hands ===\n");

foreach (var seatName in new[] { "right", "left" })
{
    Console.WriteLine($"--- {seatName} ---");
    var profile = LoadSeat(seatName);
    var result = HandAutoCalibrator.Calibrate(img, profile);

    if (result is null)
    {
        Console.WriteLine("  FAILED\n");
        continue;
    }

    Console.WriteLine($"  Tiles found: {result.RefinedSlots.Count}, pitch={result.PitchInStrip:F1}px, conf={result.Confidence:F2}");
    var r = result.RefinedHandRegion;
    Console.WriteLine($"  Quad px: TL({r.TopLeft.X*W:F0},{r.TopLeft.Y*H:F0}) TR({r.TopRight.X*W:F0},{r.TopRight.Y*H:F0}) BR({r.BottomRight.X*W:F0},{r.BottomRight.Y*H:F0}) BL({r.BottomLeft.X*W:F0},{r.BottomLeft.Y*H:F0})");

    // Old calibration in red
    DrawQuadN(profile.MainHandRegion, red, 2);
    foreach (var slot in profile.MainSlots) DrawQuadN(slot, new Scalar(0, 0, 150), 1);
    DrawQuadN(profile.DrawnSlot, new Scalar(0, 0, 200), 2);

    // New calibration in green/yellow/cyan
    DrawQuadN(result.RefinedHandRegion, green, 3);
    foreach (var slot in result.RefinedSlots) DrawQuadN(slot, yellow, 1);
    if (result.RefinedDrawnSlot is { } d) DrawQuadN(d, cyan, 2);

    Console.WriteLine($"  Normalized for profile JSON:");
    Console.WriteLine($"    \"topLeft\": {{\"x\": {r.TopLeft.X:F6}, \"y\": {r.TopLeft.Y:F6}}},");
    Console.WriteLine($"    \"topRight\": {{\"x\": {r.TopRight.X:F6}, \"y\": {r.TopRight.Y:F6}}},");
    Console.WriteLine($"    \"bottomRight\": {{\"x\": {r.BottomRight.X:F6}, \"y\": {r.BottomRight.Y:F6}}},");
    Console.WriteLine($"    \"bottomLeft\": {{\"x\": {r.BottomLeft.X:F6}, \"y\": {r.BottomLeft.Y:F6}}}");
    Console.WriteLine();
}

Cv2.PutText(draw, "RED=old calib  GREEN=auto-calib  YELLOW=auto slots  CYAN=auto drawn",
    new Point(10, 25), HersheyFonts.HersheySimplex, 0.55, green, 2);

var outPath = @"E:\文档\日麻教学\overlay\artifacts\replay\real-0229.auto-calib.png";
Cv2.ImWrite(outPath, draw);
Console.WriteLine($"Wrote {outPath}");
