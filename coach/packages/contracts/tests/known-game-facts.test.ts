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
    defenseThreats: [],
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
      roundContext: true,
    },
    evidenceIds: ["event-58"],
  };
}

describe("KnownGameFactsSchema", () => {
  it("binds known hand-structure yaku context to the legacy fact fields", () => {
    const known = {
      windsStatus: "known" as const,
      roundWindTile34: 27,
      selfWindTile34: 30,
      riichiStatus: "inactive" as const,
      openTanyaoStatus: "enabled" as const,
    };
    expect(KnownGameFactsSchema.parse({
      ...baseFacts(),
      handStructureYakuContext: known,
    }).handStructureYakuContext).toEqual(known);

    expect(() => KnownGameFactsSchema.parse({
      ...baseFacts(),
      handStructureYakuContext: { ...known, roundWindTile34: 28 },
    })).toThrow("Known yaku round wind must equal the round wind fact");
    expect(() => KnownGameFactsSchema.parse({
      ...baseFacts(),
      handStructureYakuContext: { ...known, selfWindTile34: 27 },
    })).toThrow("Known yaku self wind must equal the seat wind fact");
    expect(() => KnownGameFactsSchema.parse({
      ...baseFacts(),
      handStructureYakuContext: { ...known, riichiStatus: "accepted" },
    })).toThrow("Accepted yaku riichi requires known self riichi");
    expect(() => KnownGameFactsSchema.parse({
      ...baseFacts(),
      selfRiichi: true,
      handStructureYakuContext: known,
    })).toThrow("Inactive yaku riichi requires known non-riichi self state");
  });

  it("allows unknown yaku context for a declared or incomplete riichi state", () => {
    expect(() => KnownGameFactsSchema.parse({
      ...baseFacts(),
      selfRiichi: true,
      handStructureYakuContext: {
        windsStatus: "unknown",
        roundWindTile34: null,
        selfWindTile34: null,
        riichiStatus: "unknown",
        openTanyaoStatus: "unknown",
      },
    })).not.toThrow();
  });

  it("requires a remaining-draw value when that source is complete", () => {
    expect(() => KnownGameFactsSchema.parse({
      ...baseFacts(),
      remainingDraws: null,
    })).toThrow("Complete remaining draws require a known value");
    expect(() => KnownGameFactsSchema.parse({
      ...baseFacts(),
      remainingDraws: null,
      completeness: {
        ...baseFacts().completeness,
        remainingDraws: false,
      },
    })).not.toThrow();
    expect(() => KnownGameFactsSchema.parse({
      ...baseFacts(),
      remainingDraws: 12,
      completeness: {
        ...baseFacts().completeness,
        remainingDraws: false,
      },
    })).not.toThrow();
  });

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

  it("requires a lossless defense threat for every active legacy riichi", () => {
    const acceptedThreat = {
      actor: 2,
      kind: "riichi_accepted" as const,
      source: "canonical_replay" as const,
      sourceEventRefs: ["game/0/47/0", "game/0/49/0"],
      openMeldRefs: [],
      dealerStatus: "non_dealer" as const,
      riichiTurn: { status: "calculated" as const, value: 6 },
      ippatsu: { status: "calculated" as const, value: true },
    };
    const legacyThreat = {
      actor: 2,
      riichi: true,
      declarationEventId: "game/0/47/0",
      ippatsuAlive: true,
    };

    expect(KnownGameFactsSchema.parse({
      ...baseFacts(),
      factSetId: "canonical-v2:sha256:accepted-threat",
      threats: [legacyThreat],
      defenseThreats: [acceptedThreat],
    }).defenseThreats).toEqual([acceptedThreat]);
    expect(() => KnownGameFactsSchema.parse({
      ...baseFacts(),
      threats: [legacyThreat],
      defenseThreats: [],
    })).toThrow("Active legacy riichi requires exactly one matching defense threat");
    expect(() => KnownGameFactsSchema.parse({
      ...baseFacts(),
      threats: [],
      defenseThreats: [acceptedThreat],
    })).toThrow("Replay riichi defense threat requires an active legacy riichi");
  });

  it("rejects self, contradictory, or evidence-free rich threats", () => {
    const legacyThreat = {
      actor: 2,
      riichi: true,
      declarationEventId: "game/0/47/0",
      ippatsuAlive: true,
    };
    const acceptedThreat = {
      actor: 2,
      kind: "riichi_accepted" as const,
      source: "canonical_replay" as const,
      sourceEventRefs: ["game/0/47/0", "game/0/49/0"],
      openMeldRefs: [],
      dealerStatus: "non_dealer" as const,
      riichiTurn: { status: "calculated" as const, value: 6 },
      ippatsu: { status: "calculated" as const, value: true },
    };

    expect(() => KnownGameFactsSchema.parse({
      ...baseFacts(),
      actor: 2,
      decisionWindow: { ...baseFacts().decisionWindow, actor: 2 },
      threats: [],
      defenseThreats: [acceptedThreat],
    })).toThrow("Defense threat actor cannot equal self actor");
    expect(() => KnownGameFactsSchema.parse({
      ...baseFacts(),
      threats: [legacyThreat],
      defenseThreats: [{
        ...acceptedThreat,
        kind: "riichi_declared",
      }],
    })).toThrow("Declared riichi requires exactly one source event reference");
    expect(() => KnownGameFactsSchema.parse({
      ...baseFacts(),
      threats: [legacyThreat],
      defenseThreats: [{
        ...acceptedThreat,
        sourceEventRefs: ["event-riichi", "event-accepted"],
      }],
    })).toThrow("Replay defense threat evidence must use canonical event references");
  });

  it("keeps user asserted open threats out of the legacy riichi projection", () => {
    const openThreat = {
      actor: 1,
      kind: "user_marked_open" as const,
      source: "user_asserted" as const,
      sourceEventRefs: ["user:threat:1"],
      openMeldRefs: ["user:meld:1"],
      dealerStatus: "non_dealer" as const,
      riichiTurn: { status: "not_applicable" as const },
      ippatsu: { status: "not_applicable" as const },
    };
    expect(KnownGameFactsSchema.parse({
      ...baseFacts(),
      provenance: "user_asserted",
      factSetId: "user-asserted:sha256:user-scene",
      defenseThreats: [openThreat],
    }).defenseThreats).toEqual([openThreat]);
    expect(() => KnownGameFactsSchema.parse({
      ...baseFacts(),
      threats: [{
        actor: 1,
        riichi: true,
        declarationEventId: "user:threat:1",
        ippatsuAlive: null,
      }],
      defenseThreats: [openThreat],
    })).toThrow("User-marked open threat cannot satisfy legacy riichi state");
  });

  it("binds reserved fact-set identity to fact and threat provenance", () => {
    const legacyThreat = {
      actor: 2,
      riichi: true,
      declarationEventId: "game/0/47/0",
      ippatsuAlive: true,
    };
    const rich = {
      actor: 2,
      kind: "riichi_accepted" as const,
      source: "canonical_replay" as const,
      sourceEventRefs: ["game/0/47/0", "game/0/49/0"],
      openMeldRefs: [],
      dealerStatus: "non_dealer" as const,
      riichiTurn: { status: "calculated" as const, value: 6 },
      ippatsu: { status: "calculated" as const, value: true },
    };
    expect(() => KnownGameFactsSchema.parse({
      ...baseFacts(),
      factSetId: "canonical-v2:sha256:scene",
      threats: [legacyThreat],
      defenseThreats: [{
        ...rich,
        source: "legacy_regression_bridge_only",
      }],
    })).toThrow("Canonical fact sets cannot carry legacy threat provenance");
    expect(() => KnownGameFactsSchema.parse({
      ...baseFacts(),
      factSetId: "legacy-regression:scene",
      provenance: "legacy_regression_bridge_only",
      threats: [legacyThreat],
      defenseThreats: [rich],
    })).toThrow("Legacy fact sets require legacy threat provenance");
    expect(() => KnownGameFactsSchema.parse({
      ...baseFacts(),
      factSetId: "user-asserted:sha256:scene",
      provenance: "raw_replay",
    })).toThrow("User-asserted fact sets require user-asserted fact provenance");
    expect(() => KnownGameFactsSchema.parse({
      ...baseFacts(),
      factSetId: "canonical-v2:sha256:scene",
      provenance: "raw_replay",
      threats: [{ ...legacyThreat, declarationEventId: "user:threat:2" }],
      defenseThreats: [{
        ...rich,
        source: "user_asserted",
        sourceEventRefs: ["user:threat:2"],
      }],
    })).toThrow("Canonical facts with user assertions require mixed provenance");
    expect(() => KnownGameFactsSchema.parse({
      ...baseFacts(),
      factSetId: "canonical-v2:sha256:scene",
      provenance: "mixed",
      threats: [legacyThreat],
      defenseThreats: [rich],
    })).toThrow("Mixed canonical fact sets require at least one user assertion");
    expect(KnownGameFactsSchema.parse({
      ...baseFacts(),
      factSetId: "canonical-v2:sha256:scene",
      provenance: "mixed",
      threats: [{ ...legacyThreat, declarationEventId: "user:threat:2" }],
      defenseThreats: [{
        ...rich,
        source: "user_asserted",
        sourceEventRefs: ["user:threat:2"],
      }],
    }).provenance).toBe("mixed");
    expect(KnownGameFactsSchema.parse({
      ...baseFacts(),
      factSetId: "canonical-v2:sha256:scene",
      provenance: "mixed",
      threats: [
        { ...legacyThreat, actor: 1, declarationEventId: "user:threat:1" },
        legacyThreat,
      ],
      defenseThreats: [{
        ...rich,
        actor: 1,
        source: "user_asserted",
        sourceEventRefs: ["user:threat:1"],
      }, rich],
    }).provenance).toBe("mixed");
    expect(() => KnownGameFactsSchema.parse({
      ...baseFacts(),
      threats: [legacyThreat],
      defenseThreats: [rich],
    })).toThrow("Rich defense threats require a reserved fact-set namespace");
  });

  it("binds rich threat dealer status when round context is complete", () => {
    const legacyThreat = {
      actor: 2,
      riichi: true,
      declarationEventId: "game/0/47/0",
      ippatsuAlive: true,
    };
    expect(() => KnownGameFactsSchema.parse({
      ...baseFacts(),
      threats: [legacyThreat],
      defenseThreats: [{
        actor: 2,
        kind: "riichi_accepted",
        source: "canonical_replay",
        sourceEventRefs: ["game/0/47/0", "game/0/49/0"],
        openMeldRefs: [],
        dealerStatus: "dealer",
        riichiTurn: { status: "calculated", value: 6 },
        ippatsu: { status: "calculated", value: true },
      }],
      completeness: { ...baseFacts().completeness, roundContext: true },
    })).toThrow("Defense threat dealer status conflicts with known round context");
    expect(() => KnownGameFactsSchema.parse({
      ...baseFacts(),
      threats: [legacyThreat],
      defenseThreats: [{
        actor: 2,
        kind: "riichi_accepted",
        source: "canonical_replay",
        sourceEventRefs: ["game/0/47/0", "game/0/49/0"],
        openMeldRefs: [],
        dealerStatus: "non_dealer",
        riichiTurn: { status: "calculated", value: 6 },
        ippatsu: { status: "calculated", value: true },
      }],
      completeness: { ...baseFacts().completeness, roundContext: false },
    })).toThrow("Incomplete round context requires unknown threat dealer status");
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

  it("accepts only an exact complete self river for furiten", () => {
    const legacyDiscard = {
      tile: tile("1m"),
      actor: 3,
      tsumogiri: false,
      eventId: "event-river",
      afterRiichiEventIds: [],
    };
    const exactDiscard = {
      eventRef: "event-river",
      actor: 3,
      tile: tile("1m"),
      discardMode: "tedashi" as const,
      riichiDeclarationEventRef: null,
      calledByEventRef: null,
    };
    expect(KnownGameFactsSchema.parse({
      ...baseFacts(),
      rivers: [[], [], [], [legacyDiscard]],
      furitenSelfRiver: [exactDiscard],
      completeness: {
        ...baseFacts().completeness,
        eventSequence: true,
        roundContext: true,
      },
    }).furitenSelfRiver).toEqual([exactDiscard]);

    for (const furitenSelfRiver of [
      [{ ...exactDiscard, actor: 2 }],
      [{ ...exactDiscard, eventRef: "event-other" }],
      [{ ...exactDiscard, tile: tile("6s") }],
      [{ ...exactDiscard, discardMode: "tsumogiri" as const }],
      [exactDiscard, { ...exactDiscard, eventRef: "event-extra" }],
    ]) {
      expect(() => KnownGameFactsSchema.parse({
        ...baseFacts(),
        rivers: [[], [], [], [legacyDiscard]],
        furitenSelfRiver,
        completeness: {
          ...baseFacts().completeness,
          eventSequence: true,
          roundContext: true,
        },
      })).toThrow();
    }
    expect(() => KnownGameFactsSchema.parse({
      ...baseFacts(),
      rivers: [[], [], [], [legacyDiscard]],
      furitenSelfRiver: [exactDiscard],
      completeness: {
        ...baseFacts().completeness,
        calledDiscardMarkers: false,
      },
    })).toThrow("Exact furiten self river requires complete river and called-discard facts");
    for (const incompleteField of ["eventSequence", "roundContext"] as const) {
      expect(() => KnownGameFactsSchema.parse({
        ...baseFacts(),
        rivers: [[], [], [], [legacyDiscard]],
        furitenSelfRiver: [exactDiscard],
        completeness: {
          ...baseFacts().completeness,
          eventSequence: true,
          roundContext: true,
          [incompleteField]: false,
        },
      })).toThrow("Exact furiten self river requires complete event sequence and round context");
    }
  });
});
