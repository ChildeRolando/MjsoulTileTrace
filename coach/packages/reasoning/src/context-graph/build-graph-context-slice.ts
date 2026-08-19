/**
 * M6-D1 — `buildGraphContextSlice`: the ONLY LLM-context slice seam (spec:
 * 两个平级新增 seam 之二; 唯一 LLM 上下文切片构建入口; M6-D2 的 LLM 传输边界).
 *
 *   ContextGraph + ReviewSelectionResult → deterministic GraphContextSlice
 *
 * Same-source proof is packageId ONLY (guard 3, spec): `selection
 * .analysisPackageId === graph.packageId` is the single same-source criterion
 * — no decisionId prefix, no recordId, no other weak match may substitute it.
 * The emitted slice `packageId` is COPIED from `graph.packageId` — never
 * recomputed, never taken from a third source. Every `selected.decisionId`
 * must resolve to a Decision node of the graph (fail closed).
 *
 * Slice scope: for each selected decision, the decision subgraph; node/edge
 * unions are deduplicated by id and deterministically sorted. Node payloads
 * are filtered through the explicit allow-list (`slice-payload.ts`), so the
 * LLM surface never expands with graph-local audit fields. An EMPTY selection
 * returns a legal empty slice (spec user story 8): empty selectedDecisionIds,
 * empty nodes/edges, `packageId` still equal to `graph.packageId`.
 *
 * `selectedDecisionIds` follows the selection's rank order (spec: selected
 * 的顺序进入 slice 的 selectedDecisionIds（按 rank 升序）).
 */
import {
  GRAPH_CONTEXT_SLICE_SCHEMA_VERSION,
  ReviewSelectionResultSchema,
  type ContextGraph,
  type ContextGraphEdge,
  type ContextGraphNode,
  type GraphContextSlice,
  type ReviewSelectionResult,
} from "@riichi-coach/contracts";
import { compareIds, deriveSliceId } from "./context-graph-ids.js";
import { getDecisionSubgraph } from "./get-decision-subgraph.js";
import { sliceNodeOf } from "./slice-payload.js";

/** The slice building seam (spec seam 2). Pure and deterministic: the same
 *  graph + same selection always produce the same deep-equal slice. */
export function buildGraphContextSlice(
  graph: ContextGraph,
  selectionInput: ReviewSelectionResult,
): GraphContextSlice {
  // Fail-fast on a malformed selection (the selector always emits a valid
  // ReviewSelectionResult; untrusted callers fail closed here).
  let selection: ReviewSelectionResult;
  try {
    selection = ReviewSelectionResultSchema.parse(selectionInput);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`m6d1_slice_builder_selection_schema:${message}`);
  }

  // Guard 3: same-source proof is packageId ONLY.
  if (selection.analysisPackageId !== graph.packageId) {
    throw new Error(
      `m6d1_slice_builder_package_mismatch:${selection.analysisPackageId}`,
    );
  }

  // Rank-ascending selection order enters the slice verbatim (spec).
  const selections = [...selection.selected].sort(
    (left, right) => left.rank - right.rank,
  );
  const selectedDecisionIds = selections.map((item) => item.decisionId);

  // Pre-check (fail closed): every selected decisionId must resolve to a
  // Decision node of the graph (spec "前置校验还包括").
  const decisionIds = new Set(
    graph.nodes
      .filter((node) => node.nodeKind === "Decision")
      .map((node) => (node.payload as { decisionId?: unknown }).decisionId)
      .filter((id): id is string => typeof id === "string"),
  );
  for (const item of selections) {
    if (!decisionIds.has(item.decisionId)) {
      throw new Error(`m6d1_slice_builder_unknown_decision:${item.decisionId}`);
    }
  }

  // Union of the selected decisions' deterministic subgraphs, deduplicated by
  // id, deterministically sorted.
  const nodeById = new Map<string, ContextGraphNode>();
  const edgeById = new Map<string, ContextGraphEdge>();
  for (const item of selections) {
    const subgraph = getDecisionSubgraph(graph, item.decisionId);
    for (const node of subgraph.nodes) nodeById.set(node.nodeId, node);
    for (const edge of subgraph.edges) edgeById.set(edge.edgeId, edge);
  }
  const nodes = [...nodeById.values()]
    .sort((left, right) => compareIds(left.nodeId, right.nodeId));
  const edges = [...edgeById.values()]
    .sort((left, right) => compareIds(left.edgeId, right.edgeId));

  return {
    schemaVersion: GRAPH_CONTEXT_SLICE_SCHEMA_VERSION,
    sliceId: deriveSliceId({
      packageId: graph.packageId,
      policyVersion: selection.policyVersion,
      selectedDecisionIds,
    }),
    packageId: graph.packageId,
    selectedDecisionIds,
    // Node metadata kept, payload allow-list filtered (spec allow-list table).
    nodes: nodes.map(sliceNodeOf),
    edges,
  };
}
