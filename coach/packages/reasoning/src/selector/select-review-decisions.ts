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
 *  - Preference conflict is a tiebreaker ONLY (grill F3): it reuses the
 *    existing preference-set `conflict` semantics and never adds a decision to
 *    the review.
 *  - Depends only on `@riichi-coach/contracts` (ADR-0005); no new workspace
 *    dependency.
 */
import {
  SELECTOR_POLICY_VERSION_V1,
  StructuredAnalysisPackageSchema,
  type AnalysisReadyDecision,
  type ReviewSelectionReason,
  type ReviewSelectionResult,
  type StructuredAnalysisPackage,
} from "@riichi-coach/contracts";

/** Policy v1 T — error-gap threshold (model_selection_score_points). Pinned
 *  by `SelectorPolicyV1Schema` in contracts; a change requires a new policy
 *  version, never an in-place edit. Boundary is inclusive: `errorGap >= T`. */
const ERROR_GAP_THRESHOLD_V1 = 10;
/** Policy v1 N — maximum selections per review. Boundary is inclusive:
 *  `selected.length <= N`. */
const MAX_SELECTIONS_V1 = 10;

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
 *  preference set is non-null and disjoint from the model preferred actions —
 *  the existing preference-set `conflict` semantics. Null / partial agreement
 *  get no tiebreak priority, and conflict NEVER adds a decision to the review
 *  (user story 9). */
function hasPreferenceConflict(decision: AnalysisReadyDecision): boolean {
  const preference = decision.deterministicPreference;
  if (preference === null) return false;
  const preferredActions = new Set(decision.modelEvaluation.preferredActions);
  return preference.actionRefs.every(
    (actionRef) => !preferredActions.has(actionRef),
  );
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
      decision.modelEvaluation.errorGap >= ERROR_GAP_THRESHOLD_V1,
    )
    .sort(compareSelectedDecisions)
    .slice(0, MAX_SELECTIONS_V1);
  return {
    policyVersion: SELECTOR_POLICY_VERSION_V1,
    analysisPackageId: pkg.packageId,
    analysisPackageStatus: pkg.record.status,
    selected: admitted.map((decision, index) => ({
      decisionId: decision.decisionId,
      rank: index + 1,
      selectionReason: selectionReasonOf(decision),
    })),
  };
}
