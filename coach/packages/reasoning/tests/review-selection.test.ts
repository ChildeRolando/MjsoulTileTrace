/**
 * DeterministicReviewSelector — Slice 2: selector behavior tests.
 *
 * Spec Testing Decisions (Slice 2 — selector behavior tests). All fixtures are
 * validator-clean: each scenario package is derived from the real whole-game
 * review seam (fixtures/structured-review.ts) and must pass
 * `validateStructuredAnalysisPackage` before the selector runs (测试 fixture
 * 必须通过同一个生产 schema / validator，避免测试自造宽松协议).
 *
 * Covered behaviors (spec list):
 *  - 候选池: only analysis_ready; no_mortal_entry / unsupported_action /
 *    source_row_not_expected never appear in `selected`;
 *  - degraded / integrity_failed passthrough (analysisPackageStatus);
 *  - 多 preferred: actual hitting ANY preferred → no disagreement;
 *  - realization 等价 (riichi_discard → declare_riichi) → no disagreement;
 *  - threshold boundary: errorGap < T / = T / > T;
 *  - reason branches: distinguishable / no distinguishable / heuristic-only;
 *  - sorting (errorGap desc, conflict tiebreak, decisionId asc) and cap N=10;
 *  - determinism (repeat, decision-order permutation, createdAt/frozenAt);
 *  - fail closed on schema-invalid input.
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  SELECTOR_POLICY_V1,
  canonicalActionRef,
  type ActionRef,
  type AnalysisReadyDecision,
  type CandidateFactorLedger,
  type DecisionAnalysis,
  type DeterministicPreference,
  type FactorDifference,
  type RiichiAction,
  type StructuredAnalysisPackage,
} from "@riichi-coach/contracts";
import {
  buildStructuredAnalysisPackage,
} from "../src/analysis/structured-analysis-package-builder.js";
import {
  deriveDecisionId,
  deriveRecordStatus,
  deriveSemanticContentHash,
} from "../src/analysis/package-identity.js";
import {
  validateStructuredAnalysisPackage,
} from "../src/validate/structured-package-validator.js";
import { selectReviewDecisions, computePreferenceAgreement } from "../src/index.js";
import {
  componentVersions,
  entryFor,
  FROZEN_NOW,
  fixtureSetup,
  runFixtureReview,
} from "./fixtures/structured-review.js";

const RECORD_ID = "game:fixture";
const SELF_ACTOR = 0;
const SELF_TURN_WINDOW = "self_turn";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function buildTemplatePackage(): Promise<StructuredAnalysisPackage> {
  const { stream, decisions } = fixtureSetup();
  const review = await runFixtureReview(stream, decisions, [
    entryFor(decisions[0]!),
  ]);
  const retained = review.retainedAnalyses[0]!;
  return buildStructuredAnalysisPackage({
    review,
    stream,
    decisions,
    componentVersions,
    frozenPolicySnapshot: retained.modelEvaluation.detailPolicy,
    now: () => FROZEN_NOW,
  });
}

/** The template package (built once per test through the real seam). */
let templatePkg: StructuredAnalysisPackage;

beforeEach(async () => {
  templatePkg = await buildTemplatePackage();
});

function templateReady(): AnalysisReadyDecision {
  const decision = templatePkg.decisions[0]!;
  if (decision.outcome !== "analysis_ready") {
    throw new Error("template package decision must be analysis_ready");
  }
  return decision;
}

/** The base candidate refs of the template window: the actual discard and the
 *  other model candidate. */
function baseRefs(): { actualRef: ActionRef; otherRef: ActionRef } {
  const candidates = templateReady().comparisonSet.candidates;
  const actual = candidates.find((candidate) =>
    candidate.origins.includes("actual"),
  );
  const other = candidates.find((candidate) =>
    !candidate.origins.includes("actual"),
  );
  if (actual === undefined || other === undefined) {
    throw new Error("template comparison set must carry an actual and an other");
  }
  return { actualRef: actual.actionRef, otherRef: other.actionRef };
}

/** A registered fact-engine request evidence id (difference evidence refs must
 *  resolve into the registry). */
function factEngineRequestId(): string {
  const key = Object.keys(templatePkg.evidenceRegistry).find((candidate) =>
    templatePkg.evidenceRegistry[candidate]!.kind === "fact_engine_request",
  );
  if (key === undefined) {
    throw new Error("template package must carry a fact-engine request record");
  }
  return key;
}

function refForTrigger(triggerEventRef: string): string {
  return deriveDecisionId({
    recordId: RECORD_ID,
    selfActor: SELF_ACTOR,
    surface: "self",
    windowKind: SELF_TURN_WINDOW,
    triggerEventRef,
  });
}

