import { describe, expect, it } from "vitest";
import {
  ActionRefSchema,
  ComparisonSetSchema,
  type ActionRef,
} from "../src/index.js";

describe("comparison contracts", () => {
  it("does not allow an unparsed string to masquerade as an ActionRef", () => {
    // @ts-expect-error ActionRef values must cross the schema boundary.
    const invalidActionRef: ActionRef = "action:unparsed";
    expect(invalidActionRef).toBe("action:unparsed");
  });

  it("keeps an action opaque and allows multiple declared origins", () => {
    const parsed = ComparisonSetSchema.parse({
      comparisonSetId: "comparison:e1:t6",
      origin: "automatic_review",
      decisionLayerRef: "decision-layer:e1:t6",
      candidates: [
        {
          actionRef: "action:model",
          origins: ["model"],
        },
        {
          actionRef: "action:actual",
          origins: ["model", "actual"],
        },
      ],
    });

    expect(parsed.candidates[1]?.origins).toEqual(["model", "actual"]);
    expect(ActionRefSchema.parse("discard:6s:tsumogiri")).toBe(
      "discard:6s:tsumogiri",
    );
  });

  it("rejects duplicate candidates, duplicate origins, and singleton comparisons", () => {
    expect(() => ComparisonSetSchema.parse({
      comparisonSetId: "comparison:duplicate-action",
      origin: "user_comparison",
      decisionLayerRef: "decision-layer:user:1",
      candidates: [
        { actionRef: "action:a", origins: ["model"] },
        { actionRef: "action:a", origins: ["actual"] },
      ],
    })).toThrow();

    expect(() => ComparisonSetSchema.parse({
      comparisonSetId: "comparison:duplicate-origin",
      origin: "user_comparison",
      decisionLayerRef: "decision-layer:user:2",
      candidates: [
        { actionRef: "action:a", origins: ["model", "model"] },
        { actionRef: "action:b", origins: ["actual"] },
      ],
    })).toThrow();

    expect(() => ComparisonSetSchema.parse({
      comparisonSetId: "comparison:singleton",
      origin: "user_comparison",
      decisionLayerRef: "decision-layer:user:3",
      candidates: [
        { actionRef: "action:a", origins: ["user"] },
      ],
    })).toThrow();
  });

  it("requires every automatic candidate to be model-scored and exactly one actual", () => {
    expect(() => ComparisonSetSchema.parse({
      comparisonSetId: "comparison:auto:no-actual",
      origin: "automatic_review",
      decisionLayerRef: "decision-layer:auto:1",
      candidates: [
        { actionRef: "action:a", origins: ["model"] },
        { actionRef: "action:b", origins: ["model"] },
      ],
    })).toThrow();

    expect(() => ComparisonSetSchema.parse({
      comparisonSetId: "comparison:auto:unscored",
      origin: "automatic_review",
      decisionLayerRef: "decision-layer:auto:2",
      candidates: [
        { actionRef: "action:a", origins: ["model", "actual"] },
        { actionRef: "action:b", origins: ["user"] },
      ],
    })).toThrow();
  });
});
