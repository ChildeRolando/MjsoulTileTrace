using OpenCvSharp;
using System.Text.Json;

// Read the image and current profile
using var img = Cv2.ImRead(@"E:\文档\日麻教学\overlay\artifacts\replay\real-0229.png");
using var gray = new Mat();
Cv2.CvtColor(img, gray, ColorConversionCodes.BGR2GRAY);

int W = img.Width, H = img.Height;
Console.WriteLine($"Image: {W}x{H}");

// For Right seat: scan the right portion of the screen.
// The hand should appear as a sequence of 13 tiles going bottom-to-top.
// Each tile appears as a dark vertical rectangle (tile edge facing camera).
// We look for the bounding box of the tile edge region.

void AnalyzeRightHand()
{
    Console.WriteLine("\n=== RIGHT HAND ANALYSIS ===");

    // Scan a region on the right side
    int scanLeft = 1580, scanRight = 1850;
    int scanTop = 150, scanBottom = 850;

    // For each row, find the leftmost and rightmost dark pixel
    // (tile edges are dark compared to table background)
    // Table background is greenish, tiles are dark/black from behind

    // Vertical projection: for each column in the scan region, count dark pixels
    int[] colDarkCount = new int[scanRight - scanLeft];
    for (int x = scanLeft; x < scanRight; x++)
    {
        int count = 0;
        for (int y = scanTop; y < scanBottom; y++)
        {
            byte pixel = gray.At<byte>(y, x);
            if (pixel < 80) count++; // dark pixel = tile
        }
        colDarkCount[x - scanLeft] = count;
    }

    // Find columns with high dark-pixel density
    double maxCount = colDarkCount.Max();
    double threshold = maxCount * 0.3;
    Console.WriteLine($"  Max dark pixels per column: {maxCount:F0}");

    int leftEdge = -1, rightEdge = -1;
    for (int i = 0; i < colDarkCount.Length; i++)
    {
        if (colDarkCount[i] > threshold)
        {
            if (leftEdge < 0) leftEdge = scanLeft + i;
            rightEdge = scanLeft + i;
        }
    }
    Console.WriteLine($"  Dark column range: x={leftEdge}..{rightEdge} (width={rightEdge - leftEdge + 1})");

    // For each row, find the range of dark pixels (tile vs background)
    // to determine top and bottom of the hand
    int[] rowDarkCount = new int[scanBottom - scanTop];
    for (int y = scanTop; y < scanBottom; y++)
    {
        int count = 0;
        for (int x = leftEdge > 0 ? leftEdge : scanLeft; x <= (rightEdge > 0 ? rightEdge : scanRight); x++)
        {
            byte pixel = gray.At<byte>(y, x);
            if (pixel < 80) count++;
        }
        rowDarkCount[y - scanTop] = count;
    }

    double maxRowCount = rowDarkCount.Max();
    double rowThreshold = maxRowCount * 0.2;
    int topMost = -1, bottomMost = -1;
    for (int i = 0; i < rowDarkCount.Length; i++)
    {
        if (rowDarkCount[i] > rowThreshold)
        {
            if (topMost < 0) topMost = scanTop + i;
            bottomMost = scanTop + i;
        }
    }
    Console.WriteLine($"  Tile row range: y={topMost}..{bottomMost} (height={bottomMost - topMost + 1})");

    // Determine the trapezoid corners
    // The hand fans out slightly (perspective)
    // For bottomToTop direction, slot 0 is at bottom, slot 12 at top

    // Find the leftmost dark column near the top and bottom
    int topLeft = leftEdge, topRight = rightEdge;
    int bottomLeft = leftEdge, bottomRight = rightEdge;

    // Refine: scan narrow bands at top and bottom to find edges more precisely
    if (topMost > 0 && bottomMost > 0)
    {
        // Top band
        int topBand = topMost + 20;
        int minX_t = int.MaxValue, maxX_t = int.MinValue;
        for (int y = topMost; y < Math.Min(topBand, bottomMost); y++)
        {
            for (int x = scanLeft; x < scanRight; x++)
            {
                if (gray.At<byte>(y, x) < 80)
                {
                    if (x < minX_t) minX_t = x;
                    if (x > maxX_t) maxX_t = x;
                }
            }
        }
        topLeft = minX_t; topRight = maxX_t;

        // Bottom band
        int bottomBand = bottomMost - 20;
        int minX_b = int.MaxValue, maxX_b = int.MinValue;
        for (int y = Math.Max(bottomBand, topMost); y <= bottomMost; y++)
        {
            for (int x = scanLeft; x < scanRight; x++)
            {
                if (gray.At<byte>(y, x) < 80)
                {
                    if (x < minX_b) minX_b = x;
                    if (x > maxX_b) maxX_b = x;
                }
            }
        }
        bottomLeft = minX_b; bottomRight = maxX_b;
    }

    Console.WriteLine($"  Quad: TL({topLeft},{topMost}) TR({topRight},{topMost}) BR({bottomRight},{bottomMost}) BL({bottomLeft},{bottomMost})");

    // Draw the detected quad on the image
    using var draw = img.Clone();
    var blue = new Scalar(255, 0, 0);
    Point[] pts = {
        new(topLeft, topMost), new(topRight, topMost),
        new(bottomRight, bottomMost), new(bottomLeft, bottomMost)
    };
    Cv2.Polylines(draw, new[] { pts }, true, blue, 3, LineTypes.AntiAlias);
    Cv2.ImWrite(@"E:\文档\日麻教学\overlay\artifacts\replay\right-detect.png", draw);
    Console.WriteLine("  Wrote right-detect.png");
}

