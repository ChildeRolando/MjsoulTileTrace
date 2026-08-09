import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  canonicalActionRef,
  CurrentSceneFrameSchema,
  Hand13FactResultSchema,
  HandStructureResultV2Schema,
  ResponseFuritenAnalysisV2Schema,
  StructuredComparisonSetSchema,
  type ComparisonScope,
  type CompletedHandFactRequest,
  type CompletedHandFactResult,
  type EngineIdentity,
  type Hand13FactRequest,
  type Hand13FactResult,
  type HandStructureRequestV2,
  type HandStructureResultV2,
  type ThreatRiskFactRequest,
  type ThreatRiskFactResult,
  type KnownGameFacts,
  type ModelEvaluation,
  type NormalizedDecision,
} from "@riichi-coach/contracts";
import type { HandStructureFactEnginePort } from "../src/fact-engine/port.js";
import { analyzeAllDiscardEfficiency } from "../src/analysis/efficiency-analyzer.js";
import { importRegressionFixture } from "../src/import/mortal-report.js";
import { replayToDecision } from "../src/replay/scene-replayer.js";
import { runStructuredFactorPipeline } from "../src/factors/structured-factor-pipeline.js";
import { legacyDiscardActionIdToAction } from "../src/candidate/legacy-action-bridge.js";
import { bridgeLegacyRegressionEvents } from "../src/import/legacy-event-stream-bridge.js";
import { freezeDecisionSnapshot } from "../src/replay/decision-snapshot.js";
import { projectKnownGameFactsV2 } from "../src/factors/known-game-facts-v2.js";
import { buildMortalModelEvaluation } from
  "../src/model/model-evaluation-builder.js";
import { runStructuredAnalysisAssembly } from
  "../src/analysis/structured-analysis-assembly.js";

const fixtureUrl = new URL(
  "../../../fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json",
  import.meta.url,
);
const factEngineGoldenUrl = new URL(
  "../../../fixtures/mahjong-facts/c1924cad66f66dd9-east1-turn6-7.json",
  import.meta.url,
);
const identity: EngineIdentity = {
  engine: "mahjong-helper",
  upstreamCommit: "514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0",
  adapterVersion: "0.2.0",
  protocolVersion: "mahjong-facts/v1",
};

type GoldenCase = {
  decisionId: string;
  actionRef: string;
  request: Hand13FactRequest;
  result: Hand13FactResult;
  handStructureRequest: HandStructureRequestV2;
  handStructureResult: HandStructureResultV2;
};

class RegressionFactEngine implements HandStructureFactEnginePort {
  constructor(private readonly cases: GoldenCase[]) {}

  async identity(): Promise<EngineIdentity> {
    return identity;
  }

  async analyzeHand13(request: Hand13FactRequest): Promise<Hand13FactResult> {
    const golden = this.cases.find((entry) => entry.actionRef === request.actionRef);
    if (golden === undefined) throw new Error("missing real sidecar golden case");
    expect({ ...request, requestId: golden.request.requestId })
      .toEqual(golden.request);
    return Hand13FactResultSchema.parse({
      ...golden.result,
      requestId: request.requestId,
    });
  }

  async analyzeCompletedHand(
    _request: CompletedHandFactRequest,
  ): Promise<CompletedHandFactResult> {
    throw new Error("not used by discard regression");
  }

  async analyzeHandStructure(
    request: HandStructureRequestV2,
  ): Promise<HandStructureResultV2> {
    const golden = this.cases.find((entry) => entry.actionRef === request.actionRef);
    if (golden === undefined) throw new Error("missing real V2 sidecar golden case");
    expect({ ...request, requestId: golden.handStructureRequest.requestId })
      .toEqual(golden.handStructureRequest);
    return HandStructureResultV2Schema.parse({
      ...golden.handStructureResult,
      requestId: request.requestId,
    });
  }

  async analyzeThreatRisk(
    _request: ThreatRiskFactRequest,
  ): Promise<ThreatRiskFactResult> {
    throw new Error("legacy regression intentionally uses local defense only");
  }

  async close(): Promise<void> {}
}

