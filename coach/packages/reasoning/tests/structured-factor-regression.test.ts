import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  canonicalActionRef,
  CurrentSceneFrameSchema,
  Hand13FactResultSchema,
  StructuredComparisonSetSchema,
  type ComparisonScope,
  type CompletedHandFactRequest,
  type CompletedHandFactResult,
  type EngineIdentity,
  type Hand13FactRequest,
  type Hand13FactResult,
  type ThreatRiskFactRequest,
  type ThreatRiskFactResult,
  type KnownGameFacts,
  type NormalizedDecision,
} from "@riichi-coach/contracts";
import type { MahjongFactEnginePort } from "../src/fact-engine/port.js";
import { analyzeAllDiscardEfficiency } from "../src/analysis/efficiency-analyzer.js";
import { importRegressionFixture } from "../src/import/mortal-report.js";
import { replayToDecision } from "../src/replay/scene-replayer.js";
import { runStructuredFactorPipeline } from "../src/factors/structured-factor-pipeline.js";
import { legacyDiscardActionIdToAction } from "../src/candidate/legacy-action-bridge.js";
import { bridgeLegacyRegressionEvents } from "../src/import/legacy-event-stream-bridge.js";
import { freezeDecisionSnapshot } from "../src/replay/decision-snapshot.js";
import { projectKnownGameFactsV2 } from "../src/factors/known-game-facts-v2.js";

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
  adapterVersion: "0.1.0",
  protocolVersion: "mahjong-facts/v1",
};

type GoldenCase = {
  decisionId: string;
  actionRef: string;
  request: Hand13FactRequest;
  result: Hand13FactResult;
};

class RegressionFactEngine implements MahjongFactEnginePort {
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
  return { frame, comparisonSet, facts, legacyEfficiencyByActionRef };
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

describe("East 1 turn 6/7 structured factor regression", () => {
  it("keeps efficiency and defense on their correct axes", async () => {
    const raw = JSON.parse(await readFile(fixtureUrl, "utf8"));
    const golden = JSON.parse(await readFile(factEngineGoldenUrl, "utf8")) as {
      cases: GoldenCase[];
    };
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
      const appliedResult = await runStructuredFactorPipeline({ ...applied, engine });
      const efficiencyResult = await runStructuredFactorPipeline({ ...efficiency, engine });
      const defenseResult = await runStructuredFactorPipeline({ ...defense, engine });
      const pair = expected[index]!;

      expect(efficiencyResult.deterministicPreference?.actionRefs)
        .toEqual([pair.actual]);
      expect(defenseResult.deterministicPreference?.actionRefs)
        .toEqual([pair.safe]);
      expect(preferenceForAxis(appliedResult, "efficiency")).toEqual([pair.actual]);
      expect(preferenceForAxis(appliedResult, "defense")).toEqual([pair.safe]);
      expect(appliedResult.deterministicPreference).toBeNull();
      expect(bridged.provenance).toBe("legacy_regression_bridge_only");

      for (const ledger of appliedResult.ledgers) {
        const actionMetric = applied.legacyEfficiencyByActionRef[ledger.actionRef];
        const goldenCase = turnCases.find((entry) =>
          entry.actionRef === ledger.actionRef
        );
        const shanten = ledger.axes.flatMap((axis) => axis.facts)
          .find((fact) => fact.dimension === "shanten");
        const ukeire = ledger.axes.flatMap((axis) => axis.facts)
          .find((fact) => fact.dimension === "ukeire_remaining");
        expect(shanten?.value).toMatchObject({
          kind: "number",
          value: actionMetric?.shanten,
        });
        expect(ukeire?.value).toEqual({
          kind: "tile_counts",
          value: goldenCase?.result.waitsRemaining,
        });
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
