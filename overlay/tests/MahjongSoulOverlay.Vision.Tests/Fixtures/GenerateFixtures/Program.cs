using OpenCvSharp;

var output = Path.GetFullPath(
    Path.Combine(AppContext.BaseDirectory, "..", "..", "..", ".."));
var slots = new (Point[] Polygon, Scalar Outline)[]
{
    ([new(403, 896), new(520, 896), new(520, 984), new(403, 984)], new(25, 74, 55)),
    ([new(1594, 346), new(1710, 338), new(1721, 475), new(1605, 482)], new(22, 68, 51)),
    ([new(845, 97), new(947, 97), new(947, 164), new(845, 164)], new(28, 76, 58)),
    ([new(211, 454), new(326, 447), new(338, 584), new(222, 591)], new(23, 70, 52))
};

using var empty = new Mat(1080, 1920, MatType.CV_8UC3, new Scalar(45, 112, 76));
foreach (var (polygon, outline) in slots)
    Cv2.Polylines(empty, [polygon], true, outline, 3, LineTypes.AntiAlias);

using var occupied = empty.Clone();
foreach (var (polygon, _) in slots)
{
    Cv2.FillConvexPoly(occupied, polygon, new Scalar(218, 235, 240), LineTypes.AntiAlias);
    Cv2.Polylines(occupied, [polygon], true, new Scalar(80, 92, 96), 3, LineTypes.AntiAlias);
}

Directory.CreateDirectory(output);
Cv2.ImWrite(Path.Combine(output, "synthetic-empty-table.png"), empty,
    [new ImageEncodingParam(ImwriteFlags.PngCompression, 9)]);
Cv2.ImWrite(Path.Combine(output, "synthetic-occupied-slots.png"), occupied,
    [new ImageEncodingParam(ImwriteFlags.PngCompression, 9)]);
