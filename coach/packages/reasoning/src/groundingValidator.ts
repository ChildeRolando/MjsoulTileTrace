/**
 * M6-D2 — the graph-grounded validator pair (spec "Grounding validator" +
 * "`validateReviewReport(report, graph)`").
 *
 *  1. `validateCoachGrounding(graph, draft)` — the hard/soft grounding
 *     validator over the UNTRUSTED model-side `coach-reasoning-draft/v1`
 *     (grill E5/E8). Hard layers are the mechanical publication gate: pure,
 *     fail closed, and NEVER retried (grill E9 — retrying would launder a
 *     hallucination). Soft layers are diagnostics only and never block.
 *  2. `validateReviewReport(report, graph)` — the ReviewReport read-back
 *     validator for untrusted input (M7-B disk roundtrip, INV-006/007): every
 *     graph-dependent invariant the report schema deliberately cannot check
 *     (the report references, never embeds, the graph).
 *
 * Slice-scope discipline (task acceptance: CoachInference / CoachJudgment 的
 * evidence 引用均来自 GraphContextSlice allow-list 范围): the model only ever
 * saw `buildGraphContextSlice` output, so the allow-list scope of a draft
 * decision D is EXACTLY D's decision subgraph with slice-filtered payloads.
 * This module reuses the M6-D1 capabilities instead of re-slicing —
 * `getDecisionSubgraph` for the scope and `filterNodePayloadForSlice` for the
 * payload boundary — so a reference that resolves against the raw graph but
 * NOT against the sent slice (e.g. a field the allow-list strips, or another
 * decision's node) still fails closed.
 *
 * Hard layers implemented here (spec list 1–6 + the forged-identity guard):
 *  1. premiseRefs / claims[].evidenceRef / judgmentLocalRef resolve to nodes
 *     of the SAME decision subgraph (`dangling_ref` / `cross_decision_ref`);
 *  2. recommendation is an actionRef of the decision's CandidateAction set
 *     (`recommendation_not_in_candidates`);
 *  3. judgment premises are evidence nodes or same-decision draft
 *     CoachInference entries; inference premises are evidence nodes only
 *     (`invalid_premise_kind`). The "premiseRefs non-empty" clause of layer 3
 *     is owned by the strict draft schema (`min(1)`) — the validator re-parses
 *     the draft, so an empty list surfaces as `invalid_payload` instead;
 *  4. claims[].kind agrees with the target node's nodeKind
 *     (`claim_kind_mismatch`) — axes and directions are read back from the
 *     evidence node, never declared;
 *  5. every text placeholder resolves to a scalar of the referenced node's
 *     allow-listed payload (`unresolvable_placeholder`);
 *  6. payload carries no schema-external structure — the draft is re-parsed
 *     strictly (`invalid_payload`), and colliding local identities (duplicate
 *     localId / duplicate decision entry / duplicate explanation content that
 *     would collide the engine-derived node ids) fail the same way;
 *  +  a self-forged `ctxg:` id that resolves nowhere is `forged_node_id`.
 *
 * Layers 7 (overlay partition + appended-graph validation) and 8 (ready row
 * carries ≥1 CoachJudgment) live with the overlay/report constructors in
 * `reviewReport.ts` (`appendReasoningOverlay`, the report schema) — they need
 * the assembled overlay, which does not exist yet at draft-validation time.
 *
 * Soft layer (frozen v1 heuristics, diagnostics ONLY — never blocking): free
 * text numeral scan (the known false positives of Chinese number scanning are
 * exactly why it is soft, grill E7), direction-word scan, duplicate text,
 * length, raw-id style leak.
 *
 * Everything here is a deterministic pure function: no network, no provider,
 * no wall clock, no randomness; the same (graph, draft) always produces the
 * same deep-equal result.
 */
