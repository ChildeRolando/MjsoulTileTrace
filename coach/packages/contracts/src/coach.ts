/**
 * M6-D2 — Coach generation contract freeze (contracts portion of the spec:
 * "contracts 冻结 D2 数据契约 — ReviewReport schema、CoachInference /
 * CoachJudgment / Explanation payload schema、generationStatus /
 * explanationStatus 枚举、LlmCoachProvider 端口类型与请求/结果 DTO、
 * schema/prompt 版本字面量; contracts 不新增任何依赖").
 *
 * Spec: coach/docs/specs/2026-08-24-m6-d2-graph-grounded-coach-design.md
 * (ADR-0003 / ADR-0004; grill E1–E9). This module freezes the stable D2
 * product surface shared by the reasoning engine, the desktop provider /
 * composition root and the future M7 consumers:
 *
 *  - the three reasoning-overlay payload schemas (CoachInference /
 *    CoachJudgment / Explanation) — strict, and CoachJudgment carries NO
 *    free-reasoning-text field (recommendation + confidence + premiseRefs
 *    only). Raw chain-of-thought never enters any contract here (guard 3,
 *    ADR-0004: reasoning trace != raw chain-of-thought);
 *  - the model-side draft schema `coach-reasoning-draft/v1` — the grounding
 *    validator's untrusted INPUT contract. The draft only uses per-decision
 *    local ids; any self-forged nodeId is structurally absent (strict) and
 *    engine-side is `invalid_output`;
 *  - the grounding diagnostic vocabulary — the grounding validator's OUTPUT
 *    contract (hard rejections + soft findings; soft never blocks);
 *  - the `LlmCoachProvider` PORT TYPE with its request/result DTOs — type
 *    only, no implementation: reasoning consumes the type, the desktop main
 *    process provides the implementation and owns the BYOK key material
 *    (guard 2: descriptor / request / result carry NO key fields);
 *  - the `ReviewReport` schema: generationStatus / explanationStatus, the
 *    append-only reasoning overlay, hash-only audit (no full prompt /
 *    response) and diagnostics.
 *
 * Identity discipline (spec "Determinism 与身份派生"): nodeId / edgeId /
 * reportId / audit hashes are derived by the reasoning engine via the M6-C
 * shared deterministic serializer; like the D1 graph ids, the derivation is
 * documented here but validated as an opaque non-empty string.
 */
import { z } from "zod";
import { ActionRefSchema } from "./comparison.js";
import {
  ContextGraphEdgeSchema,
  ContextGraphNodeSchema,
  REASONING_GRAPH_EDGE_KINDS,
  REASONING_GRAPH_NODE_KINDS,
} from "./context-graph.js";
import { SELECTOR_POLICY_VERSION_V1 } from "./review-selection.js";
import { DecisionIdSchema } from "./structured-analysis-package.js";

/** The current ReviewReport schema version (contract-owned literal). */
export const REVIEW_REPORT_SCHEMA_VERSION = "review-report/v1" as const;

/** The model-side draft output schema version (contract-owned literal). */
export const COACH_REASONING_DRAFT_SCHEMA_VERSION =
  "coach-reasoning-draft/v1" as const;

/** The frozen coach review prompt template version (spec "prompt builder"). */
export const COACH_REVIEW_PROMPT_VERSION = "coach-review-prompt/v1" as const;

// ---------------------------------------------------------------------------
// Reasoning-overlay payload schemas (spec "CoachInference / CoachJudgment /
// Explanation 契约")
// ---------------------------------------------------------------------------

/**
 * The reasoning-overlay node kinds — the D1-frozen
 * `REASONING_GRAPH_NODE_KINDS` list spelled out as a union (D1 publishes the
 * list as `readonly GraphNodeKind[]`, which would widen a computed union back
 * to all node kinds); drift is caught by the contracts tests, which assert
 * the map keys and the D1 list stay equal.
 */
export type ReasoningGraphNodeKind =
  | "CoachInference"
  | "CoachJudgment"
  | "Explanation";

