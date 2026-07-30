import { describe, expect, it } from "vitest";
import {
  buildAkagiModelEvaluation,
  buildMortalModelEvaluation,
} from "../src/model/model-evaluation-builder.js";

const common = {
  evaluationId: "evaluation:test",
  comparisonSetId: "comparison:test",
  decisionLayerRef: "decision-layer:test",
  engineVersion: "test-engine",
  adapterVersion: "score-adapter@1",
  actualActionRef: "action:actual",
  detailPolicy: {
    threshold: 10,
    unit: "model_selection_score_points",
    boundary: "greater_than_or_equal_is_detailed",
    policyVersion: "detail-policy@1",
    frozenAt: "2026-07-30T00:00:00.000Z",
  },
} as const;

describe("model evaluation builders", () => {
  it("builds Mortal probability-times-100 evidence without renormalizing", () => {
    const result = buildMortalModelEvaluation({
      ...common,
      candidates: [
        { actionRef: "action:model", probability: 0.7, qValue: 1.4 },
        { actionRef: "action:actual", probability: 0.2, qValue: 0.2 },
      ],
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.evaluation.candidates.map(
        (candidate) => candidate.modelSelectionScore,
      )).toEqual([70, 20]);
      expect(result.evaluation.candidates.map(
        (candidate) => candidate.rawValues,
      )).toEqual([
        [
          { metric: "probability", value: 0.7 },
          { metric: "q_value", value: 1.4 },
        ],
        [
          { metric: "probability", value: 0.2 },
          { metric: "q_value", value: 0.2 },
        ],
      ]);
      expect(result.evaluation.preferredActions).toEqual(["action:model"]);
      expect(result.evaluation.errorGap).toBe(50);
    }
  });

  it("uses stable softmax for Akagi logits", () => {
    const result = buildAkagiModelEvaluation({
      ...common,
      candidates: [
        { actionRef: "action:model", logit: 1001 },
        { actionRef: "action:actual", logit: 1000 },
      ],
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.evaluation.candidates[0]?.modelSelectionScore)
        .toBeCloseTo(73.10585786300048);
      expect(result.evaluation.candidates[1]?.modelSelectionScore)
        .toBeCloseTo(26.894142136999513);
    }
  });

  it("binds model evidence to the comparison and decision layer", () => {
    const result = buildMortalModelEvaluation({
      ...common,
      candidates: [
        { actionRef: "action:model", probability: 0.7 },
        { actionRef: "action:actual", probability: 0.3 },
      ],
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.evaluation.comparisonSetId).toBe("comparison:test");
      expect(result.evaluation.decisionLayerRef).toBe(
        "decision-layer:test",
      );
      expect(result.evaluation.modelReason).toBe("unknown");
    }
  });

  it("fails closed with fewer than two scored candidates", () => {
    expect(buildAkagiModelEvaluation({
      ...common,
      candidates: [
        { actionRef: "action:actual", logit: 1, qValue: 0.25 },
      ],
    })).toEqual({
      status: "incomplete",
      reason: "fewer_than_two_scored_candidates",
    });
  });

  it("fails closed when the actual action is not scored", () => {
    expect(buildMortalModelEvaluation({
      ...common,
      actualActionRef: "action:missing",
      candidates: [
        { actionRef: "action:a", probability: 0.7 },
        { actionRef: "action:b", probability: 0.3 },
      ],
    })).toEqual({
      status: "incomplete",
      reason: "actual_action_not_scored",
    });
  });

  it("keeps every truly tied top action in the model preference", () => {
    const result = buildMortalModelEvaluation({
      ...common,
      candidates: [
        { actionRef: "action:model", probability: 0.5 },
        { actionRef: "action:actual", probability: 0.5 },
      ],
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.evaluation.preferredActions).toEqual([
        "action:model",
        "action:actual",
      ]);
      expect(result.evaluation.errorGap).toBe(0);
    }
  });
});
