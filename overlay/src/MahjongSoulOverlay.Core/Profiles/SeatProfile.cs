using MahjongSoulOverlay.Core.Domain;

namespace MahjongSoulOverlay.Core.Profiles;

public sealed record DetectionThresholds(
    double Occupancy,
    double Stable,
    double MinimumTileConfidence);

public sealed record SeatProfile(
    Seat Seat,
    NormalizedQuad MainHandRegion,
    IReadOnlyList<NormalizedQuad> MainSlots,
    NormalizedQuad DrawnSlot,
    NormalizedQuad RiverRegion,
    NormalizedQuad MeldRegion,
    double MinimumTileAspect,
    double MaximumTileAspect,
    double MinimumAngle,
    double MaximumAngle,
    DetectionThresholds Thresholds);

public sealed record TableProfile(
    string Id,
    int Width,
    int Height,
    double DisplayScale,
    IReadOnlyDictionary<Seat, SeatProfile> Seats);