/** grill C1 — the LLM gives a recommendation plus a coarse confidence. */
export const CoachConfidenceSchema = z.enum(["high", "medium", "low"]);
export type CoachConfidence = z.infer<typeof CoachConfidenceSchema>;

/**
 * CoachInference payload — the synthesis-layer intermediate inference (e.g. an
 * advanced tile read built on real KnownGameFacts). `premiseRefs` are graph
 * nodeIds of EVIDENCE nodes; the grounding validator resolves them within the
 * same decision subgraph (hard layer 1).
 */
export const CoachInferencePayloadSchema = z.object({
  inferenceId: z.string().min(1),
  /** Persisted engine identity material for deterministic read-back checks. */
  localId: z.string().min(1),
  decisionId: DecisionIdSchema,
  /** The inference statement (a product field — NOT raw chain-of-thought). */
  statement: z.string().min(1),
  premiseRefs: z.array(z.string().min(1)),
}).strict();
export type CoachInferencePayload = z.infer<typeof CoachInferencePayloadSchema>;

/**
 * CoachJudgment payload — the final recommendation with confidence and
 * premises. Deliberately has NO free-reasoning-text field: the judgment is
 * `recommendation + confidence + premiseRefs` (spec acceptance: 不允许自由
 * 推理文本字段); the argument for it lives in the referenced premises and the
 * verbalized Explanation entries. `premiseRefs` are graph nodeIds of evidence
 * nodes or same-report CoachInference nodes, and MUST be non-empty (hard
 * layer 3).
 */
export const CoachJudgmentPayloadSchema = z.object({
  judgmentId: z.string().min(1),
  /** Persisted engine identity material for deterministic read-back checks. */
  localId: z.string().min(1),
  decisionId: DecisionIdSchema,
  /** An actionRef inside the decision's CandidateAction set (hard layer 2). */
  recommendation: ActionRefSchema,
  confidence: CoachConfidenceSchema,
  premiseRefs: z.array(z.string().min(1)).min(1),
}).strict();
export type CoachJudgmentPayload = z.infer<typeof CoachJudgmentPayloadSchema>;

/**
 * grill E6 — the frozen two-value evidence-claim vocabulary. The value is the
 * model's DECLARATION; the grounding validator re-checks it against the
 * target node's nodeKind (factor_difference → FactorDifference,
 * factor_fact → FactorFact) so the model cannot relabel an efficiency
 * difference as a defense fact. Axes / directions are always read back from
 * the evidence node, never declared here.
 */
export const CoachEvidenceClaimKindSchema = z.enum([
  "factor_difference",
  "factor_fact",
]);
export type CoachEvidenceClaimKind = z.infer<
  typeof CoachEvidenceClaimKindSchema
>;

/** One evidence claim inside an Explanation: a kind declaration plus the
 *  graph nodeId of the evidence node it renders from. */
export const CoachEvidenceClaimSchema = z.object({
  kind: CoachEvidenceClaimKindSchema,
  /** Graph nodeId of a FactorDifference / FactorFact evidence node. */
  evidenceRef: z.string().min(1),
}).strict();
export type CoachEvidenceClaim = z.infer<typeof CoachEvidenceClaimSchema>;

/**
 * Explanation payload — one user-facing explanation entry. Factual numbers in
 * `text` are always placeholders resolved from the referenced evidence
 * (grill E7): `{diff:<differenceId>.<field>}` / `{candidate:<actionRef>.<field>}`,
 * both matched by `COACH_EXPLANATION_PLACEHOLDER_PATTERN`. Free natural
 * language is reserved for trade-off expression and teaching organization.
 */
export const CoachExplanationPayloadSchema = z.object({
  explanationId: z.string().min(1),
  decisionId: DecisionIdSchema,
  /** User-facing text with evidence placeholders for every factual number. */
  text: z.string().min(1),
  claims: z.array(CoachEvidenceClaimSchema),
}).strict();
export type CoachExplanationPayload = z.infer<
  typeof CoachExplanationPayloadSchema
>;

