import { describe, expect, it } from "vitest";
import {
  KnownGameFactsSchema,
  StructuredComparisonCandidateSchema,
  canonicalActionRef,
  type RiichiAction,
  type Tile,
  type YakuContextV2,
} from "@riichi-coach/contracts";
import { projectCandidate } from "../src/factors/candidate-projector.js";
import {
  buildHandStructureRequestV2,
  deriveHandStructureRonContext,
} from "../src/factors/hand-structure-projector.js";

const tile = (id: Tile["id"], red = false): Tile => ({ id, red });

const unknownYakuContext: YakuContextV2 = {
  windsStatus: "unknown",
  roundWindTile34: null,
  selfWindTile34: null,
  riichiStatus: "unknown",
  openTanyaoStatus: "unknown",
};

function candidate(action: RiichiAction) {
  return StructuredComparisonCandidateSchema.parse({
    action,
    actionRef: canonicalActionRef(action),
    origins: ["user"],
  });
}

function baseFacts(overrides: Record<string, unknown> = {}) {
  return KnownGameFactsSchema.parse({
    factSetId: "facts:hand-structure",
    provenance: "raw_replay",
    actor: 0,
    selfRiichi: false,
    handStructureYakuContext: {
      windsStatus: "known",
      roundWindTile34: 27,
      selfWindTile34: 27,
      riichiStatus: "inactive",
      openTanyaoStatus: "enabled",
    },
    decisionEventRef: "event-draw",
    decisionWindow: {
      kind: "self_turn",
      actor: 0,
      triggerEventRef: "event-draw",
    },
    concealedTiles: [
      tile("1m"), tile("2m"), tile("3m"), tile("5m", true),
      tile("2p"), tile("3p"), tile("4p"), tile("5p"),
      tile("2s"), tile("3s"), tile("4s"), tile("7s"), tile("7s"),
    ],
    currentDraw: { tile: tile("6s"), eventRef: "event-draw" },
    melds: [],
    doraIndicators: [tile("4m")],
    rivers: [[], [], [], []],
    threats: [],
    defenseThreats: [],
    roundWind: "E",
    seatWind: "E",
    dealer: true,
    remainingDraws: 55,
    completeness: {
      concealedTiles: true,
      melds: true,
      doraIndicators: true,
      rivers: true,
      remainingDraws: true,
      calledDiscardMarkers: true,
      responseOpportunities: true,
    },
    evidenceIds: ["event-draw"],
    ...overrides,
  });
}

