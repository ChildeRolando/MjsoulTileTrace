/**
 * M6-D1 — `validateGraphContextSlice`: the slice validator / LLM-boundary
 * gate (spec "Graph / slice 校验").
 *
 * Signature: `validateGraphContextSlice(slice, graph, selection)` — the
 * source graph AND the originating selection are both required, because the
 * slice itself carries no policy version or ranks: `sliceId` is recomputed
 * from `(graph.packageId, selection.policyVersion, slice.selectedDecisionIds)`
 * and `selectedDecisionIds` must equal the selection's rank-ordered decision
 * ids. Accepts UNTRUSTED input and fails closed. At minimum:
 *  - strict schema parse + JSON roundtrip unchanged;
 *  - payloads inside the explicit allow-list (named rejection), no URL, no
 *    privileged / LLM-boundary payload;
 *  - `slice.packageId === graph.packageId` (same-source proof, guard 3) and
 *    sliceId recomputable;
 *  - `selectedDecisionIds` matches the selection's rank order and every id
 *    resolves to a Decision node of the graph;
 *  - every slice node/edge matches the source graph node/edge of the same id
 *    (metadata verbatim; node payload must equal the allow-list-filtered graph
 *    payload — the single `slice-payload` filter guarantees builder/validator
 *    agreement);
 *  - slice edge endpoints resolve within the slice.
 */
import { isDeepStrictEqual } from "node:util";
import {
  GraphContextSliceSchema,
  slicePayloadViolations,
  type ContextGraph,
  type ContextGraphNode,
  type GraphContextSlice,
  type ReviewSelectionResult,
} from "@riichi-coach/contracts";
import { deriveSliceId } from "./context-graph-ids.js";
import { filterNodePayloadForSlice } from "./slice-payload.js";

/** LLM-boundary artifact keys (same policy as the M6-C package validator,
 *  CR-1): CoachJudgment / ExplanationBullet / CoachInference / ReviewReport
 *  never cross the LLM boundary inside a slice. */
const LLM_BOUNDARY_KEYS = [
  "CoachJudgment",
  "CoachInference",
  "ExplanationBullet",
  "ReviewReport",
  "coachJudgement",
  "coachJudgment",
  "coachInference",
  "explanationBullets",
  "reviewReport",
] as const;

function containsForbiddenKey(
  value: unknown,
  forbidden: readonly string[],
): string | null {
  if (value === null || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const hit = containsForbiddenKey(entry, forbidden);
      if (hit !== null) return hit;
    }
    return null;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (forbidden.includes(key)) return key;
    const hit = containsForbiddenKey(record[key], forbidden);
    if (hit !== null) return hit;
  }
  return null;
}

function containsUrl(value: unknown): boolean {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    // "任何 URL" (spec allow-list): http(s) covers the realistic paipu
    // download URL threat; ftp:// is caught for completeness.
    return lower.includes("http://") || lower.includes("https://")
      || lower.includes("ftp://");
  }
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((entry) => containsUrl(entry));
  return Object.values(value as Record<string, unknown>)
    .some((entry) => containsUrl(entry));
}

function rejectUrlsAndForbiddenKeys(input: unknown): void {
  const forbiddenKey = containsForbiddenKey(input, LLM_BOUNDARY_KEYS);
  if (forbiddenKey !== null) {
    throw new Error(`m6d1_slice_validator_forbidden_key:${forbiddenKey}`);
  }
  if (containsUrl(input)) {
    throw new Error(
      "m6d1_slice_validator_privileged_payload: slice contains an http(s) URL",
    );
  }
}

/** JSON roundtrip must leave the slice unchanged (spec: strict schema 解析与
 *  JSON roundtrip 不变). */
function assertJsonRoundtrip(value: unknown): void {
  let roundtripped: unknown;
  try {
    roundtripped = JSON.parse(JSON.stringify(value));
  } catch {
    throw new Error(
      "m6d1_slice_validator_roundtrip_mismatch: slice contains a non-JSON value",
    );
  }
  if (!isDeepStrictEqual(roundtripped, value)) {
    throw new Error(
      "m6d1_slice_validator_roundtrip_mismatch: slice changes under JSON serialization",
    );
  }
}

/** Named allow-list rejection before schema parse (the schema also enforces
 *  it, but a named error is asserted by tests). */
function rejectAllowListViolations(sliceInput: unknown): void {
  if (sliceInput === null || typeof sliceInput !== "object" || Array.isArray(sliceInput)) {
    return;
  }
  const nodes = (sliceInput as Record<string, unknown>).nodes;
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    if (node === null || typeof node !== "object" || Array.isArray(node)) continue;
    const record = node as Record<string, unknown>;
    if (typeof record.nodeKind !== "string" || typeof record.nodeId !== "string") {
      continue; // schema parse reports the malformed node
    }
    const violations = slicePayloadViolations(
      record.payload,
      record.nodeKind as ContextGraphNode["nodeKind"],
    );
    if (violations.length > 0) {
      throw new Error(
        `m6d1_slice_validator_allowlist:${record.nodeId}:${violations[0]}`,
      );
    }
  }
}

function decisionIdsOf(graph: ContextGraph): Set<string> {
  return new Set(
    graph.nodes
      .filter((node) => node.nodeKind === "Decision")
      .map((node) => (node.payload as { decisionId?: unknown }).decisionId)
      .filter((id): id is string => typeof id === "string"),
  );
}