/** Any reasoning-overlay node payload. */
export type CoachReasoningPayload =
  | CoachInferencePayload
  | CoachJudgmentPayload
  | CoachExplanationPayload;

/**
 * The per-kind reasoning payload map — the single owner of the typed
 * per-kind payload shape (the graph node payload itself stays opaque at the
 * D1 contract level, exactly like evidence payloads). The ReviewReport
 * schema parses overlay node payloads through this map; the reasoning
 * grounding validator consumes the same schemas.
 */
export const REASONING_PAYLOAD_SCHEMAS = Object.freeze({
  CoachInference: CoachInferencePayloadSchema,
  CoachJudgment: CoachJudgmentPayloadSchema,
  Explanation: CoachExplanationPayloadSchema,
} satisfies Readonly<Record<ReasoningGraphNodeKind, z.ZodTypeAny>>);

/**
 * One whole evidence placeholder token: `{diff:<id>.<field>}` or
 * `{candidate:<actionRef>.<field>}` (spec hard layer 5). Anchored to a SINGLE
 * token — scan with a global variant to tokenize a full `text`. The resolver
 * (engine) validates that the rendered value comes from the referenced
 * node's payload; this pattern only freezes the grammar.
 */
export const COACH_EXPLANATION_PLACEHOLDER_PATTERN =
  /^\{(?:diff|candidate):[^{}]+\.[^{}]+\}$/;

// ---------------------------------------------------------------------------
// Model-side draft contract — `coach-reasoning-draft/v1` (spec "LLM 请求 /
// 响应契约与 prompt 版本")
// ---------------------------------------------------------------------------

/**
 * The model-side judgment draft. The model NEVER mints graph identities:
 * only per-decision local ids (`localId` / `judgmentLocalRef`) and nodeIds /
 * actionRefs copied verbatim from the slice. There is deliberately NO
 * schemaVersion field inside the draft — the version rides on
 * `LlmCoachRequest.draftSchemaVersion` and `ReviewGeneration`.
 */
export const CoachDraftJudgmentSchema = z.object({
  localId: z.string().min(1),
  recommendation: ActionRefSchema,
  confidence: CoachConfidenceSchema,
  /** Premise references: slice nodeIds copied verbatim, or the localId of an
   *  inference in the same decision draft — the engine maps local ids to the
   *  engine-derived nodeIds, so the model never mints a graph id. Non-empty
   *  per hard layer 3. */
  premiseRefs: z.array(z.string().min(1)).min(1),
}).strict();
export type CoachDraftJudgment = z.infer<typeof CoachDraftJudgmentSchema>;

export const CoachDraftInferenceSchema = z.object({
  localId: z.string().min(1),
  statement: z.string().min(1),
  premiseRefs: z.array(z.string().min(1)),
}).strict();
export type CoachDraftInference = z.infer<typeof CoachDraftInferenceSchema>;

export const CoachDraftExplanationSchema = z.object({
  text: z.string().min(1),
  claims: z.array(CoachEvidenceClaimSchema),
  /** References the decision's `judgment.localId` (the future `verbalizes`
   *  edge target); optional because judgment-verbalization is an edge, not a
   *  payload truth. */
  judgmentLocalRef: z.string().min(1).optional(),
}).strict();
export type CoachDraftExplanation = z.infer<
  typeof CoachDraftExplanationSchema
>;

export const CoachDraftDecisionSchema = z.object({
  decisionId: DecisionIdSchema,
  judgment: CoachDraftJudgmentSchema,
  inferences: z.array(CoachDraftInferenceSchema).optional(),
  explanations: z.array(CoachDraftExplanationSchema).optional(),
}).strict();
export type CoachDraftDecision = z.infer<typeof CoachDraftDecisionSchema>;

/** The untrusted model output contract (grounding validator input). */
export const CoachReasoningDraftSchema = z.object({
  decisions: z.array(CoachDraftDecisionSchema),
}).strict();
export type CoachReasoningDraft = z.infer<typeof CoachReasoningDraftSchema>;

