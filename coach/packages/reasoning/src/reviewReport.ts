/**
 * M6-D2 — ReviewReport pure-function assembly + the overlay append seam
 * (spec "Solution" items 1–4: `generateReviewReport` / `appendReasoningOverlay`
 * / grounding / report validation).
 *
 * This module owns every DETERMINISTIC piece of report generation; the
 * privileged-process pieces (provider call, retries, key custody) are the
 * desktop composition root's job. Given the provider's already-returned
 * outcome, everything here is a pure function that golden tests can lock:
 *
 *  - `appendReasoningOverlay(graph, nodes, edges)` — the D1-reserved append
 *    action (spec item 2): D1 partition validation first, then a NEW graph
 *    (evidence nodes/edges copied deep-equal, reasoning appended, all sorted
 *    by id) that must re-pass `validateContextGraph`; `graphId` is unchanged
 *    (overlay content identity lives on `reportId`, never on the graph), the
 *    input graph is never mutated, and failures throw instead of returning a
 *    partial graph.
 *  - `assembleReviewReport(input)` — the deterministic half of the
 *    `generateReviewReport` seam (spec item 1): slice building (M6-D1
 *    `buildGraphContextSlice` reuse — the slice stays the ONLY LLM transport
 *    boundary), strict draft parsing, grounding (`validateCoachGrounding`
 *    reuse), draft → overlay mapping with ENGINE-derived node/edge ids,
 *    row-status assembly and the evidence-only degrade paths.
 *
 * Degrade semantics (grill E4/E9, frozen): any LLM failure leaves the
 * StructuredAnalysisPackage untouched — the engine only ever receives the
 * projected graph, so it structurally has no package write access; statuses
 * belong to the ReviewReport alone (`generationStatus` / `explanationStatus`
 * live here and nowhere else):
 *  - `provider_unavailable` → all rows, request never sent;
 *  - `request_failed` → all rows, transport failed after the recorded
 *    retries;
 *  - parse failure → all rows `invalid_output` (no retry — retrying would
 *    launder a hallucination);
 *  - per-decision grounding rejection → that row `invalid_output` with the
 *    validator's violations stored verbatim as diagnostics, ALL of that
 *    decision's overlay content dropped (the E9 cascade: a rejected judgment
 *    takes its explanations with it), other decisions unaffected;
 *  - zero ready rows (including the empty selection, which never sends a
 *    request) → a legal `evidence_only` report.
 *
 * Identity discipline: reasoning nodeIds/edgeIds and `reportId` derive
 * through the shared M6-C serializer (`context-graph-ids` → canonicalJson +
 * SHA-256) over stable semantic keys (`packageId + decisionId + local id` /
 * explanation content). The spec's "语义键 = reportId + …" shorthand cannot be
 * literal — reportId hashes `reasoningOverlay`, which contains the nodeIds —
 * so the packageId binding (the report's own package identity) is the stable
 * non-circular carrier of the same scoping intent.
 */
import {
  COACH_REASONING_DRAFT_SCHEMA_VERSION,
  COACH_REVIEW_PROMPT_VERSION,
  CoachReasoningDraftSchema,
  REVIEW_REPORT_SCHEMA_VERSION,
  ReviewReportSchema,
  ReviewSelectionResultSchema,
  type CoachDraftDecision,
  type CoachDraftExplanation,
  type CoachGroundingDiagnostic,
  type CoachGroundingRejectedCode,
  type CoachGroundingRejection,
  type CoachReasoningDraft,
  type ContextGraph,
  type ContextGraphEdge,
  type ContextGraphNode,
  type GenerationStatus,
  type LlmCoachResult,
  type LlmProviderDescriptor,
  type LlmTokenUsage,
  type ReasoningGraphNodeKind,
  type ReviewAudit,
  type ReviewDecisionEntry,
  type ReviewGeneration,
  type ReviewReasoningOverlay,
  type ReviewReport,
  type ReviewSelectionResult,
} from "@riichi-coach/contracts";
import type { ZodError } from "zod";
import { canonicalJson, sha256Hex } from "./analysis/package-identity.js";
import { compareIds, deriveEdgeId, deriveNodeId } from "./context-graph/context-graph-ids.js";
import { buildGraphContextSlice } from "./context-graph/build-graph-context-slice.js";
import { validateContextGraph } from "./context-graph/validate-context-graph.js";
import { validateReasoningOverlayPartition } from "./context-graph/validate-reasoning-overlay-partition.js";
import { validateCoachGrounding } from "./groundingValidator.js";

