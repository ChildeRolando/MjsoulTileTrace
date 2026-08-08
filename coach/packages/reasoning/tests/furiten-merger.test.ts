import { describe, expect, it } from "vitest";
import {
  HandStructureResultV2Schema,
  ResponseFuritenAnalysisV2Schema,
  StructuredComparisonCandidateSchema,
  canonicalActionRef,
  type CandidateDiscardEvidenceV2,
  type HandStructureResultV2,
  type RiverDiscardV2,
  type RiichiAction,
  type Tile,
} from "@riichi-coach/contracts";
import { projectCandidate } from "../src/factors/candidate-projector.js";
import { mergeHandStructureFuriten } from "../src/factors/furiten-merger.js";
import { KnownGameFactsSchema } from "@riichi-coach/contracts";

const tile = (id: Tile["id"], red = false): Tile => ({ id, red });
const fixtureFactSetId = "canonical-v2:sha256:fixture-prefix";
const fixtureDecisionEventRef = "game:proof/0/99/0";
const fixtureSourceStreamPrefixHash = "sha256:source-prefix";

function wait(
  tile34: number,
  eligibility: "eligible" | "ineligible" |
    "unknown_missing_situational_yaku_context" = "eligible",
  families: ("standard" | "chiitoitsu" | "kokushi")[] = ["standard"],
) {
  return {
    tile34,
    families,
    waitTypes: [families.includes("chiitoitsu") ? "tanki" as const : "ryanmen" as const],
    remainingStatus: "blocked_missing_facts" as const,
    remaining: null,
    baseRonEligibility: eligibility,
    decompositionRefs: [],
  };
}

function hand(
  waits: ReturnType<typeof wait>[],
  action: RiichiAction | null = null,
): HandStructureResultV2 {
  const standard = waits.some((item) => item.families.includes("standard"));
  const chiitoitsu = waits.some((item) => item.families.includes("chiitoitsu"));
  const kokushi = waits.some((item) => item.families.includes("kokushi"));
  const tenpai = waits.length > 0;
  const diagnostics = waits.some((item) =>
    item.baseRonEligibility === "unknown_missing_situational_yaku_context"
  ) ? ["ron_eligibility_missing_situational_context" as const] : [];
  return HandStructureResultV2Schema.parse({
    kind: "hand_structure_result",
    schemaVersion: "hand-structure/v2",
    requestId: `${fixtureFactSetId}:hand-structure:sha256:furiten`,
    protocolVersion: "mahjong-facts/v1",
    actionRef: action === null ? "scene:furiten" : canonicalActionRef(action),
    stateHash: "sha256:furiten",
    identity: {
      engine: "mahjong-helper",
      upstreamCommit: "514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0",
      adapterVersion: "0.1.0",
      protocolVersion: "mahjong-facts/v1",
    },
    overallShanten: tenpai ? 0 : 1,
    bestFamilies: [
      "standard",
      ...(chiitoitsu ? ["chiitoitsu" as const] : []),
      ...(kokushi ? ["kokushi" as const] : []),
    ],
    families: [
      {
        family: "standard",
        applicability: "applicable",
        shanten: tenpai || standard ? 0 : 1,
        effectiveTiles: [],
      },
      {
        family: "chiitoitsu",
        applicability: "applicable",
        shanten: chiitoitsu ? 0 : 5,
        effectiveTiles: [],
      },
      {
        family: "kokushi",
        applicability: "applicable",
        shanten: kokushi ? 0 : 8,
        effectiveTiles: [],
      },
    ],
    decompositions: {
      status: "calculated",
      totalNonDominated: 1,
      truncated: false,
      items: [{
        decompositionRef: "standard:shape",
        family: "standard",
        shanten: tenpai ? 0 : 1,
        groups: [{ kind: "floating", tiles34: [0] }],
      }],
      invariantClaims: [{ kind: "floating", tiles34: [0] }],
      alternativeClaims: [],
    },
    waits: [...waits].sort((left, right) => left.tile34 - right.tile34),
    diagnostics,
  });
}