void AnalyzeLeftHand()
{
    Console.WriteLine("\n=== LEFT HAND ANALYSIS ===");

    int scanLeft = 150, scanRight = 400;
    int scanTop = 50, scanBottom = 650;

    int[] colDarkCount = new int[scanRight - scanLeft];
    for (int x = scanLeft; x < scanRight; x++)
    {
        int count = 0;
        for (int y = scanTop; y < scanBottom; y++)
        {
            byte pixel = gray.At<byte>(y, x);
            if (pixel < 80) count++;
        }
        colDarkCount[x - scanLeft] = count;
    }

    double maxCount = colDarkCount.Max();
    double threshold = maxCount * 0.3;
    Console.WriteLine($"  Max dark pixels per column: {maxCount:F0}");

    int leftEdge = -1, rightEdge = -1;
    for (int i = 0; i < colDarkCount.Length; i++)
    {
        if (colDarkCount[i] > threshold)
        {
            if (leftEdge < 0) leftEdge = scanLeft + i;
            rightEdge = scanLeft + i;
        }
    }
    Console.WriteLine($"  Dark column range: x={leftEdge}..{rightEdge} (width={rightEdge - leftEdge + 1})");

    int[] rowDarkCount = new int[scanBottom - scanTop];
    for (int y = scanTop; y < scanBottom; y++)
    {
        int count = 0;
        for (int x = leftEdge > 0 ? leftEdge : scanLeft; x <= (rightEdge > 0 ? rightEdge : scanRight); x++)
        {
            byte pixel = gray.At<byte>(y, x);
            if (pixel < 80) count++;
        }
        rowDarkCount[y - scanTop] = count;
    }

    double maxRowCount = rowDarkCount.Max();
    double rowThreshold = maxRowCount * 0.2;
    int topMost = -1, bottomMost = -1;
    for (int i = 0; i < rowDarkCount.Length; i++)
    {
        if (rowDarkCount[i] > rowThreshold)
        {
            if (topMost < 0) topMost = scanTop + i;
            bottomMost = scanTop + i;
        }
    }
    Console.WriteLine($"  Tile row range: y={topMost}..{bottomMost} (height={bottomMost - topMost + 1})");

    int topLeft = leftEdge, topRight = rightEdge;
    int bottomLeft = leftEdge, bottomRight = rightEdge;

    if (topMost > 0 && bottomMost > 0)
    {
        int topBand = topMost + 20;
        int minX_t = int.MaxValue, maxX_t = int.MinValue;
        for (int y = topMost; y < Math.Min(topBand, bottomMost); y++)
        {
            for (int x = scanLeft; x < scanRight; x++)
            {
                if (gray.At<byte>(y, x) < 80)
                {
                    if (x < minX_t) minX_t = x;
                    if (x > maxX_t) maxX_t = x;
                }
            }
        }
        topLeft = minX_t; topRight = maxX_t;

        int bottomBand = bottomMost - 20;
        int minX_b = int.MaxValue, maxX_b = int.MinValue;
        for (int y = Math.Max(bottomBand, topMost); y <= bottomMost; y++)
        {
            for (int x = scanLeft; x < scanRight; x++)
            {
                if (gray.At<byte>(y, x) < 80)
                {
                    if (x < minX_b) minX_b = x;
                    if (x > maxX_b) maxX_b = x;
                }
            }
        }
        bottomLeft = minX_b; bottomRight = maxX_b;
    }

    Console.WriteLine($"  Quad: TL({topLeft},{topMost}) TR({topRight},{topMost}) BR({bottomRight},{bottomMost}) BL({bottomLeft},{bottomMost})");

    using var draw = img.Clone();
    var blue = new Scalar(255, 0, 0);
    Point[] pts = {
        new(topLeft, topMost), new(topRight, topMost),
        new(bottomRight, bottomMost), new(bottomLeft, bottomMost)
    };
    Cv2.Polylines(draw, new[] { pts }, true, blue, 3, LineTypes.AntiAlias);
    Cv2.ImWrite(@"E:\文档\日麻教学\overlay\artifacts\replay\left-detect.png", draw);
    Console.WriteLine("  Wrote left-detect.png");
}

AnalyzeRightHand();
AnalyzeLeftHand();