function v2RegressionInput(
  decision: NormalizedDecision,
  facts: KnownGameFacts,
  legacy: ReturnType<typeof analyzeAllDiscardEfficiency>,
  scope: ComparisonScope,
) {
  const actualAction = legacyDiscardActionIdToAction(decision.actualAction);
  const modelAction = legacyDiscardActionIdToAction(decision.modelAction);
  const actualRef = canonicalActionRef(actualAction);
  const modelRef = canonicalActionRef(modelAction);
  const comparisonSet = StructuredComparisonSetSchema.parse({
    comparisonSetId: `canonical-v2:${decision.decisionId}`,
    origin: "automatic_review",
    decisionLayerRef: `canonical-v2:${decision.decisionId}:decision-layer`,
    decisionWindow: facts.decisionWindow,
    candidates: [
      { actionRef: actualRef, action: actualAction, origins: ["actual", "model"] },
      { actionRef: modelRef, action: modelAction, origins: ["model"] },
    ],
  });
  const frame = CurrentSceneFrameSchema.parse({
    kind: "current_scene",
    frameId: `canonical-v2:${decision.decisionId}:frame`,
    scope,
    sceneRef: facts.decisionEventRef,
    facts: [{ factId: facts.factSetId, provenance: "raw_replay" }],
  });
  const legacyEfficiencyByActionRef = Object.fromEntries(
    comparisonSet.candidates.map((candidate) => {
      if (candidate.action.kind !== "discard") {
        throw new Error("East 1 regression candidate must be a discard");
      }
      const metric = legacy[candidate.action.tile.id];
      if (metric === undefined) throw new Error("legacy efficiency metric missing");
      return [candidate.actionRef, metric];
    }),
  );
  const responseFuriten = ResponseFuritenAnalysisV2Schema.parse({
    binding: {
      source: "unavailable",
      factSetId: facts.factSetId,
      decisionEventRef: facts.decisionEventRef,
      selfActor: facts.actor,
      reason: "response_history_not_provided",
      engineIdentityStatus: "unknown",
      engineIdentity: null,
    },
    temporary: {
      status: "unknown",
      unknownReason: "response_history_not_provided",
      evidenceIds: [],
      analysisRefs: [],
      riichiAcceptanceEventRef: null,
    },
    riichi: {
      status: "unknown",
      unknownReason: "response_history_not_provided",
      evidenceIds: [],
      analysisRefs: [],
      riichiAcceptanceEventRef: null,
    },
  });
  return {
    frame,
    comparisonSet,
    facts,
    responseFuriten,
    legacyEfficiencyByActionRef,
  };
}

function preferenceForAxis(
  result: Awaited<ReturnType<typeof runStructuredFactorPipeline>>,
  axis: "efficiency" | "defense",
) {
  const differences = result.differences.deterministic.filter(
    (difference) => difference.axis === axis && difference.direction !== "neutral",
  );
  const preference = differences.flatMap((difference) => {
    if (difference.direction === "supports_left") return [difference.leftActionRef];
    if (difference.direction === "supports_right") return [difference.rightActionRef];
    return [];
  });
  return [...new Set(preference)];
}

function factValue(
  result: Awaited<ReturnType<typeof runStructuredFactorPipeline>>,
  actionRef: string,
  dimension: string,
) {
  return result.ledgers.find((ledger) => ledger.actionRef === actionRef)
    ?.axes.flatMap((axis) => axis.facts)
    .find((fact) => fact.dimension === dimension)?.value;
}

function scoredEvaluation(
  input: ReturnType<typeof v2RegressionInput>,
  decisionId: string,
  probabilities: readonly [number, number],
): ModelEvaluation {
  const actual = input.comparisonSet.candidates.find((candidate) =>
    candidate.origins.includes("actual")
  );
  if (actual === undefined) throw new Error("actual candidate missing");
  const built = buildMortalModelEvaluation({
    evaluationId: `evaluation:${decisionId}:${probabilities.join("-")}`,
    comparisonSetId: input.comparisonSet.comparisonSetId,
    decisionLayerRef: input.comparisonSet.decisionLayerRef,
    engineVersion: "4.1b",
    adapterVersion: "regression-v1",
    actualActionRef: actual.actionRef,
    detailPolicy: {
      threshold: 10,
      unit: "model_selection_score_points",
      boundary: "greater_than_or_equal_is_detailed",
      policyVersion: "detail-v1",
      frozenAt: "2026-08-09T00:00:00.000Z",
    },
    candidates: input.comparisonSet.candidates.map((candidate, index) => ({
      actionRef: candidate.actionRef,
      probability: probabilities[index]!,
    })),
  });
  if (built.status !== "ready") throw new Error(built.reason);
  return built.evaluation;
}

async function runAtAnalysisAssembly(
  input: ReturnType<typeof v2RegressionInput>,
  engine: HandStructureFactEnginePort,
  modelEvaluation: ModelEvaluation | null,
) {
  return await runStructuredAnalysisAssembly({
    ...input,
    engine,
    modelEvaluation,
  });
}

