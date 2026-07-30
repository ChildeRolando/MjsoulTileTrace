namespace MahjongSoulOverlay.Core.Domain;

public readonly record struct NormalizedPoint(double X, double Y);

public sealed record NormalizedQuad(
    NormalizedPoint TopLeft,
    NormalizedPoint TopRight,
    NormalizedPoint BottomRight,
    NormalizedPoint BottomLeft);

public sealed record DetectedTile(string DetectionId, NormalizedQuad Quad, double Confidence);
