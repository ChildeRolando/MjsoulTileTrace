import { describe, expect, it } from "vitest";
import {
  SELECTOR_POLICY_VERSION_V1,
  StructuredAnalysisPackageSchema,
} from "@riichi-coach/contracts";
import { derivePackageId, deriveSemanticContentHash } from
  "../src/analysis/package-identity.js";
import { buildGraphContextSlice } from
  "../src/context-graph/build-graph-context-slice.js";
import { projectContextGraph } from
  "../src/context-graph/project-context-graph.js";
import { prepareCoachRequest } from "../src/coach-prompt.js";
import { buildSingleDecisionPackage } from "./fixtures/context-graph-package.js";

describe("KnownGameFacts current score and round context flow", () => {
  it("keeps current four-seat points and South 4 details through graph, brief, and LLM request", async () => {
    const archived = await buildSingleDecisionPackage();
    const oldDecision = archived.decisions[0];
    if (oldDecision === undefined || oldDecision.outcome !== "analysis_ready") {
      throw new Error("legacy fixture must carry one ready decision");
    }
    // The archived v1 package remains parseable and retains its original shape.
    expect(Object.hasOwn(oldDecision.knownGameFacts, "scores")).toBe(false);
    expect(Object.hasOwn(oldDecision.knownGameFacts, "currentRound")).toBe(false);
    expect(StructuredAnalysisPackageSchema.parse(archived)).toEqual(archived);

    const current = structuredClone(archived);
    const decision = current.decisions[0];
    if (decision === undefined || decision.outcome !== "analysis_ready") {
      throw new Error("fixture decision disappeared");
    }
    const { knownGameFacts } = decision;
    decision.knownGameFacts = {
      ...knownGameFacts,
      factSetId: `canonical-v2:sha256:${"a".repeat(64)}`,
      provenance: "raw_replay",
      roundWind: "S",
      handStructureYakuContext: {
        ...knownGameFacts.handStructureYakuContext!,
        roundWindTile34: 28,
      },
      scores: { status: "known", byActor: [34000, 23000, 23000, 17000] },
      currentRound: {
        status: "known",
        roundOrdinal: 0,
        roundWind: "S",
        hand: 4,
        honba: 2,
        riichiSticks: 3,
      },
    };
    current.componentVersions = {
      ...current.componentVersions,
      factorPipeline: "factor-pipeline/v3",
    };
    current.packageId = derivePackageId({
      analysisKey: current.analysisKey,
      componentVersions: current.componentVersions,
      analysisPolicy: current.analysisPolicy,
    });
    current.semanticContentHash = deriveSemanticContentHash({
      analysisKey: current.analysisKey,
      record: current.record,
      componentVersions: current.componentVersions,
      analysisPolicy: current.analysisPolicy,
      decisions: current.decisions,
      evidenceRegistry: current.evidenceRegistry,
      ...(current.legalActionEvidence === undefined
        ? {}
        : { legalActionEvidence: current.legalActionEvidence }),
    });
    const packageWithCurrentFacts = StructuredAnalysisPackageSchema.parse(current);
    expect(packageWithCurrentFacts.packageId).not.toBe(archived.packageId);

    const graph = projectContextGraph(packageWithCurrentFacts);
    const slice = buildGraphContextSlice(graph, {
      policyVersion: SELECTOR_POLICY_VERSION_V1,
      analysisPackageId: packageWithCurrentFacts.packageId,
      analysisPackageStatus: packageWithCurrentFacts.record.status,
      selected: [{
        decisionId: decision.decisionId,
        rank: 1,
        selectionReason: "model_disagreement_above_threshold",
      }],
    });
    const prepared = prepareCoachRequest(slice);
    const fact = prepared.context.nodes.find((node) => node.nodeKind === "KnownGameFact");

    expect(fact?.payload).toMatchObject({
      scores: { status: "known", byActor: [34000, 23000, 23000, 17000] },
      currentRound: {
        status: "known", roundOrdinal: 0, roundWind: "S", hand: 4,
        honba: 2, riichiSticks: 3,
      },
    });
    expect(prepared.brief.decisions[0]?.situation[0]?.payload).toMatchObject({
      scores: { status: "known", byActor: [34000, 23000, 23000, 17000] },
      currentRound: { status: "known", roundWind: "S", hand: 4 },
    });
    expect(prepared.request.prompt).toContain('"byActor":[34000,23000,23000,17000]');
    expect(prepared.request.prompt).toContain('"hand":4');
    expect(prepared.request.prompt).toContain('"riichiSticks":3');
  });
});
