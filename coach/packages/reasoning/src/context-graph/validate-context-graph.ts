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
  ContextGraphNodeSchema,
  ContextGraphEdgeSchema,
  EVIDENCE_GRAPH_NODE_KINDS,
  REASONING_GRAPH_NODE_KINDS,
  AutomaticComparisonScopeSchema,
  ModelEvaluationSchema,
  deriveAutomaticComparisonScope,
  type ContextGraph,
  type ContextGraphNode,
} from "@riichi-coach/contracts";
import { deriveEdgeId, deriveNodeId, semanticKeyOfNode } from "./context-graph-ids.js";
import { isPlainJson } from "../validate/plain-json.js";

const graphHeaderSchema = ContextGraphSchema.omit({ nodes: true, edges: true });

/** A report scope is derived product policy, not a canonical replay fact.
 * Recompute it from the complete model node before granting recommendation
 * permission. Keep legacy graphs without this policy readable. */
export function validateAutomaticComparisonScopes(graph: ContextGraph): void {
  const decisions = graph.nodes.filter(node => node.nodeKind === "Decision" &&
    (node.payload as Record<string, unknown>).automaticComparisonScope !== undefined);
  if (decisions.length === 0) return;
  const evaluations = new Map<unknown, ContextGraphNode[]>();
  for (const node of graph.nodes) {
    if (node.nodeKind !== "ModelEvaluation") continue;
    const id = (node.payload as Record<string, unknown>).decisionId;
    const entries = evaluations.get(id) ?? [];
    entries.push(node);
    evaluations.set(id, entries);
  }
  const contains = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (edge.edgeKind !== "contains") continue;
    const targets = contains.get(edge.from) ?? new Set<string>();
    targets.add(edge.to);
    contains.set(edge.from, targets);
  }
  for (const decision of decisions) {
    const payload = decision.payload as Record<string, unknown>;
    try {
      const scope = AutomaticComparisonScopeSchema.parse(payload.automaticComparisonScope);
      const matches = evaluations.get(payload.decisionId) ?? [];
      if (matches.length !== 1) throw new Error("expected one same-decision model evaluation");
      const model = matches[0]!;
      if (!contains.get(decision.nodeId)?.has(model.nodeId) || model.partition !== "evidence" ||
          model.origin !== "model_evaluation" || model.authority !== "model") {
        throw new Error("model evaluation is not bound to this decision");
      }
      const { decisionId: _decisionId, ...rawEvaluation } = model.payload as Record<string, unknown>;
      const expected = deriveAutomaticComparisonScope(ModelEvaluationSchema.parse(rawEvaluation));
      if (!isDeepStrictEqual(scope, expected)) throw new Error("scope differs from model-derived policy");
    } catch (error) {
      throw new Error(`m6d1_graph_validator_automatic_comparison:${decision.nodeId}:${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

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
  if (!isPlainJson(value)) {
    throw new Error(
      "m6d1_graph_validator_roundtrip_mismatch: graph contains a non-JSON value",
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
  assertJsonRoundtrip(input);
  rejectCausesEdges(input);

  let graph: ContextGraph;
  try {
    // The graph schema is a strict header plus arrays of strict records. Parse
    // those same contracts one record at a time instead of retaining a second
    // complete graph (hundreds of thousands of edges in real packages).
    if (input === null || typeof input !== "object" || Array.isArray(input)) throw new Error("expected graph object");
    const { nodes, edges, ...header } = input as Record<string, unknown>;
    const parsedHeader = graphHeaderSchema.parse(header);
    if (!isDeepStrictEqual(parsedHeader, header)) throw new Error("header normalization");
    if (!Array.isArray(nodes) || !Array.isArray(edges)) throw new Error("expected graph arrays");
    for (const node of nodes) {
      if (!isDeepStrictEqual(ContextGraphNodeSchema.parse(node), node)) throw new Error("node normalization");
    }
    for (const edge of edges) {
      if (!isDeepStrictEqual(ContextGraphEdgeSchema.parse(edge), edge)) throw new Error("edge normalization");
    }
    graph = input as ContextGraph;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`m6d1_graph_validator_schema:${message}`);
  }

  // graphId invariant (spec "Graph 总体形状"): D1's graphId is deterministically
  // derived as `context-graph:<packageId>` — a stale graphId is a tamper.
  if (graph.graphId !== `context-graph:${graph.packageId}`) {
    throw new Error(`m6d1_graph_validator_graph_id_mismatch:${graph.graphId}`);
  }
  validateAutomaticComparisonScopes(graph);

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
