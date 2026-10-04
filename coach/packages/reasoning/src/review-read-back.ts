import type {
  ContextGraph,
  ContextGraphEdge,
  ContextGraphNode,
  ReviewReport,
  ReviewSelectionResult,
  StructuredAnalysisPackage,
} from "@riichi-coach/contracts";
import { ReviewReportSchema, ReviewSelectionResultSchema } from "@riichi-coach/contracts";
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

export type ReviewReadBackReport = Readonly<{
  reportRefId: string | null;
  /** The immutable scope recorded inside this report. */
  selectedDecisionIds: readonly string[];
  /** The decisions currently assigned to this report by the session index. */
  mappedDecisionIds: readonly string[];
  report: ReviewReport;
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
  /** The latest explicitly active report; its usage remains the latest request usage. */
  report: ReviewReport | null;
  /** Individually validated report artifacts used by the current session view. */
  reports: readonly ReviewReadBackReport[];
  baseGraph: ContextGraph;
  currentGraph: ContextGraph;
  reportForDecision(decisionId: string): ReviewReport | null;
  decisionContext(decisionId: string): ReviewDecisionReadBack;
  resolveDecisionRef(decisionId: string, nodeId: string): ContextGraphNode;
}>;

export type ReviewSessionReportInput = Readonly<{
  reportRefId: string;
  report: unknown;
}>;
export type ReviewSessionDecisionReportRef = Readonly<{
  decisionId: string;
  reportRefId: string;
}>;
export type ReviewSessionReadBackInput = Readonly<{
  reports: readonly ReviewSessionReportInput[];
  decisionReportRefs: readonly ReviewSessionDecisionReportRef[];
  activeReportRefId: string | null;
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
    // Only existence is needed here; traversing every edge for every selected
    // decision repeats work that belongs to decisionContext's actual consumer.
    if (!baseGraph.nodes.some(node => node.nodeKind === "Decision" && decisionIdOf(node) === item.decisionId)) {
      throw new Error(`m6d1_subgraph_unknown_decision:${item.decisionId}`);
    }
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
  } else {
    // appendReasoningOverlay validates the complete graph when a report exists.
    validateContextGraph(baseGraph);
  }

  const reports: readonly ReviewReadBackReport[] = report === null
    ? Object.freeze([])
    : Object.freeze([Object.freeze({
      reportRefId: null,
      selectedDecisionIds: Object.freeze([...selectedDecisionIds]),
      mappedDecisionIds: Object.freeze([...selectedDecisionIds]),
      report,
    })]);

  const reportForDecision = (decisionId: string): ReviewReport | null => {
    if (!selectedDecisionIds.includes(decisionId)) {
      throw new Error(`m7a_read_back_unselected_decision:${decisionId}`);
    }
    return report !== null && selectedDecisionIds.includes(decisionId) ? report : null;
  };

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
    reports,
    baseGraph,
    currentGraph,
    reportForDecision,
    decisionContext,
    resolveDecisionRef,
  });
}

function selectionForDecisionIds(
  selection: ReviewSelectionResult,
  decisionIds: readonly string[],
): ReviewSelectionResult {
  if (new Set(decisionIds).size !== decisionIds.length) {
    throw new Error("m7a_read_back_duplicate_report_scope");
  }
  const requested = new Set(decisionIds);
  const selected = selection.selected.filter((item) => requested.has(item.decisionId));
  if (selected.length !== requested.size) {
    throw new Error("m7a_read_back_report_scope_outside_selection");
  }
  return ReviewSelectionResultSchema.parse({
    ...selection,
    selected: selected.map((item, index) => ({ ...item, rank: index + 1 })),
  });
}

/**
 * Compose the current ReviewSession view from independently generated,
 * immutable reports. Each artifact is revalidated against its original
 * selector-ordered subset; the explicit decision-to-report index determines
 * which portions remain current after later reports replace individual rows.
 * No merged ReviewReport or merged usage/audit is constructed.
 */