import {
  COACH_EXPLANATION_PLACEHOLDER_PATTERN,
  CoachInferencePayloadSchema,
  CoachJudgmentPayloadSchema,
  CoachReasoningDraftSchema,
  CoachExplanationPayloadSchema,
  ReviewReportSchema,
  type CoachGroundingCheckResult,
  type CoachGroundingRejectedCode,
  type CoachGroundingRejection,
  type CoachReasoningDraft,
  type CoachSoftFinding,
  type ContextGraph,
  type ContextGraphNode,
  type ReviewReport,
} from "@riichi-coach/contracts";
import type { ZodError } from "zod";
import { canonicalJson, sha256Hex } from "./analysis/package-identity.js";
import { deriveEdgeId, deriveNodeId } from "./context-graph/context-graph-ids.js";
import { getDecisionSubgraph } from "./context-graph/get-decision-subgraph.js";
import { filterNodePayloadForSlice } from "./context-graph/slice-payload.js";
import { validateReasoningOverlayPartition } from "./context-graph/validate-reasoning-overlay-partition.js";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Overlay-payload grounding failure (validateReviewReport): throw-based, so
 *  the first violation wins and TypeScript narrows the scope after the null
 *  guard (function declarations are honored for never-returning calls). */
function groundingThrow(code: string, detail: string): never {
  throw new Error(`m6d2_report_grounding:${code}:${detail}`);
}

function zodIssueSummary(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ")
    .slice(0, 400);
}

/** A hard rejection record (optional fields only when present, so the frozen
 *  strict schema shape is always met). */
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

/** The decision subgraph scope, with payloads filtered through the single
 *  slice allow-list filter — the exact data the model was shown for this
 *  decision (M6-D1 reuse; no re-slicing, no boundary relaxation). */
type DecisionScope = Map<string, { node: ContextGraphNode; payload: Record<string, unknown> }>;

function decisionNodeOf(
  graph: ContextGraph,
  decisionId: string,
): ContextGraphNode | undefined {
  return graph.nodes.find(
    (node) =>
      node.nodeKind === "Decision" &&
      (node.payload as { decisionId?: unknown }).decisionId === decisionId,
  );
}

function scopeOfDecision(
  graph: ContextGraph,
  decisionId: string,
): DecisionScope | null {
  if (decisionNodeOf(graph, decisionId) === undefined) return null;
  const scope: DecisionScope = new Map();
  for (const node of getDecisionSubgraph(graph, decisionId).nodes) {
    scope.set(node.nodeId, { node, payload: filterNodePayloadForSlice(node) });
  }
  return scope;
}

/** Draft reference resolution outcome (identity guard included). */
type DraftRefOutcome =
  | "evidence_node"
  | "reasoning_node"
  | "local_inference"
  | "local_judgment"
  | "cross_decision"
  | "forged_node_id"
  | "dangling";

const ENGINE_ID_PREFIX = "ctxg:";

function unresolvedRefCode(
  graphNodeIds: Set<string>,
  ref: string,
): CoachGroundingRejectedCode {
  if (graphNodeIds.has(ref)) return "cross_decision_ref";
  if (ref.startsWith(ENGINE_ID_PREFIX)) return "forged_node_id";
  return "dangling_ref";
}

function resolveDraftRef(input: {
  scope: DecisionScope;
  graphNodeIds: Set<string>;
  inferenceLocalIds: Set<string>;
  judgmentLocalId: string;
  ref: string;
}): DraftRefOutcome {
  const scoped = input.scope.get(input.ref);
  if (scoped !== undefined) {
    return scoped.node.partition === "evidence"
      ? "evidence_node"
      : "reasoning_node";
  }
  if (input.inferenceLocalIds.has(input.ref)) return "local_inference";
  if (input.ref === input.judgmentLocalId) return "local_judgment";
  if (input.graphNodeIds.has(input.ref)) return "cross_decision";
  if (input.ref.startsWith(ENGINE_ID_PREFIX)) return "forged_node_id";
  return "dangling";
}

function premiseViolationCode(
  outcome: DraftRefOutcome,
  allowInference: boolean,
): CoachGroundingRejectedCode | null {
  if (outcome === "evidence_node") return null;
  if (outcome === "local_inference") {
    return allowInference ? null : "invalid_premise_kind";
  }
  if (outcome === "local_judgment" || outcome === "reasoning_node") {
    return "invalid_premise_kind";
  }
  if (outcome === "cross_decision") return "cross_decision_ref";
  if (outcome === "forged_node_id") return "forged_node_id";
  return "dangling_ref";
}

// ---------------------------------------------------------------------------
// Placeholder resolution (hard layer 5)
// ---------------------------------------------------------------------------