type ReadySpec = {
  triggerEventRef: string;
  roundOrdinal: number;
  /** Candidate model-universe scores (probability; score = probability * 100). */
  scores: Array<{ actionRef: ActionRef; probability: number }>;
  actualActionRef: ActionRef;
  /** The scored actual-model carrier; defaults to `actualActionRef` (no
   *  correspondence). Pass the correspondence's scored ref for realization. */
  scoredActualActionRef?: ActionRef;
  factorDifferences?: FactorDifference[];
  deterministicPreference?: DeterministicPreference | null;
};

/** A scenario-ready `analysis_ready` decision cloned from the template with a
 *  fresh decision identity and a fully controlled evaluation. */
function makeReadyDecision(spec: ReadySpec): AnalysisReadyDecision {
  const decision = clone(templateReady());
  decision.decisionId = refForTrigger(spec.triggerEventRef);
  decision.roundOrdinal = spec.roundOrdinal;
  decision.normalizedDecisionContext.triggerEventRef = spec.triggerEventRef;
  decision.knownGameFacts.decisionEventRef = spec.triggerEventRef;
  decision.knownGameFacts.decisionWindow = {
    ...decision.knownGameFacts.decisionWindow,
    triggerEventRef: spec.triggerEventRef,
  };
  if (decision.knownGameFacts.currentDraw !== null) {
    decision.knownGameFacts.currentDraw = {
      ...decision.knownGameFacts.currentDraw,
      eventRef: spec.triggerEventRef,
    };
  }
  decision.comparisonSet = {
    ...decision.comparisonSet,
    decisionWindow: {
      ...decision.comparisonSet.decisionWindow,
      triggerEventRef: spec.triggerEventRef,
    },
  };
  const evaluation = decision.modelEvaluation;
  const candidates = spec.scores.map(({ actionRef, probability }) => ({
    actionRef,
    rawValues: [{ metric: "probability" as const, value: probability }],
    modelSelectionScore: probability * 100,
  }));
  evaluation.candidates = candidates;
  const highest = Math.max(
    ...candidates.map((candidate) => candidate.modelSelectionScore),
  );
  evaluation.preferredActions = candidates
    .filter((candidate) => candidate.modelSelectionScore === highest)
    .map((candidate) => candidate.actionRef);
  evaluation.actualActionRef = spec.actualActionRef;
  evaluation.scoredActualModelActionRef =
    spec.scoredActualActionRef ?? spec.actualActionRef;
  const carrier = candidates.find(
    (candidate) => candidate.actionRef === evaluation.scoredActualModelActionRef,
  );
  if (carrier === undefined) {
    throw new Error("scored actual carrier must be a scored candidate");
  }
  evaluation.errorGap = highest - carrier.modelSelectionScore;
  if (spec.factorDifferences !== undefined) {
    decision.factorDifferences = spec.factorDifferences;
  }
  if (spec.deterministicPreference !== undefined) {
    decision.deterministicPreference = spec.deterministicPreference;
  }
  return decision;
}

type FailureSpec = {
  triggerEventRef: string;
  roundOrdinal: number;
  outcome: "no_mortal_entry" | "unsupported_action" | "source_row_not_expected";
  singleCandidateProof?: { shape: "riichi_accepted_forced_tsumogiri"; candidateCount: 1 };
};

/** A schema-valid failed / skipped decision (no analysis payload). */
function makeFailureDecision(spec: FailureSpec): DecisionAnalysis {
  const facts = clone(templateReady().knownGameFacts);
  facts.decisionEventRef = spec.triggerEventRef;
  facts.decisionWindow = {
    ...facts.decisionWindow,
    triggerEventRef: spec.triggerEventRef,
  };
  if (facts.currentDraw !== null) {
    facts.currentDraw = {
      ...facts.currentDraw,
      eventRef: spec.triggerEventRef,
    };
  }
  const provider = {
    kind: "mortal" as const,
    outcome: spec.outcome,
    reason: spec.outcome === "unsupported_action"
      ? "local_actual_not_represented" as const
      : null,
    // Only carry the proof key when the outcome requires one — an `undefined`
    // own key would break JSON roundtrip validation.
    ...(spec.singleCandidateProof === undefined
      ? {}
      : { singleCandidateProof: spec.singleCandidateProof }),
  };
  return {
    decisionId: refForTrigger(spec.triggerEventRef),
    surface: "self",
    roundOrdinal: spec.roundOrdinal,
    normalizedDecisionContext: {
      decisionWindowKind: SELF_TURN_WINDOW,
      selfActor: SELF_ACTOR,
      triggerEventRef: spec.triggerEventRef,
      actualAction: null,
    },
    knownGameFacts: facts,
    analysisProvider: provider,
    outcome: spec.outcome,
  };
}

