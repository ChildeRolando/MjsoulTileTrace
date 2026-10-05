import { describe, expect, it } from "vitest";
import type { ContextGraph, ReviewSelectionResult } from "@riichi-coach/contracts";
import { buildSingleDecisionPackage, buildTwoReadyPackage } from "./fixtures/context-graph-package.js";
import { projectContextGraph } from "../src/context-graph/project-context-graph.js";
import { buildGraphContextSlice } from "../src/context-graph/build-graph-context-slice.js";
import { prepareCoachRequest } from "../src/coach-prompt.js";
import { generateReviewReport } from "../src/generate-review-report.js";
import { validateCoachGrounding, validateReviewReport } from "../src/groundingValidator.js";

async function setup() {
  const pkg = await buildSingleDecisionPackage();
  const source = projectContextGraph(pkg);
  const nodes = source.nodes.filter(n => !["FactorFact", "FactorDifference", "DeterministicPreference"].includes(n.nodeKind));
  const ids = new Set(nodes.map(n => n.nodeId));
  const graph: ContextGraph = { ...source, nodes, edges: source.edges.filter(e => ids.has(e.from) && ids.has(e.to)) };
  const decisionId = pkg.decisions[0]!.decisionId;
  const selection: ReviewSelectionResult = { policyVersion: "deterministic-review-selector/v1", analysisPackageId: pkg.packageId,
    analysisPackageStatus: pkg.record.status, selected: [{ decisionId, rank: 1, selectionReason: "model_disagreement_above_threshold" }] };
  const prepared = prepareCoachRequest(buildGraphContextSlice(graph, selection));
  const brief = prepared.brief.decisions[0]!;
  const wire = { decisions: [{ decisionId: brief.decision.ref, judgment: { localId: "j", recommendation: brief.actions[0]!.candidate.ref,
    confidence: "low", premiseRefs: [brief.situation[0]!.ref, brief.model[0]!.ref] }, explanations: [{ judgmentLocalRef: "j",
      text: "现有确定性证据没有给出候选之间的优势。模型评分提供建议，不能据此断言其内部理由或期望收益。",
      claims: [{ kind: "known_game_fact", evidenceRef: brief.situation[0]!.ref }, { kind: "model_evaluation", evidenceRef: brief.model[0]!.ref }] }] }] };
  return { graph, selection, prepared, wire };
}

describe("coach decisions without differentiating deterministic factors", () => {
  it("decodes, grounds, generates and reads back an honest scene/model explanation", async () => {
    const { graph, selection, prepared, wire } = await setup();
    expect(prepared.brief.decisions[0]!.comparisons).toEqual([]);
    expect(prepared.brief.decisions[0]!.actions.every(a => Object.values(a.facts).every(v => v.length === 0))).toBe(true);
    const decoded = prepared.decode(wire);
    expect(decoded).not.toBeNull();
    expect(validateCoachGrounding(graph, decoded!).violations).toEqual([]);
    const report = await generateReviewReport(graph, selection, { descriptor: () => ({ providerId: "fixture", model: "test" }),
      complete: async () => ({ content: JSON.stringify(wire), usage: {}, transportRetries: 0 }) }, "2026-10-06T00:00:00.000Z");
    expect(report.generationStatus).toBe("complete");
    expect(report.decisionEntries).toEqual([{ decisionId: selection.selected[0]!.decisionId, explanationStatus: "ready" }]);
    expect(report.reasoningOverlay.nodes.filter(n => n.nodeKind === "Explanation")).toHaveLength(1);
    expect(() => validateReviewReport(report, graph)).not.toThrow();
    const forged = structuredClone(report);
    const explanation = forged.reasoningOverlay.nodes.find(n => n.nodeKind === "Explanation")!;
    (explanation.payload as { claims: { kind: string }[] }).claims[0]!.kind = "model_evaluation";
    expect(() => validateReviewReport(forged, graph)).toThrow();
  });

  it("still rejects forged, mistyped and cross-decision claims", async () => {
    const { prepared, wire } = await setup();
    for (const claim of [{ kind: "known_game_fact", evidenceRef: "N999" }, { kind: "factor_fact", evidenceRef: wire.decisions[0]!.explanations[0]!.claims[0]!.evidenceRef },
      { kind: "known_game_fact", evidenceRef: wire.decisions[0]!.explanations[0]!.claims[1]!.evidenceRef }]) {
      const altered = structuredClone(wire);
      altered.decisions[0]!.explanations[0]!.claims = [claim];
      expect(prepared.decode(altered)).toBeNull();
    }
  });

  it("does not borrow another decision's model or scene facts", async () => {
    const pkg = await buildTwoReadyPackage();
    const graph = projectContextGraph(pkg);
    const selection: ReviewSelectionResult = { policyVersion: "deterministic-review-selector/v1", analysisPackageId: pkg.packageId,
      analysisPackageStatus: pkg.record.status, selected: pkg.decisions.map((d, i) => ({ decisionId: d.decisionId, rank: i + 1,
        selectionReason: "model_disagreement_above_threshold" })) };
    const prepared = prepareCoachRequest(buildGraphContextSlice(graph, selection));
    const first = prepared.brief.decisions[0]!;
    const second = prepared.brief.decisions[1]!;
    for (const [kind, ref] of [["known_game_fact", second.situation[0]!.ref], ["model_evaluation", second.model[0]!.ref]]) {
      expect(prepared.decode({ decisions: [{ decisionId: first.decision.ref, judgment: { localId: "j", recommendation: first.actions[0]!.candidate.ref,
        confidence: "low", premiseRefs: [first.situation[0]!.ref] }, explanations: [{ text: "模型仅提供建议。", claims: [{ kind, evidenceRef: ref }] }] }] })).toBeNull();
    }
  });
});
