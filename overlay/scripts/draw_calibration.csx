using System.Text.Json;
using OpenCvSharp;

// Read profile
var json = File.ReadAllText(
    @"E:\文档\日麻教学\overlay\src\MahjongSoulOverlay.Vision\Profiles\yonma-1920x1080.standard.json");
using var doc = JsonDocument.Parse(json);
var seats = doc.RootElement.GetProperty("seats");

// Read image
using var img = Cv2.ImRead(@"E:\文档\日麻教学\overlay\artifacts\replay\real-0229.png");
using var draw = img.Clone();

// Colors
var red = new Scalar(0, 0, 255);
var green = new Scalar(0, 255, 0);
var cyan = new Scalar(255, 255, 0);
var yellow = new Scalar(0, 255, 255);
var white = new Scalar(255, 255, 255);

// Helper: normalized point to pixel
Point P(double x, double y) => new((int)(x * draw.Width), (int)(y * draw.Height));

void DrawQuad(JsonElement quad, Scalar color, int thickness, string? label = null)
{
    var tl = P(quad.GetProperty("topLeft").GetProperty("x").GetDouble(),
               quad.GetProperty("topLeft").GetProperty("y").GetDouble());
    var tr = P(quad.GetProperty("topRight").GetProperty("x").GetDouble(),
               quad.GetProperty("topRight").GetProperty("y").GetDouble());
    var br = P(quad.GetProperty("bottomRight").GetProperty("x").GetDouble(),
               quad.GetProperty("bottomRight").GetProperty("y").GetDouble());
    var bl = P(quad.GetProperty("bottomLeft").GetProperty("x").GetDouble(),
               quad.GetProperty("bottomLeft").GetProperty("y").GetDouble());
    var pts = new[] { tl, tr, br, bl };
    Cv2.Polylines(draw, new[] { pts }, true, color, thickness, LineTypes.AntiAlias);
    if (label != null)
        Cv2.PutText(draw, label, tl, HersheyFonts.HersheySimplex, 0.5, color, 1);
}

void DrawSlot(JsonElement slot, Scalar color)
{
    DrawQuad(slot, color, 1);
}

foreach (var seatName in new[] { "right", "left", "top", "bottom" })
{
    var seat = seats.GetProperty(seatName);
    var region = seat.GetProperty("mainHandRegion");
    var drawn = seat.GetProperty("drawnSlot");
    var river = seat.GetProperty("riverRegion");
    var meld = seat.GetProperty("meldRegion");
    var dir = seat.GetProperty("mainHandDirection").GetString();

    // Draw main hand region in green
    DrawQuad(region, green, 2, $"{seatName} hand ({dir})");

    // Draw drawn slot in cyan
    DrawQuad(drawn, cyan, 2);

    // Draw each main slot in yellow
    foreach (var slot in seat.GetProperty("mainSlots").EnumerateArray())
        DrawSlot(slot, yellow);

    // Draw river region in red
    DrawQuad(river, red, 2, $"{seatName} river");

    // Draw meld region in white
    DrawQuad(meld, white, 1);
}

var outPath = @"E:\文档\日麻教学\overlay\artifacts\replay\real-0229.annotated.png";
Cv2.ImWrite(outPath, draw);
Console.WriteLine($"Wrote {outPath}");
Console.WriteLine($"Image: {draw.Width}x{draw.Height}");

// Print pixel coords for Right and Left main hand + drawn slot
foreach (var seatName in new[] { "right", "left" })
{
    Console.WriteLine($"\n=== {seatName} ===");
    var seat = seats.GetProperty(seatName);
    foreach (var qname in new[] { "mainHandRegion", "drawnSlot", "mainSlots" })
    {
        if (qname == "mainSlots")
        {
            var slots = seat.GetProperty("mainSlots");
            Console.WriteLine($"{qname}: {slots.GetArrayLength()} slots");
            var first = slots[0];
            var last = slots[slots.GetArrayLength() - 1];
            var fTL = (first.GetProperty("topLeft").GetProperty("x").GetDouble(),
                       first.GetProperty("topLeft").GetProperty("y").GetDouble());
            var lBR = (last.GetProperty("bottomRight").GetProperty("x").GetDouble(),
                       last.GetProperty("bottomRight").GetProperty("y").GetDouble());
            Console.WriteLine($"  First slot TL: ({fTL.Item1*1920:F0},{fTL.Item2*1080:F0})");
            Console.WriteLine($"  Last  slot BR: ({lBR.Item1*1920:F0},{lBR.Item2*1080:F0})");
        }
        else
        {
            var q = seat.GetProperty(qname);
            Console.WriteLine($"{qname}:");
            foreach (var corner in new[] { "topLeft", "topRight", "bottomRight", "bottomLeft" })
            {
                var c = q.GetProperty(corner);
                var nx = c.GetProperty("x").GetDouble();
                var ny = c.GetProperty("y").GetDouble();
                Console.WriteLine($"  {corner}: ({nx*1920:F0},{ny*1080:F0}) px  norm({nx:F4},{ny:F4})");
            }
        }
    }
}
