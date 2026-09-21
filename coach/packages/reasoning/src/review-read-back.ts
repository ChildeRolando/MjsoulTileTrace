import type {
  ContextGraph,
  ContextGraphEdge,
  ContextGraphNode,
  ReviewReport,
  ReviewSelectionResult,
  StructuredAnalysisPackage,
} from "@riichi-coach/contracts";
import { ReviewSelectionResultSchema } from "@riichi-coach/contracts";
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
 * Validated, read-only composition of one existing analysis package, its
 * selector-owned scope, and an optional existing report. This is the
 * presentation/persistence consumption seam; it
 * has no provider, prompt, selection, retry, generation, publication, or
 * mutation capability.
 */
export type ReviewReadBackContext = Readonly<{
  analysisPackage: StructuredAnalysisPackage;
  selection: ReviewSelectionResult;
  report: ReviewReport | null;
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
 * Compose a validated selector-scoped graph for read-back consumers, with an
 * optional current-report overlay.
 *
 * The function deliberately accepts untrusted values so package/selection/
 * report schema, identity, provenance, grounding, and same-decision ownership
 * are re-established before evidence or an overlay is exposed. Only the
 * supplied report's overlay is attached to a freshly projected base graph.
 * Inputs are never modified and no selection or ReviewReport is created or
 * published here.
 */
export function composeReviewReadBackContext(
  packageInput: unknown,
  selectionInput: unknown,
  reportInput: unknown | null = null,
): ReviewReadBackContext {
  validateStructuredAnalysisPackage(packageInput);
  const analysisPackage = packageInput as StructuredAnalysisPackage;
  const baseGraph = projectContextGraph(analysisPackage);
  validateContextGraph(baseGraph);

  let selection: ReviewSelectionResult;
  try {
    selection = ReviewSelectionResultSchema.parse(selectionInput);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`m7a_read_back_selection_schema:${message}`);
  }
  if (selection.analysisPackageId !== analysisPackage.packageId) {
    throw new Error(
      `m7a_read_back_selection_package_mismatch:${selection.analysisPackageId}`,
    );
  }
  if (selection.analysisPackageStatus !== analysisPackage.record.status) {
    throw new Error(
      `m7a_read_back_selection_status_mismatch:${selection.analysisPackageStatus}`,
    );
  }

  const selectedDecisionIds = selection.selected.map((item, index) => {
    if (item.rank !== index + 1) {
      throw new Error(`m7a_read_back_selection_rank:${item.decisionId}`);
    }
    getDecisionSubgraph(baseGraph, item.decisionId);
    return item.decisionId;
  });
  if (new Set(selectedDecisionIds).size !== selectedDecisionIds.length) {
    throw new Error("m7a_read_back_selection_duplicate_decision");
  }

  let report: ReviewReport | null = null;
  let currentGraph = baseGraph;
  if (reportInput !== null) {
    validateReviewReport(reportInput, baseGraph);
    report = reportInput as ReviewReport;
    if (report.selectorPolicyVersion !== selection.policyVersion) {
      throw new Error("m7a_read_back_report_selection_policy_mismatch");
    }
    if (
      report.selectedDecisionIds.length !== selectedDecisionIds.length ||
      report.selectedDecisionIds.some(
        (decisionId, index) => decisionId !== selectedDecisionIds[index],
      )
    ) {
      throw new Error("m7a_read_back_report_selection_mismatch");
    }
    currentGraph = appendReasoningOverlay(
      baseGraph,
      report.reasoningOverlay.nodes,
      report.reasoningOverlay.edges,
    );
  }
  validateContextGraph(currentGraph);

  const decisionContext = (decisionId: string): ReviewDecisionReadBack => {
    if (!selectedDecisionIds.includes(decisionId)) {
      throw new Error(`m7a_read_back_unselected_decision:${decisionId}`);
    }

    const evidence = getDecisionSubgraph(baseGraph, decisionId);
    const nodeIds = new Set(evidence.nodes.map((node) => node.nodeId));
    const reasoningNodes = (report?.reasoningOverlay.nodes ?? []).filter(
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
    selection,
    report,
    baseGraph,
    currentGraph,
    decisionContext,
    resolveDecisionRef,
  });
}
