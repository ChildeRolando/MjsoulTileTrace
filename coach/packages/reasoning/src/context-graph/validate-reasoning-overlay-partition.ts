/**
 * M6-D1 — `validateReasoningOverlayPartition`: the reasoning-overlay
 * schema/partition validator (spec "Reasoning overlay 分区校验", guard 2).
 *
 * D1 does NOT generate reasoning: there is no `appendReasoningOverlay`
 * implementation and the projector emits no CoachInference / CoachJudgment /
 * Explanation nodes or edges (spec guard: D1 不实现 appendReasoningOverlay 的
 * 追加动作，不产生任何 CoachInference / CoachJudgment / Explanation 节点或边).
 * This module only validates a PROPOSED reasoning partition (nodes + edges)
 * before any future D2 append could return a new graph:
 *
 *  - every reasoning node: `partition === "reasoning"`,
 *    `origin === "llm_reasoning"`, `authority === "coach"`, nodeKind in the
 *    three reasoning kinds (spec rule 1/2);
 *  - every reasoning edge: edgeKind in the D2-reserved kinds (opposes /
 *    qualifies / verbalizes — spec: 前六种由 projection 使用; 这三种保留给
 *    reasoning overlay), origin `llm_reasoning`, from/to resolve to an
 *    existing graph node or a same-batch reasoning node (spec rule 3);
 *  - reasoning node ids are unique within the batch and never collide with
 *    existing graph node ids (fail-closed hardening; the appended graph must
 *    keep globally unique node ids);
 *  - a reasoning edge must never start from an evidence node (spec rule 4:
 *    reasoning edge 不得以 evidence 节点为 from 去改 evidence 语义) — the D2
 *    append implementation must additionally preserve the evidence nodes and
 *    edges deep-equal (spec: evidence edge 不得因 overlay 增删而变化), which is
 *    mechanically enforced by the append's own construction contract in D2.
 *
 * Failure throws `m6d1_reasoning_partition_*` and never returns a mutated
 * graph (there is no append action in D1).
 */
import {
  ContextGraphEdgeSchema,
  ContextGraphNodeSchema,
  REASONING_GRAPH_EDGE_KINDS,
  REASONING_GRAPH_NODE_KINDS,
  type ContextGraph,
  type ContextGraphNode,
} from "@riichi-coach/contracts";

export function validateReasoningOverlayPartition(
  graph: ContextGraph,
  reasoningNodesInput: unknown,
  reasoningEdgesInput: unknown,
): void {
  const graphNodeIds = new Set(graph.nodes.map((node) => node.nodeId));
  const evidenceNodeIds = new Set(
    graph.nodes
      .filter((node) => node.partition === "evidence")
      .map((node) => node.nodeId),
  );
  const batchNodeIds = new Set<string>();

  if (!Array.isArray(reasoningNodesInput) || !Array.isArray(reasoningEdgesInput)) {
    throw new Error("m6d1_reasoning_partition_schema: nodes and edges must be arrays");
  }

  for (const rawNode of reasoningNodesInput) {
    let node: ContextGraphNode;
    try {
      node = ContextGraphNodeSchema.parse(rawNode);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`m6d1_reasoning_partition_schema:${message}`);
    }
    if (!REASONING_GRAPH_NODE_KINDS.includes(node.nodeKind)) {
      throw new Error(`m6d1_reasoning_partition_kind:${node.nodeId}`);
    }
    if (node.partition !== "reasoning") {
      throw new Error(`m6d1_reasoning_partition_partition:${node.nodeId}`);
    }
    if (node.origin !== "llm_reasoning") {
      throw new Error(`m6d1_reasoning_partition_origin:${node.nodeId}`);
    }
    if (node.authority !== "coach") {
      throw new Error(`m6d1_reasoning_partition_authority:${node.nodeId}`);
    }
    // Fail-closed hardening (review P2): reasoning node ids must be unique
    // within the batch and never collide with existing graph node ids —
    // otherwise the appended graph would fail global id uniqueness.
    if (batchNodeIds.has(node.nodeId)) {
      throw new Error(`m6d1_reasoning_partition_duplicate_node_id:${node.nodeId}`);
    }
    if (graphNodeIds.has(node.nodeId)) {
      throw new Error(`m6d1_reasoning_partition_node_id_collision:${node.nodeId}`);
    }
    batchNodeIds.add(node.nodeId);
  }

  for (const rawEdge of reasoningEdgesInput) {
    let edge;
    try {
      edge = ContextGraphEdgeSchema.parse(rawEdge);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`m6d1_reasoning_partition_schema:${message}`);
    }
    if (!REASONING_GRAPH_EDGE_KINDS.includes(edge.edgeKind)) {
      throw new Error(`m6d1_reasoning_partition_edge_kind:${edge.edgeId}:${edge.edgeKind}`);
    }
    // Fail-closed hardening (review P2): a reasoning edge is LLM-produced —
    // its origin must be llm_reasoning, never a projection origin.
    if (edge.origin !== "llm_reasoning") {
      throw new Error(`m6d1_reasoning_partition_edge_origin:${edge.edgeId}`);
    }
    // Spec rule 3: from/to resolve to an existing graph node or a same-batch
    // reasoning node.
    if (!graphNodeIds.has(edge.from) && !batchNodeIds.has(edge.from)) {
      throw new Error(`m6d1_reasoning_partition_edge_dangling:${edge.edgeId}:from`);
    }
    if (!graphNodeIds.has(edge.to) && !batchNodeIds.has(edge.to)) {
      throw new Error(`m6d1_reasoning_partition_edge_dangling:${edge.edgeId}:to`);
    }
    // Spec rule 4: reasoning edges never start from an evidence node.
    if (evidenceNodeIds.has(edge.from)) {
      throw new Error(`m6d1_reasoning_partition_edge_from_evidence:${edge.edgeId}`);
    }
  }
}