// ---------------------------------------------------------------------------
// Grounding validator I/O contracts (spec "Grounding validator")
// ---------------------------------------------------------------------------

/**
 * The frozen hard-layer rejection vocabulary — one code per mechanical
 * fail-closed gate (spec hard layers 1–8 plus the forged-identity guard).
 * Semantic / grounding failures are NEVER retried (grill E9).
 */
export const CoachGroundingRejectedCodeSchema = z.enum([
  /** A premiseRef / evidenceRef / verbalizes target does not resolve (1). */
  "dangling_ref",
  /** A reference crosses into another decision's subgraph (1). */
  "cross_decision_ref",
  /** recommendation is not an actionRef of that decision's candidates (2). */
  "recommendation_not_in_candidates",
  /** A CoachJudgment has empty premiseRefs (3). */
  "empty_premise_refs",
  /** A premise is not an evidence node / same-report CoachInference (3). */
  "invalid_premise_kind",
  /** claims[].kind disagrees with the target node's nodeKind (4). */
  "claim_kind_mismatch",
  /** A text placeholder cannot be resolved from its node payload (5). */
  "unresolvable_placeholder",
  /** Payload carries schema-external fields / wrong per-kind shape (6). */
  "invalid_payload",
  /** Overlay fails the D1 partition / context-graph validators (7). */
  "overlay_partition_violation",
  /** A ready decision entry has no CoachJudgment in the overlay (8). */
  "missing_judgment",
  /** The draft mints a nodeId instead of using local ids (identity guard). */
  "forged_node_id",
]);
export type CoachGroundingRejectedCode = z.infer<
  typeof CoachGroundingRejectedCodeSchema
>;

/**
 * The frozen soft-layer finding vocabulary — diagnostics only, NEVER blocks
 * (spec: 自由文本数字扫描、方向词检查、重复 / 长度 / 风格; the known false
 * positives of Chinese number scanning are exactly why it is soft).
 */
export const CoachSoftFindingCodeSchema = z.enum([
  "free_text_number",
  "direction_word",
  "duplicate",
  "length",
  "style",
]);
export type CoachSoftFindingCode = z.infer<
  typeof CoachSoftFindingCodeSchema
>;

/** A hard-layer rejection record (grounds for omitting the row content). */
export const CoachGroundingRejectionSchema = z.object({
  kind: z.literal("grounding_rejected"),
  code: CoachGroundingRejectedCodeSchema,
  decisionId: DecisionIdSchema.optional(),
  detail: z.string().min(1).optional(),
}).strict();
export type CoachGroundingRejection = z.infer<
  typeof CoachGroundingRejectionSchema
>;

/** A soft-layer finding record (diagnostics only, never blocks). */
export const CoachSoftFindingSchema = z.object({
  kind: z.literal("soft_finding"),
  code: CoachSoftFindingCodeSchema,
  decisionId: DecisionIdSchema.optional(),
  detail: z.string().min(1).optional(),
}).strict();
export type CoachSoftFinding = z.infer<typeof CoachSoftFindingSchema>;

/** One ReviewReport diagnostics entry (the report stores the validator
 *  output verbatim — no second truth). */
export const CoachGroundingDiagnosticSchema = z.discriminatedUnion("kind", [
  CoachGroundingRejectionSchema,
  CoachSoftFindingSchema,
]);
export type CoachGroundingDiagnostic = z.infer<
  typeof CoachGroundingDiagnosticSchema
>;

/**
 * The `validateCoachGrounding(graph, draft)` OUTPUT contract: hard violations
 * (any non-empty list fails closed) plus soft findings (recorded, never
 * blocking). `passed` is deliberately NOT a field — it is mechanically
 * `violations.length === 0`, and a stored boolean could drift from the list.
 */
export const CoachGroundingCheckResultSchema = z.object({
  violations: z.array(CoachGroundingRejectionSchema),
  softFindings: z.array(CoachSoftFindingSchema),
}).strict();
export type CoachGroundingCheckResult = z.infer<
  typeof CoachGroundingCheckResultSchema
>;