/** Assemble a scenario package: replace decisions, rederive the aggregate
 *  status and the semantic content hash (packageId / analysisKey /
 *  componentVersions / analysisPolicy stay — they are untouched by the
 *  scenario). */
function assemblePackage(decisions: readonly DecisionAnalysis[]): StructuredAnalysisPackage {
  const pkg = clone(templatePkg);
  pkg.decisions = [...decisions];
  pkg.record.status = deriveRecordStatus(
    decisions.map((decision) => decision.analysisProvider.outcome),
  );
  pkg.semanticContentHash = deriveSemanticContentHash({
    analysisKey: pkg.analysisKey,
    record: pkg.record,
    componentVersions: pkg.componentVersions,
    analysisPolicy: pkg.analysisPolicy,
    decisions: pkg.decisions,
    evidenceRegistry: pkg.evidenceRegistry,
  });
  return pkg;
}

/** Build the scenario package AND prove the fixture passes the production
 *  validator before the selector consumes it. */
function scenarioPackage(decisions: readonly DecisionAnalysis[]): StructuredAnalysisPackage {
  const pkg = assemblePackage(decisions);
  expect(() => validateStructuredAnalysisPackage(pkg)).not.toThrow();
  return pkg;
}

// ---------------------------------------------------------------------------
// Difference / preference fixtures (schema-valid per factor-ledger contract)
// ---------------------------------------------------------------------------

function orderedDeterministicDifference(
  leftActionRef: ActionRef,
  rightActionRef: ActionRef,
  differenceId: string,
): FactorDifference {
  return {
    differenceId,
    axis: "efficiency",
    dimension: "shanten",
    leftActionRef,
    rightActionRef,
    direction: "supports_left",
    valueRelation: "ordered",
    leftValue: { kind: "number", value: 1, unit: "shanten" },
    rightValue: { kind: "number", value: 2, unit: "shanten" },
    evidenceIds: [factEngineRequestId()],
    limitations: [],
    kind: "deterministic_difference",
    preferenceEligibility: "deterministic",
    evidenceClass: "deterministic_local_replay",
  };
}

function equalDeterministicDifference(
  leftActionRef: ActionRef,
  rightActionRef: ActionRef,
  differenceId: string,
): FactorDifference {
  return {
    differenceId,
    axis: "efficiency",
    dimension: "shanten",
    leftActionRef,
    rightActionRef,
    direction: "neutral",
    valueRelation: "equal",
    leftValue: { kind: "number", value: 1, unit: "shanten" },
    rightValue: { kind: "number", value: 1, unit: "shanten" },
    evidenceIds: [factEngineRequestId()],
    limitations: [],
    kind: "deterministic_difference",
    preferenceEligibility: "deterministic",
    evidenceClass: "deterministic_local_replay",
  };
}

function orderedHeuristicDifference(
  leftActionRef: ActionRef,
  rightActionRef: ActionRef,
  differenceId: string,
): FactorDifference {
  return {
    differenceId,
    axis: "value",
    dimension: "dama_point",
    leftActionRef,
    rightActionRef,
    direction: "supports_left",
    valueRelation: "ordered",
    leftValue: { kind: "number", value: 3900, unit: "points" },
    rightValue: { kind: "number", value: 2600, unit: "points" },
    evidenceIds: [factEngineRequestId()],
    limitations: [],
    kind: "heuristic_difference",
    preferenceEligibility: "heuristic_only",
    evidenceClass: "versioned_upstream_estimate",
    engineIdentity: templatePkg.componentVersions.factEngine,
  };
}

function conflictPreference(
  actionRef: ActionRef,
  decisiveDifferenceId: string,
): DeterministicPreference {
  return {
    actionRefs: [actionRef],
    scope: "applied_decision",
    decisiveDifferenceIds: [decisiveDifferenceId],
    coverage: "complete",
  };
}

// ---------------------------------------------------------------------------
// Candidate pool + aggregate status passthrough (CR-3)
// ---------------------------------------------------------------------------

