import { describe, expect, it } from "vitest";
import {
  AnalysisRequestSchema,
  ComparisonAnalysisRequestSchema,
} from "../src/index.js";

const comparisonSet = {
  comparisonSetId: "comparison:user:1",
  origin: "user_comparison",
  decisionLayerRef: "decision-layer:user:1",
  candidates: [
    { actionRef: "action:a", origins: ["user"] },
    { actionRef: "action:b", origins: ["user"] },
  ],
} as const;

const modelComparisonSet = {
  comparisonSetId: "comparison:user:model",
  origin: "user_comparison",
  decisionLayerRef: "decision-layer:user:model",
  candidates: [
    { actionRef: "action:a", origins: ["model"] },
    { actionRef: "action:b", origins: ["model", "actual"] },
    { actionRef: "action:c", origins: ["user"] },
  ],
} as const;

const modelEvaluation = {
  evaluationId: "evaluation:user:model",
  comparisonSetId: "comparison:user:model",
  decisionLayerRef: "decision-layer:user:model",
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
      actionRef: "action:a",
      rawValues: [{ metric: "probability", value: 0.6 }],
      modelSelectionScore: 60,
    },
    {
      actionRef: "action:b",
      rawValues: [{ metric: "probability", value: 0.4 }],
      modelSelectionScore: 40,
    },
  ],
  preferredActions: ["action:a"],
  actualActionRef: "action:b",
  errorGap: 20,
  modelReason: "unknown",
} as const;

