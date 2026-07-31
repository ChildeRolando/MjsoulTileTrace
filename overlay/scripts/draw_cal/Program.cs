using System.Text.Json;
using OpenCvSharp;

var json = File.ReadAllText(
    @"E:\文档\日麻教学\overlay\src\MahjongSoulOverlay.Vision\Profiles\yonma-1920x1080.standard.json");
using var doc = JsonDocument.Parse(json);
var seats = doc.RootElement.GetProperty("seats");

using var img = Cv2.ImRead(@"E:\文档\日麻教学\overlay\artifacts\replay\real-0229.png");
using var draw = img.Clone();

var green = new Scalar(0, 255, 0);
var cyan = new Scalar(255, 255, 0);
var yellow = new Scalar(0, 255, 255);
var red = new Scalar(0, 0, 255);
var magenta = new Scalar(255, 0, 255);
var blue = new Scalar(255, 0, 0);

Point Px(double x, double y) => new((int)(x * draw.Width), (int)(y * draw.Height));

void DrawQuad(JsonElement q, Scalar c, int t, string? label = null)
{
    var pts = new[] {
        Px(q.GetProperty("topLeft").GetProperty("x").GetDouble(), q.GetProperty("topLeft").GetProperty("y").GetDouble()),
        Px(q.GetProperty("topRight").GetProperty("x").GetDouble(), q.GetProperty("topRight").GetProperty("y").GetDouble()),
        Px(q.GetProperty("bottomRight").GetProperty("x").GetDouble(), q.GetProperty("bottomRight").GetProperty("y").GetDouble()),
        Px(q.GetProperty("bottomLeft").GetProperty("x").GetDouble(), q.GetProperty("bottomLeft").GetProperty("y").GetDouble())
    };
    Cv2.Polylines(draw, new[] { pts }, true, c, t, LineTypes.AntiAlias);
    if (label != null)
    {
        var cx = (pts[0].X + pts[2].X) / 2;
        var cy = (pts[0].Y + pts[2].Y) / 2;
        Cv2.PutText(draw, label, new Point(cx - 30, cy), HersheyFonts.HersheySimplex, 0.5, c, 1);
    }
}

foreach (var seatName in new[] { "right", "left", "top", "bottom" })
{
    var s = seats.GetProperty(seatName);

    // Main hand region
    DrawQuad(s.GetProperty("mainHandRegion"), green, 2, seatName);

    // Drawn slot
    DrawQuad(s.GetProperty("drawnSlot"), cyan, 1);

    // Individual main slots
    foreach (var slot in s.GetProperty("mainSlots").EnumerateArray())
        DrawQuad(slot, yellow, 1);

    // River region
    DrawQuad(s.GetProperty("riverRegion"), red, 2);

    // Meld region
    DrawQuad(s.GetProperty("meldRegion"), magenta, 2);
}

var outPath = @"E:\文档\日麻教学\overlay\artifacts\replay\real-0229.calib-annotated.png";
Cv2.ImWrite(outPath, draw);
Console.WriteLine($"Wrote {outPath}");

// Print pixel coords for Right and Left
foreach (var seatName in new[] { "right", "left" })
{
    Console.WriteLine($"\n=== {seatName} ===");
    var s = seats.GetProperty(seatName);
    Console.WriteLine($"direction: {s.GetProperty("mainHandDirection").GetString()}");
    foreach (var qn in new[] { "mainHandRegion", "drawnSlot" })
    {
        var q = s.GetProperty(qn);
        Console.WriteLine($"{qn}:");
        foreach (var c in new[] { "topLeft", "topRight", "bottomRight", "bottomLeft" })
        {
            var pt = q.GetProperty(c);
            Console.WriteLine($"  {c}: px({pt.GetProperty("x").GetDouble() * 1920:F0},{pt.GetProperty("y").GetDouble() * 1080:F0})");
        }
    }
    var slots = s.GetProperty("mainSlots");
    Console.WriteLine($"mainSlots: {slots.GetArrayLength()} total");
    var first = slots[0];
    var last = slots[slots.GetArrayLength() - 1];
    var fTLx = first.GetProperty("topLeft").GetProperty("x").GetDouble() * 1920;
    var fTLy = first.GetProperty("topLeft").GetProperty("y").GetDouble() * 1080;
    var lBRx = last.GetProperty("bottomRight").GetProperty("x").GetDouble() * 1920;
    var lBRy = last.GetProperty("bottomRight").GetProperty("y").GetDouble() * 1080;
    Console.WriteLine($"  slot[0]  TL: px({fTLx:F0},{fTLy:F0})");
    Console.WriteLine($"  slot[12] BR: px({lBRx:F0},{lBRy:F0})");
}
