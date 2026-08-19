/**
 * DeterministicReviewSelector — contract freeze (Slice 1).
 *
 * Spec: coach/docs/specs/2026-08-19-deterministic-review-selector-design.md
 * (CR-1..CR-6; 模块与依赖: contracts 包新增 SelectorPolicyV1 /
 * ReviewSelectionReason / ReviewSelection / ReviewSelectionResult 的 schema 与
 * 类型; contracts 不新增任何依赖).
 *
 * The selector is a pure, deterministic, versioned product policy that
 * projects a schema-valid `StructuredAnalysisPackage` into a machine-auditable
 * `ReviewSelectionResult` (spec definition). It consumes only M6-C existing
 * information and adds no analysis capability. These contracts freeze the
 * OUTPUT shape only — the selection algorithm lives in the reasoning package's
 * `selectReviewDecisions` seam.
 *
 * CR-1: `selected` only references `decisionId` (no copied errorGap /
 * preferredActions / factor differences — consumers resolve back into the
 * package, avoiding a second truth). No separate `selectedDecisionIds: string[]`
 * field (M6-D2 derives it mechanically via `selected.map(s => s.decisionId)`).
 * `ReviewSelectionResult` has NO `selectionId` / `semanticHash` / `createdAt`:
 * it is a deterministic projection of (package, policy), not a new artifact
 * (CR-5 identity = `(analysisPackageId, policyVersion)`).
 *
 * CR-2: the reason vocabulary is exactly two mechanical, verifiable policy
 * reasons; pedagogy / CoachJudgment wording never enters the contract.
 *
 * Policy v1 freeze: T = errorGapThreshold = 10, N = maxSelections = 10, pinned
 * as schema literals — changing T or N requires publishing a new policy
 * version (new discriminated variant), never an in-place constant edit.
 */
import { z } from "zod";
import { DecisionIdSchema, RecordAnalysisStatusSchema } from "./structured-analysis-package.js";

/** The frozen v1 selector policy version (spec "Policy v1 冻结"). */
export const SELECTOR_POLICY_VERSION_V1 =
  "deterministic-review-selector/v1" as const;

/** Policy v1 snapshot. T (errorGapThreshold) and N (maxSelections) are frozen
 *  as schema literals so a threshold/cap change is a compile/test failure and
 *  must be released as a new policy version instead of a silent code edit
 *  (spec user story 19). The version is the literal
 *  `SELECTOR_POLICY_VERSION_V1` — an unknown policy version fails closed. */
export const SelectorPolicyV1Schema = z.object({
  policyVersion: z.literal(SELECTOR_POLICY_VERSION_V1),
  /** T — error-gap selection threshold, in
   *  ModelEvaluation.errorGap units (model_selection_score_points). */
  errorGapThreshold: z.literal(10),
  /** N — maximum number of selections per review. */
  maxSelections: z.literal(10),
}).strict();
export type SelectorPolicyV1 = z.infer<typeof SelectorPolicyV1Schema>;

/** The frozen v1 policy VALUE — the SINGLE runtime owner of the selector's
 *  threshold, cap and emitted policy version (Issue #3 review: contracts is
 *  the sole owner of v1's policyVersion / errorGapThreshold=10 /
 *  maxSelections=10). It is parsed through `SelectorPolicyV1Schema` at module
 *  scope so any literal drift between the schema and the value fails closed at
 *  load time, and `Object.freeze`d so no consumer can mutate it.
 *  `selectReviewDecisions` consumes THIS value for the admission threshold,
 *  the cap and the emitted `policyVersion` — no policy literals live in the
 *  reasoning package. */
export const SELECTOR_POLICY_V1: SelectorPolicyV1 = Object.freeze(
  SelectorPolicyV1Schema.parse({
    policyVersion: SELECTOR_POLICY_VERSION_V1,
    errorGapThreshold: 10,
    maxSelections: 10,
  }),
);

/** The frozen two-value selection reason vocabulary (CR-2): only mechanical,
 *  verifiable policy reasons — no pedagogy / CoachJudgment wording. */
export const ReviewSelectionReasonSchema = z.enum([
  "model_disagreement_above_threshold",
  "no_distinguishable_factor_difference",
]);
export type ReviewSelectionReason = z.infer<
  typeof ReviewSelectionReasonSchema
>;

/** One selected decision. `rank` is the 1-based position in the final
 *  `selected` ordering (CR-1). `selectionReason` is the frozen vocabulary
 *  reason for WHY the decision passed the policy gate. */
export const ReviewSelectionSchema = z.object({
  decisionId: DecisionIdSchema,
  rank: z.number().int().min(1),
  selectionReason: ReviewSelectionReasonSchema,
}).strict();
export type ReviewSelection = z.infer<typeof ReviewSelectionSchema>;

/** The deterministic projection of one `StructuredAnalysisPackage` under
 *  selector policy v1 (CR-1 / CR-5). `analysisPackageStatus` is an exact
 *  passthrough of `package.record.status` — the selector neither recomputes
 *  nor beautifies it (CR-3; status truth is owned by the M6-C validator).
 *  `selected` may be empty. */
export const ReviewSelectionResultSchema = z.object({
  policyVersion: z.literal(SELECTOR_POLICY_VERSION_V1),
  analysisPackageId: z.string().min(1),
  analysisPackageStatus: RecordAnalysisStatusSchema,
  selected: z.array(ReviewSelectionSchema),
}).strict();
export type ReviewSelectionResult = z.infer<
  typeof ReviewSelectionResultSchema
>;
