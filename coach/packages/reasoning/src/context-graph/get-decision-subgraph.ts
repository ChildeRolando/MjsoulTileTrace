/**
 * M6-D1 — `getDecisionSubgraph`: per-decision deterministic reachable
 * subgraph (spec "Per-decision subgraph" / user stories 18/19).
 *
 * Starting from the Decision node identified by `decisionId`, the traversal
 * follows the directed projection edges (from → to) ONLY — it is a
 * "reachable from the Decision" subgraph, never an undirected connected
 * component (spec: 不在 Decision → ... 有向可达集中的共享 Evidence 节点不会被
 * 反向拉入其他决策). A shared Evidence node therefore never drags another
 * decision's Factor/Decision nodes into this subgraph.
 *
 * An unknown `decisionId` fails closed (spec: decisionId 不存在时 fail
 * closed，不返回空图). Output is deterministically sorted by id.
 */
import type { ContextGraph, ContextGraphEdge, ContextGraphNode } from "@riichi-coach/contracts";
import { compareIds } from "./context-graph-ids.js";

export type DecisionSubgraph = {
  nodes: ContextGraphNode[];
  edges: ContextGraphEdge[];
};

export function getDecisionSubgraph(
  graph: ContextGraph,
  decisionId: string,
): DecisionSubgraph {
  const root = graph.nodes.find(
    (node) =>
      node.nodeKind === "Decision" &&
      (node.payload as { decisionId?: unknown }).decisionId === decisionId,
  );
  if (root === undefined) {
    throw new Error(`m6d1_subgraph_unknown_decision:${decisionId}`);
  }

  // Out-edge index (directed: from → to).
  const outEdges = new Map<string, ContextGraphEdge[]>();
  for (const edge of graph.edges) {
    const list = outEdges.get(edge.from);
    if (list === undefined) {
      outEdges.set(edge.from, [edge]);
    } else {
      list.push(edge);
    }
  }

  const reachableIds = new Set<string>([root.nodeId]);
  const queue = [root.nodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of outEdges.get(current) ?? []) {
      if (!reachableIds.has(edge.to)) {
        reachableIds.add(edge.to);
        queue.push(edge.to);
      }
    }
  }

  const nodes = graph.nodes
    .filter((node) => reachableIds.has(node.nodeId))
    .sort((left, right) => compareIds(left.nodeId, right.nodeId));
  const edges = graph.edges
    .filter((edge) => reachableIds.has(edge.from) && reachableIds.has(edge.to))
    .sort((left, right) => compareIds(left.edgeId, right.edgeId));
  return { nodes, edges };
}
