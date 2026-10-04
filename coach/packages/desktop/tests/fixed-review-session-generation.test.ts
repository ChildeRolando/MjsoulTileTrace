import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ReviewSelectionResultSchema,
  StructuredAnalysisPackageSchema,
  type ContextGraph,
  type ReviewReport,
  type ReviewSelectionResult,
  type StructuredAnalysisPackage,
} from "@riichi-coach/contracts";
import {
  generateReviewReport,
  projectContextGraph,
  selectReviewDecisions,
  validateStructuredAnalysisPackage,
} from "@riichi-coach/reasoning";
import { createFixedReviewController } from "../src/fixed-review-controller.js";
import { createReviewSessionRepository } from "../src/review-session-repository.js";

const roots: string[] = [];
afterEach(() => { for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true }); });
const root = () => { const value = mkdtempSync(join(tmpdir(), "coach-single-action-")); roots.push(value); return value; };
const basePackage = StructuredAnalysisPackageSchema.parse(JSON.parse(readFileSync(
  new URL("./fixtures/coach-package.json", import.meta.url), "utf8",
)));

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
}

function addSecondReadyDecision(source: StructuredAnalysisPackage): StructuredAnalysisPackage {
  const result = structuredClone(source);
  const second = structuredClone(result.decisions[0]!);
  if (second.outcome !== "analysis_ready") throw new Error("fixture_decision_not_ready");
  const triggerEventRef = second.normalizedDecisionContext.triggerEventRef;
  second.decisionId = ["decision", result.record.recordId, `self${result.record.selfActor}`, "self", "post_riichi_discard", triggerEventRef].join(":");
  second.normalizedDecisionContext = { ...second.normalizedDecisionContext, decisionWindowKind: "post_riichi_discard" };
  second.knownGameFacts = { ...second.knownGameFacts, decisionWindow: { ...second.knownGameFacts.decisionWindow, kind: "post_riichi_discard" } };
  second.comparisonSet = { ...second.comparisonSet, decisionWindow: { ...second.comparisonSet.decisionWindow, kind: "post_riichi_discard" } };
  result.decisions.push(second);
  const semanticDecisions = result.decisions.map((decision) => decision.outcome === "analysis_ready"
    ? { ...decision, modelEvaluation: { ...decision.modelEvaluation, detailPolicy: { ...decision.modelEvaluation.detailPolicy, frozenAt: null } } }
    : decision);
  const hashPayload = {
    analysisKey: result.analysisKey,
    record: result.record,
    componentVersions: result.componentVersions,
    analysisPolicy: result.analysisPolicy,
    decisions: semanticDecisions,
    evidenceRegistry: result.evidenceRegistry,
  };
  result.semanticContentHash = `sha256:${createHash("sha256").update(canonical(hashPayload)).digest("hex")}`;
  validateStructuredAnalysisPackage(result);
  return result;
}

function narrowSelection(selection: ReviewSelectionResult, decisionId: string): ReviewSelectionResult {
  return ReviewSelectionResultSchema.parse({
    ...selection,
    selected: selection.selected.filter((item) => item.decisionId === decisionId)
      .map((item) => ({ ...item, rank: 1 })),
  });
}

function draftFor(graph: ContextGraph, selection: ReviewSelectionResult) {
  return {
    decisions: selection.selected.map(({ decisionId }, index) => {
      const decisionNodes = graph.nodes.filter((node) => (node.payload as { decisionId?: string }).decisionId === decisionId);
      const candidate = decisionNodes.find((node) => node.nodeKind === "CandidateAction")!;
      const premise = decisionNodes.find((node) => node.nodeKind === "KnownGameFact")!;
      const difference = decisionNodes.find((node) => node.nodeKind === "FactorDifference"
        && typeof (node.payload as { leftValue?: { value?: unknown } }).leftValue?.value === "number")!;
      const differenceId = (difference.payload as { differenceId: string }).differenceId;
      return {
        decisionId,
        judgment: {
          localId: `judgment-${index}`,
          recommendation: (candidate.payload as { actionRef: string }).actionRef,
          confidence: "medium",
          premiseRefs: [premise.nodeId],
        },
        explanations: [{
          text: `本条解释 {diff:${differenceId}.leftValue.value}`,
          claims: [{ kind: "factor_difference", evidenceRef: difference.nodeId }],
          judgmentLocalRef: `judgment-${index}`,
        }],
      };
    }),
  };
}