describe("East 1 turn 6/7 structured factor regression", () => {
  it("keeps efficiency and defense on their correct axes", async () => {
    const raw = JSON.parse(await readFile(fixtureUrl, "utf8"));
    const golden = JSON.parse(await readFile(factEngineGoldenUrl, "utf8")) as {
      cases: GoldenCase[];
    };
    expect(golden.cases.every((entry) =>
      entry.result.identity.adapterVersion === "0.2.0" &&
      entry.handStructureResult.identity.adapterVersion === "0.2.0"
    )).toBe(true);
    const { selfActor, events, decisions } = importRegressionFixture(raw);
    const bridged = bridgeLegacyRegressionEvents(events, selfActor, {
      sourceKind: "fixture",
      gameId: "fixture:c1924cad66f66dd9",
    });
    expect(bridged.status).toBe("ready");
    if (bridged.status !== "ready") return;
    const expected = [
      {
        actual: canonicalActionRef({
          kind: "discard", tile: { id: "2p", red: false }, discardMode: "tedashi",
        }),
        safe: canonicalActionRef({
          kind: "discard", tile: { id: "6s", red: false }, discardMode: "tsumogiri",
        }),
      },
      {
        actual: canonicalActionRef({
          kind: "discard", tile: { id: "7p", red: false }, discardMode: "tedashi",
        }),
        safe: canonicalActionRef({
          kind: "discard", tile: { id: "8p", red: false }, discardMode: "tsumogiri",
        }),
      },
    ];

    for (const [index, decision] of decisions.entries()) {
      const triggerEventRef = bridged
        .legacyEventRefToCanonicalEventRefs[decision.sceneEventId]?.[0];
      if (triggerEventRef === undefined) throw new Error("decision ref missing");
      const scene = replayToDecision(events, decision, selfActor);
      const legacy = analyzeAllDiscardEfficiency(scene);
      const snapshot = freezeDecisionSnapshot(bridged.stream, {
        kind: "self_turn",
        actor: selfActor,
        triggerEventRef,
      });
      const facts = projectKnownGameFactsV2({
        stream: bridged.stream,
        decisionWindow: snapshot.privateState.decisionWindow,
        cachedSnapshot: snapshot,
      });
      const applied = v2RegressionInput(
        decision, facts, legacy, { kind: "applied_decision" },
      );
      const efficiency = v2RegressionInput(
        decision, facts, legacy, { kind: "single_axis", axis: "efficiency" },
      );
      const defense = v2RegressionInput(
        decision, facts, legacy, { kind: "single_axis", axis: "defense" },
      );
      const turnCases = golden.cases.filter((entry) =>
        entry.decisionId === decision.decisionId
      );
      expect(turnCases).toHaveLength(2);
      const engine = new RegressionFactEngine(turnCases);
      const unscoredAssembly = await runAtAnalysisAssembly(applied, engine, null);
      const appliedResult = unscoredAssembly.factorResult;
      const efficiencyResult = await runStructuredFactorPipeline({ ...efficiency, engine });
      const defenseResult = await runStructuredFactorPipeline({ ...defense, engine });
      const scoredAssembly = await runAtAnalysisAssembly(
        applied,
        engine,
        scoredEvaluation(applied, decision.decisionId, [0.9, 0.1]),
      );
      const perturbedScoreAssembly = await runAtAnalysisAssembly(
        applied,
        engine,
        scoredEvaluation(applied, decision.decisionId, [0.1, 0.9]),
      );
      const pair = expected[index]!;

      expect(scoredAssembly.modelEvaluation).not.toBeNull();
      expect(perturbedScoreAssembly.modelEvaluation).not.toEqual(
        scoredAssembly.modelEvaluation,
      );
      expect(scoredAssembly.factorResult).toEqual(appliedResult);
      expect(perturbedScoreAssembly.factorResult).toEqual(appliedResult);

      expect(efficiencyResult.deterministicPreference?.actionRefs)
        .toEqual([pair.actual]);
      expect(defenseResult.deterministicPreference?.actionRefs)
        .toEqual([pair.safe]);
      expect(preferenceForAxis(appliedResult, "efficiency")).toEqual([pair.actual]);
      expect(preferenceForAxis(appliedResult, "defense")).toEqual([pair.safe]);
      expect(appliedResult.deterministicPreference).toBeNull();
      expect(bridged.provenance).toBe("legacy_regression_bridge_only");

      const actualOverall = factValue(
        appliedResult,
        pair.actual,
        "overall_shanten",
      );
      const safeOverall = factValue(
        appliedResult,
        pair.safe,
        "overall_shanten",
      );
      expect(actualOverall).toMatchObject({ kind: "number", unit: "shanten" });
      expect(safeOverall).toMatchObject({ kind: "number", unit: "shanten" });

      for (const ledger of appliedResult.ledgers) {
        const goldenCase = turnCases.find((entry) =>
          entry.actionRef === ledger.actionRef
        );
        const overall = ledger.axes.flatMap((axis) => axis.facts)
          .find((fact) => fact.dimension === "overall_shanten");
        expect(overall?.value).toEqual({
          kind: "number",
          value: goldenCase?.handStructureResult.overallShanten,
          unit: "shanten",
        });
        expect(ledger.axes.flatMap((axis) => axis.facts)
          .some((fact) => fact.dimension === "shanten")).toBe(false);
      }
      expect(Object.values(applied.legacyEfficiencyByActionRef).map(
        (metric) => metric.shanten,
      ).sort()).toEqual([
        legacy[decision.actualAction.split(":")[1]!.replace(/r$/u, "")]!.shanten,
        legacy[decision.modelAction.split(":")[1]!.replace(/r$/u, "")]!.shanten,
      ].sort());
      expect(decision.modelReason).toBe("unknown");
      const efficiencySupportsSafe = appliedResult.differences.deterministic
        .filter((difference) =>
          difference.axis === "efficiency" && difference.direction !== "neutral"
        )
        .some((difference) =>
          (difference.direction === "supports_left"
            ? difference.leftActionRef
            : difference.rightActionRef) === pair.safe
        );
      expect(efficiencySupportsSafe).toBe(false);
    }
  });
});