// ---------------------------------------------------------------------------
// Privileged-process LLM provider port (spec guard 2 — grill E1)
// ---------------------------------------------------------------------------

/**
 * The non-sensitive provider identity `{ providerId, model }`. Strictly NO key
 * material: apiKey / token / header fields are rejected at parse time, and
 * this DTO is the only provider shape the renderer-safe surfaces may carry.
 */
export const LlmProviderDescriptorSchema = z.object({
  providerId: z.string().min(1),
  model: z.string().min(1),
}).strict();
export type LlmProviderDescriptor = z.infer<typeof LlmProviderDescriptorSchema>;

/** Provider-reported token cost (optional — some endpoints omit it). */
export const LlmTokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
}).strict();
export type LlmTokenUsage = z.infer<typeof LlmTokenUsageSchema>;

/**
 * The failure codes of the provider result. The five transport codes
 * (`timeout` / `rate_limited` / `server_error` / `network_reset` /
 * `connection_failed`) are determined by a sent request;
 * `provider_unavailable` (not configured / key missing) is decided before a
 * request is sent and consumes no retry.
 */
export const LlmCoachErrorCodeSchema = z.enum([
  "provider_unavailable",
  "timeout",
  "rate_limited",
  "server_error",
  "network_reset",
  "connection_failed",
]);
export type LlmCoachErrorCode = z.infer<typeof LlmCoachErrorCodeSchema>;

/**
 * One coach completion request — exactly the frozen prompt plus sampling
 * knobs. `temperature` is pinned to literal 0 for v1 (spec: 降低采样抖动;
 * pinned like the selector's T/N so a change is a contract change). Strictly
 * NO key material: authentication is the implementation's concern.
 */
export const LlmCoachRequestSchema = z.object({
  promptVersion: z.literal(COACH_REVIEW_PROMPT_VERSION),
  draftSchemaVersion: z.literal(COACH_REASONING_DRAFT_SCHEMA_VERSION),
  /** The rendered frozen template + slice canonical JSON — nothing else. */
  prompt: z.string().min(1),
  temperature: z.literal(0),
  maxOutputTokens: z.number().int().min(1),
}).strict();
export type LlmCoachRequest = z.infer<typeof LlmCoachRequestSchema>;

/** The success variant: the raw model output (parsed downstream against
 *  `CoachReasoningDraftSchema`; everything outside the structured draft —
 *  including any reasoning / CoT fields — is dropped at parse time). */
export const LlmCoachSuccessSchema = z.object({
  content: z.string().min(1),
  usage: LlmTokenUsageSchema.optional(),
}).strict();
export type LlmCoachSuccess = z.infer<typeof LlmCoachSuccessSchema>;

/** The failure variant. */
export const LlmCoachFailureSchema = z.object({
  errorCode: LlmCoachErrorCodeSchema,
}).strict();
export type LlmCoachFailure = z.infer<typeof LlmCoachFailureSchema>;

export const LlmCoachResultSchema = z.union([
  LlmCoachSuccessSchema,
  LlmCoachFailureSchema,
]);
export type LlmCoachResult = z.infer<typeof LlmCoachResultSchema>;

/**
 * The coach LLM port — a TYPE, not an implementation (spec guard 2). The
 * reasoning engine consumes this type; the desktop main process provides the
 * v1 OpenAI-compatible BYOK implementation and is the sole runtime holder of
 * key material. `descriptor()` never exposes key material; `complete()` never
 * receives any.
 */
export interface LlmCoachProvider {
  descriptor(): LlmProviderDescriptor;
  complete(request: LlmCoachRequest): Promise<LlmCoachResult>;
}

// ---------------------------------------------------------------------------
// ReviewReport contract (spec "ReviewReport 契约")
// ---------------------------------------------------------------------------

/**
 * Report-level generation outcome (grill E4/E9): `complete` = every selected
 * row ready; `partial` = at least one ready and at least one failed;
 * `evidence_only` = zero ready rows (including the empty selection, which
 * never sends a request).
 */
