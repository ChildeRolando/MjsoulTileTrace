import { describe, expect, it } from "vitest";
import {
  buildMortalModelEvaluation,
  classifyModelEvaluationDetail,
  DEFAULT_ERROR_DETAIL_THRESHOLD,
  freezeDetailPolicy,
} from "../src/index.js";

describe("frozen detail policy", () => {
  it("defaults to 10 model-selection-score points", () => {
    expect(freezeDetailPolicy({
      policyVersion: "detail-policy@1",
      frozenAt: "2026-07-30T00:00:00.000Z",
    })).toEqual({
      threshold: 10,
      unit: "model_selection_score_points",
      boundary: "greater_than_or_equal_is_detailed",
      policyVersion: "detail-policy@1",
      frozenAt: "2026-07-30T00:00:00.000Z",
    });
    expect(DEFAULT_ERROR_DETAIL_THRESHOLD).toBe(10);
  });

  it.each([
    [9.999, "concise"],
    [10, "detailed"],
    [10.001, "detailed"],
  ] as const)(
    "classifies a %s-point gap as %s",
    (gap, expectedTier) => {
      const detailPolicy = freezeDetailPolicy({
        threshold: 10,
        policyVersion: "detail-policy@1",
        frozenAt: "2026-07-30T00:00:00.000Z",
      });
      const result = buildMortalModelEvaluation({
        evaluationId: `evaluation:gap:${gap}`,
        comparisonSetId: `comparison:gap:${gap}`,
        decisionLayerRef: `decision-layer:gap:${gap}`,
        engineVersion: "test",
        adapterVersion: "mortal-score@1",
        actualActionRef: "action:actual",
        detailPolicy,
        candidates: [
          {
            actionRef: "action:model",
            probability: 0.5 + gap / 100,
          },
          {
            actionRef: "action:actual",
            probability: 0.5,
          },
        ],
      });

      expect(result.status).toBe("ready");
      if (result.status === "ready") {
        expect(result.evaluation.errorGap).toBeCloseTo(gap);
        expect(classifyModelEvaluationDetail(result.evaluation)).toBe(
          expectedTier,
        );
      }
    },
  );

  it("classifies a tied actual action as not_error", () => {
    const result = buildMortalModelEvaluation({
      evaluationId: "evaluation:tie",
      comparisonSetId: "comparison:tie",
      decisionLayerRef: "decision-layer:tie",
      engineVersion: "test",
      adapterVersion: "mortal-score@1",
      actualActionRef: "action:actual",
      detailPolicy: freezeDetailPolicy({
        policyVersion: "detail-policy@1",
        frozenAt: "2026-07-30T00:00:00.000Z",
      }),
      candidates: [
        { actionRef: "action:model", probability: 0.5 },
        { actionRef: "action:actual", probability: 0.5 },
      ],
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(classifyModelEvaluationDetail(result.evaluation)).toBe(
        "not_error",
      );
    }
  });

  it("does not reread a mutable global threshold", () => {
    let globalThreshold = 10;
    const snapshot = freezeDetailPolicy({
      threshold: globalThreshold,
      policyVersion: "detail-policy@1",
      frozenAt: "2026-07-30T00:00:00.000Z",
    });
    globalThreshold = 30;

    expect(globalThreshold).toBe(30);
    expect(snapshot.threshold).toBe(10);
  });

  it("rejects an invalid threshold or freeze timestamp", () => {
    expect(() => freezeDetailPolicy({
      threshold: -1,
      policyVersion: "detail-policy@1",
      frozenAt: "2026-07-30T00:00:00.000Z",
    })).toThrow();
    expect(() => freezeDetailPolicy({
      policyVersion: "detail-policy@1",
      frozenAt: "not-a-datetime",
    })).toThrow();
  });
});
