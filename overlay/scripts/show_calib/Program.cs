using System.Text.Json;
using OpenCvSharp;

using var img = Cv2.ImRead(@"E:\文档\日麻教学\overlay\artifacts\replay\real-0229.png");
using var draw = img.Clone();
int W = draw.Width, H = draw.Height;

Point Px(double x, double y) => new((int)(x * W), (int)(y * H));

void DrawQuad(JsonElement q, Scalar c, int t, string? label = null)
{
    var pts = new[] {
        Px(q.GetProperty("topLeft").GetProperty("x").GetDouble(), q.GetProperty("topLeft").GetProperty("y").GetDouble()),
        Px(q.GetProperty("topRight").GetProperty("x").GetDouble(), q.GetProperty("topRight").GetProperty("y").GetDouble()),
        Px(q.GetProperty("bottomRight").GetProperty("x").GetDouble(), q.GetProperty("bottomRight").GetProperty("y").GetDouble()),
        Px(q.GetProperty("bottomLeft").GetProperty("x").GetDouble(), q.GetProperty("bottomLeft").GetProperty("y").GetDouble())
    };
    Cv2.Polylines(draw, new[] { pts }, true, c, t, LineTypes.AntiAlias);
    // Draw corner circles
    foreach (var p in pts) Cv2.Circle(draw, p, 4, c, -1, LineTypes.AntiAlias);
    if (label != null)
        Cv2.PutText(draw, label, new Point(pts[0].X + 5, pts[0].Y - 5),
            HersheyFonts.HersheySimplex, 0.6, c, 2);
}

var json = File.ReadAllText(
    @"E:\文档\日麻教学\overlay\src\MahjongSoulOverlay.Vision\Profiles\yonma-1920x1080.standard.json");
using var doc = JsonDocument.Parse(json);
var seats = doc.RootElement.GetProperty("seats");

var green = new Scalar(0, 255, 0);
var cyan = new Scalar(255, 255, 0);
var red = new Scalar(0, 0, 255);
var magenta = new Scalar(255, 0, 255);

Console.WriteLine("=== HAND REGION PIXEL COORDINATES ===\n");

foreach (var seatName in new[] { "right", "left", "top", "bottom" })
{
    var s = seats.GetProperty(seatName);
    var dir = s.GetProperty("mainHandDirection").GetString();

    // Main hand region - green thick
    DrawQuad(s.GetProperty("mainHandRegion"), green, 3, $"{seatName} hand ({dir})");

    // Drawn slot - cyan
    DrawQuad(s.GetProperty("drawnSlot"), cyan, 2);

    // Slots - thin yellow
    int slotIdx = 0;
    foreach (var slot in s.GetProperty("mainSlots").EnumerateArray())
    {
        var c = slotIdx == 0 ? new Scalar(0, 255, 255) :
                slotIdx == 12 ? new Scalar(0, 165, 255) : new Scalar(0, 200, 255);
        DrawQuad(slot, c, 1);
        slotIdx++;
    }

    // Print coordinates
    Console.WriteLine($"=== {seatName} ({dir}) ===");
    foreach (var qn in new[] { "mainHandRegion", "drawnSlot" })
    {
        var q = s.GetProperty(qn);
        Console.WriteLine($"{qn}:");
        foreach (var cn in new[] { "topLeft", "topRight", "bottomRight", "bottomLeft" })
        {
            var pt = q.GetProperty(cn);
            Console.WriteLine($"  {cn}: px({pt.GetProperty("x").GetDouble()*1920:F0},{pt.GetProperty("y").GetDouble()*1080:F0})");
        }
    }
    Console.WriteLine();
}

Cv2.PutText(draw, "GREEN=mainHand YELLOW=slots CYAN=drawn", new Point(10, 30),
    HersheyFonts.HersheySimplex, 0.6, green, 2);

var outPath = @"E:\文档\日麻教学\overlay\artifacts\replay\real-0229.current-calib.png";
Cv2.ImWrite(outPath, draw);
Console.WriteLine($"Wrote {outPath}");