export const GenerationStatusSchema = z.enum([
  "complete",
  "partial",
  "evidence_only",
]);
export type GenerationStatus = z.infer<typeof GenerationStatusSchema>;

/**
 * Row-level explanation status — the frozen five-value vocabulary. D2
 * generation emits `ready` / `provider_unavailable` / `request_failed` /
 * `invalid_output` only (the row set equals `selectedDecisionIds`);
 * `not_selected` is schema-reserved for whole-board M7-A consumers filling
 * rows for decisions outside this report's selection.
 */
export const ExplanationStatusSchema = z.enum([
  "ready",
  "not_selected",
  "provider_unavailable",
  "request_failed",
  "invalid_output",
]);
export type ExplanationStatus = z.infer<typeof ExplanationStatusSchema>;

/**
 * Generation-side component versions — the ONLY place LLM-side versions live
 * (component-version ownership: they never enter the package). For
 * degrade paths the engine still records the descriptor it attempted (or an
 * explicit unconfigured marker); the versions stay non-empty either way.
 */
export const ReviewGenerationSchema = z.object({
  providerId: z.string().min(1),
  model: z.string().min(1),
  promptVersion: z.literal(COACH_REVIEW_PROMPT_VERSION),
  draftSchemaVersion: z.literal(COACH_REASONING_DRAFT_SCHEMA_VERSION),
  /** Reasoning engine (generator) version. */
  generatorVersion: z.string().min(1),
  /** Grounding / report validator version. */
  validatorVersion: z.string().min(1),
  reportSchemaVersion: z.literal(REVIEW_REPORT_SCHEMA_VERSION),
}).strict();
export type ReviewGeneration = z.infer<typeof ReviewGenerationSchema>;

/** One decision row: exactly one per selected decisionId. */
export const ReviewDecisionEntrySchema = z.object({
  decisionId: DecisionIdSchema,
  explanationStatus: ExplanationStatusSchema,
}).strict();
export type ReviewDecisionEntry = z.infer<typeof ReviewDecisionEntrySchema>;

/**
 * The append-only reasoning overlay partition — same node/edge schema as the
 * graph, restricted (below) to the reasoning kinds, `partition = "reasoning"`,
 * `origin = "llm_reasoning"`, `authority = "coach"` (the D1 partition
 * validator's frozen values) with typed per-kind payloads. Edges may target
 * evidence nodeIds of the base graph (e.g. `verbalizes` FactorDifference),
 * so endpoint existence is validated engine-side with the graph, not here.
 */
export const ReviewReasoningOverlaySchema = z.object({
  nodes: z.array(ContextGraphNodeSchema),
  edges: z.array(ContextGraphEdgeSchema),
}).strict();
export type ReviewReasoningOverlay = z.infer<
  typeof ReviewReasoningOverlaySchema
>;

/**
 * Hash-only audit (grill E2): `inputSliceHash` = SHA-256 of the sent slice's
 * canonical JSON; `outputHash` = SHA-256 of the raw model output. The full
 * prompt and response are deliberately NOT persisted — any attempt to store
 * them is rejected by the strict schema.
 */
export const ReviewAuditSchema = z.object({
  inputSliceHash: z.string().min(1),
  outputHash: z.string().min(1),
  usage: LlmTokenUsageSchema.optional(),
  transportRetries: z.number().int().min(0),
}).strict();
export type ReviewAudit = z.infer<typeof ReviewAuditSchema>;

