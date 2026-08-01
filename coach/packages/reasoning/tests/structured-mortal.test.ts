import { describe, expect, it } from "vitest";
import {
  importStructuredMortalComparison,
} from "../src/import/structured-mortal.js";

const facts = {
  decisionWindow: {
    kind: "self_turn" as const,
    actor: 3,
    triggerEventRef: "event:draw",
  },
  concealedTiles: [{ id: "2p" as const, red: false }],
  currentDraw: {
    tile: { id: "6s" as const, red: false },
    eventRef: "event:draw",
  },
};

const modelSixSou = {
  actions: [{
    eventRef: "model:6s",
    action: {
      type: "dahai",
      actor: 3,
      pai: "6s",
      tsumogiri: true,
    },
  }],
  probability: 0.8,
  qValue: 1.2,
};
const modelTwoPin = {
  actions: [{
    eventRef: "model:2p",
    action: {
      type: "dahai",
      actor: 3,
      pai: "2p",
      tsumogiri: false,
    },
  }],
  probability: 0.2,
  qValue: 0.1,
};
const actualTwoPin = {
  actions: [{
    eventRef: "actual:2p",
    action: {
      type: "dahai",
      actor: 3,
      pai: "2p",
      tsumogiri: false,
    },
  }],
};

describe("generic structured Mortal importer", () => {
  it("maps malformed MJAI calls to a structural import diagnostic", () => {
    const responseFacts = {
      decisionWindow: {
        kind: "discard_response" as const,
        actor: 0,
        triggerEventRef: "event:discard",
        sourceActor: 1,
        offeredTile: { id: "2m" as const, red: false },
      },
      concealedTiles: [
        { id: "4m" as const, red: false },
        { id: "5m" as const, red: false },
      ],
    };
    const malformedChi = {
      actions: [{
        eventRef: "model:chi",
        action: {
          type: "chi",
          actor: 0,
          target: 1,
          pai: "2m",
          consumed: ["4m", "5m"],
        },
      }],
      probability: 0.5,
    };

    expect(importStructuredMortalComparison({
      comparisonSetId: "comparison:malformed-chi",
      decisionLayerRef: "decision-layer:malformed-chi",
      facts: responseFacts,
      modelCandidates: [malformedChi],
      actual: { actions: malformedChi.actions },
    })).toEqual({
      status: "incomplete",
      diagnostics: ["structurally_invalid_action:chi_not_sequence"],
    });
  });

  it("maps malformed MJAI kans to a structural import diagnostic", () => {
    const malformedAnkan = {
      actions: [{
        eventRef: "model:ankan",
        action: {
          type: "ankan",
          actor: 3,
          consumed: ["6s", "6s", "6s", "7s"],
        },
      }],
      probability: 0.5,
    };

    expect(importStructuredMortalComparison({
      comparisonSetId: "comparison:malformed-ankan",
      decisionLayerRef: "decision-layer:malformed-ankan",
      facts: {
        decisionWindow: {
          kind: "self_turn",
          actor: 3,
          triggerEventRef: "event:draw",
        },
        concealedTiles: [
          { id: "6s", red: false },
          { id: "6s", red: false },
          { id: "6s", red: false },
        ],
        currentDraw: {
          tile: { id: "7s", red: false },
          eventRef: "event:draw",
        },
      },
      modelCandidates: [malformedAnkan],
      actual: { actions: malformedAnkan.actions },
    })).toEqual({
      status: "incomplete",
      diagnostics: ["structurally_invalid_action:ankan_tile_id_mismatch"],
    });
  });

  it("maps a malformed actual action after valid model rows", () => {
    expect(importStructuredMortalComparison({
      comparisonSetId: "comparison:malformed-actual",
      decisionLayerRef: "decision-layer:malformed-actual",
      facts,
      modelCandidates: [modelSixSou],
      actual: {
        actions: [{
          eventRef: "actual:ankan",
          action: {
            type: "ankan",
            actor: 3,
            consumed: ["6s", "6s", "6s", "7s"],
          },
        }],
      },
    })).toEqual({
      status: "incomplete",
      diagnostics: ["structurally_invalid_action:ankan_tile_id_mismatch"],
    });
  });

  it("returns a StructuredComparisonSet and action-bound score mapping", () => {
    const result = importStructuredMortalComparison({
      comparisonSetId: "comparison:e1:t6:structured",
      decisionLayerRef: "decision-layer:e1:t6",
      facts,
      modelCandidates: [modelSixSou, modelTwoPin],
      actual: actualTwoPin,
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.comparisonSet.origin).toBe("automatic_review");
      expect(result.comparisonSet.candidates).toHaveLength(2);
      const actual = result.comparisonSet.candidates.find(
        (candidate) => candidate.origins.includes("actual"),
      );
      expect(actual?.origins).toEqual(["model", "actual"]);
      expect(result.scores).toHaveLength(2);
      expect(result.scores.map((score) => score.actionRef)).toEqual(
        result.comparisonSet.candidates.map(
          (candidate) => candidate.actionRef,
        ),
      );
      const sixSou = result.comparisonSet.candidates.find(
        (candidate) =>
          candidate.action.kind === "discard" &&
          candidate.action.tile.id === "6s",
      );
      const twoPin = result.comparisonSet.candidates.find(
        (candidate) =>
          candidate.action.kind === "discard" &&
          candidate.action.tile.id === "2p",
      );
      expect(
        result.scores.find(
          (score) => score.actionRef === sixSou?.actionRef,
        ),
      ).toEqual({
        actionRef: sixSou?.actionRef,
        probability: 0.8,
        qValue: 1.2,
      });
      expect(
        result.scores.find(
          (score) => score.actionRef === twoPin?.actionRef,
        ),
      ).toEqual({
        actionRef: twoPin?.actionRef,
        probability: 0.2,
        qValue: 0.1,
      });
      expect(result.scores.map((score) => score.probability).sort())
        .toEqual([0.2, 0.8]);
    }
  });

  it("fails closed when the actual action was not model-scored", () => {
    expect(importStructuredMortalComparison({
      comparisonSetId: "comparison:missing-actual",
      decisionLayerRef: "decision-layer:missing-actual",
      facts,
      modelCandidates: [modelSixSou],
      actual: actualTwoPin,
    })).toEqual({
      status: "incomplete",
      diagnostics: ["actual_action_not_scored"],
    });
  });

  it("preserves isolated reach as a source diagnostic", () => {
    expect(importStructuredMortalComparison({
      comparisonSetId: "comparison:isolated-reach",
      decisionLayerRef: "decision-layer:isolated-reach",
      facts,
      modelCandidates: [{
        actions: [{
          eventRef: "model:reach",
          action: { type: "reach", actor: 3 },
        }],
        probability: 0.5,
      }, modelTwoPin],
      actual: actualTwoPin,
    })).toEqual({
      status: "incomplete",
      diagnostics: ["reach_without_dahai:tile,discardMode"],
    });
  });

  it("rejects duplicate model rows for one canonical action", () => {
    expect(importStructuredMortalComparison({
      comparisonSetId: "comparison:duplicate-score",
      decisionLayerRef: "decision-layer:duplicate-score",
      facts,
      modelCandidates: [modelTwoPin, {
        ...modelTwoPin,
        probability: 0.1,
      }],
      actual: actualTwoPin,
    })).toEqual({
      status: "incomplete",
      diagnostics: ["duplicate_model_action"],
    });
  });

  it("rejects non-finite or out-of-range model score inputs", () => {
    expect(importStructuredMortalComparison({
      comparisonSetId: "comparison:bad-probability",
      decisionLayerRef: "decision-layer:bad-probability",
      facts,
      modelCandidates: [{
        ...modelSixSou,
        probability: 1.01,
      }, modelTwoPin],
      actual: actualTwoPin,
    })).toEqual({
      status: "incomplete",
      diagnostics: ["invalid_model_probability"],
    });
    expect(importStructuredMortalComparison({
      comparisonSetId: "comparison:bad-q",
      decisionLayerRef: "decision-layer:bad-q",
      facts,
      modelCandidates: [{
        ...modelSixSou,
        qValue: Number.NaN,
      }, modelTwoPin],
      actual: actualTwoPin,
    })).toEqual({
      status: "incomplete",
      diagnostics: ["invalid_model_q_value"],
    });
  });
});
