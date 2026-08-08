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
    selfRiichi: false,
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
      calledDiscardMarkers: true,
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
        actor: 0,
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
        calledDiscardMarkers: false,
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

  it("requires meld actors when public meld state is complete", () => {
    expect(() => KnownGameFactsSchema.parse({
      ...baseFacts(),
      melds: [{
        meldRef: "meld-public",
        kind: "pon",
        tiles: [tile("1m"), tile("1m"), tile("1m")],
      }],
    })).toThrow("Complete public meld state requires meld actors");
  });

  it("binds the decision actor and event to the decision window", () => {
    expect(() => KnownGameFactsSchema.parse({
      ...baseFacts(),
      decisionWindow: { ...baseFacts().decisionWindow, actor: 2 },
    })).toThrow("Decision window actor must equal known self actor");
    expect(() => KnownGameFactsSchema.parse({
      ...baseFacts(),
      decisionWindow: {
        ...baseFacts().decisionWindow,
        triggerEventRef: "event-other",
      },
    })).toThrow("Decision event must equal the window trigger event");
    expect(() => KnownGameFactsSchema.parse({
      ...baseFacts(),
      currentDraw: { tile: tile("6s"), eventRef: "event-other" },
    })).toThrow("Self-turn draw must equal the decision event");
  });

  it("binds each unique river event to its actor bucket", () => {
    const discard = {
      tile: tile("1m"),
      actor: 1,
      tsumogiri: false,
      eventId: "event-river",
      afterRiichiEventIds: [],
    };
    expect(() => KnownGameFactsSchema.parse({
      ...baseFacts(),
      rivers: [[discard], [], [], []],
    })).toThrow("River discard actor must match its river index");
    expect(() => KnownGameFactsSchema.parse({
      ...baseFacts(),
      rivers: [
        [{ ...discard, actor: 0 }],
        [{ ...discard, actor: 1 }],
        [],
        [],
      ],
    })).toThrow("River discard event IDs must be globally unique");
  });
});