/**
 * The review report artifact. REFERENCES (never embeds) the package; the
 * report is the sole owner of LLM-side generation state, so any failure path
 * leaves the StructuredAnalysisPackage untouched (grill E4). `reportId` =
 * `review-report:<sha256(canonicalJson({packageId, selectorPolicyVersion,
 * generation, decisionEntries, reasoningOverlay}))>` — engine-derived, and
 * `generatedAt` (wall-clock, display-only) never participates in it.
 *
 * The superRefine enforces every MECHANICAL, self-contained invariant so that
 * untrusted read-back (M7-B) fails closed at parse time:
 *  - selected decision ids are unique; the decision-entry set equals the
 *    selection (exactly one row per selected decision);
 *  - generationStatus matches the frozen row-status mapping;
 *  - overlay nodes are reasoning kinds on the frozen partition values with
 *    per-kind typed payloads, and overlay edges use only the D2-reserved
 *    edge kinds;
 *  - ready rows carry at least one CoachJudgment (hard layer 8), and
 *    judgments / explanations exist only for ready rows (grill E9 cascade);
 *    inference payloads stay within the selection.
 * Graph-dependent checks (reference existence, same-decision subgraph,
 * candidate membership, placeholder resolution, evidence deep-equality)
 * remain with `validateCoachGrounding` / `validateReviewReport`, which have
 * the graph the report deliberately does not embed.
 */
