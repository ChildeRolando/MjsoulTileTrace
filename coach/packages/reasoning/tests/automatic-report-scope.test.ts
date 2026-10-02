import { describe, expect, it } from "vitest";
import { buildStructuredAnalysisPackage } from "../src/analysis/structured-analysis-package-builder.js";
import { projectContextGraph } from "../src/context-graph/project-context-graph.js";
import { buildGraphContextSlice } from "../src/context-graph/build-graph-context-slice.js";
import { selectReviewDecisions } from "../src/selector/select-review-decisions.js";
import { generateReviewReport } from "../src/generate-review-report.js";
import { validateCoachGrounding, validateReviewReport } from "../src/groundingValidator.js";
import { validateContextGraph } from "../src/context-graph/validate-context-graph.js";
import { componentVersions, entryFor, FROZEN_NOW, fixtureSetup, runFixtureReview } from "./fixtures/structured-review.js";

describe("automatic pair report boundary", () => {
  it.each([false, true])("only permits a recommendation inside the analyzed pair (outside=%s)", async outside => {
    const { stream, decisions } = fixtureSetup();
    const original = entryFor(decisions[0]!);
    const entry = { ...original, details: [
      ...original.details.map((detail, index) => ({ ...detail, probability: index === 0 ? 0.2 : 0.7 })),
      { action: { type: "dahai" as const, actor: 0, pai: "1m", tsumogiri: false }, probability: 0.1, qValue: 0 },
    ] };
    const review = await runFixtureReview(stream, decisions, [entry], true);
    const pkg = buildStructuredAnalysisPackage({ review, stream, decisions, componentVersions,
      frozenPolicySnapshot: review.retainedAnalyses[0]!.modelEvaluation.detailPolicy, now: () => FROZEN_NOW });
    const decision = pkg.decisions.find(item => item.outcome === "analysis_ready")!;
    if (decision.outcome !== "analysis_ready") throw new Error("expected ready fixture");
    expect(decision.modelEvaluation.candidates).toHaveLength(3);
    expect(decision.candidateFactorLedgers).toHaveLength(2);
    const pair = decision.automaticComparisonScope!;
    const graph = projectContextGraph(pkg), selection = selectReviewDecisions(pkg);
    const recommendation = outside
      ? decision.comparisonSet.candidates.find(item => !pair.actionRefs.includes(item.actionRef))!.actionRef
      : pair.actionRefs[0];
    const premise = graph.nodes.find(node => node.nodeKind === "KnownGameFact")!;
    const report = await generateReviewReport(graph, selection, {
      descriptor: () => ({ providerId: "fixture", model: "fixture" }),
      complete: async () => ({ content: JSON.stringify({ decisions: [{ decisionId: decision.decisionId,
        judgment: { localId: "j", recommendation, confidence: "medium", premiseRefs: [premise.nodeId] } }] }), transportRetries: 0 }),
    }, "2026-09-29T00:00:00.000Z");
    expect(report.decisionEntries[0]!.explanationStatus).toBe(outside ? "invalid_output" : "ready");
    const slice = buildGraphContextSlice(graph, selection);
    const node = slice.nodes.find(node => node.nodeKind === "Decision")!;
    expect(node.payload).toHaveProperty("automaticComparisonScope", pair);
    if (!outside) {
      expect(() => validateReviewReport(report, graph)).not.toThrow();
      const forgedGraph = structuredClone(graph);
      const forgedDecision = forgedGraph.nodes.find(node => node.nodeKind === "Decision")!;
      const unanalysed = decision.comparisonSet.candidates.find(item => !pair.actionRefs.includes(item.actionRef))!.actionRef;
      (forgedDecision.payload as Record<string, unknown>).automaticComparisonScope = {
        ...pair, actionRefs: [unanalysed, pair.actionRefs[1]],
      };
      expect(() => validateContextGraph(forgedGraph)).toThrow(/automatic_comparison/);
      expect(() => validateReviewReport(report, forgedGraph)).toThrow(/automatic_comparison/);
      const draft = { decisions: [{
        decisionId: decision.decisionId, judgment: {
          localId: "j", recommendation: unanalysed, confidence: "medium" as const, premiseRefs: [premise.nodeId],
        },
      }] };
      expect(validateCoachGrounding(forgedGraph, draft).violations).toEqual([
        expect.objectContaining({ code: "invalid_payload", detail: expect.stringContaining("automatic_comparison") }),
      ]);
      let providerCalls = 0;
      await expect(generateReviewReport(forgedGraph, selection, {
        descriptor: () => ({ providerId: "fixture", model: "fixture" }),
        complete: async () => { providerCalls++; return { content: JSON.stringify(draft), transportRetries: 0 }; },
      }, "2026-09-29T00:00:00.000Z")).rejects.toThrow(/automatic_comparison/);
      expect(providerCalls).toBe(0);
      const reorderedGraph = structuredClone(graph);
      const reorderedDecision = reorderedGraph.nodes.find(node => node.nodeKind === "Decision")!;
      (reorderedDecision.payload as Record<string, unknown>).automaticComparisonScope = {
        actionRefs: pair.actionRefs, reason: pair.reason, policyVersion: pair.policyVersion,
      };
      expect(() => validateContextGraph(reorderedGraph)).not.toThrow();
      for (const mutation of ["missing", "unbound", "duplicate", "malformed"] as const) {
        const broken = structuredClone(graph);
        const model = broken.nodes.find(node => node.nodeKind === "ModelEvaluation")!;
        if (mutation === "missing") broken.nodes = broken.nodes.filter(node => node !== model);
        if (mutation === "unbound") broken.edges = broken.edges.filter(edge => edge.to !== model.nodeId);
        if (mutation === "duplicate") broken.nodes.push(structuredClone(model));
        if (mutation === "malformed") (model.payload as Record<string, unknown>).candidates = [];
        expect(() => validateContextGraph(broken), mutation).toThrow(/automatic_comparison/);
      }
      // A formerly accepted all-candidate recommendation must not bypass the
      // new boundary by arriving as an already assembled, validly hashed report.
      const legacyGraph = structuredClone(graph);
      const legacyDecision = legacyGraph.nodes.find(node => node.nodeKind === "Decision")!;
      delete (legacyDecision.payload as Record<string, unknown>).automaticComparisonScope;
      const unselected = decision.comparisonSet.candidates.find(item => !pair.actionRefs.includes(item.actionRef))!.actionRef;
      const legacyReport = await generateReviewReport(legacyGraph, selection, {
        descriptor: () => ({ providerId: "fixture", model: "fixture" }),
        complete: async () => ({ content: JSON.stringify({ decisions: [{ decisionId: decision.decisionId,
          judgment: { localId: "j", recommendation: unselected, confidence: "medium", premiseRefs: [premise.nodeId] } }] }), transportRetries: 0 }),
      }, "2026-09-29T00:00:00.000Z");
      expect(legacyReport.decisionEntries[0]!.explanationStatus).toBe("ready");
      expect(() => validateReviewReport(legacyReport, legacyGraph)).not.toThrow();
      expect(() => validateReviewReport(legacyReport, graph)).toThrow(/recommendation_not_in_candidates/);
    }
  });
});
