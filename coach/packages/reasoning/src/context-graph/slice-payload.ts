/**
 * M6-D1 — the single slice-payload filter (spec "GraphContextSlice
 * allow-list").
 *
 * The slice builder and the slice validator BOTH filter graph node payloads
 * through exactly this implementation, so "slice node matches graph node"
 * never drifts from what the builder emits. The filter:
 *  - keeps only `GRAPH_SLICE_PAYLOAD_ALLOWLIST[nodeKind]` keys;
 *  - strips the wall-clock `ModelEvaluation.detailPolicy.frozenAt`.
 *
 * Evidence ids never ride in slice payloads — they live on
 * `node.provenance`.
 */
import {
  GRAPH_SLICE_PAYLOAD_ALLOWLIST,
  type ContextGraphNode,
} from "@riichi-coach/contracts";

/** The allow-list-filtered slice payload of a graph node. */
export function filterNodePayloadForSlice(node: ContextGraphNode): Record<string, unknown> {
  const allowed = new Set(GRAPH_SLICE_PAYLOAD_ALLOWLIST[node.nodeKind]);
  const raw = node.payload as Record<string, unknown>;
  const filtered: Record<string, unknown> = {};
  for (const key of Object.keys(raw)) {
    if (allowed.has(key)) filtered[key] = raw[key];
  }
  if (node.nodeKind === "ModelEvaluation" && filtered.detailPolicy !== undefined) {
    const detailPolicy = filtered.detailPolicy as Record<string, unknown>;
    const { frozenAt: _frozenAt, ...rest } = detailPolicy;
    filtered.detailPolicy = rest;
  }
  return filtered;
}

/** The full slice node: node metadata kept verbatim, payload filtered. */
export function sliceNodeOf(node: ContextGraphNode): ContextGraphNode {
  return {
    ...node,
    payload: filterNodePayloadForSlice(node),
  };
}