function discard(
  eventRef: string,
  tileValue: Tile,
  overrides: Partial<RiverDiscardV2> = {},
): RiverDiscardV2 {
  return {
    eventRef,
    actor: 0,
    tile: tileValue,
    discardMode: "tedashi",
    riichiDeclarationEventRef: null,
    calledByEventRef: null,
    ...overrides,
  };
}

const response = (
  temporary: "clear" | "confirmed" | "unknown" = "clear",
  riichi: "clear" | "confirmed" | "unknown" = "clear",
) => ResponseFuritenAnalysisV2Schema.parse({
  binding: {
    source: "canonical_replay",
    factSetId: fixtureFactSetId,
    streamPrefixHash: "sha256:fixture-prefix",
    decisionEventRef: fixtureDecisionEventRef,
    selfActor: 0,
    engineIdentityStatus: "known",
    engineIdentity: hand([]).identity,
  },
  temporary: {
    status: temporary,
    unknownReason: temporary === "unknown"
      ? "response_window_uncertain"
      : null,
    evidenceIds: temporary === "confirmed"
      ? ["game:proof/0/1/0", "game:proof/0/2/0"]
      : [],
    analysisRefs: temporary === "confirmed" ? [{
      requestId:
        `canonical-response:${fixtureSourceStreamPrefixHash}:hand-structure:sha256:temporary`,
      actionRef: "response:game:proof/0/1/0",
      stateHash: "sha256:temporary",
      engineIdentity: {
        engine: "mahjong-helper" as const,
        upstreamCommit: "514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0" as const,
        adapterVersion: "0.1.0" as const,
        protocolVersion: "mahjong-facts/v1" as const,
      },
      sourceStreamPrefixHash: fixtureSourceStreamPrefixHash,
      sourceEventRef: "game:proof/0/1/0",
      closingEventRef: "game:proof/0/2/0",
    }] : [],
    riichiAcceptanceEventRef: null,
  },
  riichi: {
    status: riichi,
    unknownReason: riichi === "unknown"
      ? "response_window_uncertain"
      : null,
    evidenceIds: riichi === "confirmed"
      ? ["game:proof/0/1/0", "game:proof/0/2/0", "game:proof/0/3/0"]
      : [],
    analysisRefs: riichi === "confirmed" ? [{
      requestId:
        `canonical-response:${fixtureSourceStreamPrefixHash}:hand-structure:sha256:riichi`,
      actionRef: "response:game:proof/0/2/0",
      stateHash: "sha256:riichi",
      engineIdentity: {
        engine: "mahjong-helper" as const,
        upstreamCommit: "514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0" as const,
        adapterVersion: "0.1.0" as const,
        protocolVersion: "mahjong-facts/v1" as const,
      },
      sourceStreamPrefixHash: fixtureSourceStreamPrefixHash,
      sourceEventRef: "game:proof/0/2/0",
      closingEventRef: "game:proof/0/3/0",
    }] : [],
    riichiAcceptanceEventRef: riichi === "confirmed"
      ? "game:proof/0/1/0"
      : null,
  },
});

function merge(overrides: Partial<Parameters<typeof mergeHandStructureFuriten>[0]> = {}) {
  return mergeHandStructureFuriten({
    factSetId: fixtureFactSetId,
    decisionEventRef: fixtureDecisionEventRef,
    hand: hand([wait(4), wait(5)]),
    selfActor: 0,
    selfRiver: [],
    selfRiverComplete: true,
    response: response(),
    source: "current_scene",
    candidateDiscard: null,
    ...overrides,
  } as Parameters<typeof mergeHandStructureFuriten>[0]);
}

function candidateEvidence(
  action: Extract<RiichiAction, { kind: "discard" | "riichi_discard" }>,
  overrides: Partial<CandidateDiscardEvidenceV2> = {},
): CandidateDiscardEvidenceV2 {
  return {
    actor: 0,
    action,
    actionRef: canonicalActionRef(action),
    stateHash: "sha256:furiten",
    tile: action.tile,
    discardMode: action.discardMode,
    ...overrides,
  };
}