export function validateGraphContextSlice(
  sliceInput: unknown,
  graph: ContextGraph,
  selection: ReviewSelectionResult,
): void {
  rejectUrlsAndForbiddenKeys(sliceInput);
  rejectAllowListViolations(sliceInput);

  let slice: GraphContextSlice;
  try {
    slice = GraphContextSliceSchema.parse(sliceInput);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`m6d1_slice_validator_schema:${message}`);
  }
  if (!isDeepStrictEqual(slice, sliceInput)) {
    throw new Error(
      "m6d1_slice_validator_schema_normalization: schema parse must not reshape the slice",
    );
  }
  // JSON roundtrip unchanged.
  assertJsonRoundtrip(slice);

  // Same-source proof (guard 3): packageId only.
  if (slice.packageId !== graph.packageId) {
    throw new Error(
      `m6d1_slice_validator_package_mismatch:${slice.packageId}`,
    );
  }
  // Guard-3 reinforcement (review P2): the ORIGINATING selection must itself
  // be bound to the graph's packageId — validating a slice against a foreign
  // selection would weaken the same-source proof.
  if (selection.analysisPackageId !== graph.packageId) {
    throw new Error(
      `m6d1_slice_validator_selection_package_mismatch:${selection.analysisPackageId}`,
    );
  }

  // sliceId recomputable (spec: sliceId 可重算一致).
  const expectedSliceId = deriveSliceId({
    packageId: graph.packageId,
    policyVersion: selection.policyVersion,
    selectedDecisionIds: slice.selectedDecisionIds,
  });
  if (slice.sliceId !== expectedSliceId) {
    throw new Error(`m6d1_slice_validator_slice_id_mismatch:${slice.sliceId}`);
  }

  // selectedDecisionIds in the selection's rank order, each resolving to a
  // Decision node (spec: selectedDecisionIds 按 rank 升序且每个都能解析到
  // Decision 节点 — the selection is the rank authority).
  const rankOrdered = [...selection.selected]
    .sort((left, right) => left.rank - right.rank)
    .map((item) => item.decisionId);
  if (!isDeepStrictEqual(slice.selectedDecisionIds, rankOrdered)) {
    throw new Error("m6d1_slice_validator_selection_mismatch");
  }
  const decisionIds = decisionIdsOf(graph);
  for (const decisionId of slice.selectedDecisionIds) {
    if (!decisionIds.has(decisionId)) {
      throw new Error(`m6d1_slice_validator_decision_unresolved:${decisionId}`);
    }
  }

  // Slice nodes/edges match the source graph of the same id (spec: 所有 slice
  // node/edge 能匹配源 graph 中同 id 节点/边).
  const graphNodeById = new Map(graph.nodes.map((node) => [node.nodeId, node]));
  const graphEdgeById = new Map(graph.edges.map((edge) => [edge.edgeId, edge]));
  const sliceNodeIds = new Set(slice.nodes.map((node) => node.nodeId));
  for (const sliceNode of slice.nodes) {
    const graphNode = graphNodeById.get(sliceNode.nodeId);
    if (graphNode === undefined) {
      throw new Error(`m6d1_slice_validator_node_mismatch:${sliceNode.nodeId}`);
    }
    const metadataEqual =
      graphNode.nodeKind === sliceNode.nodeKind &&
      graphNode.partition === sliceNode.partition &&
      graphNode.origin === sliceNode.origin &&
      graphNode.authority === sliceNode.authority &&
      graphNode.producer === sliceNode.producer &&
      graphNode.producerVersion === sliceNode.producerVersion &&
      isDeepStrictEqual(graphNode.provenance, sliceNode.provenance);
    const payloadEqual = isDeepStrictEqual(
      filterNodePayloadForSlice(graphNode),
      sliceNode.payload,
    );
    if (!metadataEqual || !payloadEqual) {
      throw new Error(`m6d1_slice_validator_node_mismatch:${sliceNode.nodeId}`);
    }
  }
  for (const sliceEdge of slice.edges) {
    const graphEdge = graphEdgeById.get(sliceEdge.edgeId);
    if (graphEdge === undefined) {
      throw new Error(`m6d1_slice_validator_edge_mismatch:${sliceEdge.edgeId}`);
    }
    const equal =
      graphEdge.edgeKind === sliceEdge.edgeKind &&
      graphEdge.from === sliceEdge.from &&
      graphEdge.to === sliceEdge.to &&
      graphEdge.origin === sliceEdge.origin &&
      isDeepStrictEqual(graphEdge.provenance, sliceEdge.provenance) &&
      isDeepStrictEqual(graphEdge.payload, sliceEdge.payload);
    if (!equal) {
      throw new Error(`m6d1_slice_validator_edge_mismatch:${sliceEdge.edgeId}`);
    }
  }

  // Structural sanity: slice edge endpoints resolve within the slice.
  for (const sliceEdge of slice.edges) {
    if (!sliceNodeIds.has(sliceEdge.from) || !sliceNodeIds.has(sliceEdge.to)) {
      throw new Error(`m6d1_slice_validator_dangling_edge:${sliceEdge.edgeId}`);
    }
  }
}
