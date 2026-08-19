/**
 * M6-D1 — `validateContextGraph`: the graph structural validator (spec
 * "Graph / slice 校验" + design §11 rules + 投影不变量).
 *
 * Accepts UNTRUSTED input (e.g. a graph read back from disk) and fails
 * closed. At minimum:
 *  - strict schema parse + JSON roundtrip unchanged;
 *  - nodeId / edgeId globally unique AND recomputable from the node/edge's own
 *    payload via the SHARED derivation (tampering the payload without
 *    updating the id fails; guard 1);
 *  - edge endpoints resolve to existing nodes;
 *  - no `causes` and no unknown edge kind (named pre-scan + schema enum);
 *  - evidence-partition nodes: origin never `llm_reasoning`, authority never
 *    `coach`, nodeKind in the evidence kinds;
 *  - reasoning-partition nodes: origin `llm_reasoning`, authority `coach`,
 *    nodeKind in the three reasoning kinds;
 *  - all edges (incl. reasoning edges) resolve to existing nodes.
 *
 * The evidence nodes/edges immutability under a reasoning overlay is enforced
 * mechanically by `validateReasoningOverlayPartition` (spec: 该分区规则的校验
 * 在 validateReasoningOverlayPartition 中机械执行), not duplicated here.
 */
import { isDeepStrictEqual } from "node:util";
import {
  ContextGraphSchema,
  EVIDENCE_GRAPH_NODE_KINDS,
  REASONING_GRAPH_NODE_KINDS,
  type ContextGraph,
  type ContextGraphNode,
} from "@riichi-coach/contracts";
import { deriveEdgeId, deriveNodeId, semanticKeyOfNode } from "./context-graph-ids.js";

/** Named `causes` rejection before schema parse (spec: graph 校验拒绝任何
 * 未知 edge kind 与 `causes` 字符串). */
function rejectCausesEdges(input: unknown): void {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return;
  const edges = (input as Record<string, unknown>).edges;
  if (!Array.isArray(edges)) return;
  for (const edge of edges) {
    if (
      edge !== null &&
      typeof edge === "object" &&
      !Array.isArray(edge) &&
      (edge as Record<string, unknown>).edgeKind === "causes"
    ) {
      throw new Error("m6d1_graph_validator_causes_edge");
    }
  }
}

function recomputeNodeId(node: ContextGraphNode): string {
  return deriveNodeId(node.nodeKind, semanticKeyOfNode(node.nodeKind, node.payload));
}

/** JSON roundtrip must leave the graph unchanged (non-JSON values such as
 *  NaN / undefined are rejected here, spec: strict schema 解析与 JSON
 *  roundtrip 不变). */
function assertJsonRoundtrip(value: unknown): void {
  let roundtripped: unknown;
  try {
    roundtripped = JSON.parse(JSON.stringify(value));
  } catch {
    throw new Error(
      "m6d1_graph_validator_roundtrip_mismatch: graph contains a non-JSON value",
    );
  }
  if (!isDeepStrictEqual(roundtripped, value)) {
    throw new Error(
      "m6d1_graph_validator_roundtrip_mismatch: graph changes under JSON serialization",
    );
  }
}

function assertNodeIdRecomputable(node: ContextGraphNode): void {
  let expected: string;
  try {
    expected = recomputeNodeId(node);
  } catch {
    // A missing semantic key field means the payload cannot produce the id.
    throw new Error(`m6d1_graph_validator_node_key_missing:${node.nodeId}`);
  }
  if (node.nodeId !== expected) {
    throw new Error(`m6d1_graph_validator_node_id_mismatch:${node.nodeId}`);
  }
}

export function validateContextGraph(input: unknown): void {
  rejectCausesEdges(input);

  let graph: ContextGraph;
  try {
    graph = ContextGraphSchema.parse(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`m6d1_graph_validator_schema:${message}`);
  }
  if (!isDeepStrictEqual(graph, input)) {
    throw new Error(
      "m6d1_graph_validator_schema_normalization: schema parse must not reshape the graph",
    );
  }
  // JSON roundtrip unchanged (CR-5 style serializability at the graph layer).
  assertJsonRoundtrip(graph);

  // Global uniqueness + recomputability (spec: nodeId / edgeId 全局唯一且可重算
  // 一致). Reasoning-partition node ids have no D1 derivation (D2 owns them),
  // so recomputation applies to evidence-partition nodes only.
  const seenNodeIds = new Set<string>();
  for (const node of graph.nodes) {
    if (seenNodeIds.has(node.nodeId)) {
      throw new Error(`m6d1_graph_validator_duplicate_node_id:${node.nodeId}`);
    }
    seenNodeIds.add(node.nodeId);
    if (node.partition === "evidence") assertNodeIdRecomputable(node);
  }
  const seenEdgeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (seenEdgeIds.has(edge.edgeId)) {
      throw new Error(`m6d1_graph_validator_duplicate_edge_id:${edge.edgeId}`);
    }
    seenEdgeIds.add(edge.edgeId);
    const expected = deriveEdgeId({
      from: edge.from,
      to: edge.to,
      edgeKind: edge.edgeKind,
      payload: edge.payload,
    });
    if (edge.edgeId !== expected) {
      throw new Error(`m6d1_graph_validator_edge_id_mismatch:${edge.edgeId}`);
    }
  }

  // Edge endpoints resolve to existing nodes (spec: edge 端点解析到存在节点;
  // 所有 reasoning edge 必须解析到存在节点).
  const nodeIds = new Set(graph.nodes.map((node) => node.nodeId));
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.from)) {
      throw new Error(`m6d1_graph_validator_dangling_edge:${edge.edgeId}:from`);
    }
    if (!nodeIds.has(edge.to)) {
      throw new Error(`m6d1_graph_validator_dangling_edge:${edge.edgeId}:to`);
    }
  }

  // Partition rules (spec: evidence 分区节点 origin 不得为 llm_reasoning、
  // authority 不得为 coach; reasoning 分区节点 origin 必须为 llm_reasoning、
  // authority 必须为 coach、nodeKind 必须是三种 reasoning kind).
  for (const node of graph.nodes) {
    if (node.partition === "evidence") {
      if (!EVIDENCE_GRAPH_NODE_KINDS.includes(node.nodeKind)) {
        throw new Error(`m6d1_graph_validator_evidence_kind:${node.nodeId}`);
      }
      if (node.origin === "llm_reasoning") {
        throw new Error(`m6d1_graph_validator_evidence_origin:${node.nodeId}`);
      }
      if (node.authority === "coach") {
        throw new Error(`m6d1_graph_validator_evidence_authority:${node.nodeId}`);
      }
    } else {
      // reasoning partition
      if (!REASONING_GRAPH_NODE_KINDS.includes(node.nodeKind)) {
        throw new Error(`m6d1_graph_validator_reasoning_kind:${node.nodeId}`);
      }
      if (node.origin !== "llm_reasoning") {
        throw new Error(`m6d1_graph_validator_reasoning_origin:${node.nodeId}`);
      }
      if (node.authority !== "coach") {
        throw new Error(`m6d1_graph_validator_reasoning_authority:${node.nodeId}`);
      }
    }
  }
}
