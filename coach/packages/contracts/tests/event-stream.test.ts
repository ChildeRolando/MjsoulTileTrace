import { describe, expect, it } from "vitest";
import {
  CanonicalEventStreamSchema,
  CanonicalGameEventSchema,
} from "../src/index.js";

const tile = (id:
  | "1m" | "2m" | "3m" | "4m" | "5m" | "6m" | "7m" | "8m" | "9m"
  | "1p" | "2p" | "3p" | "4p") => ({ id, red: false });

const selfHand = [
  tile("1m"), tile("2m"), tile("3m"), tile("4m"), tile("5m"),
  tile("6m"), tile("7m"), tile("8m"), tile("9m"), tile("1p"),
  tile("2p"), tile("3p"), tile("4p"),
];

function baseStream() {
  return {
    schemaVersion: "canonical-riichi-events/v2" as const,
    mapperVersion: "fixture/v1",
    gameId: "game:fixture",
    sourceKind: "fixture" as const,
    sourceRecordHash: "sha256:source",
    playerCount: 4 as const,
    selfActor: 0,
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
