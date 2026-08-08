import { describe, expect, it } from "vitest";
import {
  CandidateDiscardEvidenceV2Schema,
  HAND_STRUCTURE_SCHEMA_VERSION,
  HandStructureRequestV2Schema,
  HandStructureResultV2Schema,
  MergedHandFuritenV2Schema,
  ResponseFuritenAnalysisRefV2Schema,
  ResponseFuritenAnalysisV2Schema,
  ResponseFuritenComponentV2Schema,
  type HandStructureRequestV2,
  type HandStructureResultV2,
} from "../src/hand-structure.js";
import { canonicalActionRef } from "../src/action-codec.js";
import { ActionRefSchema } from "../src/comparison.js";

const zeroes = Array<number>(34).fill(0);
const handAction = {
  kind: "discard" as const,
  tile: { id: "9s" as const, red: false },
  discardMode: "tedashi" as const,
};
const actionRef = ActionRefSchema.parse("scene:shape");

function request(): HandStructureRequestV2 {
  const hand = [...zeroes];
  [0, 1, 2, 9, 10, 11, 18, 19, 20, 24, 25, 27, 27]
    .forEach((tile) => {
      hand[tile] = hand[tile]! + 1;
    });
  return {
    kind: "hand_structure" as const,
    schemaVersion: HAND_STRUCTURE_SCHEMA_VERSION,
    requestId: "request:shape",
    protocolVersion: "mahjong-facts/v1" as const,
    actionRef,
    stateHash: "sha256:shape",
    handTiles34: hand,
    melds: [],
    leftTiles34: null,
    visibleCountsComplete: false,
    ronContext: "unknown_future" as const,
    yakuContext: {
      windsStatus: "known" as const,
      roundWindTile34: 27,
      selfWindTile34: 28,
      riichiStatus: "inactive" as const,
      openTanyaoStatus: "enabled" as const,
    },
  };
}

function result(): HandStructureResultV2 {
  return {
    kind: "hand_structure_result",
    schemaVersion: HAND_STRUCTURE_SCHEMA_VERSION,
    requestId: "request:shape",
    protocolVersion: "mahjong-facts/v1",
    actionRef,
    stateHash: "sha256:shape",
    identity: {
      engine: "mahjong-helper",
      upstreamCommit: "514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0",
      adapterVersion: "0.1.0",
      protocolVersion: "mahjong-facts/v1",
    },
    overallShanten: 0,
    bestFamilies: ["standard"],
    families: [
      {
        family: "standard",
        applicability: "applicable",
        shanten: 0,
        effectiveTiles: [
          { tile34: 23, remainingStatus: "blocked_missing_facts", remaining: null },
          { tile34: 26, remainingStatus: "blocked_missing_facts", remaining: null },
        ],
      },
      {
        family: "chiitoitsu",
        applicability: "applicable",
        shanten: 5,
        effectiveTiles: [],
      },
      {
        family: "kokushi",
        applicability: "applicable",
        shanten: 8,
        effectiveTiles: [],
      },
    ],
    decompositions: {
      status: "calculated",
      totalNonDominated: 1,
      truncated: false,
      items: [{
        decompositionRef: "standard:abc",
        family: "standard",
        shanten: 0,
        groups: [
          { kind: "sequence", tiles34: [0, 1, 2] },
          { kind: "pair_candidate", tiles34: [27, 27] },
        ],
      }],
      invariantClaims: [
        { kind: "sequence", tiles34: [0, 1, 2] },
        { kind: "pair_candidate", tiles34: [27, 27] },
      ],
      alternativeClaims: [],
    },
    waits: [
      {
        tile34: 23,
        families: ["standard"],
        waitTypes: ["ryanmen"],
        remainingStatus: "blocked_missing_facts",
        remaining: null,
        baseRonEligibility: "unknown_missing_situational_yaku_context",
        decompositionRefs: ["standard:abc"],
      },
    ],
    diagnostics: ["ron_eligibility_missing_situational_context"],
  };
}

