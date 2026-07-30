namespace MahjongSoulOverlay.Core.Domain;

public enum TableEventKind
{
    Draw, Tsumogiri, Tedashi, ChiOrPon, Daiminkan, Ankan, Kakan,
    RinshanDraw, CalledDiscard, Unknown
}

public sealed record TableEvent(
    TableEventKind Kind,
    Seat Actor,
    Seat? SourceSeat,
    DateTimeOffset Timestamp,
    double Confidence);

public enum DiscardKind { Tsumogiri, Tedashi, Unknown }

public sealed record RiverTile(
    Guid Id,
    Seat Seat,
    NormalizedQuad Quad,
    DiscardKind Kind,
    bool WasCalled,
    double Confidence,
    DateTimeOffset FirstSeen);