describe("DeterministicReviewSelector candidate pool and status passthrough", () => {
  it("selects only analysis_ready decisions and never failure outcomes", () => {
    const { actualRef, otherRef } = baseRefs();
    const ready = makeReadyDecision({
      triggerEventRef: "game:fixture/0/5/0",
      roundOrdinal: 1,
      scores: [
        { actionRef: actualRef, probability: 0.4 },
        { actionRef: otherRef, probability: 0.6 },
      ],
      actualActionRef: actualRef,
      factorDifferences: [orderedDeterministicDifference(actualRef, otherRef, "difference:pool:1")],
    });
    const pkg = scenarioPackage([
      ready,
      makeFailureDecision({
        triggerEventRef: "game:fixture/0/7/0",
        roundOrdinal: 2,
        outcome: "no_mortal_entry",
      }),
      makeFailureDecision({
        triggerEventRef: "game:fixture/0/9/0",
        roundOrdinal: 3,
        outcome: "unsupported_action",
      }),
      makeFailureDecision({
        triggerEventRef: "game:fixture/0/11/0",
        roundOrdinal: 4,
        outcome: "source_row_not_expected",
        singleCandidateProof: {
          shape: "riichi_accepted_forced_tsumogiri",
          candidateCount: 1,
        },
      }),
    ]);
    const result = selectReviewDecisions(pkg);
    expect(result.selected.map((selection) => selection.decisionId)).toEqual([
      ready.decisionId,
    ]);
    // The aggregate status TRUTHFULLY reflects the no_mortal_entry (CR-3) and
    // is passed through untouched — the selector neither recomputes nor
    // beautifies it.
    expect(pkg.record.status).toBe("integrity_failed");
    expect(result.analysisPackageStatus).toBe("integrity_failed");
  });

  it("passes through a degraded aggregate status while still selecting ready decisions", () => {
    const { actualRef, otherRef } = baseRefs();
    const ready = makeReadyDecision({
      triggerEventRef: "game:fixture/0/5/0",
      roundOrdinal: 1,
      scores: [
        { actionRef: actualRef, probability: 0.4 },
        { actionRef: otherRef, probability: 0.6 },
      ],
      actualActionRef: actualRef,
      factorDifferences: [],
    });
    const pkg = scenarioPackage([
      ready,
      makeFailureDecision({
        triggerEventRef: "game:fixture/0/7/0",
        roundOrdinal: 2,
        outcome: "unsupported_action",
      }),
    ]);
    expect(pkg.record.status).toBe("degraded");
    const result = selectReviewDecisions(pkg);
    expect(result.analysisPackageStatus).toBe("degraded");
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0]!.decisionId).toBe(ready.decisionId);
  });

  it("returns an empty selection for a complete package with no disagreement", () => {
    const pkg = scenarioPackage([templateReady()]);
    expect(pkg.record.status).toBe("complete");
    const result = selectReviewDecisions(pkg);
    expect(result.selected).toEqual([]);
    expect(result.analysisPackageStatus).toBe("complete");
  });
});

// ---------------------------------------------------------------------------
// Disagreement authority (CR-4)
// ---------------------------------------------------------------------------

describe("DeterministicReviewSelector disagreement authority", () => {
  it("treats the actual as agreeing when it hits ANY one of multiple preferred actions", () => {
    const { actualRef, otherRef } = baseRefs();
    // Equal scores → both candidates are preferred; the actual is one of them.
    const ready = makeReadyDecision({
      triggerEventRef: "game:fixture/0/5/0",
      roundOrdinal: 1,
      scores: [
        { actionRef: actualRef, probability: 0.5 },
        { actionRef: otherRef, probability: 0.5 },
      ],
      actualActionRef: actualRef,
    });
    const pkg = scenarioPackage([ready]);
    expect(ready.modelEvaluation.preferredActions).toContain(actualRef);
    expect(selectReviewDecisions(pkg).selected).toEqual([]);
  });

  it("honors the existing actual↔model realization correspondence (riichi_discard realizes declare_riichi) without building its own equality", () => {
    const declareRiichi: RiichiAction = { kind: "declare_riichi" };
    const riichiDiscard: RiichiAction = {
      kind: "riichi_discard",
      tile: { id: "3m", red: false },
      discardMode: "tedashi",
    };
    const declareRef = canonicalActionRef(declareRiichi);
    const riichiDiscardRef = canonicalActionRef(riichiDiscard);
    // The other model candidate stays the template's non-actual discard.
    const otherCandidate = templateReady().comparisonSet.candidates.find(
      (candidate) => !candidate.origins.includes("actual"),
    );
    if (otherCandidate === undefined) {
      throw new Error("template must carry a non-actual model candidate");
    }
    const ready = makeReadyDecision({
      triggerEventRef: "game:fixture/0/5/0",
      roundOrdinal: 1,
      scores: [
        { actionRef: declareRef, probability: 0.6 },
        { actionRef: otherCandidate.actionRef, probability: 0.4 },
      ],
      actualActionRef: riichiDiscardRef,
      // The scored carrier is the correspondence's scored model ref — NOT the
      // actual ref (the concrete riichi_discard carries no model score of its
      // own, ADR-0001).
      scoredActualActionRef: declareRef,
      factorDifferences: [],
    });
    ready.comparisonSet = {
      ...clone(ready.comparisonSet),
      candidates: [
        { actionRef: declareRef, action: declareRiichi, origins: ["model"] },
        { ...clone(otherCandidate) },
        {
          actionRef: riichiDiscardRef,
          action: riichiDiscard,
          origins: ["actual"],
        },
      ],
      correspondences: [{
        actualActionRef: riichiDiscardRef,
        scoredModelActionRef: declareRef,
        relation: "realizes",
      }],
    };
    ready.candidateFactorLedgers = [declareRef, otherCandidate.actionRef, riichiDiscardRef]
      .map((ref) => remapLedger(ref));
    ready.normalizedDecisionContext = {
      ...ready.normalizedDecisionContext,
      actualAction: riichiDiscard,
    };
    // The player declared riichi and the model also prefers riichi: the scored
    // actual-model carrier IS the preferred action, so there is no
    // disagreement — the selector must not invent a tile/action equality rule
    // to reach that verdict.
    expect(ready.modelEvaluation.preferredActions).toEqual([declareRef]);
    expect(ready.modelEvaluation.scoredActualModelActionRef).toBe(declareRef);
    const pkg = scenarioPackage([ready]);
    expect(selectReviewDecisions(pkg).selected).toEqual([]);
  });
});

