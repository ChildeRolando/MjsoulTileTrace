import { describe, expect, it } from "vitest";
import { ModelEvaluationSchema } from "../src/index.js";

const mortalEvaluation = {
  evaluationId: "evaluation:mortal:e1:t6",
  comparisonSetId: "comparison:e1:t6",
  decisionLayerRef: "decision-layer:e1:t6",
  engineId: "mortal",
  engineVersion: "4.1b",
  adapterVersion: "mortal-score@1",
  scoreMethod: "mortal_probability_x100",
  detailPolicy: {
    threshold: 10,
    unit: "model_selection_score_points",
    boundary: "greater_than_or_equal_is_detailed",
    policyVersion: "detail-policy@1",
    frozenAt: "2026-07-30T00:00:00.000Z",
  },
  candidates: [
    {
      actionRef: "action:6s",
      rawValues: [
        { metric: "probability", value: 0.75 },
        { metric: "q_value", value: 1.2 },
      ],
      modelSelectionScore: 75,
    },
    {
      actionRef: "action:2p",
      rawValues: [
        { metric: "probability", value: 0.25 },
        { metric: "q_value", value: 0.4 },
      ],
      modelSelectionScore: 25,
    },
  ],
  preferredActions: ["action:6s"],
  actualActionRef: "action:2p",
  errorGap: 50,
  modelReason: "unknown",
} as const;

describe("model evaluation contract", () => {
  it("accepts replayable Mortal score evidence", () => {
    const parsed = ModelEvaluationSchema.parse(mortalEvaluation);

    expect(parsed.preferredActions).toEqual(["action:6s"]);
    expect(parsed.detailPolicy.threshold).toBe(10);
    expect(parsed.errorGap).toBe(50);
  });

  it("rejects a claimed model reason, an unscored actual action, and wrong top actions", () => {
    expect(() => ModelEvaluationSchema.parse({
      ...mortalEvaluation,
      modelReason: "defense",
    })).toThrow();

    expect(() => ModelEvaluationSchema.parse({
      ...mortalEvaluation,
      actualActionRef: "action:missing",
    })).toThrow();

    expect(() => ModelEvaluationSchema.parse({
      ...mortalEvaluation,
      preferredActions: ["action:2p"],
    })).toThrow();

    expect(() => ModelEvaluationSchema.parse({
      ...mortalEvaluation,
      errorGap: 49,
    })).toThrow();

    expect(() => ModelEvaluationSchema.parse({
      ...mortalEvaluation,
      scoreMethod: "akagi_softmax_x100",
    })).toThrow();

    expect(() => ModelEvaluationSchema.parse({
      ...mortalEvaluation,
      candidates: mortalEvaluation.candidates.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              rawValues: [
                ...candidate.rawValues,
                { metric: "logit", value: 1 },
              ],
            }
          : candidate
      ),
    })).toThrow();
  });

  it("recomputes Mortal and Akagi selection scores", () => {
    expect(() => ModelEvaluationSchema.parse({
      ...mortalEvaluation,
      candidates: [
        {
          ...mortalEvaluation.candidates[0],
          modelSelectionScore: 74,
        },
        mortalEvaluation.candidates[1],
      ],
    })).toThrow();

    expect(ModelEvaluationSchema.parse({
      evaluationId: "evaluation:akagi:test",
      comparisonSetId: "comparison:akagi:test",
      decisionLayerRef: "decision-layer:akagi:test",
      engineId: "akagi_native",
      engineVersion: "1.0.0",
      adapterVersion: "akagi-score@1",
      scoreMethod: "akagi_softmax_x100",
      detailPolicy: mortalEvaluation.detailPolicy,
      candidates: [
        {
          actionRef: "action:a",
          rawValues: [{ metric: "logit", value: 1 }],
          modelSelectionScore: 73.10585786300048,
        },
        {
          actionRef: "action:b",
          rawValues: [{ metric: "logit", value: 0 }],
          modelSelectionScore: 26.894142136999513,
        },
      ],
      preferredActions: ["action:a"],
      actualActionRef: "action:b",
      errorGap: 46.21171572600097,
      modelReason: "unknown",
    }).engineId).toBe("akagi_native");
  });

  it("derives tied preferences and gaps from canonical raw scores", () => {
    expect(() => ModelEvaluationSchema.parse({
      ...mortalEvaluation,
      candidates: [
        {
          ...mortalEvaluation.candidates[0],
          rawValues: [{ metric: "probability", value: 0.5 }],
          modelSelectionScore: 50.0000000005,
        },
        {
          ...mortalEvaluation.candidates[1],
          rawValues: [{ metric: "probability", value: 0.5 }],
          modelSelectionScore: 50,
        },
      ],
      preferredActions: ["action:6s"],
      errorGap: 0.0000000005,
    })).toThrow();

    expect(() => ModelEvaluationSchema.parse({
      ...mortalEvaluation,
      candidates: [
        {
          ...mortalEvaluation.candidates[0],
          rawValues: [{ metric: "probability", value: 0.5 }],
          modelSelectionScore: 50.0000000005,
        },
        {
          ...mortalEvaluation.candidates[1],
          rawValues: [{ metric: "probability", value: 0.5 }],
          modelSelectionScore: 50,
        },
      ],
      preferredActions: ["action:6s", "action:2p"],
      errorGap: 0.0000000005,
    })).toThrow();

    expect(() => ModelEvaluationSchema.parse({
      evaluationId: "evaluation:akagi:tie",
      comparisonSetId: "comparison:akagi:tie",
      decisionLayerRef: "decision-layer:akagi:tie",
      engineId: "akagi_native",
      engineVersion: "1.0.0",
      adapterVersion: "akagi-score@1",
      scoreMethod: "akagi_softmax_x100",
      detailPolicy: mortalEvaluation.detailPolicy,
      candidates: [
        {
          actionRef: "action:a",
          rawValues: [{ metric: "logit", value: 0 }],
          modelSelectionScore: 50.0000000005,
        },
        {
          actionRef: "action:b",
          rawValues: [{ metric: "logit", value: 0 }],
          modelSelectionScore: 50,
        },
      ],
      preferredActions: ["action:a"],
      actualActionRef: "action:b",
      errorGap: 0.0000000005,
      modelReason: "unknown",
    })).toThrow();

    expect(() => ModelEvaluationSchema.parse({
      evaluationId: "evaluation:akagi:tie",
      comparisonSetId: "comparison:akagi:tie",
      decisionLayerRef: "decision-layer:akagi:tie",
      engineId: "akagi_native",
      engineVersion: "1.0.0",
      adapterVersion: "akagi-score@1",
      scoreMethod: "akagi_softmax_x100",
      detailPolicy: mortalEvaluation.detailPolicy,
      candidates: [
        {
          actionRef: "action:a",
          rawValues: [{ metric: "logit", value: 0 }],
          modelSelectionScore: 50.0000000005,
        },
        {
          actionRef: "action:b",
          rawValues: [{ metric: "logit", value: 0 }],
          modelSelectionScore: 50,
        },
      ],
      preferredActions: ["action:a", "action:b"],
      actualActionRef: "action:b",
      errorGap: 0.0000000005,
      modelReason: "unknown",
    })).toThrow();
  });
});