describe("analysis request contract", () => {
  it("requires a comparison set for comparison requests", () => {
    const parsed = AnalysisRequestSchema.parse({
      kind: "comparison_request",
      requestId: "request:1",
      frame: {
        kind: "standalone_hypothesis",
        frameId: "frame:user:1",
        scope: { kind: "flat_discard" },
        facts: [
          { factId: "user-fact:hand", provenance: "user_asserted" },
        ],
      },
      comparisonSet,
    });

    expect(parsed.kind).toBe("comparison_request");

    expect(() => AnalysisRequestSchema.parse({
      kind: "comparison_request",
      requestId: "request:missing-comparison",
      frame: {
        kind: "standalone_hypothesis",
        frameId: "frame:user:missing-comparison",
        scope: { kind: "flat_discard" },
        facts: [
          { factId: "user-fact:hand", provenance: "user_asserted" },
        ],
      },
    })).toThrow();
  });

  it("forbids a comparison set on conceptual requests", () => {
    expect(AnalysisRequestSchema.parse({
      kind: "conceptual_request",
      requestId: "request:concept",
      frame: {
        kind: "conceptual",
        frameId: "frame:concept:1",
        scope: { kind: "conceptual" },
        topic: "What is temporary furiten?",
      },
    }).kind).toBe("conceptual_request");

    expect(() => AnalysisRequestSchema.parse({
      kind: "conceptual_request",
      requestId: "request:invalid-concept",
      frame: {
        kind: "conceptual",
        frameId: "frame:concept:2",
        scope: { kind: "conceptual" },
        topic: "What is temporary furiten?",
      },
      comparisonSet,
    })).toThrow();

    expect(() => AnalysisRequestSchema.parse({
      kind: "comparison_request",
      requestId: "request:invalid-comparison-frame",
      frame: {
        kind: "conceptual",
        frameId: "frame:concept:comparison",
        scope: { kind: "conceptual" },
        topic: "What is temporary furiten?",
      },
      comparisonSet,
    })).toThrow();
  });

  it("requires every model-scored action to belong to the comparison set", () => {
    expect(() => AnalysisRequestSchema.parse({
      kind: "comparison_request",
      requestId: "request:invalid-model-ref",
      frame: {
        kind: "standalone_hypothesis",
        frameId: "frame:user:2",
        scope: { kind: "flat_discard" },
        facts: [
          { factId: "user-fact:hand", provenance: "user_asserted" },
        ],
      },
      comparisonSet: {
        ...comparisonSet,
        candidates: [
          { actionRef: "action:a", origins: ["user", "actual"] },
          { actionRef: "action:b", origins: ["user"] },
        ],
      },
      modelEvaluation: {
        evaluationId: "evaluation:test",
        comparisonSetId: "comparison:user:1",
        decisionLayerRef: "decision-layer:user:1",
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
            actionRef: "action:a",
            rawValues: [{ metric: "probability", value: 0.6 }],
            modelSelectionScore: 60,
          },
          {
            actionRef: "action:outside",
            rawValues: [{ metric: "probability", value: 0.4 }],
            modelSelectionScore: 40,
          },
        ],
        preferredActions: ["action:a"],
        actualActionRef: "action:a",
        errorGap: 0,
        modelReason: "unknown",
      },
    })).toThrow();
  });

  it("rejects model evidence bound to another comparison or decision layer", () => {
    expect(() => AnalysisRequestSchema.parse({
      kind: "comparison_request",
      requestId: "request:wrong-comparison-binding",
      frame: {
        kind: "standalone_hypothesis",
        frameId: "frame:user:binding",
        scope: { kind: "flat_discard" },
        facts: [
          { factId: "user-fact:hand", provenance: "user_asserted" },
        ],
      },
      comparisonSet: modelComparisonSet,
      modelEvaluation: {
        ...modelEvaluation,
        comparisonSetId: "comparison:other",
      },
    })).toThrow();

    expect(() => AnalysisRequestSchema.parse({
      kind: "comparison_request",
      requestId: "request:wrong-decision-layer-binding",
      frame: {
        kind: "standalone_hypothesis",
        frameId: "frame:user:binding",
        scope: { kind: "flat_discard" },
        facts: [
          { factId: "user-fact:hand", provenance: "user_asserted" },
        ],
      },
      comparisonSet: modelComparisonSet,
      modelEvaluation: {
        ...modelEvaluation,
        decisionLayerRef: "decision-layer:other",
      },
    })).toThrow();
  });

  it("accepts scored subsets for user comparisons and matches the actual action", () => {
    const parsed = AnalysisRequestSchema.parse({
      kind: "comparison_request",
      requestId: "request:valid-model-evidence",
      frame: {
        kind: "standalone_hypothesis",
        frameId: "frame:user:valid-model-evidence",
        scope: { kind: "flat_discard" },
        facts: [
          { factId: "user-fact:hand", provenance: "user_asserted" },
        ],
      },
      comparisonSet: modelComparisonSet,
      modelEvaluation,
    });
    expect(parsed.kind).toBe("comparison_request");
    if (parsed.kind === "comparison_request") {
      expect(parsed.modelEvaluation?.actualActionRef).toBe("action:b");
    }

    expect(() => AnalysisRequestSchema.parse({
      kind: "comparison_request",
      requestId: "request:wrong-actual-marker",
      frame: {
        kind: "standalone_hypothesis",
        frameId: "frame:user:wrong-actual-marker",
        scope: { kind: "flat_discard" },
        facts: [
          { factId: "user-fact:hand", provenance: "user_asserted" },
        ],
      },
      comparisonSet: {
        ...modelComparisonSet,
        candidates: [
          { actionRef: "action:a", origins: ["model", "actual"] },
          { actionRef: "action:b", origins: ["model"] },
          { actionRef: "action:c", origins: ["user"] },
        ],
      },
      modelEvaluation,
    })).toThrow();
  });

  it("requires exact score coverage for automatic review", () => {
    const automaticSet = {
      comparisonSetId: "comparison:auto:1",
      origin: "automatic_review",
      decisionLayerRef: "decision-layer:auto:1",
      candidates: [
        { actionRef: "action:a", origins: ["model"] },
        { actionRef: "action:b", origins: ["model", "actual"] },
        { actionRef: "action:c", origins: ["model"] },
      ],
    } as const;

    expect(() => AnalysisRequestSchema.parse({
      kind: "comparison_request",
      requestId: "request:auto:missing-evaluation",
      frame: {
        kind: "current_scene",
        frameId: "frame:auto:1",
        scope: { kind: "applied_decision" },
        sceneRef: "scene:auto:1",
        facts: [{ factId: "event-1", provenance: "raw_replay" }],
      },
      comparisonSet: automaticSet,
    })).toThrow();

    expect(() => AnalysisRequestSchema.parse({
      kind: "comparison_request",
      requestId: "request:auto:partial-evaluation",
      frame: {
        kind: "current_scene",
        frameId: "frame:auto:2",
        scope: { kind: "applied_decision" },
        sceneRef: "scene:auto:2",
        facts: [{ factId: "event-1", provenance: "raw_replay" }],
      },
      comparisonSet: automaticSet,
      modelEvaluation: {
        evaluationId: "evaluation:auto:partial",
        comparisonSetId: "comparison:auto:1",
        decisionLayerRef: "decision-layer:auto:1",
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
            actionRef: "action:a",
            rawValues: [{ metric: "probability", value: 0.6 }],
            modelSelectionScore: 60,
          },
          {
            actionRef: "action:b",
            rawValues: [{ metric: "probability", value: 0.4 }],
            modelSelectionScore: 40,
          },
        ],
        preferredActions: ["action:a"],
        actualActionRef: "action:b",
        errorGap: 20,
        modelReason: "unknown",
      },
    })).toThrow();

    expect(AnalysisRequestSchema.parse({
      kind: "comparison_request",
      requestId: "request:auto:complete-evaluation",
      frame: {
        kind: "current_scene",
        frameId: "frame:auto:3",
        scope: { kind: "applied_decision" },
        sceneRef: "scene:auto:3",
        facts: [{ factId: "event-1", provenance: "raw_replay" }],
      },
      comparisonSet: automaticSet,
      modelEvaluation: {
        evaluationId: "evaluation:auto:complete",
        comparisonSetId: "comparison:auto:1",
        decisionLayerRef: "decision-layer:auto:1",
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
            actionRef: "action:a",
            rawValues: [{ metric: "probability", value: 0.5 }],
            modelSelectionScore: 50,
          },
          {
            actionRef: "action:b",
            rawValues: [{ metric: "probability", value: 0.3 }],
            modelSelectionScore: 30,
          },
          {
            actionRef: "action:c",
            rawValues: [{ metric: "probability", value: 0.2 }],
            modelSelectionScore: 20,
          },
        ],
        preferredActions: ["action:a"],
        actualActionRef: "action:b",
        errorGap: 20,
        modelReason: "unknown",
      },
    }).kind).toBe("comparison_request");
  });
});

