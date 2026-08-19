/**
 * DeterministicReviewSelector — Slice 2: the pure selector implementation.
 *
 * Spec: coach/docs/specs/2026-08-19-deterministic-review-selector-design.md
 * (Slice 2 — Pure selector implementation; 选择算法 / 输出组装 / CR-1..CR-6).
 *
 * `selectReviewDecisions(package)` is the SINGLE pure-function seam for the
 * deterministic, versioned review-worthy selection policy (grill F1-F3). It
 * projects a schema-valid `StructuredAnalysisPackage` into a machine-auditable
 * `ReviewSelectionResult`:
 *
 *   package → filter (analysis_ready) → disagreement → errorGap >= T → reason
 *   → total order → cap N → rank → result
 *
 * Constraints honored:
 *  - Pure and deterministic: no Mortal / fact engine / LLM / graph / database
 *    calls, no runtime random, no wall clock (CR-5; user stories 17/18/22).
 *  - Fail fast / fail closed on schema-invalid input: the selector re-parses
 *    with the frozen `StructuredAnalysisPackageSchema` but NEVER re-runs the
 *    M6-C package validator (validation ownership stays there; spec 模块与依赖).
 *  - No action matching / tile equality of its own: disagreement is a set
 *    membership check over `scoredActualModelActionRef` against
 *    `preferredActions`, and equality authority is entirely the package's
 *    existing semantics (CR-4) — the actual↔model realization correspondence
 *    (riichi_discard → declare_riichi) is honored through
 *    `scoredActualModelActionRef`, never re-derived here.
 *  - `no_distinguishable_factor_difference` is NOT a separate admission
 *    authority (CR-2): it only replaces the reason of an already-admitted
 *    decision; it never bypasses T, disagreement, or N.
 *  - Preference conflict is a tiebreaker ONLY (grill F3): it delegates to the
 *    existing shared preference-agreement authority
 *    (`computePreferenceAgreement` — the single owner of agree/partial/conflict
 *    semantics) and never adds a decision to the review.
 *  - Policy v1 truth lives in contracts: the admission threshold, the cap and
 *    the emitted `policyVersion` are read from the frozen
 *    `SELECTOR_POLICY_V1` value — reasoning owns no policy literals.
 *  - No new workspace dependency (ADR-0005): besides `@riichi-coach/contracts`
 *    it only reuses the reasoning package's own pure preference-agreement
 *    module; no Mortal / fact engine / LLM / graph / database.
 */
import {
  SELECTOR_POLICY_V1,
  StructuredAnalysisPackageSchema,
  type AnalysisReadyDecision,
  type ReviewSelectionReason,
  type ReviewSelectionResult,
  type StructuredAnalysisPackage,
} from "@riichi-coach/contracts";
import { computePreferenceAgreement } from "../preference/preference-agreement.js";

/** CR-4 disagreement: the scored actual-model carrier is NOT among the model's
 *  preferred actions. With multiple preferredActions, hitting ANY one of them
 *  means agreement (user story 4); the actual↔model realization correspondence
 *  is already folded into `scoredActualModelActionRef` by the package (user
 *  story 5) — no equality rule is re-implemented here. */
function isDisagreement(decision: AnalysisReadyDecision): boolean {
  return !decision.modelEvaluation.preferredActions.includes(
    decision.modelEvaluation.scoredActualModelActionRef,
  );
}

/** Tiebreaker-only preference conflict (grill F3): the deterministic
 *  preference set conflicts with the model preferred actions. Delegates to the
 *  existing shared preference-agreement authority (`computePreferenceAgreement`
 *  — the single owner of agree/partial_agreement/conflict semantics): only the
 *  `conflict` verdict gets tiebreak priority; null (not comparable) and
 *  partial agreement do not, and conflict NEVER adds a decision to the review
 *  (user story 9). */
function hasPreferenceConflict(decision: AnalysisReadyDecision): boolean {
  return computePreferenceAgreement(
    decision.modelEvaluation.preferredActions,
    decision.deterministicPreference?.actionRefs ?? null,
  ) === "conflict";
}