function respondingProvider(content: unknown, inputTokens?: number) {
  return {
    descriptor: () => ({ providerId: "fixture", model: "fixture" }),
    complete: async () => ({
      content: JSON.stringify(content),
      transportRetries: 0 as const,
      ...(inputTokens === undefined ? {} : { usage: { inputTokens, cachedInputTokens: 0, outputTokens: 10, totalTokens: inputTokens + 10 } }),
    }),
  };
}

const failedProvider = {
  descriptor: () => ({ providerId: "fixture", model: "fixture" }),
  complete: async () => ({ errorCode: "connection_failed" as const, transportRetries: 0 as const }),
};

describe("fixed review single-decision generation", () => {
  it("generates one scope at a time, fills only missing rows, and reopens without provider calls", async () => {
    const pkg = addSecondReadyDecision(basePackage);
    const selected = selectReviewDecisions(pkg).selected;
    expect(selected).toHaveLength(2);
    const [first, second] = selected;
    if (first === undefined || second === undefined) throw new Error("fixture_selection_incomplete");
    const providerSelections: string[][] = [];
    const providerRanks: number[][] = [];
    const generateReport = vi.fn(async (analysisPackage: StructuredAnalysisPackage, selection: ReviewSelectionResult) => {
      providerSelections.push(selection.selected.map((item) => item.decisionId));
      providerRanks.push(selection.selected.map((item) => item.rank));
      const graph = projectContextGraph(analysisPackage);
      const inputTokens = selection.selected[0]?.decisionId === first.decisionId ? 11 : 22;
      return generateReviewReport(graph, selection, respondingProvider(draftFor(graph, selection), inputTokens));
    });
    const dir = root();
    let repository = createReviewSessionRepository({ root: dir });
    const controller = createFixedReviewController({ readPackage: async () => pkg, generateReport, repository });
    try {
      await controller.openReview(pkg.packageId);
      const firstResult = await controller.generateReview(pkg.packageId, "one", first.decisionId);
      expect(firstResult.status).toBe("ready");
      const afterFirst = repository.openByPackageId(pkg.packageId);
      expect(afterFirst.readBack.reportForDecision(first.decisionId)?.decisionEntries[0]?.explanationStatus).toBe("ready");
      expect(afterFirst.readBack.reportForDecision(second.decisionId)).toBeNull();
      expect(afterFirst.readBack.reports.map((item) => item.report.selectedDecisionIds)).toEqual([[first.decisionId]]);
      expect(afterFirst.decisionReportRefs).toEqual([{ decisionId: first.decisionId, reportRefId: afterFirst.activeReportRefId }]);
      const firstOverlay = afterFirst.readBack.reports[0]!.report.reasoningOverlay;
      expect(afterFirst.readBack.currentGraph.nodes.filter((node) => node.partition === "reasoning"))
        .toEqual(firstOverlay.nodes);
      const availableNodeIds = new Set([
        ...afterFirst.readBack.baseGraph.nodes.map((node) => node.nodeId),
        ...firstOverlay.nodes.map((node) => node.nodeId),
      ]);
      expect(afterFirst.readBack.currentGraph.edges).toEqual(expect.arrayContaining(
        firstOverlay.edges.filter((edge) => availableNodeIds.has(edge.from) && availableNodeIds.has(edge.to)),
      ));

      const filled = await controller.generateReview(pkg.packageId, "fill-rest");
      expect(filled.status).toBe("ready");
      expect(providerSelections).toEqual([[first.decisionId], [second.decisionId]]);
      expect(providerRanks).toEqual([[1], [1]]);
      const state = repository.openByPackageId(pkg.packageId);
      expect(state.readBack.reports.map((item) => item.report.selectedDecisionIds)).toEqual([
        [first.decisionId], [second.decisionId],
      ]);
      expect(state.activeReport).toBe(state.readBack.reports.find((item) => item.reportRefId === state.activeReportRefId)?.report);
      expect(state.activeReport?.selectedDecisionIds).toEqual([second.decisionId]);
      expect(state.activeReport?.audit.usage).toEqual({ inputTokens: 22, cachedInputTokens: 0, outputTokens: 10, totalTokens: 32 });
      expect(state.decisionReportRefs).toEqual(expect.arrayContaining([
        { decisionId: first.decisionId, reportRefId: expect.any(String) },
        { decisionId: second.decisionId, reportRefId: expect.any(String) },
      ]));
      expect(state.decisionReportRefs[0]?.reportRefId).not.toBe(state.decisionReportRefs[1]?.reportRefId);
      const reportRefsBeforeClose = state.reportRefs.map((item) => item.reportRefId);
      repository.close();

      repository = createReviewSessionRepository({ root: dir });
      const reopenedCalls = vi.fn(async () => { throw new Error("provider_must_not_run"); });
      const reopened = createFixedReviewController({ readPackage: async () => { throw new Error("package_must_not_be_read"); }, generateReport: reopenedCalls, repository });
      const snapshot = await reopened.openReview(pkg.packageId);
      expect(snapshot.activeReportRefId).not.toBeNull();
      expect(reopenedCalls).not.toHaveBeenCalled();
      expect((await reopened.generateReview(pkg.packageId, "nothing-left")).status).toBe("ready");
      expect(reopenedCalls).not.toHaveBeenCalled();
      expect(repository.openByPackageId(pkg.packageId).reportRefs.map((item) => item.reportRefId)).toEqual(reportRefsBeforeClose);
    } finally { repository.close(); }
  });

  it("rejects unknown or already-ready decisions and prevents operation ID reuse before charging", async () => {
    const pkg = addSecondReadyDecision(basePackage);
    const firstDecisionId = selectReviewDecisions(pkg).selected[0]!.decisionId;
    const generateReport = vi.fn(async (analysisPackage: StructuredAnalysisPackage, selection: ReviewSelectionResult) => {
      const graph = projectContextGraph(analysisPackage);
      return generateReviewReport(graph, selection, respondingProvider(draftFor(graph, selection)));
    });
    const controller = createFixedReviewController({ readPackage: async () => pkg, generateReport });
    await controller.openReview(pkg.packageId);
    expect(await controller.generateReview(pkg.packageId, "one", "unknown-decision")).toEqual({ status: "failed", code: "generation_failed" });
    expect(generateReport).not.toHaveBeenCalled();
    expect((await controller.generateReview(pkg.packageId, "same-op", firstDecisionId)).status).toBe("ready");
    expect(await controller.generateReview(pkg.packageId, "same-op", selectReviewDecisions(pkg).selected[1]!.decisionId))
      .toEqual({ status: "failed", code: "generation_failed" });
    expect(generateReport).toHaveBeenCalledTimes(1);
    expect(await controller.generateReview(pkg.packageId, "ready-again", firstDecisionId))
      .toEqual({ status: "failed", code: "generation_failed" });
    expect(generateReport).toHaveBeenCalledTimes(1);
  });

  it("recovers a second scoped activation without changing the first decision mapping", async () => {
    const pkg = addSecondReadyDecision(basePackage);
    const [first, second] = selectReviewDecisions(pkg).selected;
    if (first === undefined || second === undefined) throw new Error("fixture_selection_incomplete");
    const dir = root();
    let repository = createReviewSessionRepository({
      root: dir,
      beforeActivationReadBack: (operationId) => { if (operationId === "second-action") throw new Error("simulated_crash"); },
    });
    const makeReport = async (_pkg: StructuredAnalysisPackage, scoped: ReviewSelectionResult) => {
      const graph = projectContextGraph(_pkg);
      return generateReviewReport(graph, scoped, respondingProvider(draftFor(graph, scoped)));
    };
    let refIndex = 0;
    const firstController = createFixedReviewController({
      readPackage: async () => pkg,
      generateReport: makeReport,
      repository,
      createReportRefId: () => `recover-${++refIndex}`,
    });
    await firstController.openReview(pkg.packageId);
    expect((await firstController.generateReview(pkg.packageId, "first-action", first.decisionId)).status).toBe("ready");
    expect(await firstController.generateReview(pkg.packageId, "second-action", second.decisionId))
      .toEqual({ status: "failed", code: "generation_failed" });
    expect(repository.inspect(pkg.packageId)).toMatchObject({
      activeReportRefId: "recover-1",
      intents: [{ operation_id: "second-action" }],
    });
    repository.close();

    repository = createReviewSessionRepository({ root: dir });
    const recovered = repository.openByPackageId(pkg.packageId);
    expect(recovered.activeReportRefId).toBe("recover-2");
    expect(recovered.decisionReportRefs).toEqual(expect.arrayContaining([
      { decisionId: first.decisionId, reportRefId: expect.any(String) },
      { decisionId: second.decisionId, reportRefId: "recover-2" },
    ]));
    expect(recovered.readBack.reports.map((item) => item.report.selectedDecisionIds)).toEqual([
      [first.decisionId], [second.decisionId],
    ]);
    const noProvider = vi.fn(async () => { throw new Error("provider_must_not_run"); });
    const resumed = createFixedReviewController({ readPackage: async () => pkg, generateReport: noProvider, repository });
    expect(await resumed.generateReview(pkg.packageId, "second-action", second.decisionId))
      .toEqual({ status: "failed", code: "generation_failed" });
    expect(noProvider).not.toHaveBeenCalled();
    repository.close();
  });

  it("keeps the prior active state and another decision's explanation after invalid grounding", async () => {
    const pkg = addSecondReadyDecision(basePackage);
    const [first, second] = selectReviewDecisions(pkg).selected;
    if (first === undefined || second === undefined) throw new Error("fixture_selection_incomplete");
    const graph = projectContextGraph(pkg);
    const firstReport = await generateReviewReport(graph, narrowSelection(selectReviewDecisions(pkg), first.decisionId),
      respondingProvider(draftFor(graph, narrowSelection(selectReviewDecisions(pkg), first.decisionId))));
    const secondSelection = narrowSelection(selectReviewDecisions(pkg), second.decisionId);
    const secondFailure = await generateReviewReport(graph, secondSelection, failedProvider);
    const invalidGrounding = structuredClone(await generateReviewReport(graph, secondSelection,
      respondingProvider(draftFor(graph, secondSelection)))) as ReviewReport;
    const invalidJudgment = invalidGrounding.reasoningOverlay.nodes.find((node) => node.nodeKind === "CoachJudgment");
    if (invalidJudgment === undefined) throw new Error("fixture_judgment_missing");
    (invalidJudgment.payload as { recommendation: string }).recommendation = "action:unknown";
    expect(invalidGrounding.selectedDecisionIds).toEqual([second.decisionId]);

    const generated = [firstReport, secondFailure, invalidGrounding];
    const controller = createFixedReviewController({
      readPackage: async () => pkg,
      generateReport: async () => generated.shift()!,
      createReportRefId: (() => { let index = 0; return () => `scope-${++index}`; })(),
    });
    await controller.openReview(pkg.packageId);
    expect((await controller.generateReview(pkg.packageId, "first", first.decisionId)).status).toBe("ready");
    expect((await controller.generateReview(pkg.packageId, "second", second.decisionId)).status).toBe("ready");
    const before = controller.getReviewDetail(pkg.packageId, second.decisionId, "scope-2");
    const firstBefore = controller.getReviewDetail(pkg.packageId, first.decisionId, "scope-2");
    expect(firstBefore.explanationStatus).toBe("ready");
    expect(await controller.generateReview(pkg.packageId, "bad-retry", second.decisionId))
      .toEqual({ status: "failed", code: "generation_failed" });
    expect(controller.inspect(pkg.packageId)).toMatchObject({
      activeReportRefId: "scope-2",
      reportRefs: [{ reportRefId: "scope-1" }, { reportRefId: "scope-2" }],
      decisionMappings: [
        { decisionId: first.decisionId, reportRefId: "scope-1" },
        { decisionId: second.decisionId, reportRefId: "scope-2" },
      ],
    });
    expect(controller.getReviewDetail(pkg.packageId, second.decisionId, "scope-2")).toEqual(before);
    expect(controller.getReviewDetail(pkg.packageId, first.decisionId, "scope-2")).toEqual(firstBefore);
  });
});