// ---------------------------------------------------------------------------
// Frozen generation-side versions (the report is the sole owner of LLM-side
// component versions — they never enter the analysis package)
// ---------------------------------------------------------------------------

/** The reasoning coach engine (generator) version. */
export const COACH_ENGINE_VERSION = "coach-engine/v1" as const;

/** The grounding / report validator version. */
export const COACH_GROUNDING_VALIDATOR_VERSION = "coach-grounding/v1" as const;

const COACH_ENGINE_PRODUCER = "coach-engine" as const;

/** The explicit unconfigured marker recorded on degrade paths where no
 *  provider was ever configured (versions stay non-empty either way). */
export const UNCONFIGURED_COACH_PROVIDER: LlmProviderDescriptor = Object.freeze({
  providerId: "unconfigured",
  model: "unconfigured",
});

/** SHA-256 of the empty output — the deterministic outputHash for every path
 *  where no model output exists. */
const EMPTY_OUTPUT_HASH = `sha256:${sha256Hex("")}`;

// ---------------------------------------------------------------------------
// Provider outcome → assembly input
// ---------------------------------------------------------------------------

/** What the (caller-owned) provider interaction produced. `provider_unavailable`
 *  is decided before any request is sent; `request_failed` carries the actual
 *  transport retry count; `generated` carries the raw model output. */
export type CoachRequestOutcome =
  | { kind: "provider_unavailable" }
  | { kind: "request_failed"; transportRetries: number }
  | {
      kind: "generated";
      content: string;
      usage?: LlmTokenUsage;
      transportRetries: number;
    };

/** Pure mapping of a contracts `LlmCoachResult` DTO onto the assembly
 *  outcome (no provider, no network — the port implementation lives in the
 *  desktop main process). */
export function coachRequestOutcomeFromLlmResult(
  result: LlmCoachResult,
  transportRetries: number,
): CoachRequestOutcome {
  if ("content" in result) {
    if (result.usage !== undefined) {
      return {
        kind: "generated",
        content: result.content,
        usage: result.usage,
        transportRetries,
      };
    }
    return { kind: "generated", content: result.content, transportRetries };
  }
  if (result.errorCode === "provider_unavailable") {
    return { kind: "provider_unavailable" };
  }
  return { kind: "request_failed", transportRetries };
}

// ---------------------------------------------------------------------------
// appendReasoningOverlay (spec item 2 — the D1-reserved append action)
// ---------------------------------------------------------------------------

/** The single overlay append action: validate the proposed reasoning
 *  partition (D1), build a NEW graph (evidence deep-equal, reasoning appended,
 *  deterministically sorted) and require the result to re-pass
 *  `validateContextGraph` (D1) before returning it. The input graph is never
 *  mutated and `graphId` never changes — overlay content identity is carried
 *  by `reportId`, not by the graph. */
