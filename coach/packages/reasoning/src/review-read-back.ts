import type {
  ContextGraph,
  ContextGraphEdge,
  ContextGraphNode,
  ReviewReport,
  StructuredAnalysisPackage,
} from "@riichi-coach/contracts";
import { getDecisionSubgraph } from "./context-graph/get-decision-subgraph.js";
import { projectContextGraph } from "./context-graph/project-context-graph.js";
import { validateContextGraph } from "./context-graph/validate-context-graph.js";
import { validateReviewReport } from "./groundingValidator.js";
import { appendReasoningOverlay } from "./reviewReport.js";
import { validateStructuredAnalysisPackage } from "./validate/structured-package-validator.js";

export type ReviewDecisionReadBack = Readonly<{
  decisionId: string;
  nodes: readonly ContextGraphNode[];
  edges: readonly ContextGraphEdge[];
}>;

/**
 * Validated, read-only composition of one existing analysis package and one
 * existing report. This is the presentation/persistence consumption seam; it
 * has no provider, prompt, selection, retry, generation, publication, or
 * mutation capability.
 */
export type ReviewReadBackContext = Readonly<{
  analysisPackage: StructuredAnalysisPackage;
  report: ReviewReport;
  baseGraph: ContextGraph;
  currentGraph: ContextGraph;
  decisionContext(decisionId: string): ReviewDecisionReadBack;
  resolveDecisionRef(decisionId: string, nodeId: string): ContextGraphNode;
}>;

function decisionIdOf(node: ContextGraphNode): string | undefined {
  const payload = node.payload;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }
  const decisionId = (payload as { decisionId?: unknown }).decisionId;
  return typeof decisionId === "string" ? decisionId : undefined;
}

/**
 * Compose a validated current-report graph for read-back consumers.
 *
 * The function deliberately accepts untrusted values so package/report
 * schema, identity, provenance, grounding, and same-decision ownership are
 * re-established before any overlay is exposed. Only the supplied report's
 * overlay is attached to a freshly projected base graph. Inputs are never
 * modified and no ReviewReport is created or published here.
 */
export function composeReviewReadBackContext(
  packageInput: unknown,
  reportInput: unknown,
): ReviewReadBackContext {
  validateStructuredAnalysisPackage(packageInput);
  const analysisPackage = packageInput as StructuredAnalysisPackage;
  const baseGraph = projectContextGraph(analysisPackage);
  validateContextGraph(baseGraph);

  validateReviewReport(reportInput, baseGraph);
  const report = reportInput as ReviewReport;
  const currentGraph = appendReasoningOverlay(
    baseGraph,
    report.reasoningOverlay.nodes,
    report.reasoningOverlay.edges,
  );
  validateContextGraph(currentGraph);

  const decisionContext = (decisionId: string): ReviewDecisionReadBack => {
    if (!report.selectedDecisionIds.includes(decisionId)) {
      throw new Error(`m7a_read_back_unselected_decision:${decisionId}`);
    }

    const evidence = getDecisionSubgraph(baseGraph, decisionId);
    const nodeIds = new Set(evidence.nodes.map((node) => node.nodeId));
    const reasoningNodes = report.reasoningOverlay.nodes.filter(
      (node) => decisionIdOf(node) === decisionId,
    );
    for (const node of reasoningNodes) nodeIds.add(node.nodeId);

    const nodes = currentGraph.nodes.filter((node) => nodeIds.has(node.nodeId));
    const edges = currentGraph.edges.filter(
      (edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to),
    );
    return Object.freeze({
      decisionId,
      nodes: Object.freeze(nodes),
      edges: Object.freeze(edges),
    });
  };

  const resolveDecisionRef = (
    decisionId: string,
    nodeId: string,
  ): ContextGraphNode => {
    const node = decisionContext(decisionId).nodes.find(
      (candidate) => candidate.nodeId === nodeId,
    );
    if (node === undefined) {
      throw new Error(`m7a_read_back_unresolved_ref:${decisionId}:${nodeId}`);
    }
    return node;
  };

  return Object.freeze({
    analysisPackage,
    report,
    baseGraph,
    currentGraph,
    decisionContext,
    resolveDecisionRef,
  });
}