export function composeReviewSessionReadBackContext(
  packageInput: unknown,
  selectionInput: unknown,
  sessionInput: ReviewSessionReadBackInput,
): ReviewReadBackContext {
  const base = composeReviewReadBackContext(packageInput, selectionInput, null);
  const selectedIds = base.selection.selected.map((item) => item.decisionId);
  const reportByRef = new Map<string, ReviewReadBackReport>();

  for (const reportInput of sessionInput.reports) {
    if (typeof reportInput.reportRefId !== "string" || reportInput.reportRefId.length === 0
      || reportByRef.has(reportInput.reportRefId)) {
      throw new Error("m7a_read_back_duplicate_report_ref");
    }
    let report: ReviewReport;
    try {
      report = ReviewReportSchema.parse(reportInput.report);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`m7a_read_back_report_schema:${message}`);
    }
    const reportSelection = selectionForDecisionIds(base.selection, report.selectedDecisionIds);
    const expectedIds = reportSelection.selected.map((item) => item.decisionId);
    if (report.selectedDecisionIds.length !== expectedIds.length
      || report.selectedDecisionIds.some((decisionId, index) => decisionId !== expectedIds[index])) {
      throw new Error("m7a_read_back_report_scope_order_mismatch");
    }
    if (report.selectorPolicyVersion !== base.selection.policyVersion) {
      throw new Error("m7a_read_back_report_selection_policy_mismatch");
    }
    validateReviewReport(report, base.baseGraph);
    reportByRef.set(reportInput.reportRefId, Object.freeze({
      reportRefId: reportInput.reportRefId,
      selectedDecisionIds: Object.freeze([...report.selectedDecisionIds]),
      mappedDecisionIds: Object.freeze([]),
      report,
    }));
  }

  if (sessionInput.activeReportRefId !== null && !reportByRef.has(sessionInput.activeReportRefId)) {
    throw new Error("m7a_read_back_active_report_unresolved");
  }
  const mappedByDecision = new Map<string, string>();
  for (const mapping of sessionInput.decisionReportRefs) {
    if (!selectedIds.includes(mapping.decisionId)) {
      throw new Error(`m7a_read_back_mapping_unselected_decision:${mapping.decisionId}`);
    }
    if (mappedByDecision.has(mapping.decisionId)) {
      throw new Error(`m7a_read_back_duplicate_decision_mapping:${mapping.decisionId}`);
    }
    const report = reportByRef.get(mapping.reportRefId);
    if (report === undefined) {
      throw new Error(`m7a_read_back_mapping_report_unresolved:${mapping.reportRefId}`);
    }
    if (!report.selectedDecisionIds.includes(mapping.decisionId)) {
      throw new Error(`m7a_read_back_mapping_outside_report_scope:${mapping.decisionId}`);
    }
    mappedByDecision.set(mapping.decisionId, mapping.reportRefId);
  }

  const reports = [...reportByRef.values()].map((report) => {
    const mappedDecisionIds = selectedIds.filter((decisionId) =>
      mappedByDecision.get(decisionId) === report.reportRefId,
    );
    if (mappedDecisionIds.length === 0
      && report.reportRefId !== sessionInput.activeReportRefId) {
      throw new Error(`m7a_read_back_unreferenced_report:${report.reportRefId}`);
    }
    if (report.reportRefId === sessionInput.activeReportRefId
      && (mappedDecisionIds.length !== report.selectedDecisionIds.length
        || report.selectedDecisionIds.some((decisionId, index) => mappedDecisionIds[index] !== decisionId))) {
      throw new Error("m7a_read_back_active_report_scope_mismatch");
    }
    return Object.freeze({ ...report, mappedDecisionIds: Object.freeze(mappedDecisionIds) });
  });

  const overlayNodes: ContextGraphNode[] = [];
  const overlayEdges: ContextGraphEdge[] = [];
  const baseNodeIds = new Set(base.baseGraph.nodes.map((node) => node.nodeId));
  for (const report of reports) {
    const mapped = new Set(report.mappedDecisionIds);
    if (mapped.size === 0) continue;
    const includedNodeIds = new Set(baseNodeIds);
    for (const node of report.report.reasoningOverlay.nodes) {
      if (mapped.has(decisionIdOf(node) ?? "")) {
        overlayNodes.push(node);
        includedNodeIds.add(node.nodeId);
      }
    }
    for (const edge of report.report.reasoningOverlay.edges) {
      if (includedNodeIds.has(edge.from) && includedNodeIds.has(edge.to)) {
        overlayEdges.push(edge);
      }
    }
  }
  const currentGraph = overlayNodes.length === 0
    ? base.baseGraph
    : appendReasoningOverlay(base.baseGraph, overlayNodes, overlayEdges);

  const reportForDecision = (decisionId: string): ReviewReport | null => {
    if (!selectedIds.includes(decisionId)) {
      throw new Error(`m7a_read_back_unselected_decision:${decisionId}`);
    }
    const reportRef = mappedByDecision.get(decisionId);
    if (reportRef === undefined) return null;
    const report = reports.find((item) => item.reportRefId === reportRef);
    if (report === undefined) throw new Error(`m7a_read_back_mapping_report_unresolved:${reportRef}`);
    return report.report;
  };

  const decisionContext = (decisionId: string): ReviewDecisionReadBack => {
    if (!selectedIds.includes(decisionId)) {
      throw new Error(`m7a_read_back_unselected_decision:${decisionId}`);
    }
    const evidence = getDecisionSubgraph(base.baseGraph, decisionId);
    const nodeIds = new Set(evidence.nodes.map((node) => node.nodeId));
    for (const node of currentGraph.nodes) {
      if (decisionIdOf(node) === decisionId) nodeIds.add(node.nodeId);
    }
    return Object.freeze({
      decisionId,
      nodes: Object.freeze(currentGraph.nodes.filter((node) => nodeIds.has(node.nodeId))),
      edges: Object.freeze(currentGraph.edges.filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))),
    });
  };

  const activeReport = sessionInput.activeReportRefId === null
    ? null
    : reports.find((report) => report.reportRefId === sessionInput.activeReportRefId)?.report ?? null;
  const resolveDecisionRef = (decisionId: string, nodeId: string): ContextGraphNode => {
    const node = decisionContext(decisionId).nodes.find((candidate) => candidate.nodeId === nodeId);
    if (node === undefined) throw new Error(`m7a_read_back_unresolved_ref:${decisionId}:${nodeId}`);
    return node;
  };

  return Object.freeze({
    analysisPackage: base.analysisPackage,
    selection: base.selection,
    report: activeReport,
    reports: Object.freeze(reports),
    baseGraph: base.baseGraph,
    currentGraph,
    reportForDecision,
    decisionContext,
    resolveDecisionRef,
  });
}