/** A ledger template remapped to a candidate ref (one ledger per comparison
 *  candidate — ready-decision reference integrity). */
function remapLedger(actionRef: ActionRef): CandidateFactorLedger {
  const ledger = clone(templateReady().candidateFactorLedgers[0]!);
  return {
    ...ledger,
    actionRef,
    projectedStateRef: `state:${actionRef}`,
  };
}

// ---------------------------------------------------------------------------
// Threshold boundary (policy v1 T = 10, inclusive)
// ---------------------------------------------------------------------------

describe("DeterministicReviewSelector threshold boundary", () => {
  it("selects only disagreement with errorGap >= T using the frozen v1 policy threshold", () => {
    // The threshold comes from the contracts-owned policy value — the selector
    // must react to exactly SELECTOR_POLICY_V1.errorGapThreshold (T=10):
    // T-1 rejected, T (inclusive boundary) and T+1 selected.
    const T = SELECTOR_POLICY_V1.errorGapThreshold;
    const { actualRef, otherRef } = baseRefs();
    const below = makeReadyDecision({
      triggerEventRef: "game:fixture/0/1/0",
      roundOrdinal: 1,
      scores: [
        { actionRef: actualRef, probability: 0.5 },
        { actionRef: otherRef, probability: 0.5 + (T - 1) / 100 },
      ],
      actualActionRef: actualRef,
    });
    const atThreshold = makeReadyDecision({
      triggerEventRef: "game:fixture/0/5/0",
      roundOrdinal: 2,
      scores: [
        { actionRef: actualRef, probability: 0.5 },
        { actionRef: otherRef, probability: 0.5 + T / 100 },
      ],
      actualActionRef: actualRef,
    });
    const above = makeReadyDecision({
      triggerEventRef: "game:fixture/0/7/0",
      roundOrdinal: 3,
      scores: [
        { actionRef: actualRef, probability: 0.5 },
        { actionRef: otherRef, probability: 0.5 + (T + 1) / 100 },
      ],
      actualActionRef: actualRef,
    });
    expect(below.modelEvaluation.errorGap).toBe(T - 1);
    expect(atThreshold.modelEvaluation.errorGap).toBe(T);
    expect(above.modelEvaluation.errorGap).toBe(T + 1);
    const pkg = scenarioPackage([below, atThreshold, above]);
    const result = selectReviewDecisions(pkg);
    expect(result.selected.map((selection) => selection.decisionId)).toEqual([
      above.decisionId, // errorGap T+1 ranks above the exact-threshold gap T
      atThreshold.decisionId,
    ]);
  });
});

// ---------------------------------------------------------------------------
// Selection reason (CR-2)
// ---------------------------------------------------------------------------