/** CR-2 reason selection. Relevant differences = `factorDifferences` entries
 *  that are deterministic AND whose unordered pair {leftActionRef,
 *  rightActionRef} equals {actualActionRef, p} for some p in preferredActions.
 *  If any such entry has `valueRelation !== "equal"`, the decision carries a
 *  distinguishable factor difference → `model_disagreement_above_threshold`;
 *  otherwise (empty relevant set, or all equal) →
 *  `no_distinguishable_factor_difference`. The pairing uses `actualActionRef`
 *  (not the scored ref) so an existing riichi_discard ↔ declare_riichi
 *  FactorDifference is not skipped; heuristic differences never participate. */
function selectionReasonOf(
  decision: AnalysisReadyDecision,
): ReviewSelectionReason {
  const actualRef = decision.modelEvaluation.actualActionRef;
  const preferredActions = new Set(decision.modelEvaluation.preferredActions);
  const hasDistinguishableDifference = decision.factorDifferences.some(
    (difference) => {
      if (difference.kind !== "deterministic_difference") return false;
      const { leftActionRef, rightActionRef } = difference;
      const actualOnLeft = leftActionRef === actualRef;
      const actualOnRight = rightActionRef === actualRef;
      if (actualOnLeft === actualOnRight) return false;
      const otherRef = actualOnLeft ? rightActionRef : leftActionRef;
      if (!preferredActions.has(otherRef)) return false;
      return difference.valueRelation !== "equal";
    },
  );
  return hasDistinguishableDifference
    ? "model_disagreement_above_threshold"
    : "no_distinguishable_factor_difference";
}

/** The three-level deterministic total order (spec 选择算法 step 5):
 *  1. errorGap descending (equal gaps stay equal — no epsilon merging);
 *  2. preference conflict first within equal-gap groups (tiebreaker only);
 *  3. decisionId ascending (locale-independent lexicographic) for full order.
 *  No runtime random, Date.now(), wall clock, or locale-dependent sort. */
function compareSelectedDecisions(
  left: AnalysisReadyDecision,
  right: AnalysisReadyDecision,
): number {
  const gapOrder = right.modelEvaluation.errorGap - left.modelEvaluation.errorGap;
  if (gapOrder !== 0) return gapOrder;
  const conflictOrder =
    Number(hasPreferenceConflict(right)) - Number(hasPreferenceConflict(left));
  if (conflictOrder !== 0) return conflictOrder;
  if (left.decisionId < right.decisionId) return -1;
  if (left.decisionId > right.decisionId) return 1;
  return 0;
}

/**
 * The pure selection seam (spec "唯一新增 seam"): project a schema-valid
 * `StructuredAnalysisPackage` into a `ReviewSelectionResult` under policy v1.
 *
 * Selection algorithm (external behavior contract, policy v1):
 *  1. candidate pool = decisions with `outcome === "analysis_ready"` — other
 *     outcomes never enter, never rank, never occupy N (CR-3; user story 2);
 *  2. disagreement (CR-4, above);
 *  3. admission gate = disagreement AND `errorGap >= T` — the only admission
 *     authority (user stories 6/9);
 *  4. reason (CR-2, above);
 *  5. total order (above);
 *  6. cap at N and assign 1-based ranks; fewer than N returns all; `selected`
 *     may be empty.
 *
 * Input contract: callers pass a schema-valid package (on the production path
 * it has passed `validateStructuredAnalysisPackage`); the selector re-parses
 * with the frozen schema as fail-fast and FAILS CLOSED on schema-invalid input
 * (user story 20) — it never returns partial selections for bad input.
 */
export function selectReviewDecisions(
  packageInput: StructuredAnalysisPackage,
): ReviewSelectionResult {
  const pkg = StructuredAnalysisPackageSchema.parse(packageInput);
  const admitted = pkg.decisions
    .filter(
      (decision): decision is AnalysisReadyDecision =>
        decision.outcome === "analysis_ready",
    )
    .filter((decision) =>
      isDisagreement(decision) &&
      decision.modelEvaluation.errorGap >= SELECTOR_POLICY_V1.errorGapThreshold,
    )
    .sort(compareSelectedDecisions)
    .slice(0, SELECTOR_POLICY_V1.maxSelections);
  return {
    policyVersion: SELECTOR_POLICY_V1.policyVersion,
    analysisPackageId: pkg.packageId,
    analysisPackageStatus: pkg.record.status,
    selected: admitted.map((decision, index) => ({
      decisionId: decision.decisionId,
      rank: index + 1,
      selectionReason: selectionReasonOf(decision),
    })),
  };
}
