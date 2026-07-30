namespace MahjongSoulOverlay.Core.Domain;

public readonly record struct NormalizedPoint
{
    public NormalizedPoint(double x, double y)
    {
        X = RequireNormalized(x, nameof(x));
        Y = RequireNormalized(y, nameof(y));
    }

    public double X { get; }

    public double Y { get; }

    private static double RequireNormalized(double value, string parameterName)
    {
        if (!double.IsFinite(value) || value is < 0d or > 1d)
            throw new ArgumentOutOfRangeException(parameterName, value, "Value must be within [0, 1].");

        return value;
    }
}

public sealed record NormalizedQuad(
    NormalizedPoint TopLeft,
    NormalizedPoint TopRight,
    NormalizedPoint BottomRight,
    NormalizedPoint BottomLeft);

public sealed record DetectedTile
{
    public DetectedTile(string detectionId, NormalizedQuad quad, double confidence)
    {
        DetectionId = detectionId;
        Quad = quad;
        Confidence = RequireConfidence(confidence);
    }

    public string DetectionId { get; }

    public NormalizedQuad Quad { get; }

    public double Confidence { get; }

    private static double RequireConfidence(double value)
    {
        if (!double.IsFinite(value) || value is < 0d or > 1d)
            throw new ArgumentOutOfRangeException(nameof(value), value, "Confidence must be within [0, 1].");

        return value;
    }
}