/** Any brace token of the text — valid placeholders AND malformed ones (a
 *  malformed `{...}` is itself an unresolvable placeholder). */
const PLACEHOLDER_TOKEN_PATTERN = /\{[^{}]*\}/g;

/** Resolves one grammar-valid placeholder token against the decision scope's
 *  allow-listed payloads. Resolvable iff the referenced node exists in the
 *  scope and the (possibly dotted) field path lands on a JSON scalar — the
 *  rendered value must come from the referenced node's payload, never from
 *  the model (grill E7). The id/field split is at the FIRST dot; ids carry
 *  colons (`difference:v1:...`, `action:v1:...`) but never dots. */
function resolveExplanationPlaceholder(
  scope: DecisionScope,
  token: string,
): boolean {
  const body = token.slice(1, -1);
  const colonAt = body.indexOf(":");
  if (colonAt < 0) return false;
  const kind = body.slice(0, colonAt);
  const rest = body.slice(colonAt + 1);
  const dotAt = rest.indexOf(".");
  if (dotAt < 0) return false;
  const ref = rest.slice(0, dotAt);
  const fieldPath = rest.slice(dotAt + 1);
  if (ref === "" || fieldPath === "") return false;

  let expectedKind: ContextGraphNode["nodeKind"] | undefined;
  let key: string | undefined;
  if (kind === "diff") {
    expectedKind = "FactorDifference";
    key = "differenceId";
  } else if (kind === "candidate") {
    expectedKind = "CandidateAction";
    key = "actionRef";
  } else {
    return false;
  }

  const target = [...scope.values()].find(
    (entry) =>
      entry.node.nodeKind === expectedKind && entry.payload[key!] === ref,
  );
  if (target === undefined) return false;

  let current: unknown = target.payload;
  for (const segment of fieldPath.split(".")) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) {
      return false;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return (
    typeof current === "string" ||
    typeof current === "number" ||
    typeof current === "boolean"
  );
}

// ---------------------------------------------------------------------------
// Soft layer (frozen v1 heuristics — diagnostics only, never blocking)
// ---------------------------------------------------------------------------

const SOFT_DIRECTION_WORDS: readonly string[] = Object.freeze([
  "更快", "更慢", "更安全", "更危险", "更优", "更差", "优于", "劣于",
]);
const SOFT_TEXT_LENGTH_LIMIT = 500;
const FREE_TEXT_NUMBER_PATTERN = /[0-9０-９〇一二三四五六七八九十百千万亿两]/u;
const RAW_GRAPH_ID_PATTERN = /ctxg:[A-Za-z][A-Za-z0-9_]*:/u;

function softFinding(
  code: CoachSoftFinding["code"],
  decisionId: string,
  detail: string,
): CoachSoftFinding {
  return { kind: "soft_finding", code, decisionId, detail };
}

function collectSoftFindings(
  sink: CoachSoftFinding[],
  decisionId: string,
  text: string,
): void {
  const outsidePlaceholders = text.split(PLACEHOLDER_TOKEN_PATTERN).join("");
  if (FREE_TEXT_NUMBER_PATTERN.test(outsidePlaceholders)) {
    sink.push(
      softFinding("free_text_number", decisionId, "free text numeral outside placeholders"),
    );
  }
  const directionWord = SOFT_DIRECTION_WORDS.find((word) => text.includes(word));
  if (directionWord !== undefined) {
    sink.push(
      softFinding("direction_word", decisionId, `direction word "${directionWord}" should be read back from evidence`),
    );
  }
  if (text.length > SOFT_TEXT_LENGTH_LIMIT) {
    sink.push(
      softFinding("length", decisionId, `text length ${text.length} exceeds ${SOFT_TEXT_LENGTH_LIMIT}`),
    );
  }
  if (RAW_GRAPH_ID_PATTERN.test(outsidePlaceholders)) {
    sink.push(softFinding("style", decisionId, "text leaks a raw graph id"));
  }
}

// ---------------------------------------------------------------------------
// validateCoachGrounding
// ---------------------------------------------------------------------------

/**
 * The hard/soft grounding validator (spec seam support function; pure and
 * deterministic). Hard violations are GROUNDS FOR OMITTING the decision's row
 * content — the caller (report assembly) fails closed on any non-empty
 * violations list; soft findings are recorded and never block.
 */