describe("DeterministicReviewSelector selection reason", () => {
  function disagreementDecision(
    triggerEventRef: string,
    roundOrdinal: number,
    factorDifferences: FactorDifference[],
  ): AnalysisReadyDecision {
    const { actualRef, otherRef } = baseRefs();
    return makeReadyDecision({
      triggerEventRef,
      roundOrdinal,
      scores: [
        { actionRef: actualRef, probability: 0.4 },
        { actionRef: otherRef, probability: 0.6 },
      ],
      actualActionRef: actualRef,
      factorDifferences,
    });
  }

  it("reports model_disagreement_above_threshold when a deterministic difference is distinguishable", () => {
    const { actualRef, otherRef } = baseRefs();
    const decision = disagreementDecision("game:fixture/0/5/0", 1, [
      orderedDeterministicDifference(actualRef, otherRef, "difference:reason:ordered"),
    ]);
    const pkg = scenarioPackage([decision]);
    const result = selectReviewDecisions(pkg);
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0]!.selectionReason)
      .toBe("model_disagreement_above_threshold");
  });

  it("reports no_distinguishable_factor_difference when only equal deterministic differences exist", () => {
    const { actualRef, otherRef } = baseRefs();
    const decision = disagreementDecision("game:fixture/0/5/0", 1, [
      equalDeterministicDifference(actualRef, otherRef, "difference:reason:equal"),
    ]);
    const pkg = scenarioPackage([decision]);
    const result = selectReviewDecisions(pkg);
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0]!.selectionReason)
      .toBe("no_distinguishable_factor_difference");
  });

  it("reports no_distinguishable_factor_difference with an empty relevant difference set", () => {
    const decision = disagreementDecision("game:fixture/0/5/0", 1, []);
    const pkg = scenarioPackage([decision]);
    const result = selectReviewDecisions(pkg);
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0]!.selectionReason)
      .toBe("no_distinguishable_factor_difference");
  });

  it("never lets a heuristic difference flip the reason", () => {
    const { actualRef, otherRef } = baseRefs();
    const decision = disagreementDecision("game:fixture/0/5/0", 1, [
      orderedHeuristicDifference(actualRef, otherRef, "difference:reason:heuristic"),
    ]);
    const pkg = scenarioPackage([decision]);
    const result = selectReviewDecisions(pkg);
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0]!.selectionReason)
      .toBe("no_distinguishable_factor_difference");
  });

  it("ignores deterministic differences between two non-actual candidates", () => {
    const { actualRef, otherRef } = baseRefs();
    const extraAction: RiichiAction = {
      kind: "discard",
      tile: { id: "7p", red: false },
      discardMode: "tedashi",
    };
    const extraRef = canonicalActionRef(extraAction);
    const decision = makeReadyDecision({
      triggerEventRef: "game:fixture/0/5/0",
      roundOrdinal: 1,
      scores: [
        { actionRef: actualRef, probability: 0.3 },
        { actionRef: otherRef, probability: 0.4 },
        { actionRef: extraRef, probability: 0.3 },
      ],
      actualActionRef: actualRef,
      factorDifferences: [
        orderedDeterministicDifference(otherRef, extraRef, "difference:reason:irrelevant"),
      ],
    });
    // Keep the model candidate universe a true bijection: the extra scored
    // candidate must be a comparison candidate with a ledger.
    decision.comparisonSet = {
      ...clone(decision.comparisonSet),
      candidates: [
        ...decision.comparisonSet.candidates,
        { actionRef: extraRef, action: extraAction, origins: ["model"] },
      ],
    };
    decision.candidateFactorLedgers = [
      ...decision.candidateFactorLedgers,
      remapLedger(extraRef),
    ];
    // The distinguishable difference pairs two NON-preferred model candidates
    // (the actual is not on either side), so it cannot establish a
    // distinguishable actual↔preferred difference.
    const pkg = scenarioPackage([decision]);
    const result = selectReviewDecisions(pkg);
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0]!.selectionReason)
      .toBe("no_distinguishable_factor_difference");
  });
});

// ---------------------------------------------------------------------------
// Sorting + cap (policy v1 N = 10)
// ---------------------------------------------------------------------------