export const ReviewReportSchema = z.object({
  schemaVersion: z.literal(REVIEW_REPORT_SCHEMA_VERSION),
  reportId: z.string().min(1),
  /** Reference to (not a copy of) the source StructuredAnalysisPackage. */
  packageId: z.string().min(1),
  selectorPolicyVersion: z.literal(SELECTOR_POLICY_VERSION_V1),
  /** Rank-ascending selected decision ids, mechanically derived by the
   *  engine as `selection.selected.map(s => s.decisionId)`. */
  selectedDecisionIds: z.array(DecisionIdSchema),
  generation: ReviewGenerationSchema,
  generationStatus: GenerationStatusSchema,
  decisionEntries: z.array(ReviewDecisionEntrySchema),
  reasoningOverlay: ReviewReasoningOverlaySchema,
  audit: ReviewAuditSchema,
  diagnostics: z.array(CoachGroundingDiagnosticSchema),
  /** Wall-clock, display-only metadata; excluded from reportId. */
  generatedAt: z.string().datetime(),
})
  .strict()
  .superRefine((report, context) => {
    const addIssue = (message: string, path: (string | number)[]) =>
      context.addIssue({ code: z.ZodIssueCode.custom, message, path });

    // Selection uniqueness (order itself is an engine builder contract,
    // exactly like the slice's rank order).
    if (
      new Set(report.selectedDecisionIds).size !==
      report.selectedDecisionIds.length
    ) {
      addIssue("Selected decision ids must be unique", [
        "selectedDecisionIds",
      ]);
    }

    // Row set = selection set, one row per selected decision.
    const rowStatusById = new Map<string, ExplanationStatus>();
    report.decisionEntries.forEach((entry, index) => {
      if (rowStatusById.has(entry.decisionId)) {
        addIssue(
          `Duplicate decision entry for ${entry.decisionId}`,
          ["decisionEntries", index],
        );
        return;
      }
      rowStatusById.set(entry.decisionId, entry.explanationStatus);
    });
    const selectedSet = new Set(report.selectedDecisionIds);
    for (const decisionId of selectedSet) {
      if (!rowStatusById.has(decisionId)) {
        addIssue(
          `Missing decision entry for selected decision ${decisionId}`,
          ["decisionEntries"],
        );
      }
    }
    for (const decisionId of rowStatusById.keys()) {
      if (!selectedSet.has(decisionId)) {
        addIssue(
          `Decision entry ${decisionId} is outside selectedDecisionIds`,
          ["decisionEntries"],
        );
      }
    }

    // generationStatus follows the frozen row-status mapping.
    const rows = report.decisionEntries;
    const readyCount = rows.filter(
      (entry) => entry.explanationStatus === "ready",
    ).length;
    const expectedStatus: GenerationStatus =
      readyCount === 0
        ? "evidence_only"
        : readyCount === rows.length
          ? "complete"
          : "partial";
    if (report.generationStatus !== expectedStatus) {
      addIssue(
        `generationStatus must be "${expectedStatus}" for these decision entries`,
        ["generationStatus"],
      );
    }

    // Overlay partition shape + per-kind payloads + row coupling.
    const readyIds = new Set(
      rows
        .filter((entry) => entry.explanationStatus === "ready")
        .map((entry) => entry.decisionId),
    );
    const judgmentDecisionIds = new Set<string>();
    report.reasoningOverlay.nodes.forEach((node, index) => {
      const nodeKind = REASONING_GRAPH_NODE_KINDS.find(
        (candidate): candidate is ReasoningGraphNodeKind =>
          candidate === node.nodeKind,
      );
      if (nodeKind === undefined) {
        addIssue(
          `reasoningOverlay node kind "${node.nodeKind}" is not a reasoning-overlay kind`,
          ["reasoningOverlay", "nodes", index, "nodeKind"],
        );
        return;
      }
      if (node.partition !== "reasoning") {
        addIssue(
          `reasoningOverlay node ${node.nodeId} must have partition "reasoning"`,
          ["reasoningOverlay", "nodes", index, "partition"],
        );
      }
      if (node.origin !== "llm_reasoning") {
        addIssue(
          `reasoningOverlay node ${node.nodeId} must have origin "llm_reasoning"`,
          ["reasoningOverlay", "nodes", index, "origin"],
        );
      }
      if (node.authority !== "coach") {
        addIssue(
          `reasoningOverlay node ${node.nodeId} must have authority "coach"`,
          ["reasoningOverlay", "nodes", index, "authority"],
        );
      }
      const payloadResult = REASONING_PAYLOAD_SCHEMAS[nodeKind].safeParse(
        node.payload,
      );
      if (!payloadResult.success) {
        addIssue(
          `reasoningOverlay node ${node.nodeId} payload must satisfy the ${nodeKind} schema`,
          ["reasoningOverlay", "nodes", index, "payload"],
        );
        return;
      }
      const payloadDecisionId = (payloadResult.data as CoachReasoningPayload)
        .decisionId;
      const payloadIdentity = nodeKind === "CoachJudgment"
        ? (payloadResult.data as CoachJudgmentPayload).judgmentId
        : nodeKind === "CoachInference"
          ? (payloadResult.data as CoachInferencePayload).inferenceId
          : (payloadResult.data as CoachExplanationPayload).explanationId;
      if (payloadIdentity !== node.nodeId) {
        addIssue(
          `${nodeKind} payload identity must equal nodeId`,
          ["reasoningOverlay", "nodes", index, "payload"],
        );
      }
      if (!selectedSet.has(payloadDecisionId)) {
        addIssue(
          `reasoningOverlay ${nodeKind} payload decisionId ${payloadDecisionId} is outside selectedDecisionIds`,
          ["reasoningOverlay", "nodes", index, "payload", "decisionId"],
        );
      }
      if (nodeKind === "CoachJudgment") {
        judgmentDecisionIds.add(payloadDecisionId);
        if (!readyIds.has(payloadDecisionId)) {
          addIssue(
            `CoachJudgment for ${payloadDecisionId} requires an entry with explanationStatus "ready"`,
            ["reasoningOverlay", "nodes", index, "payload", "decisionId"],
          );
        }
      }
      if (nodeKind === "Explanation" && !readyIds.has(payloadDecisionId)) {
        addIssue(
          `Explanation for ${payloadDecisionId} requires an entry with explanationStatus "ready" (rejected judgments cascade away their explanations)`,
          ["reasoningOverlay", "nodes", index, "payload", "decisionId"],
        );
      }
    });
    for (const decisionId of readyIds) {
      if (!judgmentDecisionIds.has(decisionId)) {
        addIssue(
          `Every ready decision entry must carry at least one CoachJudgment in the reasoning overlay (${decisionId} has none)`,
          ["reasoningOverlay", "nodes"],
        );
      }
    }
    report.reasoningOverlay.edges.forEach((edge, index) => {
      if (!REASONING_GRAPH_EDGE_KINDS.includes(edge.edgeKind)) {
        addIssue(
          `reasoningOverlay edge kind "${edge.edgeKind}" is not a reasoning-overlay kind`,
          ["reasoningOverlay", "edges", index, "edgeKind"],
        );
      }
    });
  });
export type ReviewReport = z.infer<typeof ReviewReportSchema>;
