import { describe, expect, it } from "vitest";
import { KnownGameFactsSchema } from "../src/index.js";

const tile = (
  id: "1m" | "5p" | "6s",
  red = false,
): { id: "1m" | "5p" | "6s"; red: boolean } => ({ id, red });

function baseFacts() {
  return {
    factSetId: "facts:e1:t6",
    provenance: "raw_replay" as const,
    actor: 3,
    decisionEventRef: "event-58",
    decisionWindow: {
      kind: "self_turn" as const,
      actor: 3,
      triggerEventRef: "event-58",
    },
    concealedTiles: [tile("1m"), tile("5p", true)],
    currentDraw: { tile: tile("6s"), eventRef: "event-58" },
    melds: [],
    doraIndicators: [tile("1m")],
    rivers: [[], [], [], []],
    threats: [],
    roundWind: "E" as const,
    seatWind: "N" as const,
    dealer: false,
    remainingDraws: 50,
    completeness: {
      concealedTiles: true,
      melds: true,
      doraIndicators: true,
      rivers: true,
      remainingDraws: true,
    },
    evidenceIds: ["event-58"],
  };
}

describe("KnownGameFactsSchema", () => {
  it("keeps exact red identity and per-field completeness", () => {
    const parsed = KnownGameFactsSchema.parse(baseFacts());

    expect(parsed.concealedTiles[1]).toEqual(tile("5p", true));
    expect(parsed.completeness.rivers).toBe(true);
    expect(parsed.provenance).toBe("raw_replay");
  });

  it("accepts a four-tile kakan as known state", () => {
    const parsed = KnownGameFactsSchema.parse({
      ...baseFacts(),
      factSetId: "facts:kakan",
      provenance: "user_asserted",
      actor: 0,
      decisionEventRef: "event-kakan",
      decisionWindow: {
        kind: "self_turn",
        actor: 0,
        triggerEventRef: "event-kakan",
      },
      concealedTiles: [],
      currentDraw: null,
      melds: [{
        meldRef: "meld-1",
        kind: "kakan",
        tiles: [tile("1m"), tile("1m"), tile("1m"), tile("1m")],
      }],
      seatWind: "E",
      dealer: true,
      remainingDraws: null,
      completeness: {
        concealedTiles: true,
        melds: true,
        doraIndicators: true,
        rivers: true,
        remainingDraws: false,
      },
      evidenceIds: ["event-kakan"],
    });

    expect(parsed.melds[0]?.kind).toBe("kakan");
  });

  it("rejects duplicate evidence IDs", () => {
    expect(() => KnownGameFactsSchema.parse({
      ...baseFacts(),
      evidenceIds: ["event-58", "event-58"],
    })).toThrow("Known game fact evidence IDs must be unique");
  });

  it("rejects a threat actor equal to self", () => {
    expect(() => KnownGameFactsSchema.parse({
      ...baseFacts(),
      threats: [{
        actor: 3,
        riichi: true,
        declarationEventId: "event-riichi",
        ippatsuAlive: true,
      }],
    })).toThrow("Known threat actor cannot equal self actor");
  });

  it("requires dealer and east seat wind to agree", () => {
    expect(() => KnownGameFactsSchema.parse({
      ...baseFacts(),
      seatWind: "E",
      dealer: false,
    })).toThrow("Dealer status must agree with east seat wind");
  });
});