describe("public comparison analysis request contract", () => {
  const automaticSet = {
    comparisonSetId: "comparison:auto:direct",
    origin: "automatic_review",
    decisionLayerRef: "decision-layer:auto:direct",
    candidates: [
      { actionRef: "action:a", origins: ["model"] },
      { actionRef: "action:b", origins: ["model", "actual"] },
      { actionRef: "action:c", origins: ["model"] },
    ],
  } as const;

  const automaticFrame = {
    kind: "current_scene",
    frameId: "frame:auto:direct",
    scope: { kind: "applied_decision" },
    sceneRef: "scene:auto:direct",
    facts: [{ factId: "event-1", provenance: "raw_replay" }],
  } as const;

  const automaticEvaluation = {
    ...modelEvaluation,
    evaluationId: "evaluation:auto:direct",
    comparisonSetId: "comparison:auto:direct",
    decisionLayerRef: "decision-layer:auto:direct",
    candidates: [
      {
        actionRef: "action:a",
        rawValues: [{ metric: "probability", value: 0.6 }],
        modelSelectionScore: 60,
      },
      {
        actionRef: "action:b",
        rawValues: [{ metric: "probability", value: 0.4 }],
        modelSelectionScore: 40,
      },
    ],
  } as const;

  it("rejects automatic review without model evidence when parsed directly", () => {
    expect(() => ComparisonAnalysisRequestSchema.parse({
      kind: "comparison_request",
      requestId: "request:auto:direct:missing-evaluation",
      frame: automaticFrame,
      comparisonSet: automaticSet,
    })).toThrow();
  });

  it("rejects incorrectly bound model evidence when parsed directly", () => {
    expect(() => ComparisonAnalysisRequestSchema.parse({
      kind: "comparison_request",
      requestId: "request:direct:wrong-comparison-binding",
      frame: {
        kind: "standalone_hypothesis",
        frameId: "frame:direct:wrong-comparison-binding",
        scope: { kind: "flat_discard" },
        facts: [
          { factId: "user-fact:hand", provenance: "user_asserted" },
        ],
      },
      comparisonSet: modelComparisonSet,
      modelEvaluation: {
        ...modelEvaluation,
        comparisonSetId: "comparison:other",
      },
    })).toThrow();

    expect(() => ComparisonAnalysisRequestSchema.parse({
      kind: "comparison_request",
      requestId: "request:direct:wrong-decision-layer-binding",
      frame: {
        kind: "standalone_hypothesis",
        frameId: "frame:direct:wrong-decision-layer-binding",
        scope: { kind: "flat_discard" },
        facts: [
          { factId: "user-fact:hand", provenance: "user_asserted" },
        ],
      },
      comparisonSet: modelComparisonSet,
      modelEvaluation: {
        ...modelEvaluation,
        decisionLayerRef: "decision-layer:other",
      },
    })).toThrow();
  });

  it("rejects incomplete automatic score coverage when parsed directly", () => {
    expect(() => ComparisonAnalysisRequestSchema.parse({
      kind: "comparison_request",
      requestId: "request:auto:direct:partial-evaluation",
      frame: automaticFrame,
      comparisonSet: automaticSet,
      modelEvaluation: automaticEvaluation,
    })).toThrow();
  });

  it("rejects an actual marker mismatch when parsed directly", () => {
    expect(() => ComparisonAnalysisRequestSchema.parse({
      kind: "comparison_request",
      requestId: "request:direct:wrong-actual-marker",
      frame: {
        kind: "standalone_hypothesis",
        frameId: "frame:direct:wrong-actual-marker",
        scope: { kind: "flat_discard" },
        facts: [
          { factId: "user-fact:hand", provenance: "user_asserted" },
        ],
      },
      comparisonSet: {
        ...modelComparisonSet,
        candidates: [
          { actionRef: "action:a", origins: ["model", "actual"] },
          { actionRef: "action:b", origins: ["model"] },
          { actionRef: "action:c", origins: ["user"] },
        ],
      },
      modelEvaluation,
    })).toThrow();
  });
});
