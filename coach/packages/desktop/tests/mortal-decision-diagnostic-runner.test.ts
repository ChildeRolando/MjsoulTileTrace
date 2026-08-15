import { describe, expect, it } from "vitest";
import type { ReplayedDecision } from "@riichi-coach/reasoning";
import {
  buildMortalDecisionResultPath,
  formatMortalDecisionConsoleLine,
  serializeMortalDecisionDiagnosticResult,
} from "../src/mortal-decision-diagnostic-runner.js";

const SYNTHETIC_REPORT_ID = "0123456789abcdef";

function fakeReview() {
  return {
    status: "ready",
    anchor: {
      reportIdHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      kyoku: 0,
      honba: 0,
      junme: 1,
      decisionEventRef: "decision:1",
    },
    comparisonSet: {
      comparisonSetId: "comparison:hash",
      origin: "automatic_review",
      decisionLayerRef: "layer:hash",
      decisionWindow: {
        kind: "self_turn",
        actor: 1,
        triggerEventRef: "decision:1",
        sourceActor: null,
        offeredTile: null,
        kanKind: null,
      },
      candidates: [{
        actionRef: "action:v1:actual",
        action: {
          kind: "discard",
          tile: { id: "4z", red: false },
          discardMode: "tedashi",
        },
        origins: ["model", "actual"],
      }],
    },
    modelEvaluation: {
      evaluationId: `mortal-evaluation:${SYNTHETIC_REPORT_ID}:decision:1`,
      comparisonSetId: "comparison:hash",
      decisionLayerRef: "layer:hash",
      engineId: "mortal",
      engineVersion: "1.5.10",
      adapterVersion: "mortal-source/1",
      scoreMethod: "mortal_probability_x100",
      detailPolicy: {
        threshold: 10,
        unit: "model_selection_score_points",
        boundary: "greater_than_or_equal_is_detailed",
        policyVersion: "detail-v1",
        frozenAt: "2026-08-15T00:00:00.000Z",
      },
      candidates: [{
        actionRef: "action:v1:actual",
        rawValues: [{ metric: "probability", value: 1 }],
        modelSelectionScore: 100,
      }],
      preferredActions: ["action:v1:actual"],
      actualActionRef: "action:v1:actual",
      errorGap: 0,
      modelReason: "unknown",
    },
    factorResult: {
      analysisMode: "v2",
      ledgers: [],
      defenseMatrices: [],
      differences: { status: "ready", differences: [] },
      deterministicPreference: null,
      diagnostics: [],
    },
  };
}

describe("mortal-decision diagnostic privacy", () => {
  it("never serializes a raw Mortal report id", () => {
    const serialized = serializeMortalDecisionDiagnosticResult(
      { status: "acquired", selfSeat: 1 } as never,
      {
        snapshot: { privateState: { decisionWindow: { kind: "self_turn" } } },
      } as ReplayedDecision,
      fakeReview() as never,
      "not_error",
    );
    expect(serialized).not.toContain(SYNTHETIC_REPORT_ID);
    expect(serialized).not.toContain("evaluationId");
    expect(serialized).not.toContain("decision:1");
  });

  it("never prints a raw Mortal report id to the console line", () => {
    const line = formatMortalDecisionConsoleLine({
      decisionKind: "self_turn",
      candidateCount: 12,
      actualActionRef: "action:v1:actual",
      errorGap: 0,
    });
    expect(line).not.toContain(SYNTHETIC_REPORT_ID);
    expect(line).not.toContain("https://");
  });

  it("never writes a result path embedding a raw Mortal report id", () => {
    const path = buildMortalDecisionResultPath("C:\\temp\\results", 1234567890);
    expect(path).not.toContain(SYNTHETIC_REPORT_ID);
    expect(path).toContain("mortal-decision-result-1234567890.json");
  });
});