export function validateCoachGrounding(
  graph: ContextGraph,
  draft: CoachReasoningDraft,
): CoachGroundingCheckResult {
  const violations: CoachGroundingRejection[] = [];
  const softFindings: CoachSoftFinding[] = [];

  // Layer 6 / defense in depth: the engine parses the raw model output
  // against the strict draft schema BEFORE grounding; a draft that no longer
  // parses is a hard invalid_payload — the LLM may not carry schema-external
  // structure (no new structured facts, no CoT fields).
  const parsed = CoachReasoningDraftSchema.safeParse(draft);
  if (!parsed.success) {
    violations.push(
      rejection("invalid_payload", undefined, `draft schema: ${zodIssueSummary(parsed.error)}`),
    );
    return { violations, softFindings };
  }

  const graphNodeIds = new Set(graph.nodes.map((node) => node.nodeId));
  const seenDecisionIds = new Set<string>();

  for (const decision of parsed.data.decisions) {
    if (seenDecisionIds.has(decision.decisionId)) {
      violations.push(
        rejection("invalid_payload", decision.decisionId, `duplicate draft decision entry ${decision.decisionId}`),
      );
      continue;
    }
    seenDecisionIds.add(decision.decisionId);

    const scope = scopeOfDecision(graph, decision.decisionId);
    if (scope === null) {
      violations.push(
        rejection("dangling_ref", decision.decisionId, `decisionId ${decision.decisionId} does not resolve to a Decision node of the graph`),
      );
      continue;
    }

    // Local identity well-formedness: colliding local ids would collide the
    // engine-derived reasoning node ids (identity discipline — the model never
    // mints graph identities), so they are a hard payload defect. Resolution
    // keeps inference ids separate from the judgment id: a judgment premise
    // may reference inference local ids, but never the judgment's own.
    const judgmentLocalId = decision.judgment.localId;
    const seenLocalIds = new Set<string>([judgmentLocalId]);
    const inferenceLocalIds = new Set<string>();
    const inferences = decision.inferences ?? [];
    for (const inference of inferences) {
      if (seenLocalIds.has(inference.localId)) {
        violations.push(
          rejection("invalid_payload", decision.decisionId, `duplicate draft localId ${inference.localId}`),
        );
      }
      seenLocalIds.add(inference.localId);
      inferenceLocalIds.add(inference.localId);
    }

    // Layer 2: recommendation inside the decision's CandidateAction set (the
    // slice allow-list keeps CandidateAction.actionRef).
    const candidateActionRefs = new Set(
      [...scope.values()]
        .filter((entry) => entry.node.nodeKind === "CandidateAction")
        .map((entry) => entry.payload.actionRef)
        .filter((ref): ref is string => typeof ref === "string"),
    );
    if (!candidateActionRefs.has(decision.judgment.recommendation)) {
      violations.push(
        rejection("recommendation_not_in_candidates", decision.decisionId, `recommendation ${decision.judgment.recommendation} is not a CandidateAction of the decision`),
      );
    }

    // Layer 1/3 — inference premises: evidence nodes of the same decision
    // subgraph only (an inference may not premise on another inference).
    for (const inference of inferences) {
      for (const ref of inference.premiseRefs) {
        const outcome = resolveDraftRef({
          scope, graphNodeIds, inferenceLocalIds, judgmentLocalId, ref,
        });
        const code = premiseViolationCode(outcome, false);
        if (code !== null) {
          violations.push(
            rejection(code, decision.decisionId, `inference ${inference.localId} premise ${ref} (${outcome})`),
          );
        }
      }
    }

    // Layer 1/3 — judgment premises: evidence nodes or same-decision draft
    // CoachInference entries.
    for (const ref of decision.judgment.premiseRefs) {
      const outcome = resolveDraftRef({
        scope, graphNodeIds, inferenceLocalIds, judgmentLocalId, ref,
      });
      const code = premiseViolationCode(outcome, true);
      if (code !== null) {
        violations.push(
          rejection(code, decision.decisionId, `judgment ${judgmentLocalId} premise ${ref} (${outcome})`),
        );
      }
    }

    // Layers 1/4/5 + soft layer over the explanation entries.
    const seenExplanationKeys = new Set<string>();
    const seenTexts = new Set<string>();
    for (const explanation of decision.explanations ?? []) {
      const contentKey = canonicalJson({
        text: explanation.text,
        claims: explanation.claims,
      });
      if (seenExplanationKeys.has(contentKey)) {
        violations.push(
          rejection("invalid_payload", decision.decisionId, "duplicate explanation content (engine-derived node id would collide)"),
        );
      }
      seenExplanationKeys.add(contentKey);
      if (seenTexts.has(explanation.text)) {
        softFindings.push(
          softFinding("duplicate", decision.decisionId, "identical explanation text within the decision"),
        );
      }
      seenTexts.add(explanation.text);

      if (
        explanation.judgmentLocalRef !== undefined &&
        explanation.judgmentLocalRef !== judgmentLocalId
      ) {
        violations.push(
          rejection("dangling_ref", decision.decisionId, `judgmentLocalRef ${explanation.judgmentLocalRef} does not resolve to the decision judgment`),
        );
      }

      for (const claim of explanation.claims) {
        const scoped = scope.get(claim.evidenceRef);
        if (scoped !== undefined) {
          const expectedKind =
            claim.kind === "factor_difference" ? "FactorDifference" : "FactorFact";
          if (scoped.node.nodeKind !== expectedKind) {
            violations.push(
              rejection("claim_kind_mismatch", decision.decisionId, `claim kind ${claim.kind} disagrees with target nodeKind ${scoped.node.nodeKind}`),
            );
          }
          continue;
        }
        violations.push(
          rejection(
            unresolvedRefCode(graphNodeIds, claim.evidenceRef),
            decision.decisionId,
            `claim evidenceRef ${claim.evidenceRef} does not resolve within the decision slice scope`,
          ),
        );
      }

      for (const token of explanation.text.match(PLACEHOLDER_TOKEN_PATTERN) ?? []) {
        if (
          !COACH_EXPLANATION_PLACEHOLDER_PATTERN.test(token) ||
          !resolveExplanationPlaceholder(scope, token)
        ) {
          violations.push(
            rejection("unresolvable_placeholder", decision.decisionId, `placeholder ${token} cannot be resolved from the slice payloads`),
          );
        }
      }

      collectSoftFindings(softFindings, decision.decisionId, explanation.text);
    }
  }

  return { violations, softFindings };
}