describe("hand structure request projector", () => {
  it("binds a strict immutable request to the action and payload hash", () => {
    const projectedHand = [
      tile("1m"), tile("2m"), tile("3m"), tile("4m"), tile("5m"),
      tile("6m"), tile("7m"), tile("8m"), tile("9m"),
      tile("1p"), tile("1p"), tile("2p"), tile("3p"),
    ];
    const input = {
      actionRef: canonicalActionRef({
        kind: "discard",
        tile: tile("1s"),
        discardMode: "tedashi",
      }),
      factSetId: "facts:builder",
      projectedHand,
      selfMelds: [],
      leftTiles34: Array<number>(34).fill(0),
      ronContext: "unknown_future" as const,
      yakuContext: unknownYakuContext,
    };
    const before = structuredClone(input);

    const request = buildHandStructureRequestV2(input);

    expect(request).toMatchObject({
      kind: "hand_structure",
      schemaVersion: "hand-structure/v2",
      protocolVersion: "mahjong-facts/v1",
      actionRef: input.actionRef,
      visibleCountsComplete: true,
      ronContext: "unknown_future",
      yakuContext: unknownYakuContext,
    });
    expect(request.requestId).toBe(
      `${input.factSetId}:hand-structure:${request.stateHash}`,
    );
    expect(input).toEqual(before);
    expect(buildHandStructureRequestV2({
      ...input,
      ronContext: "known_houtei",
    }).stateHash).not.toBe(request.stateHash);
  });

  it("projects discard and riichi-discard as the 13-tile post-action hand", () => {
    const discard = candidate({
      kind: "discard",
      tile: tile("6s"),
      discardMode: "tsumogiri",
    });
    const riichiDiscard = candidate({
      kind: "riichi_discard",
      tile: tile("2p"),
      discardMode: "tedashi",
    });

    for (const action of [discard, riichiDiscard]) {
      const projected = projectCandidate(action, baseFacts());
      expect(projected.status).toBe("ready");
      if (projected.status !== "ready") throw new Error("expected ready");
      expect(projected.handStructureRequest?.handTiles34
        .reduce((sum, count) => sum + count, 0)).toBe(13);
      expect(projected.handStructureRequest).toMatchObject({
        actionRef: action.actionRef,
        ronContext: "unknown_future",
      });
      expect(projected.handStructureRequest?.requestId).toContain(
        `${baseFacts().factSetId}:hand-structure:`,
      );
    }
  });

  it("projects self open melds and the reduced concealed hand count", () => {
    const facts = baseFacts({
      concealedTiles: [
        tile("2m"), tile("3m"), tile("4m"), tile("2p"), tile("3p"),
        tile("4p"), tile("2s"), tile("3s"), tile("4s"), tile("7s"),
      ],
      currentDraw: { tile: tile("8s"), eventRef: "event-draw" },
      melds: [{
        meldRef: "meld:pon:1z",
        kind: "pon",
        actor: 0,
        calledDiscardEventRef: "discard:1z",
        tiles: [tile("1z"), tile("1z"), tile("1z")],
      }],
      rivers: [[], [{
        tile: tile("1z"), actor: 1, tsumogiri: false,
        eventId: "discard:1z", afterRiichiEventIds: [],
      }], [], []],
      evidenceIds: ["event-draw", "discard:1z"],
    });
    const projected = projectCandidate(candidate({
      kind: "discard",
      tile: tile("8s"),
      discardMode: "tsumogiri",
    }), facts);

    expect(projected.status).toBe("ready");
    if (projected.status !== "ready") throw new Error("expected ready");
    expect(projected.handStructureRequest?.handTiles34
      .reduce((sum, count) => sum + count, 0)).toBe(10);
    expect(projected.handStructureRequest?.melds).toEqual([{
      kind: "pon",
      tiles34: [27, 27, 27],
    }]);
  });

  it("keeps a request but blocks left counts when visible facts are incomplete", () => {
    const complete = projectCandidate(candidate({
      kind: "discard",
      tile: tile("6s"),
      discardMode: "tsumogiri",
    }), baseFacts());
    const incompleteFacts = baseFacts({
      completeness: {
        ...baseFacts().completeness,
        rivers: false,
      },
    });
    const incomplete = projectCandidate(candidate({
      kind: "discard",
      tile: tile("6s"),
      discardMode: "tsumogiri",
    }), incompleteFacts);

    expect(complete.status).toBe("ready");
    expect(incomplete.status).toBe("ready");
    if (complete.status !== "ready" || incomplete.status !== "ready") {
      throw new Error("expected ready");
    }
    expect(complete.handStructureRequest?.leftTiles34).not.toBeNull();
    expect(complete.handStructureRequest?.visibleCountsComplete).toBe(true);
    expect(complete.handStructureRequest?.leftTiles34?.[0]).toBe(3);
    expect(complete.handStructureRequest?.leftTiles34?.[3]).toBe(3);
    expect(complete.handStructureRequest?.leftTiles34?.[23]).toBe(3);
    expect(complete.handStructureRequest?.leftTiles34?.[24]).toBe(2);
    expect(incomplete.handStructureRequest).toMatchObject({
      leftTiles34: null,
      visibleCountsComplete: false,
    });
  });

  it("fails closed when complete visible facts contain a physical fifth tile", () => {
    const facts = baseFacts({
      rivers: [[], [
        {
          tile: tile("7s"), actor: 1, tsumogiri: false,
          eventId: "river:7s:1", afterRiichiEventIds: [],
        },
        {
          tile: tile("7s"), actor: 1, tsumogiri: false,
          eventId: "river:7s:2", afterRiichiEventIds: [],
        },
        {
          tile: tile("7s"), actor: 1, tsumogiri: false,
          eventId: "river:7s:3", afterRiichiEventIds: [],
        },
      ], [], []],
      evidenceIds: [
        "event-draw", "river:7s:1", "river:7s:2", "river:7s:3",
      ],
    });

    expect(() => projectCandidate(candidate({
      kind: "discard",
      tile: tile("6s"),
      discardMode: "tsumogiri",
    }), facts)).toThrow("candidate_projection_visible_tile_count_exceeds_four");
  });

  it("derives exact ron contexts without guessing incomplete houtei facts", () => {
    expect(deriveHandStructureRonContext(baseFacts())).toBe("unknown_future");
    expect(deriveHandStructureRonContext(baseFacts({
      decisionEventRef: "discard:source",
      decisionWindow: {
        kind: "discard_response", actor: 0,
        triggerEventRef: "discard:source", sourceActor: 1,
        offeredTile: tile("3p"),
      },
      currentDraw: null,
      remainingDraws: 12,
    }))).toBe("complete_none");
    expect(deriveHandStructureRonContext(baseFacts({
      decisionEventRef: "discard:last",
      decisionWindow: {
        kind: "discard_response", actor: 0,
        triggerEventRef: "discard:last", sourceActor: 1,
        offeredTile: tile("3p"),
      },
      currentDraw: null,
      remainingDraws: 0,
    }))).toBe("known_houtei");
    expect(deriveHandStructureRonContext(baseFacts({
      decisionEventRef: "discard:unknown",
      decisionWindow: {
        kind: "discard_response", actor: 0,
        triggerEventRef: "discard:unknown", sourceActor: 1,
        offeredTile: tile("3p"),
      },
      currentDraw: null,
      remainingDraws: null,
      completeness: {
        ...baseFacts().completeness,
        remainingDraws: false,
      },
    }))).toBe("unknown_future");
    expect(deriveHandStructureRonContext(baseFacts({
      decisionEventRef: "kan:kakan",
      decisionWindow: {
        kind: "kan_response", actor: 0,
        triggerEventRef: "kan:kakan", sourceActor: 1,
        offeredTile: tile("3p"), kanKind: "kakan",
      },
      currentDraw: null,
    }))).toBe("known_kakan_chankan");
    expect(deriveHandStructureRonContext(baseFacts({
      decisionEventRef: "kan:ankan",
      decisionWindow: {
        kind: "kan_response", actor: 0,
        triggerEventRef: "kan:ankan", sourceActor: 1,
        offeredTile: tile("3p"), kanKind: "ankan",
      },
      currentDraw: null,
    }))).toBe("known_ankan_chankan");
  });

  it("preserves unknown yaku facts and binds a riichi declaration candidate", () => {
    const facts = baseFacts({ handStructureYakuContext: unknownYakuContext });
    const before = structuredClone(facts);
    const projected = projectCandidate(candidate({
      kind: "riichi_discard",
      tile: tile("6s"),
      discardMode: "tsumogiri",
    }), facts);

    expect(projected.status).toBe("ready");
    if (projected.status !== "ready") throw new Error("expected ready");
    expect(projected.handStructureRequest?.yakuContext).toEqual({
      ...unknownYakuContext,
      riichiStatus: "accepted",
    });
    expect(facts).toEqual(before);
  });

  it("rejects accepted riichi with a non-ankan open meld", () => {
    const facts = baseFacts({
      selfRiichi: true,
      handStructureYakuContext: {
        windsStatus: "known",
        roundWindTile34: 27,
        selfWindTile34: 27,
        riichiStatus: "accepted",
        openTanyaoStatus: "enabled",
      },
      concealedTiles: [
        tile("2m"), tile("3m"), tile("4m"), tile("2p"), tile("3p"),
        tile("4p"), tile("2s"), tile("3s"), tile("4s"), tile("7s"),
      ],
      currentDraw: { tile: tile("8s"), eventRef: "event-draw" },
      melds: [{
        meldRef: "meld:pon:1z", kind: "pon", actor: 0,
        calledDiscardEventRef: "discard:1z",
        tiles: [tile("1z"), tile("1z"), tile("1z")],
      }],
      rivers: [[], [{
        tile: tile("1z"), actor: 1, tsumogiri: false,
        eventId: "discard:1z", afterRiichiEventIds: [],
      }], [], []],
      evidenceIds: ["event-draw", "discard:1z"],
    });

    expect(() => projectCandidate(candidate({
      kind: "discard", tile: tile("8s"), discardMode: "tsumogiri",
    }), facts)).toThrow(/Accepted riichi is incompatible with an open meld/);
  });
});