export function appendReasoningOverlay(
  graph: ContextGraph,
  reasoningNodesInput: unknown,
  reasoningEdgesInput: unknown,
): ContextGraph {
  try {
    validateReasoningOverlayPartition(graph, reasoningNodesInput, reasoningEdgesInput);
  } catch (error) {
    throw new Error(
      `m6d2_overlay_partition:${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const nodes = [
    ...graph.nodes,
    ...(reasoningNodesInput as ContextGraphNode[]),
  ].sort((left, right) => compareIds(left.nodeId, right.nodeId));
  const edges = [
    ...graph.edges,
    ...(reasoningEdgesInput as ContextGraphEdge[]),
  ].sort((left, right) => compareIds(left.edgeId, right.edgeId));
  const appended: ContextGraph = {
    schemaVersion: graph.schemaVersion,
    graphId: graph.graphId,
    packageId: graph.packageId,
    nodes,
    edges,
  };
  try {
    validateContextGraph(appended);
  } catch (error) {
    throw new Error(
      `m6d2_overlay_invalid:${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return appended;
}

// ---------------------------------------------------------------------------
// Draft → reasoning overlay mapping (engine-derived identities)
// ---------------------------------------------------------------------------

function zodIssueSummary(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ")
    .slice(0, 400);
}

function rejection(
  code: CoachGroundingRejectedCode,
  decisionId: string | undefined,
  detail: string | undefined,
): CoachGroundingRejection {
  const record: CoachGroundingRejection = { kind: "grounding_rejected", code };
  if (decisionId !== undefined) record.decisionId = decisionId;
  if (detail !== undefined) record.detail = detail;
  return record;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function provenanceUnion(
  sources: readonly (readonly string[])[],
): string[] {
  const ids = new Set<string>();
  for (const source of sources) {
    for (const id of source) ids.add(id);
  }
  return [...ids].sort(compareIds);
}

function reasoningNodeOf(input: {
  nodeKind: ReasoningGraphNodeKind;
  nodeId: string;
  payload: unknown;
  provenance: readonly string[];
}): ContextGraphNode {
  return {
    nodeId: input.nodeId,
    nodeKind: input.nodeKind,
    partition: "reasoning",
    origin: "llm_reasoning",
    authority: "coach",
    producer: COACH_ENGINE_PRODUCER,
    producerVersion: COACH_ENGINE_VERSION,
    payload: input.payload,
    provenance: [...input.provenance],
  };
}

/** The engine-derived CoachJudgment node id — semantic key
 *  (packageId, decisionId, "judgment", localId); the model never mints it. */
function judgmentNodeIdOf(
  graph: ContextGraph,
  decisionId: string,
  localId: string,
): string {
  return deriveNodeId("CoachJudgment", [
    graph.packageId,
    decisionId,
    "judgment",
    localId,
  ]);
}

function inferenceNodeIdOf(
  graph: ContextGraph,
  decisionId: string,
  localId: string,
): string {
  return deriveNodeId("CoachInference", [
    graph.packageId,
    decisionId,
    "inference",
    localId,
  ]);
}

/** Draft explanations carry NO local id (frozen draft schema), so the
 *  Explanation node identity is content-derived over the stable scope values
 *  (packageId, decisionId, text, claims) — no array index, no traversal
 *  order. Two identical explanations therefore collide and are rejected by
 *  the grounding validator before they could ever reach this builder. */
function explanationNodeIdOf(
  graph: ContextGraph,
  decisionId: string,
  explanation: CoachDraftExplanation,
): string {
  return deriveNodeId("Explanation", [
    graph.packageId,
    decisionId,
    "explanation",
    explanation.text,
    explanation.claims,
  ]);
}

/** The overlay for the GROUNDED (ready) decisions only — a rejected decision's
 *  entire content is dropped (E9 cascade). Edges are the frozen v1 usage:
 *  Explanation `verbalizes` the decision judgment (judgmentLocalRef) and each
 *  factor_difference claim target. Premise references stay in the payload
 *  (premiseRefs) — v1 drafts carry no stance marker, so no opposes/qualifies
 *  edge is generated; the validator accepts them for report read-back. */
function buildReportReasoningOverlay(
  graph: ContextGraph,
  draft: CoachReasoningDraft,
  readyDecisionIds: Set<string>,
): ReviewReasoningOverlay {
  const graphNodeById = new Map(graph.nodes.map((node) => [node.nodeId, node]));
  const nodes: ContextGraphNode[] = [];
  const edgeById = new Map<string, ContextGraphEdge>();
  const addVerbalizesEdge = (from: string, to: string): void => {
    const edge: ContextGraphEdge = {
      edgeId: deriveEdgeId({ from, to, edgeKind: "verbalizes", payload: {} }),
      edgeKind: "verbalizes",
      from,
      to,
      origin: "llm_reasoning",
      provenance: [],
      payload: {},
    };
    edgeById.set(edge.edgeId, edge);
  };

  for (const decision of draft.decisions) {
    if (!readyDecisionIds.has(decision.decisionId)) continue;

    // Inference nodes first — judgment premises may reference their local ids.
    const inferenceNodeIdByLocal = new Map<string, string>();
    const inferenceProvenanceByNodeId = new Map<string, readonly string[]>();
    for (const inference of decision.inferences ?? []) {
      const nodeId = inferenceNodeIdOf(graph, decision.decisionId, inference.localId);
      inferenceNodeIdByLocal.set(inference.localId, nodeId);
      // Inference premises are evidence nodeIds only (grounding layer 3).
      const provenance = provenanceUnion(
        inference.premiseRefs.map((ref) => graphNodeById.get(ref)?.provenance ?? []),
      );
      inferenceProvenanceByNodeId.set(nodeId, provenance);
      nodes.push(
        reasoningNodeOf({
          nodeKind: "CoachInference",
          nodeId,
          payload: {
            inferenceId: nodeId,
            localId: inference.localId,
            decisionId: decision.decisionId,
            statement: inference.statement,
            premiseRefs: [...inference.premiseRefs],
          },
          provenance,
        }),
      );
    }

    // Judgment node — local premise ids map to engine-derived inference ids.
    const judgmentNodeId = judgmentNodeIdOf(
      graph,
      decision.decisionId,
      decision.judgment.localId,
    );
    const premiseNodeIds = decision.judgment.premiseRefs.map((ref) => {
      if (graphNodeById.has(ref)) return ref;
      return inferenceNodeIdByLocal.get(ref) ?? ref;
    });
    const judgmentProvenance = provenanceUnion(
      premiseNodeIds.map(
        (nodeId) =>
          graphNodeById.get(nodeId)?.provenance ??
          inferenceProvenanceByNodeId.get(nodeId) ??
          [],
      ),
    );
    nodes.push(
      reasoningNodeOf({
        nodeKind: "CoachJudgment",
        nodeId: judgmentNodeId,
        payload: {
          judgmentId: judgmentNodeId,
          localId: decision.judgment.localId,
          decisionId: decision.decisionId,
          recommendation: decision.judgment.recommendation,
          confidence: decision.judgment.confidence,
          premiseRefs: premiseNodeIds,
        },
        provenance: judgmentProvenance,
      }),
    );

    // Explanation nodes + the frozen v1 verbalizes edges.
    for (const explanation of decision.explanations ?? []) {
      const nodeId = explanationNodeIdOf(graph, decision.decisionId, explanation);
      nodes.push(
        reasoningNodeOf({
          nodeKind: "Explanation",
          nodeId,
          payload: {
            explanationId: nodeId,
            decisionId: decision.decisionId,
            text: explanation.text,
            claims: explanation.claims.map((claim) => ({
              kind: claim.kind,
              evidenceRef: claim.evidenceRef,
            })),
          },
          provenance: provenanceUnion(
            explanation.claims.map(
              (claim) => graphNodeById.get(claim.evidenceRef)?.provenance ?? [],
            ),
          ),
        }),
      );
      if (explanation.judgmentLocalRef === decision.judgment.localId) {
        addVerbalizesEdge(nodeId, judgmentNodeId);
      }
      for (const claim of explanation.claims) {
        if (claim.kind === "factor_difference") {
          addVerbalizesEdge(nodeId, claim.evidenceRef);
        }
      }
    }
  }

  return {
    nodes: nodes.sort((left, right) => compareIds(left.nodeId, right.nodeId)),
    edges: [...edgeById.values()].sort((left, right) =>
      compareIds(left.edgeId, right.edgeId),
    ),
  };
}

// ---------------------------------------------------------------------------
// assembleReviewReport
// ---------------------------------------------------------------------------

export interface AssembleReviewReportInput {
  /** A graph that passed `validateContextGraph` (the D1 projection result). */
  graph: ContextGraph;
  /** The same-origin selector result (packageId fail-closed, as in D1). */
  selection: ReviewSelectionResult;
  /** What the provider interaction produced (pure data — no provider here). */
  outcome: CoachRequestOutcome;
  /** The non-sensitive provider identity attempted; defaults to the explicit
   *  unconfigured marker on degrade paths. */
  provider?: LlmProviderDescriptor;
  /** Wall-clock display metadata, caller-owned (injected clock keeps the
   *  assembly pure); never participates in reportId. */
  generatedAt: string;
}

/** Strict parse of the raw model output into the frozen draft contract.
 *  Anything outside the structured draft — including any reasoning / CoT
 *  fields — is dropped here (guard 3); a parse failure is `invalid_output`,
 *  never retried. */
function parseDraftContent(content: string): CoachReasoningDraft | null {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }
  const parsed = CoachReasoningDraftSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * The deterministic ReviewReport assembly (the pure core of the
 * `generateReviewReport` seam). Pure and deterministic: the same
 * (graph, selection, outcome, provider, generatedAt) always produces the same
 * deep-equal, schema-valid report. The returned report has re-passed
 * `ReviewReportSchema` (fail closed on any assembly defect).
 */
export function assembleReviewReport(
  input: AssembleReviewReportInput,
): ReviewReport {
  let selection: ReviewSelectionResult;
  try {
    selection = ReviewSelectionResultSchema.parse(input.selection);
  } catch (error) {
    throw new Error(`m6d2_report_selection_schema:${messageOf(error)}`);
  }
  if (selection.analysisPackageId !== input.graph.packageId) {
    throw new Error(
      `m6d2_report_package_mismatch:${selection.analysisPackageId}`,
    );
  }

  const ranked = [...selection.selected].sort(
    (left, right) => left.rank - right.rank,
  );
  const selectedDecisionIds = ranked.map((item) => item.decisionId);
  const selectedSet = new Set(selectedDecisionIds);

  // M6-D1 reuse: the slice stays the single LLM transport boundary; the audit
  // records only its canonical-JSON hash (grill E2 — hash-only audit).
  const slice = buildGraphContextSlice(input.graph, selection);
  const inputSliceHash = `sha256:${sha256Hex(canonicalJson(slice))}`;

  const provider = input.provider ?? UNCONFIGURED_COACH_PROVIDER;
  const generation: ReviewGeneration = {
    providerId: provider.providerId,
    model: provider.model,
    promptVersion: COACH_REVIEW_PROMPT_VERSION,
    draftSchemaVersion: COACH_REASONING_DRAFT_SCHEMA_VERSION,
    generatorVersion: COACH_ENGINE_VERSION,
    validatorVersion: COACH_GROUNDING_VALIDATOR_VERSION,
    reportSchemaVersion: REVIEW_REPORT_SCHEMA_VERSION,
  };

  const diagnostics: CoachGroundingDiagnostic[] = [];
  let overlay: ReviewReasoningOverlay = { nodes: [], edges: [] };
  let rows: ReviewDecisionEntry[] = [];
  let outputHash = EMPTY_OUTPUT_HASH;
  let usage: LlmTokenUsage | undefined;
  let transportRetries = 0;

  const rowOf = (
    decisionId: string,
    explanationStatus: ReviewDecisionEntry["explanationStatus"],
  ): ReviewDecisionEntry => ({ decisionId, explanationStatus });

  if (input.outcome.kind === "provider_unavailable") {
    // Degrade path 1: no request was ever sent.
    rows = selectedDecisionIds.map((decisionId) =>
      rowOf(decisionId, "provider_unavailable"),
    );
  } else if (input.outcome.kind === "request_failed") {
    // Degrade path 2: transport failed after the recorded retries.
    transportRetries = input.outcome.transportRetries;
    rows = selectedDecisionIds.map((decisionId) =>
      rowOf(decisionId, "request_failed"),
    );
  } else {
    transportRetries = input.outcome.transportRetries;
    if (input.outcome.usage !== undefined) usage = input.outcome.usage;
    outputHash = `sha256:${sha256Hex(input.outcome.content)}`;
    const draft = parseDraftContent(input.outcome.content);
    if (draft === null) {
      // Degrade path 3: unparseable output — invalid_output, no retry.
      rows = selectedDecisionIds.map((decisionId) =>
        rowOf(decisionId, "invalid_output"),
      );
      diagnostics.push(
        rejection(
          "invalid_payload",
          undefined,
          "model output is not a schema-valid coach-reasoning-draft/v1",
        ),
      );
    } else {
      const grounding = validateCoachGrounding(input.graph, draft);
      const readyDecisionIds: string[] = [];
      const draftByDecisionId = new Map<string, CoachDraftDecision>();
      for (const decision of draft.decisions) {
        if (!selectedSet.has(decision.decisionId)) {
          // Slice-external content: the model returned a decision the sent
          // slice never offered — dropped, never enters the overlay.
          diagnostics.push(
            rejection(
              "dangling_ref",
              decision.decisionId,
              `draft decision ${decision.decisionId} is outside the selection`,
            ),
          );
          continue;
        }
        if (!draftByDecisionId.has(decision.decisionId)) {
          draftByDecisionId.set(decision.decisionId, decision);
        }
      }

      // A violation the validator could not attribute to a decision fails the
      // whole draft closed (defense in depth — the row set stays consistent).
      const globalViolations = grounding.violations.filter(
        (violation) => violation.decisionId === undefined,
      );
      for (const item of ranked) {
        if (globalViolations.length > 0) {
          rows.push(rowOf(item.decisionId, "invalid_output"));
          continue;
        }
        const entry = draftByDecisionId.get(item.decisionId);
        if (entry === undefined) {
          diagnostics.push(
            rejection(
              "missing_judgment",
              item.decisionId,
              "selected decision has no draft decision entry",
            ),
          );
          rows.push(rowOf(item.decisionId, "invalid_output"));
          continue;
        }
        const decisionViolations = grounding.violations.filter(
          (violation) => violation.decisionId === item.decisionId,
        );
        if (decisionViolations.length > 0) {
          diagnostics.push(...decisionViolations);
          rows.push(rowOf(item.decisionId, "invalid_output"));
          continue;
        }
        readyDecisionIds.push(item.decisionId);
        rows.push(rowOf(item.decisionId, "ready"));
      }
      diagnostics.push(...globalViolations);
      // Soft findings are recorded verbatim and NEVER block a row.
      diagnostics.push(...grounding.softFindings);
      if (readyDecisionIds.length > 0) {
        overlay = buildReportReasoningOverlay(
          input.graph,
          draft,
          new Set(readyDecisionIds),
        );
      }
    }
  }

  // Hard layer 7 (defensive belt over the builder): nothing enters the report
  // before the overlay survives the D1 partition validator and a full
  // appended-graph validation.
  if (overlay.nodes.length > 0 || overlay.edges.length > 0) {
    try {
      appendReasoningOverlay(input.graph, overlay.nodes, overlay.edges);
    } catch (error) {
      diagnostics.push(
        rejection("overlay_partition_violation", undefined, messageOf(error)),
      );
      overlay = { nodes: [], edges: [] };
      rows = rows.map((row) =>
        row.explanationStatus === "ready"
          ? rowOf(row.decisionId, "invalid_output")
          : row,
      );
    }
  }

  const readyCount = rows.filter((row) => row.explanationStatus === "ready").length;
  const generationStatus: GenerationStatus =
    readyCount === 0
      ? "evidence_only"
      : readyCount === rows.length
        ? "complete"
        : "partial";

  const reportId = `review-report:${sha256Hex(canonicalJson({
    packageId: input.graph.packageId,
    selectorPolicyVersion: selection.policyVersion,
    generation,
    decisionEntries: rows,
    reasoningOverlay: overlay,
  }))}`;

  const audit: ReviewAudit = {
    inputSliceHash,
    outputHash,
    transportRetries,
  };
  if (usage !== undefined) audit.usage = usage;

  const report: ReviewReport = {
    schemaVersion: REVIEW_REPORT_SCHEMA_VERSION,
    reportId,
    packageId: input.graph.packageId,
    selectorPolicyVersion: selection.policyVersion,
    selectedDecisionIds,
    generation,
    generationStatus,
    decisionEntries: rows,
    reasoningOverlay: overlay,
    audit,
    diagnostics,
    generatedAt: input.generatedAt,
  };

  const parsed = ReviewReportSchema.safeParse(report);
  if (!parsed.success) {
    throw new Error(
      `m6d2_report_schema_invalid:${zodIssueSummary(parsed.error)}`,
    );
  }
  return parsed.data;
}