// ---------------------------------------------------------------------------
// validateReviewReport
// ---------------------------------------------------------------------------

/** Overlay-space premise resolution for the read-back validator: same-decision
 *  evidence nodes, or same-report CoachInference nodes (now real nodeIds). */
function overlayPremiseViolationCode(input: {
  scope: DecisionScope;
  graphNodeIds: Set<string>;
  overlayNodeIds: Set<string>;
  inferenceDecisionByNodeId: Map<string, string>;
  decisionId: string;
  ref: string;
  allowInference: boolean;
}): CoachGroundingRejectedCode | null {
  const scoped = input.scope.get(input.ref);
  if (scoped !== undefined) {
    return scoped.node.partition === "evidence" ? null : "invalid_premise_kind";
  }
  if (input.overlayNodeIds.has(input.ref)) {
    const ownerDecision = input.inferenceDecisionByNodeId.get(input.ref);
    if (ownerDecision === undefined) return "invalid_premise_kind";
    if (ownerDecision !== input.decisionId) return "cross_decision_ref";
    return input.allowInference ? null : "invalid_premise_kind";
  }
  return unresolvedRefCode(input.graphNodeIds, input.ref);
}

/**
 * The ReviewReport read-back validator (spec item 4): accepts UNTRUSTED input
 * (e.g. a report read back from disk, M7-B) and fails closed with
 * `m6d2_report_*` errors. The report schema (contracts) already owns every
 * mechanical self-contained invariant; this validator adds the
 * graph-dependent ones:
 *  - same-source proof (`report.packageId === graph.packageId`);
 *  - every selectedDecisionId resolves to a Decision node;
 *  - the overlay passes the D1 partition validator (reasoning kinds/values,
 *    endpoint existence, no evidence-origin edges) and every overlay edge id
 *    is recomputable through the shared serializer (tamper detection);
 *  - overlay payloads re-pass grounding: recommendation membership, premise
 *    references (evidence or same-report same-decision CoachInference nodes),
 *    claim kind agreement, placeholder resolvability;
 *  - reportId is recomputable from the frozen formula.
 */