describe("furiten merger", () => {
  it("rejects cross-scene response and hand facts and preserves an exact binding", () => {
    const factSetId = "canonical-v2:sha256:decision-prefix";
    const decisionEventRef = "game:proof/0/3/0";
    const boundHand = {
      ...hand([wait(4), wait(5)]),
      requestId: `${factSetId}:hand-structure:sha256:furiten`,
    };
    const binding = {
      source: "canonical_replay" as const,
      factSetId,
      streamPrefixHash: "sha256:decision-prefix",
      decisionEventRef,
      selfActor: 0,
      engineIdentityStatus: "known" as const,
      engineIdentity: boundHand.identity,
    };
    const boundResponse = {
      binding,
      temporary: {
        status: "clear" as const,
        unknownReason: null,
        evidenceIds: [],
        analysisRefs: [],
        riichiAcceptanceEventRef: null,
      },
      riichi: {
        status: "clear" as const,
        unknownReason: null,
        evidenceIds: [],
        analysisRefs: [],
        riichiAcceptanceEventRef: null,
      },
    };
    const input = {
      factSetId,
      decisionEventRef,
      hand: boundHand,
      selfActor: 0,
      selfRiver: [],
      selfRiverComplete: true,
      response: boundResponse,
      source: "current_scene" as const,
      candidateDiscard: null,
    };
    expect(mergeHandStructureFuriten(input).binding).toEqual(binding);
    for (const mismatch of [
      { ...input, factSetId: "canonical-v2:sha256:other" },
      { ...input, decisionEventRef: "game:proof/0/2/0" },
      { ...input, selfActor: 1 },
    ]) {
      expect(() => mergeHandStructureFuriten(
        mismatch as Parameters<typeof mergeHandStructureFuriten>[0],
      )).toThrow(/furiten_merge/);
    }
    expect(() => mergeHandStructureFuriten({
      ...input,
      response: {
        ...boundResponse,
        binding: {
          ...binding,
          engineIdentity: null,
          engineIdentityStatus: "unknown",
        },
      },
    } as Parameters<typeof mergeHandStructureFuriten>[0])).toThrow();

    for (const eventRef of [
      "game:other/0/1/0",
      "game:proof/1/1/0",
      "game:proof/0/100/0",
    ]) {
      expect(() => mergeHandStructureFuriten({
        ...input,
        selfRiver: [discard(eventRef, tile("5m"))],
      })).toThrow("furiten_merge_self_river_scene_mismatch");
    }
  });

  it("clears discard furiten for a complete river with no structural wait match", () => {
    expect(merge({
      selfRiver: [discard("game:proof/0/1/0", tile("1m"))],
    }).furiten.discard).toMatchObject({
      status: "clear",
      canonicalEventRefs: [],
      candidateActionRefs: [],
    });
  });

  it("matches all structural waits regardless of base ron eligibility", () => {
    for (const eligibility of [
      "eligible",
      "ineligible",
      "unknown_missing_situational_yaku_context",
    ] as const) {
      const merged = merge({
        hand: hand([wait(4, eligibility)]),
        selfRiver: [discard("game:proof/0/1/0", tile("5m"))],
      });
      expect(merged.furiten.discard.status).toBe("confirmed");
      expect(merged.ronEligibilityStatus).toBe("calculated");
      expect(merged.ronEligibleWaits34).toEqual([]);
    }
  });

  it("preserves canonical match order, red/normal identity and called discards", () => {
    const merged = merge({
      hand: hand([wait(4)]),
      selfRiver: [
        discard("game:proof/0/1/0", tile("5m", true)),
        discard("game:proof/0/2/0", tile("5m"), { calledByEventRef: "game:proof/0/3/0" }),
      ],
    });
    expect(merged.furiten.discard.canonicalEventRefs)
      .toEqual(["game:proof/0/1/0", "game:proof/0/2/0"]);
  });

  it("makes confirmed temporary or riichi furiten whole-hand", () => {
    for (const responseState of [response("confirmed"), response("clear", "confirmed")]) {
      expect(merge({ response: responseState })).toMatchObject({
        ronEligibilityStatus: "calculated",
        ronEligibleWaits34: [],
      });
    }
  });

  it("preserves historical response proof without rebinding it to the candidate hand", () => {
    const historical = response("confirmed");
    const merged = merge({ response: historical });
    expect(merged.furiten.temporary.analysisRefs).toEqual(
      historical.temporary.analysisRefs,
    );
    expect(merged.furiten.temporary.analysisRefs[0]).toMatchObject({
      requestId:
        `canonical-response:${fixtureSourceStreamPrefixHash}:hand-structure:sha256:temporary`,
      actionRef: "response:game:proof/0/1/0",
      stateHash: "sha256:temporary",
    });
    expect(merged.furiten.temporary.analysisRefs[0]?.stateHash)
      .not.toBe(merged.hand.stateHash);
  });

  it("lets confirmed evidence dominate incomplete or unknown components", () => {
    const merged = merge({
      selfRiverComplete: false,
      response: response("confirmed", "unknown"),
    });
    expect(merged.furiten.discard.status).toBe("unknown");
    expect(merged.ronEligibilityStatus).toBe("calculated");
    expect(merged.ronEligibleWaits34).toEqual([]);
  });

  it("reports incomplete no-match evidence as unknown without reordering response evidence", () => {
    const rawResponse = ResponseFuritenAnalysisV2Schema.parse({
      binding: response().binding,
      temporary: {
        status: "confirmed" as const,
        unknownReason: null,
        evidenceIds: ["game:proof/0/2/0", "game:proof/0/10/0"],
        analysisRefs: [{
          ...response("confirmed").temporary.analysisRefs[0]!,
          actionRef: "response:game:proof/0/2/0",
          sourceEventRef: "game:proof/0/2/0",
          closingEventRef: "game:proof/0/10/0",
        }],
        riichiAcceptanceEventRef: null,
      },
      riichi: {
        status: "clear" as const,
        unknownReason: null,
        evidenceIds: [],
        analysisRefs: [],
        riichiAcceptanceEventRef: null,
      },
    });
    const merged = merge({
      hand: hand([wait(4, "ineligible")]),
      selfRiverComplete: false,
      response: rawResponse,
    });
    expect(merged.furiten.temporary.evidenceIds).toEqual([
      "game:proof/0/2/0", "game:proof/0/10/0",
    ]);
    expect(merged.furiten.temporary.analysisRefs).toEqual(
      rawResponse.temporary.analysisRefs,
    );
    expect(merge({
      hand: hand([wait(4)]),
      selfRiver: [discard("game:proof/0/1/0", tile("1m"))],
      selfRiverComplete: false,
      response: response(),
    })).toMatchObject({
      furiten: { discard: { status: "unknown" } },
      ronEligibilityStatus: "unknown_missing_facts",
      ronEligibleWaits34: [],
    });
  });

  it("uses the final three-valued ordering for no waits and base eligibility", () => {
    expect(merge({ hand: hand([]), selfRiverComplete: false, response: response("unknown") }))
      .toMatchObject({ ronEligibilityStatus: "calculated", ronEligibleWaits34: [] });
    expect(merge({
      hand: hand([wait(4, "ineligible")]),
      selfRiverComplete: false,
      response: response("unknown"),
    })).toMatchObject({ ronEligibilityStatus: "calculated", ronEligibleWaits34: [] });
    expect(merge({
      hand: hand([wait(4), wait(5, "unknown_missing_situational_yaku_context")]),
    })).toMatchObject({
      ronEligibilityStatus: "unknown_missing_facts",
      ronEligibleWaits34: [],
    });
  });

  it("returns unique sorted eligible waits only when every dependency is clear", () => {
    const merged = merge({
      hand: hand([
        wait(6, "eligible", ["standard", "chiitoitsu"]),
        wait(4, "ineligible"),
        wait(5, "eligible"),
      ]),
    });
    expect(merged).toMatchObject({
      ronEligibilityStatus: "calculated",
      ronEligibleWaits34: [5, 6],
    });
    const multiFamilyDiscard = merge({
      hand: hand([wait(6, "eligible", ["standard", "chiitoitsu"])]),
      selfRiver: [discard("game:proof/0/1/0", tile("7m"))],
    });
    expect(multiFamilyDiscard.furiten.discard).toMatchObject({
      status: "confirmed",
      canonicalEventRefs: ["game:proof/0/1/0"],
      candidateActionRefs: [],
    });
  });

  it("lets an incomplete candidate wait match confirm discard furiten", () => {
    const action = {
      kind: "discard" as const,
      tile: tile("5m"),
      discardMode: "tedashi" as const,
    };
    const merged = merge({
      hand: hand([wait(4), wait(5)], action),
      selfRiverComplete: false,
      source: "candidate_discard",
      candidateDiscard: candidateEvidence(action),
    });
    expect(merged.furiten.discard).toMatchObject({
      status: "confirmed",
      canonicalEventRefs: [],
      candidateActionRefs: [canonicalActionRef(action)],
    });
  });

  it("rejects malformed canonical river and every candidate binding mismatch", () => {
    expect(() => merge({
      selfRiver: [discard("game:proof/0/1/0", tile("1m"), { actor: 1 })],
    })).toThrow("furiten_merge_self_river_actor_mismatch");
    expect(() => merge({
      selfRiver: [discard("game:proof/0/1/0", tile("1m")), discard("game:proof/0/1/0", tile("2m"))],
    })).toThrow("furiten_merge_duplicate_canonical_event_ref");

    const action = {
      kind: "discard" as const,
      tile: tile("5m"),
      discardMode: "tedashi" as const,
    };
    const evidence = candidateEvidence(action);
    const otherAction = {
      ...action,
      tile: tile("6m"),
    };
    expect(() => merge({
      hand: hand([wait(4), wait(5)], action),
      source: "candidate_discard",
      candidateDiscard: candidateEvidence(otherAction),
    })).toThrow("furiten_merge_candidate_action_ref_mismatch");
    for (const invalid of [
      { ...evidence, actor: 1 },
      { ...evidence, stateHash: "sha256:other" },
      { ...evidence, actionRef: canonicalActionRef({ ...action, tile: tile("6m") }) },
      { ...evidence, tile: tile("6m") },
      { ...evidence, discardMode: "tsumogiri" as const },
    ]) {
      expect(() => merge({
        hand: hand([wait(4), wait(5)], action),
        source: "candidate_discard",
        candidateDiscard: invalid,
      }))
        .toThrow(/candidate|hand_structure/i);
    }
  });

  it("rejects direct response-proof bypasses before merging", () => {
    const confirmed = response("confirmed");
    const proof = confirmed.temporary.analysisRefs[0]!;
    for (const temporary of [
      {
        status: "confirmed",
        evidenceIds: ["game:proof/0/1/0", "game:proof/0/2/0"],
        analysisRefs: [],
        riichiAcceptanceEventRef: null,
      },
      {
        status: "clear",
        evidenceIds: [],
        analysisRefs: [proof],
        riichiAcceptanceEventRef: null,
      },
      {
        status: "confirmed",
        evidenceIds: ["game:proof/0/1/0", "game:proof/0/2/0"],
        analysisRefs: [{ ...proof, closingEventRef: "game:proof/0/99/0" }],
        riichiAcceptanceEventRef: null,
      },
      {
        status: "confirmed",
        evidenceIds: ["game:proof/0/1/0", "game:proof/0/2/0"],
        analysisRefs: [{ ...proof, diagnostic: "untrusted sidecar prose" }],
        riichiAcceptanceEventRef: null,
      },
      {
        status: "confirmed",
        evidenceIds: [
          "game:proof/0/1/0",
          "game:proof/0/2/0",
          "game:proof/0/3/0",
        ],
        analysisRefs: [proof, {
          ...proof,
          requestId: "request:temporary:forged-second-closure",
          stateHash: "sha256:temporary:forged-second-closure",
          closingEventRef: "game:proof/0/3/0",
        }],
        riichiAcceptanceEventRef: null,
      },
    ]) {
      expect(() => merge({
        response: {
          temporary,
          riichi: response().riichi,
        } as Parameters<typeof mergeHandStructureFuriten>[0]["response"],
      })).toThrow();
    }
  });

  it("projects an auditable hypothetical discard without inserting a canonical event", () => {
    const action = {
      kind: "discard" as const,
      tile: tile("5m"),
      discardMode: "tedashi" as const,
    };
    const facts = KnownGameFactsSchema.parse({
      factSetId: "facts:furiten-candidate",
      provenance: "raw_replay",
      actor: 0,
      selfRiichi: false,
      decisionEventRef: "event:draw",
      decisionWindow: { kind: "self_turn", actor: 0, triggerEventRef: "event:draw" },
      concealedTiles: [
        tile("5m"), tile("1p"), tile("2p"), tile("3p"), tile("4p"),
        tile("5p"), tile("6p"), tile("1s"), tile("2s"), tile("3s"),
        tile("7s"), tile("8s"), tile("9s"),
      ],
      currentDraw: { tile: tile("1m"), eventRef: "event:draw" },
      melds: [],
      doraIndicators: [],
      rivers: [[], [], [], []],
      threats: [],
      roundWind: "E",
      seatWind: "E",
      dealer: true,
      remainingDraws: 50,
      completeness: {
        concealedTiles: true,
        melds: true,
        doraIndicators: false,
        rivers: true,
        remainingDraws: true,
        calledDiscardMarkers: true,
        responseOpportunities: true,
      },
      evidenceIds: ["event:draw"],
    });
    const structured = StructuredComparisonCandidateSchema.parse({
      action,
      actionRef: canonicalActionRef(action),
      origins: ["user"],
    });
    const projected = projectCandidate(structured, facts);
    expect(projected.status).toBe("ready");
    if (projected.status !== "ready") throw new Error("expected ready");
    expect(projected.candidateDiscard).toMatchObject({
      actor: 0,
      action,
      actionRef: structured.actionRef,
      stateHash: projected.handStructureRequest?.stateHash,
      tile: action.tile,
      discardMode: action.discardMode,
    });
    expect(facts.rivers[0]).toEqual([]);
  });

  it("rejects a candidate-discard source when its candidate proof is omitted", () => {
    expect(() => mergeHandStructureFuriten({
      factSetId: fixtureFactSetId,
      decisionEventRef: fixtureDecisionEventRef,
      hand: hand([wait(4)]),
      selfActor: 0,
      selfRiver: [],
      selfRiverComplete: true,
      response: response(),
      source: "candidate_discard",
      candidateDiscard: null,
    } as unknown as Parameters<typeof mergeHandStructureFuriten>[0]))
      .toThrow(/candidate.*required/i);
  });

  it("rejects relabeling a candidate action hand as a current scene", () => {
    const action = {
      kind: "discard" as const,
      tile: tile("5m"),
      discardMode: "tedashi" as const,
    };
    expect(() => mergeHandStructureFuriten({
      factSetId: fixtureFactSetId,
      decisionEventRef: fixtureDecisionEventRef,
      hand: hand([wait(4)], action),
      selfActor: 0,
      selfRiver: [],
      selfRiverComplete: true,
      response: response(),
      source: "current_scene",
      candidateDiscard: null,
    })).toThrow(/current.scene.*action/i);
  });
});