describe("hand-structure/v2 contracts", () => {
  it("strictly binds response and merged furiten to one canonical scene", () => {
    const engineIdentity = result().identity;
    const sourceStreamPrefixHash = "sha256:source-prefix";
    const binding = {
      source: "canonical_replay" as const,
      factSetId: "canonical-v2:sha256:decision-prefix",
      streamPrefixHash: "sha256:decision-prefix",
      decisionEventRef: "game:fixture/0/6/0",
      selfActor: 0,
      engineIdentityStatus: "known" as const,
      engineIdentity,
    };
    const proof = {
      requestId:
        `canonical-response:${sourceStreamPrefixHash}:hand-structure:sha256:response:5`,
      stateHash: "sha256:response:5",
      actionRef: "response:game:fixture/0/5/0",
      engineIdentity,
      sourceStreamPrefixHash,
      sourceEventRef: "game:fixture/0/5/0",
      closingEventRef: "game:fixture/0/6/0",
    };
    const response = {
      binding,
      temporary: {
        status: "confirmed" as const,
        unknownReason: null,
        evidenceIds: [proof.sourceEventRef, proof.closingEventRef],
        analysisRefs: [proof],
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
    expect(ResponseFuritenAnalysisV2Schema.parse(response).binding)
      .toEqual(binding);

    for (const invalid of [
      {
        ...response,
        binding: { ...binding, factSetId: "canonical-v2:sha256:other" },
      },
      {
        ...response,
        binding: { ...binding, decisionEventRef: "game:other/0/6/0" },
      },
      {
        ...response,
        temporary: {
          ...response.temporary,
          analysisRefs: [{ ...proof, sourceStreamPrefixHash: "sha256:other" }],
        },
      },
      {
        ...response,
        temporary: {
          ...response.temporary,
          analysisRefs: [{ ...proof, engineIdentity: { ...engineIdentity, adapterVersion: "forged" } }],
        },
      },
      {
        ...response,
        binding: { ...binding, decisionEventRef: "game:fixture/0/4/0" },
      },
    ]) {
      expect(ResponseFuritenAnalysisV2Schema.safeParse(invalid).success)
        .toBe(false);
    }
  });

  it("permits unavailable response facts only as fixed-reason unknowns", () => {
    for (const [reason, unknownReason] of [
      ["no_canonical_stream", "response_no_canonical_stream"],
      ["response_history_not_provided", "response_history_not_provided"],
      ["unsupported_source", "response_unsupported_source"],
    ] as const) {
      const unavailable = {
        binding: {
          source: "unavailable" as const,
          factSetId: "hypothetical:scene",
          decisionEventRef: "hypothetical:decision",
          selfActor: 0,
          reason,
          engineIdentityStatus: "unknown" as const,
          engineIdentity: null,
        },
        temporary: {
          status: "unknown" as const,
          unknownReason,
          evidenceIds: [],
          analysisRefs: [],
          riichiAcceptanceEventRef: null,
        },
        riichi: {
          status: "unknown" as const,
          unknownReason,
          evidenceIds: [],
          analysisRefs: [],
          riichiAcceptanceEventRef: null,
        },
      };
      expect(ResponseFuritenAnalysisV2Schema.parse(unavailable)).toEqual(
        unavailable,
      );
      expect(ResponseFuritenAnalysisV2Schema.safeParse({
        ...unavailable,
        temporary: {
          ...unavailable.temporary,
          status: "clear",
          unknownReason: null,
        },
      }).success).toBe(false);
    }
  });

  it("requires canonical engine-bound proof for confirmed response furiten", () => {
    const sourceStreamPrefixHash = "sha256:response-prefix:5";
    const proof = {
      requestId:
        `canonical-response:${sourceStreamPrefixHash}:hand-structure:sha256:response:5`,
      stateHash: "sha256:response:5",
      actionRef: "response:game:fixture/0/5/0",
      engineIdentity: result().identity,
      sourceStreamPrefixHash,
      sourceEventRef: "game:fixture/0/5/0",
      closingEventRef: "game:fixture/0/6/0",
    };
    expect(ResponseFuritenAnalysisRefV2Schema.parse(proof)).toEqual(proof);
    const confirmedTemporary = {
      status: "confirmed",
      unknownReason: null,
      evidenceIds: [proof.sourceEventRef, proof.closingEventRef],
      analysisRefs: [proof],
      riichiAcceptanceEventRef: null,
    };
    expect(ResponseFuritenComponentV2Schema.parse(confirmedTemporary)
      .analysisRefs).toEqual([proof]);
    const missingAcceptanceField = { ...confirmedTemporary } as Record<
      string,
      unknown
    >;
    delete missingAcceptanceField.riichiAcceptanceEventRef;
    expect(ResponseFuritenComponentV2Schema.safeParse(missingAcceptanceField)
      .success).toBe(false);
    expect(ResponseFuritenComponentV2Schema.safeParse({
      ...confirmedTemporary,
      evidenceIds: [
        proof.sourceEventRef,
        proof.closingEventRef,
        "game:fixture/0/7/0",
      ],
    }).success).toBe(false);
    expect(ResponseFuritenComponentV2Schema.safeParse({
      ...confirmedTemporary,
      evidenceIds: [
        proof.sourceEventRef,
        proof.closingEventRef,
        "game:fixture/0/7/0",
      ],
      analysisRefs: [proof, {
        ...proof,
        requestId: "request:response:5:forged-second-closure",
        stateHash: "sha256:response:5:forged-second-closure",
        closingEventRef: "game:fixture/0/7/0",
      }],
    }).success).toBe(false);
    const riichiConfirmed = {
      ...confirmedTemporary,
      evidenceIds: [
        "game:fixture/0/4/0",
        proof.sourceEventRef,
        proof.closingEventRef,
      ],
      riichiAcceptanceEventRef: "game:fixture/0/4/0",
    };
    expect(ResponseFuritenAnalysisV2Schema.safeParse({
      binding: {
        source: "canonical_replay",
        factSetId: "canonical-v2:sha256:decision-prefix",
        streamPrefixHash: "sha256:decision-prefix",
        decisionEventRef: "game:fixture/0/6/0",
        selfActor: 0,
        engineIdentityStatus: "known",
        engineIdentity: proof.engineIdentity,
      },
      temporary: {
        status: "clear",
        unknownReason: null,
        evidenceIds: [],
        analysisRefs: [],
        riichiAcceptanceEventRef: null,
      },
      riichi: riichiConfirmed,
    }).success).toBe(true);
    expect(ResponseFuritenAnalysisV2Schema.safeParse({
      binding: {
        source: "canonical_replay",
        factSetId: "canonical-v2:sha256:decision-prefix",
        streamPrefixHash: "sha256:decision-prefix",
        decisionEventRef: "game:fixture/0/6/0",
        selfActor: 0,
        engineIdentityStatus: "known",
        engineIdentity: proof.engineIdentity,
      },
      temporary: confirmedTemporary,
      riichi: {
        status: "clear",
        unknownReason: null,
        evidenceIds: [],
        analysisRefs: [],
        riichiAcceptanceEventRef: "game:fixture/0/4/0",
      },
    }).success).toBe(false);
    expect(ResponseFuritenAnalysisV2Schema.safeParse({
      binding: {
        source: "canonical_replay",
        factSetId: "canonical-v2:sha256:decision-prefix",
        streamPrefixHash: "sha256:decision-prefix",
        decisionEventRef: "game:fixture/0/6/0",
        selfActor: 0,
        engineIdentityStatus: "known",
        engineIdentity: proof.engineIdentity,
      },
      temporary: {
        status: "clear",
        unknownReason: null,
        evidenceIds: [],
        analysisRefs: [],
        riichiAcceptanceEventRef: null,
      },
      riichi: {
        ...confirmedTemporary,
        evidenceIds: [proof.sourceEventRef, proof.closingEventRef],
        riichiAcceptanceEventRef: proof.sourceEventRef,
      },
    }).success).toBe(false);
    for (const closingEventRef of [
      "game:fixture/1/6/0",
      "game:other/0/6/0",
    ]) {
      expect(ResponseFuritenComponentV2Schema.safeParse({
        ...confirmedTemporary,
        evidenceIds: [proof.sourceEventRef, closingEventRef],
        analysisRefs: [{ ...proof, closingEventRef }],
      }).success).toBe(false);
    }
    expect(ResponseFuritenAnalysisV2Schema.safeParse({
      binding: {
        source: "canonical_replay",
        factSetId: "canonical-v2:sha256:decision-prefix",
        streamPrefixHash: "sha256:decision-prefix",
        decisionEventRef: "game:fixture/0/6/0",
        selfActor: 0,
        engineIdentityStatus: "known",
        engineIdentity: proof.engineIdentity,
      },
      temporary: {
        ...confirmedTemporary,
        riichiAcceptanceEventRef: "game:fixture/0/4/0",
        evidenceIds: [
          "game:fixture/0/4/0",
          proof.sourceEventRef,
          proof.closingEventRef,
        ],
      },
      riichi: riichiConfirmed,
    }).success).toBe(false);

    for (const invalid of ([
      { status: "confirmed", evidenceIds: [proof.sourceEventRef], analysisRefs: [] },
      { status: "clear", evidenceIds: [], analysisRefs: [proof] },
      { status: "unknown", evidenceIds: [], analysisRefs: [proof] },
      {
        status: "confirmed",
        evidenceIds: [proof.sourceEventRef],
        analysisRefs: [proof],
      },
      {
        status: "confirmed",
        evidenceIds: [proof.sourceEventRef, proof.closingEventRef],
        analysisRefs: [proof, proof],
      },
      {
        status: "confirmed",
        evidenceIds: [
          proof.sourceEventRef, proof.closingEventRef,
          "game:fixture/0/7/0", "game:fixture/0/8/0",
        ],
        analysisRefs: [{
          ...proof,
          requestId: "request:response:7",
          actionRef: "response:game:fixture/0/7/0",
          stateHash: "sha256:response:7",
          sourceEventRef: "game:fixture/0/7/0",
          closingEventRef: "game:fixture/0/8/0",
        }, proof],
      },
      {
        status: "confirmed",
        evidenceIds: [proof.sourceEventRef, proof.closingEventRef],
        analysisRefs: [{
          ...proof,
          engineIdentity: { ...proof.engineIdentity, adapterVersion: "9.9.9" },
        }],
      },
      {
        status: "confirmed",
        evidenceIds: [proof.sourceEventRef, proof.closingEventRef],
        analysisRefs: [{ ...proof, decompositionRef: "standard:forged" }],
      },
      {
        status: "confirmed",
        evidenceIds: [proof.sourceEventRef, proof.closingEventRef],
        analysisRefs: [{ ...proof, diagnostic: "sidecar said this was a wait" }],
      },
      {
        status: "confirmed",
        evidenceIds: [proof.sourceEventRef, proof.closingEventRef],
        analysisRefs: [{
          ...proof,
          sourceEventRef: canonicalActionRef(handAction),
        }],
      },
      {
        status: "confirmed",
        evidenceIds: [proof.sourceEventRef, proof.closingEventRef],
        analysisRefs: [{
          ...proof,
          actionRef: canonicalActionRef(handAction),
        }],
      },
      {
        status: "confirmed",
        evidenceIds: [proof.sourceEventRef, proof.closingEventRef],
        analysisRefs: [{
          ...proof,
          actionRef: "response:game:fixture/0/99/0",
        }],
      },
    ].map((component) => ({
      riichiAcceptanceEventRef: null,
      ...component,
    })))) {
      expect(ResponseFuritenComponentV2Schema.safeParse(invalid).success)
        .toBe(false);
    }

    const ordinalProof = (ordinal: number) => ({
      ...proof,
      requestId:
        `canonical-response:${sourceStreamPrefixHash}:hand-structure:sha256:response:${ordinal}`,
      actionRef: `response:game:fixture/0/${ordinal}/0`,
      stateHash: `sha256:response:${ordinal}`,
      sourceEventRef: `game:fixture/0/${ordinal}/0`,
      closingEventRef: `game:fixture/0/${ordinal + 1}/0`,
    });
    expect(ResponseFuritenComponentV2Schema.safeParse({
      status: "confirmed",
      unknownReason: null,
      evidenceIds: [
        "game:fixture/0/2/0", "game:fixture/0/3/0",
        "game:fixture/0/10/0", "game:fixture/0/11/0",
      ],
      analysisRefs: [ordinalProof(2), ordinalProof(10)],
      riichiAcceptanceEventRef: null,
    }).success).toBe(true);
    expect(ResponseFuritenComponentV2Schema.safeParse({
      status: "confirmed",
      unknownReason: null,
      evidenceIds: [
        "game:fixture/0/2/0", "game:fixture/0/3/0",
        "game:fixture/0/10/0", "game:fixture/0/11/0",
      ],
      analysisRefs: [ordinalProof(10), ordinalProof(2)],
      riichiAcceptanceEventRef: null,
    }).success).toBe(false);
    expect(ResponseFuritenComponentV2Schema.safeParse({
      status: "confirmed",
      unknownReason: null,
      evidenceIds: [
        "game:fixture/0/10/0", "game:fixture/0/11/0",
        "game:fixture/0/2/0", "game:fixture/0/3/0",
      ],
      analysisRefs: [ordinalProof(10), ordinalProof(2)],
      riichiAcceptanceEventRef: null,
    }).success).toBe(false);
  });

  it("keeps hypothetical candidate discards separate from canonical events", () => {
    const action = {
      kind: "discard" as const,
      tile: { id: "5p" as const, red: true },
      discardMode: "tedashi" as const,
    };
    const evidence = {
      actor: 0,
      action,
      actionRef: canonicalActionRef(action),
      stateHash: "sha256:candidate-hand",
      tile: action.tile,
      discardMode: action.discardMode,
    };
    expect(CandidateDiscardEvidenceV2Schema.parse(evidence)).toEqual(evidence);
    expect(CandidateDiscardEvidenceV2Schema.safeParse({
      ...evidence,
      actionRef: actionRef,
    }).success).toBe(false);
    expect(CandidateDiscardEvidenceV2Schema.safeParse({
      ...evidence,
      tile: { id: "5p", red: false },
    }).success).toBe(false);
    expect(CandidateDiscardEvidenceV2Schema.safeParse({
      ...evidence,
      discardMode: "tsumogiri",
    }).success).toBe(false);
  });

  it("requires exact merged furiten truth and separated evidence namespaces", () => {
    const hand = result();
    const factSetId = "canonical-v2:sha256:merged-prefix";
    hand.requestId = `${factSetId}:hand-structure:${hand.stateHash}`;
    hand.waits[0]!.baseRonEligibility = "eligible";
    hand.diagnostics = [];
    const clear = {
      binding: {
        source: "canonical_replay" as const,
        factSetId,
        streamPrefixHash: "sha256:merged-prefix",
        decisionEventRef: "game:fixture/0/99/0",
        selfActor: 0,
        engineIdentityStatus: "known" as const,
        engineIdentity: hand.identity,
      },
      hand,
      furiten: {
        discard: {
          status: "clear" as const,
          source: "current_scene" as const,
          selfActor: 0,
          selfRiver: [],
          selfRiverComplete: true,
          candidateDiscard: null,
          canonicalEventRefs: [],
          candidateActionRefs: [],
        },
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
      },
      ronEligibilityStatus: "calculated" as const,
      ronEligibleWaits34: [23],
    };
    expect(MergedHandFuritenV2Schema.parse(clear).ronEligibleWaits34)
      .toEqual([23]);
    expect(MergedHandFuritenV2Schema.safeParse({
      ...clear,
      hand: { ...hand, actionRef: canonicalActionRef(handAction) },
    }).success).toBe(false);

    for (const invalid of [
      { ...clear, ronEligibleWaits34: [] },
      { ...clear, ronEligibleWaits34: [23, 23] },
      { ...clear, ronEligibilityStatus: "unknown_missing_facts" },
      {
        ...clear,
        furiten: {
          ...clear.furiten,
          discard: {
            status: "confirmed",
            canonicalEventRefs: [],
            candidateActionRefs: [actionRef],
          },
        },
      },
    ]) {
      expect(MergedHandFuritenV2Schema.safeParse(invalid).success).toBe(false);
    }

    const validCanonicalConfirmation = {
      ...clear,
      furiten: {
        ...clear.furiten,
        discard: {
          status: "confirmed" as const,
          source: "current_scene" as const,
          selfActor: 0,
          selfRiver: [{
            eventRef: "game:fixture/0/1/0",
            actor: 0,
            tile: { id: "6s" as const, red: false },
            discardMode: "tedashi" as const,
            riichiDeclarationEventRef: null,
            calledByEventRef: null,
          }],
          selfRiverComplete: true,
          candidateDiscard: null,
          canonicalEventRefs: ["game:fixture/0/1/0"],
          candidateActionRefs: [],
        },
      },
      ronEligibleWaits34: [],
    };
    expect(MergedHandFuritenV2Schema.parse(validCanonicalConfirmation)
      .ronEligibleWaits34).toEqual([]);
    const forgedCanonicalConfirmation = {
      ...validCanonicalConfirmation,
      furiten: {
        ...validCanonicalConfirmation.furiten,
        discard: {
          ...validCanonicalConfirmation.furiten.discard,
          selfRiver: [{
            ...validCanonicalConfirmation.furiten.discard.selfRiver[0]!,
            tile: { id: "1m" as const, red: false },
          }],
        },
      },
    };
    expect(MergedHandFuritenV2Schema.safeParse(forgedCanonicalConfirmation).success)
      .toBe(false);
    const candidateActionRef = canonicalActionRef(handAction);
    const candidateHand = { ...hand, actionRef: candidateActionRef };
    const candidateDiscard = {
      actor: 0,
      action: handAction,
      actionRef: candidateActionRef,
      stateHash: hand.stateHash,
      tile: handAction.tile,
      discardMode: handAction.discardMode,
    };
    const forgedCandidateConfirmation = {
      ...clear,
      hand: candidateHand,
      furiten: {
        ...clear.furiten,
        discard: {
          status: "confirmed" as const,
          source: "candidate_discard" as const,
          selfActor: 0,
          selfRiver: [],
          selfRiverComplete: true,
          candidateDiscard,
          canonicalEventRefs: [],
          candidateActionRefs: [candidateActionRef],
        },
      },
      ronEligibleWaits34: [],
    };
    expect(MergedHandFuritenV2Schema.safeParse(forgedCandidateConfirmation).success)
      .toBe(false);
    expect(MergedHandFuritenV2Schema.safeParse({
      ...forgedCanonicalConfirmation,
      furiten: {
        ...forgedCanonicalConfirmation.furiten,
        discard: {
          status: "confirmed",
          canonicalEventRefs: ["game:fixture/0/1/0"],
          candidateActionRefs: ["event:not-an-action"],
        },
      },
    }).success).toBe(false);
    expect(MergedHandFuritenV2Schema.safeParse({
      ...forgedCanonicalConfirmation,
      furiten: {
        ...forgedCanonicalConfirmation.furiten,
        discard: {
          status: "confirmed",
          canonicalEventRefs: [],
          candidateActionRefs: [canonicalActionRef({
            kind: "discard",
            tile: { id: "1m", red: false },
            discardMode: "tedashi",
          })],
        },
      },
    }).success).toBe(false);
    expect(MergedHandFuritenV2Schema.safeParse({
      ...forgedCanonicalConfirmation,
      furiten: {
        ...forgedCanonicalConfirmation.furiten,
        temporary: {
          status: "confirmed",
          evidenceIds: [canonicalActionRef({
            kind: "discard",
            tile: { id: "1m", red: false },
            discardMode: "tedashi",
          })],
        },
      },
    }).success).toBe(false);
  });

  it("accepts a strict independent request", () => {
    expect(HandStructureRequestV2Schema.parse(request()).schemaVersion)
      .toBe("hand-structure/v2");
    expect(() => HandStructureRequestV2Schema.parse({ ...request(), extra: true }))
      .toThrow();
  });

  it("requires a strict, stable yaku context shape", () => {
    const missingContext = { ...request() } as Record<string, unknown>;
    delete missingContext.yakuContext;
    expect(() => HandStructureRequestV2Schema.parse(missingContext)).toThrow();

    for (const field of [
      "windsStatus",
      "roundWindTile34",
      "selfWindTile34",
      "riichiStatus",
      "openTanyaoStatus",
    ] as const) {
      const missing = request() as unknown as {
        yakuContext: Record<string, unknown>;
      };
      delete missing.yakuContext[field];
      expect(() => HandStructureRequestV2Schema.parse(missing)).toThrow();
    }

    const unknownNested = request() as unknown as {
      yakuContext: Record<string, unknown>;
    };
    unknownNested.yakuContext.extra = true;
    expect(() => HandStructureRequestV2Schema.parse(unknownNested)).toThrow();
  });

  it("binds wind status to known wind values and their ranges", () => {
    const cases = [
      {
        ...request(),
        yakuContext: {
          ...request().yakuContext,
          windsStatus: "known",
          roundWindTile34: null,
        },
      },
      {
        ...request(),
        yakuContext: {
          ...request().yakuContext,
          windsStatus: "unknown",
        },
      },
      {
        ...request(),
        yakuContext: {
          ...request().yakuContext,
          windsStatus: "unknown",
          roundWindTile34: null,
          selfWindTile34: 28,
        },
      },
      {
        ...request(),
        yakuContext: {
          ...request().yakuContext,
          roundWindTile34: 30,
        },
      },
      {
        ...request(),
        yakuContext: {
          ...request().yakuContext,
          selfWindTile34: 31,
        },
      },
    ];
    for (const invalid of cases) {
      expect(HandStructureRequestV2Schema.safeParse(invalid).success).toBe(false);
    }

    const unknown = request();
    unknown.yakuContext = {
      ...unknown.yakuContext,
      windsStatus: "unknown",
      roundWindTile34: null,
      selfWindTile34: null,
    };
    expect(HandStructureRequestV2Schema.parse(unknown).yakuContext.windsStatus)
      .toBe("unknown");
  });

  it("accepts every explicit open-tanyao state", () => {
    for (const openTanyaoStatus of ["enabled", "disabled", "unknown"] as const) {
      const candidate = request();
      candidate.yakuContext.openTanyaoStatus = openTanyaoStatus;
      expect(HandStructureRequestV2Schema.parse(candidate).yakuContext.openTanyaoStatus)
        .toBe(openTanyaoStatus);
    }
  });

  it("rejects unknown riichi and open-tanyao status values", () => {
    const badRiichi = request() as unknown as {
      yakuContext: Record<string, unknown>;
    };
    badRiichi.yakuContext.riichiStatus = "declared";
    expect(HandStructureRequestV2Schema.safeParse(badRiichi).success).toBe(false);

    const badOpenTanyao = request() as unknown as {
      yakuContext: Record<string, unknown>;
    };
    badOpenTanyao.yakuContext.openTanyaoStatus = "optional";
    expect(HandStructureRequestV2Schema.safeParse(badOpenTanyao).success).toBe(false);
  });

  it("rejects accepted riichi with open melds but permits ankan", () => {
    const concealed = [...zeroes];
    [3, 4, 5, 9, 10, 11, 18, 19, 20, 31].forEach((tile) => {
      concealed[tile] = concealed[tile]! + 1;
    });
    for (const meld of [
      { kind: "chi" as const, tiles34: [0, 1, 2] },
      { kind: "pon" as const, tiles34: [27, 27, 27] },
      { kind: "daiminkan" as const, tiles34: [27, 27, 27, 27] },
      { kind: "kakan" as const, tiles34: [27, 27, 27, 27] },
    ]) {
      const open = request();
      open.handTiles34 = concealed;
      open.melds = [meld];
      open.yakuContext.riichiStatus = "accepted";
      expect(HandStructureRequestV2Schema.safeParse(open).success).toBe(false);
    }

    const closedKan = request();
    closedKan.handTiles34 = concealed;
    closedKan.melds = [{ kind: "ankan", tiles34: [27, 27, 27, 27] }];
    closedKan.yakuContext.riichiStatus = "accepted";
    expect(HandStructureRequestV2Schema.safeParse(closedKan).success).toBe(true);
  });

  it("uses precise ron-context variants and rejects the ambiguous legacy value", () => {
    for (const ronContext of [
      "complete_none",
      "known_kakan_chankan",
      "known_ankan_chankan",
      "known_houtei",
      "unknown_future",
    ] as const) {
      expect(HandStructureRequestV2Schema.parse({ ...request(), ronContext }).ronContext)
        .toBe(ronContext);
    }
    expect(HandStructureRequestV2Schema.safeParse({
      ...request(),
      ronContext: "known_chankan",
    }).success).toBe(false);
  });

  it("requires family order and exact best-family minima", () => {
    expect(HandStructureResultV2Schema.parse(result()).bestFamilies)
      .toEqual(["standard"]);
    const reversed = result();
    reversed.families = [
      reversed.families[2],
      reversed.families[1],
      reversed.families[0],
    ];
    expect(() => HandStructureResultV2Schema.parse(reversed)).toThrow();
    const falseBest = result();
    falseBest.bestFamilies = ["chiitoitsu"];
    expect(() => HandStructureResultV2Schema.parse(falseBest)).toThrow();
  });

  it("rejects wrong concealed counts, unsorted waits and false truncation", () => {
    const open = request();
    open.melds = [{ kind: "pon", tiles34: [31, 31, 31] }];
    expect(HandStructureRequestV2Schema.safeParse(open).success).toBe(false);
    const unsorted = result();
    unsorted.waits = [
      { ...unsorted.waits[0]!, tile34: 26 },
      { ...unsorted.waits[0]!, tile34: 23 },
    ];
    expect(() => HandStructureResultV2Schema.parse(unsorted)).toThrow();
    const falseTruncation = result();
    falseTruncation.decompositions.truncated = true;
    expect(() => HandStructureResultV2Schema.parse(falseTruncation)).toThrow();
  });

  it("rejects physical-left contradictions and malformed shape groups", () => {
    const impossibleLeft = request();
    impossibleLeft.visibleCountsComplete = true;
    impossibleLeft.leftTiles34 = [...zeroes];
    impossibleLeft.leftTiles34[27] = 3;
    expect(() => HandStructureRequestV2Schema.parse(impossibleLeft)).toThrow();

    const malformed = result();
    malformed.decompositions.items[0]!.groups[0] = {
      kind: "sequence",
      tiles34: [0, 1, 3],
    };
    expect(() => HandStructureResultV2Schema.parse(malformed)).toThrow();
  });

  it("binds blocked payloads and every decomposition reference", () => {
    const blocked = result();
    blocked.decompositions.status = "blocked_engine_failure";
    expect(() => HandStructureResultV2Schema.parse(blocked)).toThrow();

    const impossibleCount = result();
    impossibleCount.decompositions.totalNonDominated = 0;
    expect(() => HandStructureResultV2Schema.parse(impossibleCount)).toThrow();

    const danglingAlternative = result();
    danglingAlternative.decompositions.alternativeClaims = [{
      kind: "floating",
      tiles34: [8],
      decompositionRefs: ["standard:missing"],
    }];
    expect(() => HandStructureResultV2Schema.parse(danglingAlternative)).toThrow();

    const danglingWait = result();
    danglingWait.waits[0]!.decompositionRefs = ["standard:missing"];
    expect(() => HandStructureResultV2Schema.parse(danglingWait)).toThrow();
  });

  it("requires wait/family/diagnostic semantics to agree", () => {
    const notTenpai = result();
    notTenpai.families[0].shanten = 1;
    notTenpai.overallShanten = 1;
    expect(() => HandStructureResultV2Schema.parse(notTenpai)).toThrow();

    const duplicateWaitFamily = result();
    duplicateWaitFamily.waits[0]!.families = ["standard", "standard"];
    expect(() => HandStructureResultV2Schema.parse(duplicateWaitFamily)).toThrow();

    const missingDiagnostic = result();
    missingDiagnostic.waits[0]!.baseRonEligibility =
      "unknown_missing_situational_yaku_context";
    missingDiagnostic.diagnostics = [];
    expect(() => HandStructureResultV2Schema.parse(missingDiagnostic)).toThrow();

    const strayDiagnostic = result();
    strayDiagnostic.waits[0]!.baseRonEligibility = "eligible";
    strayDiagnostic.diagnostics = [
      "ron_eligibility_missing_situational_context",
    ];
    expect(() => HandStructureResultV2Schema.parse(strayDiagnostic)).toThrow();
  });
});