export function validateReviewReport(
  reportInput: unknown,
  graph: ContextGraph,
): void {
  const parsed = ReviewReportSchema.safeParse(reportInput);
  if (!parsed.success) {
    throw new Error(`m6d2_report_schema:${zodIssueSummary(parsed.error)}`);
  }
  const report: ReviewReport = parsed.data;

  if (report.packageId !== graph.packageId) {
    throw new Error(`m6d2_report_package_mismatch:${report.packageId}`);
  }

  for (const decisionId of report.selectedDecisionIds) {
    if (decisionNodeOf(graph, decisionId) === undefined) {
      throw new Error(`m6d2_report_decision_unresolved:${decisionId}`);
    }
  }

  // Layer 7 reuse: the D1 partition validator over the reported overlay.
  try {
    validateReasoningOverlayPartition(
      graph,
      report.reasoningOverlay.nodes,
      report.reasoningOverlay.edges,
    );
  } catch (error) {
    throw new Error(`m6d2_report_overlay_partition:${messageOf(error)}`);
  }

  const graphNodeById = new Map(
    graph.nodes.map((node) => [node.nodeId, node] as const),
  );
  const overlayNodeById = new Map(
    report.reasoningOverlay.nodes.map((node) => [node.nodeId, node] as const),
  );

  for (const edge of report.reasoningOverlay.edges) {
    const expected = deriveEdgeId({
      from: edge.from,
      to: edge.to,
      edgeKind: edge.edgeKind,
      payload: edge.payload,
    });
    if (edge.edgeId !== expected) {
      throw new Error(`m6d2_report_overlay_edge_id_mismatch:${edge.edgeId}`);
    }

    // A read-back edge must start from this report's overlay. Its kind fixes
    // the legal endpoint shapes; a syntactically valid edge kind is not
    // sufficient by itself.
    const from = overlayNodeById.get(edge.from);
    const to = overlayNodeById.get(edge.to) ?? graphNodeById.get(edge.to);
    const endpointKindsValid = edge.edgeKind === "verbalizes"
      ? from?.nodeKind === "Explanation" &&
        (to?.nodeKind === "CoachJudgment" || to?.nodeKind === "FactorDifference")
      : (from?.nodeKind === "CoachJudgment" || from?.nodeKind === "CoachInference") &&
        to?.partition === "evidence";
    if (!endpointKindsValid || from === undefined || to === undefined) {
      throw new Error(`m6d2_report_overlay_edge_endpoint_kind:${edge.edgeId}`);
    }

    const fromDecisionId = (from.payload as { decisionId?: unknown }).decisionId;
    const toDecisionId = (to.payload as { decisionId?: unknown }).decisionId;
    if (
      typeof fromDecisionId !== "string" ||
      typeof toDecisionId !== "string" ||
      fromDecisionId !== toDecisionId
    ) {
      throw new Error(`m6d2_report_overlay_edge_cross_decision:${edge.edgeId}`);
    }
  }

  // Graph-dependent grounding over the overlay payloads.
  const graphNodeIds = new Set(graphNodeById.keys());
  const overlayNodeIds = new Set(overlayNodeById.keys());
  const inferenceDecisionByNodeId = new Map<string, string>();
  for (const node of report.reasoningOverlay.nodes) {
    if (node.nodeKind !== "CoachInference") continue;
    const payload = CoachInferencePayloadSchema.parse(node.payload);
    inferenceDecisionByNodeId.set(node.nodeId, payload.decisionId);
  }

  for (const node of report.reasoningOverlay.nodes) {
    if (node.nodeKind === "CoachJudgment") {
      const payload = CoachJudgmentPayloadSchema.parse(node.payload);
      const expectedNodeId = deriveNodeId("CoachJudgment", [
        graph.packageId,
        payload.decisionId,
        "judgment",
        payload.localId,
      ]);
      if (node.nodeId !== expectedNodeId || payload.judgmentId !== expectedNodeId) {
        throw new Error(`m6d2_report_overlay_node_id_mismatch:${node.nodeId}`);
      }
      const scope = scopeOfDecision(graph, payload.decisionId);
      if (scope === null) {
        groundingThrow("dangling_ref", `decisionId ${payload.decisionId}`);
      }
      const candidateActionRefs = new Set(
        [...scope.values()]
          .filter((entry) => entry.node.nodeKind === "CandidateAction")
          .map((entry) => entry.payload.actionRef)
          .filter((ref): ref is string => typeof ref === "string"),
      );
      if (!candidateActionRefs.has(payload.recommendation)) {
        groundingThrow(
          "recommendation_not_in_candidates",
          `${payload.judgmentId}:${payload.recommendation}`,
        );
      }
      for (const ref of payload.premiseRefs) {
        const code = overlayPremiseViolationCode({
          scope, graphNodeIds, overlayNodeIds, inferenceDecisionByNodeId,
          decisionId: payload.decisionId, ref, allowInference: true,
        });
        if (code !== null) groundingThrow(code, `${payload.judgmentId}:${ref}`);
      }
      continue;
    }

    if (node.nodeKind === "CoachInference") {
      const payload = CoachInferencePayloadSchema.parse(node.payload);
      const expectedNodeId = deriveNodeId("CoachInference", [
        graph.packageId,
        payload.decisionId,
        "inference",
        payload.localId,
      ]);
      if (node.nodeId !== expectedNodeId || payload.inferenceId !== expectedNodeId) {
        throw new Error(`m6d2_report_overlay_node_id_mismatch:${node.nodeId}`);
      }
      const scope = scopeOfDecision(graph, payload.decisionId);
      if (scope === null) {
        groundingThrow("dangling_ref", `decisionId ${payload.decisionId}`);
      }
      for (const ref of payload.premiseRefs) {
        const code = overlayPremiseViolationCode({
          scope, graphNodeIds, overlayNodeIds, inferenceDecisionByNodeId,
          decisionId: payload.decisionId, ref, allowInference: false,
        });
        if (code !== null) groundingThrow(code, `${payload.inferenceId}:${ref}`);
      }
      continue;
    }

    const payload = CoachExplanationPayloadSchema.parse(node.payload);
    const expectedExplanationId = deriveNodeId("Explanation", [
      graph.packageId,
      payload.decisionId,
      "explanation",
      payload.text,
      payload.claims,
    ]);
    if (
      node.nodeId !== expectedExplanationId ||
      payload.explanationId !== expectedExplanationId
    ) {
      throw new Error(`m6d2_report_overlay_node_id_mismatch:${node.nodeId}`);
    }
    const scope = scopeOfDecision(graph, payload.decisionId);
    if (scope === null) {
      groundingThrow("dangling_ref", `decisionId ${payload.decisionId}`);
    }
    for (const claim of payload.claims) {
      const scoped = scope.get(claim.evidenceRef);
      if (scoped === undefined) {
        groundingThrow(
          unresolvedRefCode(graphNodeIds, claim.evidenceRef),
          `${payload.explanationId}:${claim.evidenceRef}`,
        );
      }
      const expectedKind =
        claim.kind === "factor_difference" ? "FactorDifference" : "FactorFact";
      if (scoped.node.nodeKind !== expectedKind) {
        groundingThrow(
          "claim_kind_mismatch",
          `${payload.explanationId}:${claim.evidenceRef}`,
        );
      }
    }
    for (const token of payload.text.match(PLACEHOLDER_TOKEN_PATTERN) ?? []) {
      if (
        !COACH_EXPLANATION_PLACEHOLDER_PATTERN.test(token) ||
        !resolveExplanationPlaceholder(scope, token)
      ) {
        groundingThrow(
          "unresolvable_placeholder",
          `${payload.explanationId}:${token}`,
        );
      }
    }
  }

  // Identity: reportId must be recomputable from the frozen formula (the
  // shared serializer — no second canonicalization).
  const expectedReportId = `review-report:${sha256Hex(canonicalJson({
    packageId: report.packageId,
    selectorPolicyVersion: report.selectorPolicyVersion,
    generation: report.generation,
    decisionEntries: report.decisionEntries,
    reasoningOverlay: report.reasoningOverlay,
  }))}`;
  if (report.reportId !== expectedReportId) {
    throw new Error(`m6d2_report_id_mismatch:${report.reportId}`);
  }
}
