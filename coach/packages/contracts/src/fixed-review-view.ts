import { z } from "zod";
import { RecordAnalysisStatusSchema } from "./analysis-identity-contract.js";
import { GraphAuthoritySchema } from "./context-graph.js";
import { ReviewSelectionReasonSchema, SELECTOR_POLICY_VERSION_V1 } from "./review-selection.js";

export const FIXED_REVIEW_VIEW_SCHEMA_VERSION = "fixed-review-view/v1" as const;
export const FIXED_REVIEW_DETAIL_SCHEMA_VERSION = "fixed-review-detail/v1" as const;

export const FixedReviewExplanationStatusSchema = z.enum([
  "not_generated", "ready", "provider_unavailable", "request_failed", "invalid_output",
]);
export const FixedReviewActiveReportStatusSchema = z.enum([
  "not_generated", "complete", "partial", "evidence_only",
]);
export const FixedReviewAxisTagSchema = z.enum([
  "efficiency", "value", "defense", "placement", "option_value",
]);

export const RendererActionSchema = z.object({
  actionRef: z.string().min(1).nullable(),
  label: z.string().min(1).max(160),
}).strict();
export const RendererScoredActionSchema = RendererActionSchema.extend({
  score: z.number().finite().min(0).max(100),
  scoreUnit: z.literal("模型选择分"),
  scoreMethodLabel: z.enum(["Mortal 行动概率 × 100", "Akagi 选择分 softmax × 100"]),
}).strict();
export const RendererCoachJudgmentSchema = z.object({
  recommendation: RendererActionSchema,
  confidence: z.enum(["high", "medium", "low"]),
  premiseRefs: z.array(z.string().min(1)),
}).strict();
export const RendererExplanationSegmentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string() }).strict(),
  z.object({ kind: z.literal("evidence_value"), text: z.string(), sourceRef: z.string().min(1) }).strict(),
]);
export const RendererExplanationSchema = z.object({
  segments: z.array(RendererExplanationSegmentSchema).min(1),
  evidenceRefs: z.array(z.string().min(1)),
}).strict();
export const RendererProvenanceItemSchema = z.object({
  displayRef: z.string().min(1),
  category: z.enum(["hard_evidence", "advisory_signal", "coach_inference"]),
  label: z.string().min(1),
  summary: z.string().min(1),
  relatedAction: RendererActionSchema.nullable(),
  details: z.array(z.object({
    label: z.string().min(1),
    value: z.string().min(1),
    scope: z.string().min(1).nullable(),
    tiles: z.array(z.object({
      tile: z.string().min(1),
      count: z.number().int().nonnegative().nullable(),
    }).strict()),
  }).strict()),
  parentRefs: z.array(z.string().min(1)),
  producer: z.string().min(1),
  producerVersion: z.string().min(1),
  sourceRefs: z.array(z.string().min(1)),
}).strict();

export const RendererReferenceTargetSchema = z.object({
  displayRef: z.string().min(1),
  authority: GraphAuthoritySchema,
  label: z.string().min(1),
  summary: z.string().min(1),
  relatedAction: RendererActionSchema.nullable(),
}).strict();

export const FixedReviewListItemSchema = z.object({
  decisionId: z.string().min(1),
  rank: z.number().int().min(1),
  selectionReason: ReviewSelectionReasonSchema,
  roundOrdinal: z.number().int().nonnegative(),
  decisionWindowKind: z.string().min(1),
  actualAction: RendererActionSchema.nullable(),
  mortalPreferredActions: z.array(RendererScoredActionSchema),
  errorGap: z.number().finite().nonnegative(),
  tags: z.array(FixedReviewAxisTagSchema),
  explanationStatus: FixedReviewExplanationStatusSchema,
}).strict();

export const FIXED_REVIEW_OUTCOMES = [
  "analysis_ready", "unsupported_action", "source_row_not_expected", "no_mortal_entry",
  "binding_mismatch", "model_output_incomplete", "analysis_blocked",
] as const;
const CountSchema = z.number().int().nonnegative();
const OutcomeCountsSchema = z.object({
  analysis_ready: CountSchema,
  unsupported_action: CountSchema,
  source_row_not_expected: CountSchema,
  no_mortal_entry: CountSchema,
  binding_mismatch: CountSchema,
  model_output_incomplete: CountSchema,
  analysis_blocked: CountSchema,
}).strict();

export const FixedReviewSnapshotSchema = z.object({
  schemaVersion: z.literal(FIXED_REVIEW_VIEW_SCHEMA_VERSION),
  packageId: z.string().min(1),
  analysisStatus: RecordAnalysisStatusSchema,
  outcomeCounts: OutcomeCountsSchema,
  selection: z.object({
    policyVersion: z.literal(SELECTOR_POLICY_VERSION_V1),
    selectedCount: z.number().int().nonnegative(),
    items: z.array(FixedReviewListItemSchema),
  }).strict(),
  activeReportRefId: z.string().min(1).nullable(),
  activeReportStatus: FixedReviewActiveReportStatusSchema,
  explanationCounts: z.object({
    ready: z.number().int().nonnegative(),
    provider_unavailable: z.number().int().nonnegative(),
    request_failed: z.number().int().nonnegative(),
    invalid_output: z.number().int().nonnegative(),
  }).strict(),
}).strict();

export const FixedReviewDetailSchema = z.object({
  schemaVersion: z.literal(FIXED_REVIEW_DETAIL_SCHEMA_VERSION),
  packageId: z.string().min(1),
  activeReportRefId: z.string().min(1).nullable(),
  decisionId: z.string().min(1),
  actual: RendererActionSchema.nullable(),
  mortal: z.array(RendererScoredActionSchema),
  coachJudgments: z.array(RendererCoachJudgmentSchema),
  explanations: z.array(RendererExplanationSchema),
  referenceTargets: z.array(RendererReferenceTargetSchema),
  provenance: z.array(RendererProvenanceItemSchema),
  explanationStatus: FixedReviewExplanationStatusSchema,
}).strict();

export const FixedReviewOpenRequestSchema = z.object({ packageId: z.string().min(1).max(200) }).strict();
export const FixedReviewGenerateRequestSchema = z.object({
  packageId: z.string().min(1).max(200), operationId: z.string().min(1).max(200),
}).strict();
export const FixedReviewCancelRequestSchema = z.object({ operationId: z.string().min(1).max(200) }).strict();
export const FixedReviewDetailRequestSchema = z.object({
  packageId: z.string().min(1).max(200), decisionId: z.string().min(1).max(500), activeReportRefId: z.string().min(1).max(200).nullable(),
}).strict();
export const FixedReviewLeaveRequestSchema = FixedReviewOpenRequestSchema;
export const FixedReviewAcknowledgementSchema = z.object({ status: z.literal("acknowledged") }).strict();
export const FixedReviewOperationResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ready"), snapshot: FixedReviewSnapshotSchema }).strict(),
  z.object({ status: z.literal("failed"), code: z.enum(["review_unavailable", "generation_failed", "operation_cancelled"]) }).strict(),
]);

export type FixedReviewSnapshotDto = z.infer<typeof FixedReviewSnapshotSchema>;
export type FixedReviewDetailDto = z.infer<typeof FixedReviewDetailSchema>;
export type FixedReviewOperationResult = z.infer<typeof FixedReviewOperationResultSchema>;
