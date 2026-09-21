import { describe, expect, it } from "vitest";
import {
  SELECTOR_POLICY_VERSION_V1,
  type ContextGraph,
  type ContextGraphNode,
  type LlmCoachProvider,
  type ReviewSelectionResult,
} from "@riichi-coach/contracts";
import {
  composeReviewReadBackContext,
  generateReviewReport,
  projectContextGraph,
} from "../src/index.js";
import { buildSingleDecisionPackage } from "./fixtures/context-graph-package.js";

function nodeOf(
  graph: ContextGraph,
  kind: ContextGraphNode["nodeKind"],
): ContextGraphNode {
  return graph.nodes.find((node) => node.nodeKind === kind)!;
}

describe("M7-A authorized report read-back composition", () => {
  async function setup(recommendationIndex = 0) {
    const pkg = await buildSingleDecisionPackage();
    const graph = projectContextGraph(pkg);
    const decision = nodeOf(graph, "Decision");
    const candidates = graph.nodes.filter(
      (node) => node.nodeKind === "CandidateAction",
    );
    const premise = nodeOf(graph, "KnownGameFact");
    const decisionId = (decision.payload as { decisionId: string }).decisionId;
    const selection: ReviewSelectionResult = {
      policyVersion: SELECTOR_POLICY_VERSION_V1,
      analysisPackageId: pkg.packageId,
      analysisPackageStatus: pkg.record.status,
      selected: [{
        decisionId,
        rank: 1,
        selectionReason: "model_disagreement_above_threshold",
      }],
    };
    const recommendation = (
      candidates[recommendationIndex % candidates.length]!.payload as {
        actionRef: string;
      }
    ).actionRef;
    const provider: LlmCoachProvider = {
      descriptor: () => ({ providerId: "fixture", model: "fixture-model" }),
      complete: async () => ({
        content: JSON.stringify({
          decisions: [{
            decisionId,
            judgment: {
              localId: `judgment-${recommendationIndex}`,
              recommendation,
              confidence: "medium",
              premiseRefs: [premise.nodeId],
            },
          }],
        }),
        transportRetries: 0,
      }),
    };
    const report = await generateReviewReport(
      graph,
      selection,
      provider,
      "2026-09-22T00:00:00.000Z",
    );
    return { pkg, graph, report, decisionId, premise };
  }

  it("validates package/report, attaches only the current overlay, and resolves decision refs", async () => {
    const { pkg, graph, report, decisionId, premise } = await setup();
    const packageBefore = structuredClone(pkg);
    const reportBefore = structuredClone(report);

    const readBack = composeReviewReadBackContext(pkg, report);
    const judgment = report.reasoningOverlay.nodes.find(
      (node) => node.nodeKind === "CoachJudgment",
    )!;

    expect(readBack.baseGraph).toEqual(graph);
    expect(readBack.currentGraph.nodes).toHaveLength(
      graph.nodes.length + report.reasoningOverlay.nodes.length,
    );
    expect(readBack.resolveDecisionRef(decisionId, premise.nodeId)).toEqual(premise);
    expect(readBack.resolveDecisionRef(decisionId, judgment.nodeId)).toBe(judgment);
    expect(() => readBack.resolveDecisionRef(decisionId, "other-report-node"))
      .toThrow(/m7a_read_back_unresolved_ref/);
    expect(() => readBack.decisionContext("unselected-decision"))
      .toThrow(/m7a_read_back_unselected_decision/);
    expect(pkg).toEqual(packageBefore);
    expect(report).toEqual(reportBefore);
  });

  it("recomposes A -> B -> A from the immutable base without overlay leakage", async () => {
    const a = await setup(0);
    const b = await setup(1);
    expect(a.pkg).toEqual(b.pkg);

    const graphA1 = composeReviewReadBackContext(a.pkg, a.report).currentGraph;
    const graphB = composeReviewReadBackContext(a.pkg, b.report).currentGraph;
    const graphA2 = composeReviewReadBackContext(a.pkg, a.report).currentGraph;

    expect(graphA2).toEqual(graphA1);
    expect(graphB).not.toEqual(graphA1);
    expect(graphB.nodes.filter((node) => node.partition === "reasoning"))
      .toEqual(b.report.reasoningOverlay.nodes);
    expect(graphA2.nodes.filter((node) => node.partition === "reasoning"))
      .toEqual(a.report.reasoningOverlay.nodes);
  });

  it("fails closed before composition for invalid package or report identity", async () => {
    const { pkg, report } = await setup();
    const invalidPackage = structuredClone(pkg);
    invalidPackage.packageId = `${pkg.packageId}:tampered`;
    expect(() => composeReviewReadBackContext(invalidPackage, report))
      .toThrow(/m6c_validator_package_id/);

    const invalidReport = structuredClone(report);
    invalidReport.packageId = `${report.packageId}:tampered`;
    expect(() => composeReviewReadBackContext(pkg, invalidReport))
      .toThrow(/m6d2_report_package_mismatch/);
  });
});
