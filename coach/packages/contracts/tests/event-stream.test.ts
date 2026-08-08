import { describe, expect, it } from "vitest";
import {
  CanonicalEventStreamSchema,
  CanonicalGameEventSchema,
  compareCanonicalEventPositions,
  parseCanonicalEventRef,
} from "../src/index.js";

const tile = (id:
  | "1m" | "2m" | "3m" | "4m" | "5m" | "6m" | "7m" | "8m" | "9m"
  | "1p" | "2p" | "3p" | "4p") => ({ id, red: false });

const selfHand = [
  tile("1m"), tile("2m"), tile("3m"), tile("4m"), tile("5m"),
  tile("6m"), tile("7m"), tile("8m"), tile("9m"), tile("1p"),
  tile("2p"), tile("3p"), tile("4p"),
];

it("parses and compares canonical event refs by numeric position", () => {
  const second = parseCanonicalEventRef("game:fixture/0/2/0");
  const tenth = parseCanonicalEventRef("game:fixture/0/10/0");
  expect(second).toEqual({
    gameId: "game:fixture",
    position: { roundOrdinal: 0, sourceRecordOrdinal: 2, subEventOrdinal: 0 },
  });
  expect(tenth).not.toBeNull();
  expect(compareCanonicalEventPositions(second!.position, tenth!.position))
    .toBeLessThan(0);
  expect(parseCanonicalEventRef("game:fixture/00/2/0")).toBeNull();
  expect(parseCanonicalEventRef("event:not-canonical")).toBeNull();
});

function baseStream() {
  return {
    schemaVersion: "canonical-riichi-events/v2" as const,
    mapperVersion: "fixture/v1",
    gameId: "game:fixture",
    sourceKind: "fixture" as const,
    sourceRecordHash: "sha256:source",
    playerCount: 4 as const,
    selfActor: 0,
    completeness: {
      eventSequence: "complete" as const,
      ruleSet: "complete" as const,
      scores: "complete" as const,
      doraIndicators: "complete" as const,
      rivers: "complete" as const,
      calledDiscardMarkers: "complete" as const,
      melds: "complete" as const,
      remainingDraws: "complete" as const,
      settlement: "complete" as const,
      responseOpportunities: "complete" as const,
    },
    ruleSet: {
      length: "south" as const,
      redFives: { man: 1, pin: 1, sou: 1 },
      openTanyao: true,
      atamahane: false,
      westExtension: "sudden_death" as const,
      ippatsuCancelledByAnkan: true,
    },
    events: [
      {
        type: "game_started" as const,
        eventId: "game:fixture/0/0/0",
        sourceRecordRef: "record:0",
      },
      {
        type: "round_started" as const,
        eventId: "game:fixture/0/1/0",
        sourceRecordRef: "record:1",
        roundOrdinal: 0,
        roundWind: "E" as const,
        hand: 1,
        honba: 0,
        riichiSticks: 0,
        dealer: 0,
        scores: [25000, 25000, 25000, 25000],
        doraIndicator: tile("1m"),
        selfHand,
        remainingDraws: 70,
      },
    ],
  };
}

