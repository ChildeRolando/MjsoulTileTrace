import {
  CanonicalEventStreamSchema,
  type CanonicalEventStream,
  type CanonicalGameEvent,
  type Tile,
  type TileId,
} from "@riichi-coach/contracts";

export const canonicalTile = (id: TileId, red = false): Tile => ({ id, red });

export const canonicalSelfHand: Tile[] = [
  canonicalTile("1m"), canonicalTile("2m"), canonicalTile("3m"),
  canonicalTile("4m"), canonicalTile("5m"), canonicalTile("6m"),
  canonicalTile("7m"), canonicalTile("8m"), canonicalTile("9m"),
  canonicalTile("1p"), canonicalTile("2p"), canonicalTile("3p"),
  canonicalTile("4p"),
];

export function canonicalStartEvents(
  selfHand: readonly Tile[] = canonicalSelfHand,
  doraIndicator: Tile = canonicalTile("1s"),
): CanonicalGameEvent[] {
  return [
    {
      type: "game_started",
      eventId: "game:fixture/0/0/0",
      sourceRecordRef: "record:0",
    },
    {
      type: "round_started",
      eventId: "game:fixture/0/1/0",
      sourceRecordRef: "record:1",
      roundOrdinal: 0,
      roundWind: "E",
      hand: 1,
      honba: 0,
      riichiSticks: 0,
      dealer: 0,
      scores: [25000, 25000, 25000, 25000],
      doraIndicator,
      selfHand: [...selfHand],
      remainingDraws: 70,
    },
  ];
}

export function canonicalStream(
  events: readonly CanonicalGameEvent[],
): CanonicalEventStream {
  return CanonicalEventStreamSchema.parse({
    schemaVersion: "canonical-riichi-events/v2",
    mapperVersion: "fixture/v1",
    gameId: "game:fixture",
    sourceKind: "fixture",
    sourceRecordHash: "sha256:source",
    playerCount: 4,
    selfActor: 0,
    completeness: {
      eventSequence: "complete",
      ruleSet: "complete",
      scores: "complete",
      doraIndicators: "complete",
      rivers: "complete",
      calledDiscardMarkers: "complete",
      melds: "complete",
      remainingDraws: "complete",
      settlement: "complete",
      responseOpportunities: "complete",
    },
    ruleSet: {
      length: "south",
      redFives: { man: 1, pin: 1, sou: 1 },
      openTanyao: true,
      atamahane: false,
      westExtension: "sudden_death",
      ippatsuCancelledByAnkan: true,
    },
    events,
  });
}

export function canonicalSelfDrawDiscardEvents(): CanonicalGameEvent[] {
  return [
    ...canonicalStartEvents(),
    {
      type: "tile_drawn",
      eventId: "game:fixture/0/2/0",
      sourceRecordRef: "record:2",
      actor: 0,
      tile: { visibility: "visible", tile: canonicalTile("5p") },
      from: "live_wall",
    },
    {
      type: "tile_discarded",
      eventId: "game:fixture/0/3/0",
      sourceRecordRef: "record:3",
      actor: 0,
      tile: canonicalTile("5p"),
      discardMode: "tsumogiri",
      riichiDeclarationEventRef: null,
    },
  ];
}
