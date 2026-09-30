import { describe, expect, it } from "vitest";
import { deriveAutomaticComparisonScope, ModelEvaluationSchema } from "../src/index.js";

function evaluation(probabilities: number[], actualIndex: number, physicalActual?: string) {
  const refs = ["action:a", "action:b", "action:c"];
  const best = Math.max(...probabilities);
  return ModelEvaluationSchema.parse({
    evaluationId: "evaluation:test", comparisonSetId: "comparison:test", decisionLayerRef: "layer:test",
    engineId: "mortal", engineVersion: "test", adapterVersion: "test",
    scoreMethod: "mortal_probability_x100", modelReason: "unknown",
    detailPolicy: { threshold: 99, unit: "model_selection_score_points",
      boundary: "greater_than_or_equal_is_detailed", policyVersion: "test", frozenAt: "2026-09-29T00:00:00.000Z" },
    candidates: probabilities.map((probability, index) => ({ actionRef: refs[index],
      rawValues: [{ metric: "probability", value: probability }], modelSelectionScore: probability * 100 })),
    preferredActions: refs.filter((_, index) => probabilities[index] === best),
    actualActionRef: physicalActual ?? refs[actualIndex], scoredActualModelActionRef: refs[actualIndex],
    errorGap: best * 100 - probabilities[actualIndex]! * 100,
  });
}

describe("automatic report comparison scope", () => {
  it.each([
    { actual: 0, pair: ["action:a", "action:b"], reason: "model_agreement" },
    { actual: 1, pair: ["action:a", "action:b"], reason: "model_disagreement" },
    { actual: 2, pair: ["action:a", "action:c"], reason: "model_disagreement" },
  ])("selects $pair for actual index $actual independently of the detail threshold", ({ actual, pair, reason }) => {
    expect(deriveAutomaticComparisonScope(evaluation([0.6, 0.3, 0.1], actual))).toEqual({
      policyVersion: "automatic-comparison/top-pair-v1", reason, actionRefs: pair,
    });
  });

  it("treats a tied best actual as agreement and ranks remaining choices deterministically", () => {
    const input = evaluation([0.45, 0.45, 0.1], 1);
    const original = structuredClone(input);
    expect(deriveAutomaticComparisonScope(input).actionRefs).toEqual(["action:b", "action:a"]);
    input.candidates.reverse();
    expect(deriveAutomaticComparisonScope(input)).toEqual(deriveAutomaticComparisonScope(original));
    expect(original.candidates.map(row => row.actionRef)).toEqual(["action:a", "action:b", "action:c"]);
  });

  it("uses stable identity to break a top tie when the actual is not preferred", () => {
    const input = evaluation([0.45, 0.45, 0.1], 2);
    input.candidates.reverse();
    expect(deriveAutomaticComparisonScope(input).actionRefs).toEqual(["action:a", "action:c"]);
  });

  it.each([0, 2])("preserves the actual physical action without comparing it against its own model carrier (%s)", actual => {
    const scope = deriveAutomaticComparisonScope(evaluation([0.6, 0.3, 0.1], actual, "action:physical-actual"));
    expect(scope.actionRefs).toEqual(actual === 0
      ? ["action:physical-actual", "action:b"] : ["action:a", "action:physical-actual"]);
  });

  it("rejects missing scores and a forged preferred set instead of guessing a pair", () => {
    const missing = evaluation([0.6, 0.3, 0.1], 2);
    missing.candidates.pop();
    expect(() => deriveAutomaticComparisonScope(missing)).toThrow();
    const forged = evaluation([0.6, 0.3, 0.1], 2);
    forged.preferredActions = [forged.actualActionRef];
    expect(() => deriveAutomaticComparisonScope(forged)).toThrow();
  });
});
