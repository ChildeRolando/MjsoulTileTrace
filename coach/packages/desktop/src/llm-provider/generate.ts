import {
  LlmCoachResultSchema, LlmProviderDescriptorSchema, ReviewReportSchema,
  type ContextGraph, type LlmCoachProvider, type ReviewReport, type ReviewSelectionResult,
} from "@riichi-coach/contracts";
import {
  assembleReviewReport, buildCoachRequest, buildGraphContextSlice,
  coachRequestOutcomeFromLlmResult, validateContextGraph, validateReviewReport,
} from "@riichi-coach/reasoning";

/** COAC-3 narrow seam: one slice, at most two HTTP attempts, existing pure assembly.
 * No full generation workflow, job state, report persistence or regeneration policy. */
export async function generateReviewReport(
  graph: ContextGraph, selection: ReviewSelectionResult, provider: LlmCoachProvider,
  generatedAt = new Date().toISOString(),
): Promise<ReviewReport> {
  validateContextGraph(graph);
  const slice = buildGraphContextSlice(graph, selection);
  const descriptor = LlmProviderDescriptorSchema.parse(provider.descriptor());
  let result = { errorCode: "provider_unavailable" } as Awaited<ReturnType<LlmCoachProvider["complete"]>>;
  let transportRetries = 0;
  if (slice.selectedDecisionIds.length > 0) {
    const request = buildCoachRequest(slice);
    const attempt = async () => {
      try { return LlmCoachResultSchema.parse(await provider.complete(request)); }
      catch { return { errorCode: "connection_failed" as const }; }
    };
    result = await attempt();
    if ("errorCode" in result && result.errorCode !== "provider_unavailable") {
      const retried = await attempt();
      // An unavailable second attempt did not send HTTP. Preserve the first
      // transport failure, rather than claiming no request was ever sent.
      if (!("errorCode" in retried && retried.errorCode === "provider_unavailable")) {
        transportRetries = 1;
        result = retried;
      }
    }
  }
  const report = assembleReviewReport({ graph, selection, provider: descriptor, generatedAt,
    outcome: coachRequestOutcomeFromLlmResult(result, transportRetries) });
  // Validator prose may contain rejected model identifiers. Only frozen codes
  // and known decision ids leave main; never persist rejected arbitrary prose.
  report.diagnostics = report.diagnostics.map(({ kind, code, decisionId }) => ({
    kind, code, ...(decisionId !== undefined && report.selectedDecisionIds.includes(decisionId) ? { decisionId } : {}),
  })) as typeof report.diagnostics;
  validateReviewReport(report, graph);
  return ReviewReportSchema.parse(report);
}