describe("DeterministicReviewSelector ordering and cap", () => {
  function sortedDecision(
    triggerEventRef: string,
    roundOrdinal: number,
    gap: number,
    conflict: boolean,
  ): AnalysisReadyDecision {
    const { actualRef, otherRef } = baseRefs();
    const decision = makeReadyDecision({
      triggerEventRef,
      roundOrdinal,
      scores: [
        { actionRef: actualRef, probability: 0.5 },
        { actionRef: otherRef, probability: 0.5 + gap / 100 },
      ],
      actualActionRef: actualRef,
      factorDifferences: [orderedDeterministicDifference(actualRef, otherRef, `difference:sort:${triggerEventRef}`)],
    });
    if (conflict) {
      decision.deterministicPreference = conflictPreference(
        actualRef,
        `difference:sort:${triggerEventRef}`,
      );
    }
    return decision;
  }

  it("orders by errorGap desc, preference conflict tiebreak, then decisionId asc", () => {
    const first = sortedDecision("game:fixture/0/9/0", 1, 30, true);
    const second = sortedDecision("game:fixture/0/7/0", 2, 30, false);
    const third = sortedDecision("game:fixture/0/1/0", 3, 20, false);
    const fourth = sortedDecision("game:fixture/0/5/0", 4, 20, false);
    const pkg = scenarioPackage([fourth, second, first, third]);
    const result = selectReviewDecisions(pkg);
    expect(result.selected.map((selection) => selection.decisionId)).toEqual([
      first.decisionId, // gap 30 + conflict first
      second.decisionId, // gap 30, no conflict
      third.decisionId, // gap 20, decisionId "…/0/1/0" < "…/0/5/0"
      fourth.decisionId,
    ]);
    expect(result.selected.map((selection) => selection.rank)).toEqual([1, 2, 3, 4]);
  });

  it("caps at the frozen v1 policy N with contiguous 1-based ranks and keeps the top gaps", () => {
    // The cap comes from the contracts-owned policy value — the selector must
    // cut exactly at SELECTOR_POLICY_V1.maxSelections (N=10).
    const N = SELECTOR_POLICY_V1.maxSelections;
    const decisions: AnalysisReadyDecision[] = [];
    // N+2 disagreements with distinct gaps, all far above T.
    const gaps = Array.from({ length: N + 2 }, (_, index) => 3 * (N + 2) - index);
    gaps.forEach((gap, index) => {
      decisions.push(sortedDecision(
        `game:fixture/0/${1 + index * 2}/0`,
        index + 1,
        gap,
        false,
      ));
    });
    const pkg = scenarioPackage(decisions);
    const result = selectReviewDecisions(pkg);
    expect(result.selected).toHaveLength(N);
    expect(result.selected.map((selection) => selection.rank)).toEqual(
      Array.from({ length: N }, (_, index) => index + 1),
    );
    // The top-N by errorGap are kept; the two smallest gaps are dropped.
    const keptDecisionIds = new Set(
      result.selected.map((selection) => selection.decisionId),
    );
    const topGaps = new Set(
      decisions
        .slice()
        .sort((left, right) =>
          right.modelEvaluation.errorGap - left.modelEvaluation.errorGap,
        )
        .slice(0, N)
        .map((decision) => decision.decisionId),
    );
    expect([...keptDecisionIds].sort()).toEqual([...topGaps].sort());
    // Gap ordering is preserved in the result.
    for (let index = 1; index < result.selected.length; index += 1) {
      const previous = decisions.find(
        (decision) => decision.decisionId === result.selected[index - 1]!.decisionId,
      )!;
      const current = decisions.find(
        (decision) => decision.decisionId === result.selected[index]!.decisionId,
      )!;
      expect(current.modelEvaluation.errorGap)
        .toBeLessThanOrEqual(previous.modelEvaluation.errorGap);
    }
  });

  it("derives the conflict tiebreak from the shared preference-agreement authority (agree/partial get no priority)", () => {
    // The tiebreak must follow `computePreferenceAgreement` exactly: only the
    // `conflict` verdict gets priority; `agree` and `partial_agreement` fall
    // back to the decisionId order. All three decisions share gap 30.
    const { actualRef, otherRef } = baseRefs();
    const conflictDecision = makeReadyDecision({
      triggerEventRef: "game:fixture/0/9/0",
      roundOrdinal: 1,
      scores: [
        { actionRef: actualRef, probability: 0.5 },
        { actionRef: otherRef, probability: 0.8 },
      ],
      actualActionRef: actualRef,
      factorDifferences: [orderedDeterministicDifference(actualRef, otherRef, "difference:agree-class:conflict")],
      // disjoint from the preferred set → conflict
      deterministicPreference: conflictPreference(actualRef, "difference:agree-class:conflict"),
    });
    const partialDecision = makeReadyDecision({
      triggerEventRef: "game:fixture/0/1/0",
      roundOrdinal: 2,
      scores: [
        { actionRef: actualRef, probability: 0.5 },
        { actionRef: otherRef, probability: 0.8 },
      ],
      actualActionRef: actualRef,
      factorDifferences: [orderedDeterministicDifference(actualRef, otherRef, "difference:agree-class:partial")],
      // overlaps the preferred set → partial_agreement
      deterministicPreference: {
        ...conflictPreference(otherRef, "difference:agree-class:partial"),
        actionRefs: [otherRef, actualRef],
      },
    });
    const agreeDecision = makeReadyDecision({
      triggerEventRef: "game:fixture/0/5/0",
      roundOrdinal: 3,
      scores: [
        { actionRef: actualRef, probability: 0.5 },
        { actionRef: otherRef, probability: 0.8 },
      ],
      actualActionRef: actualRef,
      factorDifferences: [orderedDeterministicDifference(actualRef, otherRef, "difference:agree-class:agree")],
      // identical to the preferred set → agree
      deterministicPreference: conflictPreference(otherRef, "difference:agree-class:agree"),
    });
    // Prove the agreement classes map onto the shared authority.
    expect(computePreferenceAgreement(
      conflictDecision.modelEvaluation.preferredActions,
      conflictDecision.deterministicPreference!.actionRefs,
    )).toBe("conflict");
    expect(computePreferenceAgreement(
      partialDecision.modelEvaluation.preferredActions,
      partialDecision.deterministicPreference!.actionRefs,
    )).toBe("partial_agreement");
    expect(computePreferenceAgreement(
      agreeDecision.modelEvaluation.preferredActions,
      agreeDecision.deterministicPreference!.actionRefs,
    )).toBe("agree");

    const pkg = scenarioPackage([partialDecision, agreeDecision, conflictDecision]);
    const result = selectReviewDecisions(pkg);
    // conflict first; agree and partial order by decisionId ("…/0/1/0" before
    // "…/0/5/0") — the tiebreak never re-orders non-conflict classes.
    expect(result.selected.map((selection) => selection.decisionId)).toEqual([
      conflictDecision.decisionId,
      partialDecision.decisionId,
      agreeDecision.decisionId,
    ]);
  });

  it("returns fewer than N when the pool is smaller", () => {
    const { actualRef, otherRef } = baseRefs();
    const decision = makeReadyDecision({
      triggerEventRef: "game:fixture/0/5/0",
      roundOrdinal: 1,
      scores: [
        { actionRef: actualRef, probability: 0.4 },
        { actionRef: otherRef, probability: 0.6 },
      ],
      actualActionRef: actualRef,
      factorDifferences: [],
    });
    const pkg = scenarioPackage([decision]);
    const result = selectReviewDecisions(pkg);
    expect(result.selected).toHaveLength(1);
    expect(result.selected.length).toBeLessThan(SELECTOR_POLICY_V1.maxSelections);
    expect(result.selected[0]!.rank).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Determinism (CR-5)
// ---------------------------------------------------------------------------

describe("DeterministicReviewSelector determinism", () => {
  function pair(): AnalysisReadyDecision[] {
    const { actualRef, otherRef } = baseRefs();
    return [
      makeReadyDecision({
        triggerEventRef: "game:fixture/0/5/0",
        roundOrdinal: 1,
        scores: [
          { actionRef: actualRef, probability: 0.4 },
          { actionRef: otherRef, probability: 0.6 },
        ],
        actualActionRef: actualRef,
        factorDifferences: [orderedDeterministicDifference(actualRef, otherRef, "difference:det:1")],
      }),
      makeReadyDecision({
        triggerEventRef: "game:fixture/0/7/0",
        roundOrdinal: 2,
        scores: [
          { actionRef: actualRef, probability: 0.49 },
          { actionRef: otherRef, probability: 0.51 },
        ],
        actualActionRef: actualRef,
        factorDifferences: [],
      }),
    ];
  }

  it("produces field-identical results across repeated calls", () => {
    const pkg = scenarioPackage(pair());
    expect(selectReviewDecisions(pkg)).toEqual(selectReviewDecisions(pkg));
  });

  it("is insensitive to the package.decisions array order (with recomputed identity/hash)", () => {
    const decisions = pair();
    const forward = scenarioPackage(decisions);
    const reversed = scenarioPackage([decisions[1]!, decisions[0]!]);
    expect(forward.semanticContentHash).not.toBe(reversed.semanticContentHash);
    expect(selectReviewDecisions(forward)).toEqual(
      selectReviewDecisions(reversed),
    );
  });

  it("ignores artifact-creation metadata (createdAt / detailPolicy.frozenAt)", () => {
    const pkg = scenarioPackage(pair());
    const baseline = selectReviewDecisions(pkg);
    const tampered = clone(pkg);
    tampered.createdAt = "2026-07-01T00:00:00.000Z";
    for (const decision of tampered.decisions) {
      if (decision.outcome === "analysis_ready") {
        decision.modelEvaluation.detailPolicy.frozenAt =
          "2026-07-01T00:00:00.000Z";
      }
    }
    expect(selectReviewDecisions(tampered)).toEqual(baseline);
  });
});

// ---------------------------------------------------------------------------
// Fail closed (user story 20 / CR-3)
// ---------------------------------------------------------------------------

describe("DeterministicReviewSelector fail closed", () => {
  it("throws on schema-invalid packages instead of returning partial selections", () => {
    const pkg = scenarioPackage([templateReady()]);
    expect(() => selectReviewDecisions({
      ...pkg,
      decisions: [],
    } as unknown as StructuredAnalysisPackage)).toThrow();
    expect(() => selectReviewDecisions({
      ...pkg,
      extraField: "smuggled",
    } as unknown as StructuredAnalysisPackage)).toThrow();
    const duplicate = clone(pkg);
    duplicate.decisions = [clone(pkg.decisions[0]!), clone(pkg.decisions[0]!)];
    expect(() => selectReviewDecisions(
      duplicate as unknown as StructuredAnalysisPackage,
    )).toThrow(/globally unique/);
  });

  it("emits the policy version from the frozen v1 policy owner", () => {
    const pkg = scenarioPackage([templateReady()]);
    const result = selectReviewDecisions(pkg);
    expect(result.policyVersion).toBe(SELECTOR_POLICY_V1.policyVersion);
    expect(result.policyVersion).toBe("deterministic-review-selector/v1");
  });
});
