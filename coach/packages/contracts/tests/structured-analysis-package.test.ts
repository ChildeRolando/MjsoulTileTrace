import { describe, expect, it } from "vitest";
import {
  FACT_ENGINE_ADAPTER_VERSION,
  FACT_ENGINE_PROTOCOL_VERSION,
  MAHJONG_HELPER_COMMIT,
  AnalysisProviderSchema,
  ComponentVersionsSchema,
  DecisionAnalysisSchema,
  DecisionIdSchema,
  DecisionWindowKindSchema,
  EvidenceRecordSchema,
  EvidenceRegistrySchema,
  MortalAnalysisProviderSchema,
  MortalBindingMismatchReasonSchema,
  MortalDecisionOutcomeSchema,
  MortalDecisionReasonSchema,
  NormalizedDecisionContextSchema,
  RecordAnalysisSchema,
  SingleCandidateProofSchema,
  StructuredAnalysisPackageSchema,
  canonicalActionRef,
  type RiichiAction,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Minimal valid fixtures (all payload components are themselves validated by
// their own contract schemas).
// ---------------------------------------------------------------------------

const CANONICAL_EVENT_REF = "game-1/0/0/58";
// Production-shaped fact-engine request id (<factSetId>:hand-structure:<hash>);
// the contract must NOT force a namespace rename on existing evidence.
const FACT_ENGINE_REQUEST_ID = "facts:e1:t6:hand-structure:abc";

const DISCARD_6S: RiichiAction = {
  kind: "discard",
  tile: { id: "6s", red: false },
  discardMode: "tsumogiri",
};
const DISCARD_2P: RiichiAction = {
  kind: "discard",
  tile: { id: "2p", red: false },
  discardMode: "tedashi",
};
const REF_6S = canonicalActionRef(DISCARD_6S);
const REF_2P = canonicalActionRef(DISCARD_2P);

function baseFacts() {
  return {
    factSetId: "facts:e1:t6",
    provenance: "raw_replay",
    actor: 3,
    selfRiichi: false,
    decisionEventRef: CANONICAL_EVENT_REF,
    decisionWindow: {
      kind: "self_turn",
      actor: 3,
      triggerEventRef: CANONICAL_EVENT_REF,
    },
    concealedTiles: [
      { id: "1m", red: false },
      { id: "5p", red: true },
    ],
    currentDraw: { tile: { id: "6s", red: false }, eventRef: CANONICAL_EVENT_REF },
    melds: [],
    doraIndicators: [{ id: "1m", red: false }],
    rivers: [[], [], [], []],
    threats: [],
    defenseThreats: [],
    roundWind: "E",
    seatWind: "N",
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
    evidenceIds: [CANONICAL_EVENT_REF],
  };
}

const mortalEvaluation = {
  evaluationId: "evaluation:mortal:e1:t6",
  comparisonSetId: "comparison:e1:t6",
  decisionLayerRef: "decision-layer:e1:t6",
  engineId: "mortal",
  engineVersion: "4.1b",
  adapterVersion: "mortal-score@1",
  scoreMethod: "mortal_probability_x100",
  detailPolicy: {
    threshold: 10,
    unit: "model_selection_score_points",
    boundary: "greater_than_or_equal_is_detailed",
    policyVersion: "detail-policy@1",
    frozenAt: "2026-07-30T00:00:00.000Z",
  },
  candidates: [
    {
      actionRef: REF_6S,
      rawValues: [
        { metric: "probability", value: 0.75 },
        { metric: "q_value", value: 1.2 },
      ],
      modelSelectionScore: 75,
    },
    {
      actionRef: REF_2P,
      rawValues: [
        { metric: "probability", value: 0.25 },
        { metric: "q_value", value: 0.4 },
      ],
      modelSelectionScore: 25,
    },
  ],
  preferredActions: [REF_6S],
  actualActionRef: REF_2P,
  scoredActualModelActionRef: REF_2P,
  errorGap: 50,
  modelReason: "unknown",
};

// The action-bound comparison set preserves actionRef → RiichiAction semantics
// and the actual ↔ model realization correspondence that ModelEvaluation alone
// cannot express.
const comparisonSet = {
  comparisonSetId: "comparison:e1:t6",
  origin: "automatic_review",
  decisionLayerRef: "decision-layer:e1:t6",
  decisionWindow: {
    kind: "self_turn",
    actor: 3,
    triggerEventRef: CANONICAL_EVENT_REF,
  },
  candidates: [
    { actionRef: REF_6S, action: DISCARD_6S, origins: ["model"] },
    { actionRef: REF_2P, action: DISCARD_2P, origins: ["model", "actual"] },
  ],
};

function ledger(actionRef: string) {
  return {
    actionRef,
    projectedStateRef: `state:${actionRef}`,
    axes: [
      {
        axis: "efficiency",
        status: "calculated",
        facts: [{
          factorKey: "efficiency.shanten",
          dimension: "shanten",
          status: "calculated",
          evidenceClass: "deterministic_local_replay",
          preferenceEligibility: "deterministic",
          value: { kind: "number", value: 1, unit: "shanten" },
          evidenceIds: [FACT_ENGINE_REQUEST_ID],
          limitations: [],
        }],
      },
      { axis: "value", status: "unsupported_dimension", facts: [] },
      { axis: "defense", status: "unsupported_dimension", facts: [] },
      { axis: "placement", status: "unsupported_dimension", facts: [] },
      { axis: "option_value", status: "unsupported_dimension", facts: [] },
    ],
    diagnostics: [],
  };
}

const factorDifference = {
  differenceId: "diff:1",
  axis: "efficiency",
  dimension: "shanten",
  leftActionRef: REF_6S,
  rightActionRef: REF_2P,
  kind: "deterministic_difference",
  direction: "supports_left",
  valueRelation: "ordered",
  leftValue: { kind: "number", value: 1, unit: "shanten" },
  rightValue: { kind: "number", value: 2, unit: "shanten" },
  evidenceIds: [FACT_ENGINE_REQUEST_ID],
  limitations: [],
  preferenceEligibility: "deterministic",
  evidenceClass: "deterministic_local_replay",
};

function analysisReadyDecision() {
  return {
    decisionId: `${CANONICAL_EVENT_REF}#self#self_turn`,
    surface: "self",
    roundOrdinal: 0,
    normalizedDecisionContext: {
      decisionWindowKind: "self_turn",
      selfActor: 3,
      triggerEventRef: CANONICAL_EVENT_REF,
      actualAction: DISCARD_2P,
    },
    knownGameFacts: baseFacts(),
    analysisProvider: { kind: "mortal", outcome: "analysis_ready", reason: null },
    outcome: "analysis_ready",
    comparisonSet,
    candidateFactorLedgers: [ledger(REF_6S), ledger(REF_2P)],
    factorDifferences: [factorDifference],
    deterministicPreference: null,
    modelEvaluation: mortalEvaluation,
    evidenceIds: [CANONICAL_EVENT_REF, FACT_ENGINE_REQUEST_ID],
  };
}

function validPackage() {
  return {
    analysisKey: "analysis:game-1:actor3:mortal",
    packageId: "package:game-1:actor3:mortal:m6c/v1",
    createdAt: "2026-08-19T00:00:00.000Z",
    semanticContentHash: "sha256:0123456789abcdef",
    record: { recordId: "game-1", selfActor: 3, status: "complete" },
    componentVersions: {
      packageSchema: "m6c/v1",
      canonicalReplay: "canonical-riichi-events/v2",
      mapperAdapter: "mahjong-soul-mapper/1",
      factEngine: {
        engine: "mahjong-helper",
        upstreamCommit: MAHJONG_HELPER_COMMIT,
        adapterVersion: FACT_ENGINE_ADAPTER_VERSION,
        protocolVersion: FACT_ENGINE_PROTOCOL_VERSION,
      },
      factorPipeline: "factor-pipeline/v1",
      mortalSourceModel: {
        identity: "Mortal",
        version: "mortal-source/2",
        modelTag: "2026-07",
      },
    },
    decisions: [analysisReadyDecision()],
    evidenceRegistry: {
      [CANONICAL_EVENT_REF]: {
        evidenceId: CANONICAL_EVENT_REF,
        kind: "canonical_event",
        producer: "canonical-replay",
        producerVersion: "canonical-riichi-events/v2",
        sourceRefs: [],
        payload: { type: "draw", actor: 3 },
      },
      [FACT_ENGINE_REQUEST_ID]: {
        evidenceId: FACT_ENGINE_REQUEST_ID,
        kind: "fact_engine_request",
        producer: "fact-engine",
        producerVersion: FACT_ENGINE_PROTOCOL_VERSION,
        sourceRefs: [CANONICAL_EVENT_REF],
        payload: { requestId: FACT_ENGINE_REQUEST_ID, actionRef: REF_6S },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// CR-2 — outcome / reason / proof schema
// ---------------------------------------------------------------------------

describe("M6-C Slice 1 outcome contract", () => {
  it("freezes the seven-value Mortal outcome without reduction", () => {
    const seven = [
      "analysis_ready",
      "unsupported_action",
      "source_row_not_expected",
      "no_mortal_entry",
      "binding_mismatch",
      "model_output_incomplete",
      "analysis_blocked",
    ] as const;
    for (const outcome of seven) {
      expect(MortalDecisionOutcomeSchema.parse(outcome)).toBe(outcome);
    }
    expect(MortalDecisionOutcomeSchema.options).toHaveLength(7);
    expect(() => MortalDecisionOutcomeSchema.parse("partial_analysis")).toThrow();
  });

  it("parses every reason union member as a MortalDecisionReason", () => {
    const reasons = [
      ...MortalBindingMismatchReasonSchema.options,
      "local_actual_not_represented",
      "mortal_candidate_action_not_supported",
      "coverage_branch_uncovered",
      "actual_action_not_scored",
      "duplicate_model_action",
      "invalid_model_candidate",
      "fewer_than_two_distinct_actions",
      "cross_decision_window",
      "candidate_normalization_failed",
      "terminal_window_action_unsupported",
      "fact_engine_failure",
      "structured_analysis_assembly_failure",
    ] as const;
    for (const reason of reasons) {
      expect(MortalDecisionReasonSchema.parse(reason)).toBe(reason);
    }
    expect(() => MortalDecisionReasonSchema.parse("unknown_reason")).toThrow();
  });

  it("accepts exactly the frozen single-candidate proof shapes", () => {
    expect(SingleCandidateProofSchema.parse({
      shape: "riichi_accepted_forced_tsumogiri",
      candidateCount: 1,
    })).toEqual({ shape: "riichi_accepted_forced_tsumogiri", candidateCount: 1 });
    expect(SingleCandidateProofSchema.parse({
      shape: "response_single_candidate",
      candidateCount: 1,
    })).toEqual({ shape: "response_single_candidate", candidateCount: 1 });
    expect(() => SingleCandidateProofSchema.parse({
      shape: "riichi_accepted_forced_tsumogiri",
      candidateCount: 2,
    })).toThrow();
    expect(() => SingleCandidateProofSchema.parse({
      shape: "guessed_single_candidate",
      candidateCount: 1,
    })).toThrow();
  });

  it("keeps the provider-scoped outcome discriminated and akagi-extensible", () => {
    expect(AnalysisProviderSchema.parse({
      kind: "mortal",
      outcome: "analysis_ready",
      reason: null,
    })).toEqual({ kind: "mortal", outcome: "analysis_ready", reason: null });
    // The extension point is the discriminated `kind`: a future "akagi"
    // variant is additive, and anything else fails closed today.
    expect(() => AnalysisProviderSchema.parse({
      kind: "akagi",
      outcome: "analysis_ready",
      reason: null,
    })).toThrow();
    // The Mortal provider itself must express all seven outcomes.
    for (const outcome of MortalDecisionOutcomeSchema.options) {
      expect(MortalAnalysisProviderSchema.parse({
        kind: "mortal",
        outcome,
        reason: null,
      }).outcome).toBe(outcome);
    }
  });
});

// ---------------------------------------------------------------------------
// DecisionAnalysis — provider-scoped outcome + type-level payload binding
// ---------------------------------------------------------------------------

describe("DecisionAnalysis payload binding", () => {
  it("parses a minimal valid analysis_ready decision", () => {
    const parsed = DecisionAnalysisSchema.parse(analysisReadyDecision());
    expect(parsed.outcome).toBe("analysis_ready");
    if (parsed.outcome !== "analysis_ready") {
      throw new Error("expected an analysis_ready decision");
    }
    expect(parsed.analysisProvider.outcome).toBe("analysis_ready");
    expect(parsed.modelEvaluation.errorGap).toBe(50);
    expect(parsed.candidateFactorLedgers).toHaveLength(2);
  });

  it("preserves the action-bound comparison set and its actual (Blocker 1)", () => {
    const parsed = DecisionAnalysisSchema.parse(analysisReadyDecision());
    if (parsed.outcome !== "analysis_ready") {
      throw new Error("expected an analysis_ready decision");
    }
    expect(parsed.comparisonSet.comparisonSetId).toBe("comparison:e1:t6");
    const actual = parsed.comparisonSet.candidates.find(
      (candidate) => candidate.origins.includes("actual"),
    );
    if (actual === undefined || actual.action.kind !== "discard") {
      throw new Error("expected the discard actual in the comparison set");
    }
    expect(actual.action.tile.id).toBe("2p");
    expect(actual.actionRef).toBe(REF_2P);
  });

  it("rejects an analysis_ready decision carrying a failure reason", () => {
    expect(() => DecisionAnalysisSchema.parse({
      ...analysisReadyDecision(),
      analysisProvider: {
        kind: "mortal",
        outcome: "analysis_ready",
        reason: "mortal_actual_mismatch",
      },
    })).toThrow(/cannot carry a failure reason/);
  });

  it("rejects an analysis_ready decision missing its analysis payload", () => {
    const { modelEvaluation: _omitted, ...withoutEvaluation } = analysisReadyDecision();
    expect(() => DecisionAnalysisSchema.parse(withoutEvaluation)).toThrow();
    const { comparisonSet: _omittedSet, ...withoutComparisonSet } = analysisReadyDecision();
    expect(() => DecisionAnalysisSchema.parse(withoutComparisonSet)).toThrow();
  });

  it("rejects a failed decision that fakes an analyzed shape", () => {
    expect(() => DecisionAnalysisSchema.parse({
      ...analysisReadyDecision(),
      outcome: "no_mortal_entry",
      analysisProvider: { kind: "mortal", outcome: "no_mortal_entry", reason: null },
    })).toThrow(/Unrecognized key/);
  });

  it("parses a minimal valid failure decision without analysis payload", () => {
    const parsed = DecisionAnalysisSchema.parse({
      decisionId: `${CANONICAL_EVENT_REF}#self#self_turn`,
      surface: "self",
      roundOrdinal: 1,
      normalizedDecisionContext: {
        decisionWindowKind: "self_turn",
        selfActor: 3,
        triggerEventRef: CANONICAL_EVENT_REF,
        actualAction: null,
      },
      knownGameFacts: baseFacts(),
      analysisProvider: { kind: "mortal", outcome: "no_mortal_entry", reason: null },
      outcome: "no_mortal_entry",
    });
    expect(parsed.outcome).toBe("no_mortal_entry");
    expect("modelEvaluation" in parsed).toBe(false);
  });

  it("requires the single-candidate proof for source_row_not_expected", () => {
    expect(() => DecisionAnalysisSchema.parse({
      decisionId: `${CANONICAL_EVENT_REF}#self#self_turn`,
      surface: "self",
      roundOrdinal: 2,
      normalizedDecisionContext: {
        decisionWindowKind: "self_turn",
        selfActor: 3,
        triggerEventRef: CANONICAL_EVENT_REF,
        actualAction: null,
      },
      knownGameFacts: baseFacts(),
      analysisProvider: { kind: "mortal", outcome: "source_row_not_expected", reason: null },
      outcome: "source_row_not_expected",
    })).toThrow(/require a single-candidate proof/);

    expect(DecisionAnalysisSchema.parse({
      decisionId: `${CANONICAL_EVENT_REF}#self#self_turn`,
      surface: "self",
      roundOrdinal: 2,
      normalizedDecisionContext: {
        decisionWindowKind: "self_turn",
        selfActor: 3,
        triggerEventRef: CANONICAL_EVENT_REF,
        actualAction: null,
      },
      knownGameFacts: baseFacts(),
      analysisProvider: {
        kind: "mortal",
        outcome: "source_row_not_expected",
        reason: null,
        singleCandidateProof: {
          shape: "riichi_accepted_forced_tsumogiri",
          candidateCount: 1,
        },
      },
      outcome: "source_row_not_expected",
    }).outcome).toBe("source_row_not_expected");
  });

  it("binds the reason category to the failure outcome", () => {
    const base = {
      decisionId: `${CANONICAL_EVENT_REF}#self#self_turn`,
      surface: "self",
      roundOrdinal: 3,
      normalizedDecisionContext: {
        decisionWindowKind: "self_turn",
        selfActor: 3,
        triggerEventRef: CANONICAL_EVENT_REF,
        actualAction: null,
      },
      knownGameFacts: baseFacts(),
      outcome: "unsupported_action",
    };
    expect(() => DecisionAnalysisSchema.parse({
      ...base,
      analysisProvider: {
        kind: "mortal",
        outcome: "unsupported_action",
        reason: null,
      },
    })).toThrow(/require a reason/);
    expect(() => DecisionAnalysisSchema.parse({
      ...base,
      analysisProvider: {
        kind: "mortal",
        outcome: "unsupported_action",
        reason: "mortal_actual_mismatch",
      },
    })).toThrow(/does not match/);
    expect(DecisionAnalysisSchema.parse({
      ...base,
      analysisProvider: {
        kind: "mortal",
        outcome: "unsupported_action",
        reason: "coverage_branch_uncovered",
      },
    }).outcome).toBe("unsupported_action");
  });

  it("rejects a provider-scoped outcome that contradicts the decision outcome", () => {
    expect(() => DecisionAnalysisSchema.parse({
      ...analysisReadyDecision(),
      analysisProvider: { kind: "mortal", outcome: "no_mortal_entry", reason: null },
    })).toThrow(/must equal the decision outcome/);
  });

  it("binds the normalized context, KnownGameFacts, and surface together (Blocker 3B)", () => {
    const decision = analysisReadyDecision();
    const context = decision.normalizedDecisionContext;
    expect(() => DecisionAnalysisSchema.parse({
      ...decision,
      normalizedDecisionContext: { ...context, selfActor: 2 },
    })).toThrow(/self actor must equal/);
    expect(() => DecisionAnalysisSchema.parse({
      ...decision,
      normalizedDecisionContext: { ...context, triggerEventRef: "game-1/0/0/99" },
    })).toThrow(/trigger event must equal/);
    expect(() => DecisionAnalysisSchema.parse({
      ...decision,
      normalizedDecisionContext: { ...context, decisionWindowKind: "post_call_discard" },
    })).toThrow(/window kind must equal/);
    expect(() => DecisionAnalysisSchema.parse({
      ...decision,
      surface: "response",
    })).toThrow(/Surface must be inferred/);
    // A response window kind infers the response surface.
    const responseFacts = baseFacts();
    const responseWindow = {
      kind: "discard_response",
      actor: 3,
      triggerEventRef: CANONICAL_EVENT_REF,
      sourceActor: 0,
      offeredTile: { id: "4m", red: false },
    };
    expect(DecisionAnalysisSchema.parse({
      ...decision,
      surface: "response",
      normalizedDecisionContext: { ...context, decisionWindowKind: "discard_response" },
      knownGameFacts: {
        ...responseFacts,
        decisionWindow: responseWindow,
      },
    }).surface).toBe("response");
  });

  it("freezes the decision identity semantics (CR-4)", () => {
    expect(() => DecisionIdSchema.parse("")).toThrow();
    expect(DecisionIdSchema.parse("game-1/0/0/58#self#self_turn")).toBe(
      "game-1/0/0/58#self#self_turn",
    );
    expect(DecisionWindowKindSchema.options).toEqual([
      "self_turn",
      "discard_response",
      "kan_response",
      "post_call_discard",
      "post_riichi_discard",
    ]);
    expect(() => NormalizedDecisionContextSchema.parse({
      decisionWindowKind: "self_turn",
      selfActor: 4,
      triggerEventRef: CANONICAL_EVENT_REF,
      actualAction: null,
    })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// CR-3 — evidence registry
// ---------------------------------------------------------------------------

describe("evidence registry (CR-3)", () => {
  it("keeps canonical-event evidence in the canonical event ref namespace", () => {
    expect(() => EvidenceRecordSchema.parse({
      evidenceId: "event-58",
      kind: "canonical_event",
      producer: "canonical-replay",
      producerVersion: "v2",
      sourceRefs: [],
      payload: { type: "draw" },
    })).toThrow(/canonical event ref namespace/);
    expect(EvidenceRecordSchema.parse({
      evidenceId: CANONICAL_EVENT_REF,
      kind: "canonical_event",
      producer: "canonical-replay",
      producerVersion: "v2",
      sourceRefs: [],
      payload: { type: "draw", actor: 3 },
    }).kind).toBe("canonical_event");
  });

  it("accepts production fact-engine request IDs without a forced namespace (Blocker 2)", () => {
    expect(EvidenceRecordSchema.parse({
      evidenceId: FACT_ENGINE_REQUEST_ID,
      kind: "fact_engine_request",
      producer: "fact-engine",
      producerVersion: FACT_ENGINE_PROTOCOL_VERSION,
      sourceRefs: [CANONICAL_EVENT_REF],
      payload: { requestId: FACT_ENGINE_REQUEST_ID, actionRef: REF_6S },
    }).evidenceId).toBe(FACT_ENGINE_REQUEST_ID);
  });

  it("rejects incomplete evidence records", () => {
    expect(() => EvidenceRecordSchema.parse({
      evidenceId: FACT_ENGINE_REQUEST_ID,
      kind: "fact_engine_request",
      producer: "fact-engine",
      sourceRefs: [],
      payload: {},
    })).toThrow();
    expect(() => EvidenceRecordSchema.parse({
      evidenceId: "",
      kind: "fact_engine_request",
      producer: "fact-engine",
      producerVersion: "v1",
      sourceRefs: [],
      payload: {},
    })).toThrow();
  });

  it("requires registry keys to equal their record evidenceId", () => {
    expect(() => EvidenceRegistrySchema.parse({
      [FACT_ENGINE_REQUEST_ID]: {
        evidenceId: "facts:e1:t6:hand-structure:other",
        kind: "fact_engine_request",
        producer: "fact-engine",
        producerVersion: "v1",
        sourceRefs: [],
        payload: {},
      },
    })).toThrow(/must equal/);
  });
});

// ---------------------------------------------------------------------------
// RecordAnalysis / ComponentVersions / package (CR-5/CR-6, 3A/3B)
// ---------------------------------------------------------------------------

describe("record, versions, and package contract", () => {
  it("marks the aggregate analysis status faithfully (CR-6)", () => {
    expect(RecordAnalysisSchema.parse({
      recordId: "game-1",
      selfActor: 3,
      status: "degraded",
    }).status).toBe("degraded");
    expect(() => RecordAnalysisSchema.parse({
      recordId: "game-1",
      selfActor: 3,
      status: "succeeded",
    })).toThrow();
  });

  it("requires non-empty deterministic producer versions (D4)", () => {
    expect(ComponentVersionsSchema.parse({
      packageSchema: "m6c/v1",
      canonicalReplay: "canonical-riichi-events/v2",
      factEngine: {
        engine: "mahjong-helper",
        upstreamCommit: MAHJONG_HELPER_COMMIT,
        adapterVersion: FACT_ENGINE_ADAPTER_VERSION,
        protocolVersion: FACT_ENGINE_PROTOCOL_VERSION,
      },
      factorPipeline: "factor-pipeline/v1",
      mortalSourceModel: {
        identity: "Mortal",
        version: "mortal-source/2",
        modelTag: "2026-07",
      },
    })).toBeDefined();
    expect(() => ComponentVersionsSchema.parse({
      packageSchema: "",
      canonicalReplay: "canonical-riichi-events/v2",
      factEngine: {
        engine: "mahjong-helper",
        upstreamCommit: MAHJONG_HELPER_COMMIT,
        adapterVersion: FACT_ENGINE_ADAPTER_VERSION,
        protocolVersion: FACT_ENGINE_PROTOCOL_VERSION,
      },
      factorPipeline: "factor-pipeline/v1",
      mortalSourceModel: {
        identity: "Mortal",
        version: "mortal-source/2",
        modelTag: "2026-07",
      },
    })).toThrow();
  });

  it("parses a minimal valid whole-game package", () => {
    const parsed = StructuredAnalysisPackageSchema.parse(validPackage());
    expect(parsed.analysisKey).toBe("analysis:game-1:actor3:mortal");
    expect(parsed.packageId).toBe("package:game-1:actor3:mortal:m6c/v1");
    expect(parsed.decisions).toHaveLength(1);
    expect(Object.keys(parsed.evidenceRegistry)).toHaveLength(2);
  });

  it("rejects structurally invalid packages", () => {
    expect(() => StructuredAnalysisPackageSchema.parse({
      ...validPackage(),
      decisions: [],
    })).toThrow();
    expect(() => StructuredAnalysisPackageSchema.parse({
      ...validPackage(),
      analysisKey: "",
    })).toThrow();
    expect(() => StructuredAnalysisPackageSchema.parse({
      ...validPackage(),
      createdAt: "not-a-timestamp",
    })).toThrow();
    expect(() => StructuredAnalysisPackageSchema.parse({
      ...validPackage(),
      semanticContentHash: "",
    })).toThrow();
  });

  it("enforces package-level identity coherence (Blocker 3B)", () => {
    const pkg = validPackage();
    expect(() => StructuredAnalysisPackageSchema.parse({
      ...pkg,
      decisions: [analysisReadyDecision(), analysisReadyDecision()],
    })).toThrow(/globally unique/);
    expect(() => StructuredAnalysisPackageSchema.parse({
      ...pkg,
      record: { ...pkg.record, selfActor: 2 },
    })).toThrow(/known self actor must equal the record/);
  });
});