describe("canonical event stream", () => {
  it("accepts a strict, versioned four-player stream", () => {
    expect(CanonicalEventStreamSchema.parse(baseStream()).events).toHaveLength(2);
  });

  it("binds every event ID to the stream game and active round", () => {
    const stream = baseStream();
    expect(() => CanonicalEventStreamSchema.parse({
      ...stream,
      events: [
        { ...stream.events[0]!, eventId: "other-game/0/0/0" },
        stream.events[1]!,
      ],
    })).toThrow("Canonical event ID must bind to stream gameId");
    expect(() => CanonicalEventStreamSchema.parse({
      ...stream,
      events: [
        stream.events[0]!,
        { ...stream.events[1]!, eventId: "game:fixture/1/1/0" },
      ],
    })).toThrow("Canonical event ID round must match its event round");
  });

  it("requires ordered source-record and sub-event positions", () => {
    const stream = baseStream();
    const declaration = {
      type: "riichi_declared" as const,
      eventId: "game:fixture/0/2/0",
      sourceRecordRef: "record:2",
      actor: 0,
    };
    const discard = {
      type: "tile_discarded" as const,
      eventId: "game:fixture/0/2/1",
      sourceRecordRef: "record:2",
      actor: 0,
      tile: tile("1m"),
      discardMode: "tedashi" as const,
      riichiDeclarationEventRef: declaration.eventId,
    };
    expect(CanonicalEventStreamSchema.parse({
      ...stream,
      events: [...stream.events, declaration, discard],
    }).events).toHaveLength(4);
    expect(() => CanonicalEventStreamSchema.parse({
      ...stream,
      events: [...stream.events, { ...declaration, eventId: "game:fixture/0/2/1" }],
    })).toThrow("Canonical source record must start at sub-event ordinal 0");
    expect(() => CanonicalEventStreamSchema.parse({
      ...stream,
      events: [...stream.events, declaration, {
        ...discard,
        eventId: "game:fixture/0/2/2",
      }],
    })).toThrow("Canonical sub-event ordinals must be contiguous");
    expect(() => CanonicalEventStreamSchema.parse({
      ...stream,
      events: [...stream.events, declaration, {
        ...discard,
        sourceRecordRef: "record:other",
      }],
    })).toThrow("Canonical source position must bind one sourceRecordRef");
    expect(() => CanonicalEventStreamSchema.parse({
      ...stream,
      events: [...stream.events, {
        ...declaration,
        eventId: "game:fixture/0/0/0",
      }],
    })).toThrow("Canonical event positions must be strictly ordered");
  });

  it("uses occurrence ordinals for rounds, including repeated hands", () => {
    const stream = baseStream();
    const repeatedHand = {
      ...stream.events[1]!,
      eventId: "game:fixture/1/2/0",
      sourceRecordRef: "record:2",
      roundOrdinal: 1,
      honba: 1,
    };
    expect(CanonicalEventStreamSchema.parse({
      ...stream,
      events: [...stream.events, repeatedHand],
    }).events[2]).toMatchObject({ roundOrdinal: 1, honba: 1 });
    expect(() => CanonicalEventStreamSchema.parse({
      ...stream,
      events: [...stream.events, {
        ...repeatedHand,
        eventId: "game:fixture/0/2/0",
        roundOrdinal: 0,
      }],
    })).toThrow("Round occurrence ordinals must increase by one");
  });

  it("distinguishes an opponent hidden draw from missing data", () => {
    const event = CanonicalGameEventSchema.parse({
      type: "tile_drawn",
      eventId: "game:fixture/0/2/0",
      sourceRecordRef: "record:2",
      actor: 1,
      tile: { visibility: "hidden" },
      from: "live_wall",
    });
    if (event.type !== "tile_drawn") throw new Error("unexpected event kind");
    expect(event.tile).toEqual({ visibility: "hidden" });
    expect(() => CanonicalGameEventSchema.parse({
      type: "tile_drawn",
      eventId: "game:fixture/0/2/0",
      sourceRecordRef: "record:2",
      actor: 1,
      from: "live_wall",
    })).toThrow();
  });

  it("rejects duplicate event IDs and unknown fields", () => {
    const stream = baseStream();
    expect(() => CanonicalEventStreamSchema.parse({
      ...stream,
      events: [...stream.events, { ...stream.events[1] }],
    })).toThrow("Canonical event IDs must be unique");
    expect(() => CanonicalEventStreamSchema.parse({ ...stream, modelScore: 99 }))
      .toThrow();
  });

  it("rejects opponent-visible private draws", () => {
    const stream = baseStream();
    expect(() => CanonicalEventStreamSchema.parse({
      ...stream,
      events: [...stream.events, {
        type: "tile_drawn",
        eventId: "game:fixture/0/2/0",
        sourceRecordRef: "record:2",
        actor: 1,
        tile: { visibility: "visible", tile: tile("1m") },
        from: "live_wall",
      }],
    })).toThrow("Only the self actor may expose a private draw");
  });

  it("requires the stream to begin with game_started", () => {
    const stream = baseStream();
    expect(() => CanonicalEventStreamSchema.parse({
      ...stream,
      events: stream.events.slice(1),
    })).toThrow("Canonical stream must begin with game_started");
  });

  it("requires explicit source completeness instead of inferring it", () => {
    const { completeness: _completeness, ...stream } = baseStream();
    expect(() => CanonicalEventStreamSchema.parse(stream)).toThrow();
  });

  it("binds a win to the draw, discard, or kan event it resolves", () => {
    expect(CanonicalGameEventSchema.parse({
      type: "win_declared",
      eventId: "game:fixture/0/4/0",
      sourceRecordRef: "record:4",
      winnerActor: 1,
      targetActor: 0,
      method: "ron",
      winningTile: tile("1m"),
      winSourceEventRef: "game:fixture/0/3/0",
      scoreDeltas: null,
    })).toMatchObject({ winSourceEventRef: "game:fixture/0/3/0" });
  });
});
