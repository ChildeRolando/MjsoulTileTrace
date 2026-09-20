import {
  LlmCoachResultSchema,
  LlmProviderDescriptorSchema,
  ReviewReportSchema,
  type ContextGraph,
  type LlmCoachProvider,
  type ReviewReport,
  type ReviewSelectionResult,
} from "@riichi-coach/contracts";
import { buildCoachRequest } from "./coach-prompt.js";
import { buildGraphContextSlice } from "./context-graph/build-graph-context-slice.js";
import { validateContextGraph } from "./context-graph/validate-context-graph.js";
import { validateReviewReport } from "./groundingValidator.js";
import {
  assembleReviewReport,
  coachRequestOutcomeFromLlmResult,
} from "./reviewReport.js";

/**
 * The sole production ReviewReport generation seam.
 *
 * Selection remains owned by DeterministicReviewSelector. The engine sends
 * exactly one provider-level completion request; the provider alone may
 * perform its one automatic transport retry. Semantic, grounding and
 * read-back failures never call the provider again.
 */
export async function generateReviewReport(
  graph: ContextGraph,
  selection: ReviewSelectionResult,
  provider: LlmCoachProvider,
  generatedAt = new Date().toISOString(),
): Promise<ReviewReport> {
  validateContextGraph(graph);
  const slice = buildGraphContextSlice(graph, selection);
  const descriptor = LlmProviderDescriptorSchema.parse(provider.descriptor());
  const result = slice.selectedDecisionIds.length === 0
    ? { errorCode: "provider_unavailable" as const, transportRetries: 0 as const }
    : LlmCoachResultSchema.parse(await provider.complete(buildCoachRequest(slice)));
  const report = assembleReviewReport({
    graph,
    selection,
    provider: descriptor,
    generatedAt,
    outcome: coachRequestOutcomeFromLlmResult(result),
  });
  // Rejected model prose never leaves the generation boundary. Diagnostics
  // retain only frozen codes and selected decision identities.
  report.diagnostics = report.diagnostics.map(({ kind, code, decisionId }) => ({
    kind,
    code,
    ...(decisionId !== undefined && report.selectedDecisionIds.includes(decisionId)
      ? { decisionId }
      : {}),
  })) as typeof report.diagnostics;
  validateReviewReport(report, graph);
  return ReviewReportSchema.parse(report);
}
