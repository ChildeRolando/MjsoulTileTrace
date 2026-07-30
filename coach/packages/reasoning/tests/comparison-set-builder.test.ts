import { describe, expect, it } from "vitest";
import {
  buildStructuredComparisonSet,
} from "../src/candidate/comparison-set-builder.js";
import {
  normalizeCandidate,
} from "../src/candidate/candidate-normalizer.js";
import type {
  CandidateNormalizationResult,
  DecisionWindow,
} from "@riichi-coach/contracts";

const selfTurn = {
  kind: "self_turn" as const,
  actor: 0,
  triggerEventRef: "event:draw",
};

function discard(
  id: "2p" | "6s",
  origin: "model" | "actual" | "user",
) {
  const result = normalizeCandidate({
    draft: {
      kind: "discard",
      tile: { id, red: false },
      discardMode: "tedashi",
    },
    origin,
    facts: {
      decisionWindow: selfTurn,
      concealedTiles: [
        { id: "2p", red: false },
        { id: "6s", red: false },
      ],
      currentDraw: null,
    },
  });
  if (result.status !== "ready") {
    throw new Error(`fixture did not normalize: ${result.status}`);
  }
  return { result, decisionWindow: selfTurn };
}

describe("structured comparison set builder", () => {
  it("merges model, actual, and user origins for one canonical action", () => {
    const built = buildStructuredComparisonSet({
      comparisonSetId: "comparison:merged",
      origin: "automatic_review",
      decisionLayerRef: "decision-layer:self-turn",
      candidates: [
        discard("2p", "model"),
        discard("2p", "actual"),
        discard("2p", "user"),
        discard("6s", "model"),
      ],
    });

    expect(built.status).toBe("ready");
    if (built.status === "ready") {
      expect(built.comparisonSet.candidates).toHaveLength(2);
      expect(
        built.comparisonSet.candidates.find(
          (candidate) =>
            candidate.action.kind === "discard" &&
            candidate.action.tile.id === "2p",
        )?.origins,
      ).toEqual(["model", "actual", "user"]);
    }
  });

  it("preserves first-seen action order while merging origins", () => {
    const built = buildStructuredComparisonSet({
      comparisonSetId: "comparison:stable-order",
      origin: "user_comparison",
      decisionLayerRef: "decision-layer:self-turn",
      candidates: [
        discard("6s", "user"),
        discard("2p", "model"),
        discard("6s", "actual"),
      ],
    });

    expect(built.status).toBe("ready");
    if (built.status === "ready") {
      expect(
        built.comparisonSet.candidates.map((candidate) => candidate.actionRef),
      ).toEqual([
        discard("6s", "user").result.candidate.actionRef,
        discard("2p", "model").result.candidate.actionRef,
      ]);
      expect(built.comparisonSet.candidates[0]?.origins).toEqual([
        "actual",
        "user",
      ]);
    }
  });

  it("returns not_comparable after identical actions merge to one", () => {
    const built = buildStructuredComparisonSet({
      comparisonSetId: "comparison:singleton-after-merge",
      origin: "user_comparison",
      decisionLayerRef: "decision-layer:self-turn",
      candidates: [
        discard("2p", "model"),
        discard("2p", "user"),
      ],
    });

    expect(built).toMatchObject({
      status: "not_comparable",
      code: "fewer_than_two_distinct_actions",
      windowKinds: ["self_turn"],
    });
  });

  it("uses the complete decision-window identity, not only its kind", () => {
    const differentDraw = {
      ...selfTurn,
      triggerEventRef: "event:other-draw",
    };

    expect(buildStructuredComparisonSet({
      comparisonSetId: "comparison:same-kind-cross-window",
      origin: "user_comparison",
      decisionLayerRef: "decision-layer:self-turn",
      candidates: [
        discard("2p", "user"),
        {
          ...discard("6s", "model"),
          decisionWindow: differentDraw,
        },
      ],
    })).toMatchObject({
      status: "not_comparable",
      code: "cross_decision_window",
      windowKinds: ["self_turn"],
    });
  });

  it("keeps whether-to-pon separate from the post-pon discard", () => {
    const responseWindow = {
      kind: "discard_response" as const,
      actor: 0,
      triggerEventRef: "event:discard",
      sourceActor: 1,
      offeredTile: { id: "5p" as const, red: false },
    };
    const postCallWindow = {
      kind: "post_call_discard" as const,
      actor: 0,
      triggerEventRef: "event:pon",
    };
    const pon = normalizeCandidate({
      draft: {
        kind: "pon",
        consumedTiles: [
          { id: "5p", red: false },
          { id: "5p", red: true },
        ],
      },
      origin: "user",
      facts: {
        decisionWindow: responseWindow,
        concealedTiles: [
          { id: "5p", red: false },
          { id: "5p", red: true },
        ],
      },
    });
    const afterPonDiscard = normalizeCandidate({
      draft: {
        kind: "discard",
        tile: { id: "2p", red: false },
        discardMode: "tedashi",
      },
      origin: "user",
      facts: {
        decisionWindow: postCallWindow,
        concealedTiles: [{ id: "2p", red: false }],
        currentDraw: null,
      },
    });
    if (pon.status !== "ready" || afterPonDiscard.status !== "ready") {
      throw new Error("comparison fixtures did not normalize");
    }

    expect(buildStructuredComparisonSet({
      comparisonSetId: "comparison:cross-layer",
      origin: "user_comparison",
      decisionLayerRef: "decision-layer:cross-layer",
      candidates: [
        { result: pon, decisionWindow: responseWindow },
        { result: afterPonDiscard, decisionWindow: postCallWindow },
      ],
    })).toMatchObject({
      status: "not_comparable",
      code: "cross_decision_window",
      windowKinds: ["discard_response", "post_call_discard"],
    });
  });

  it("rejects candidates that are not ready", () => {
    const notReady: CandidateNormalizationResult = {
      status: "needs_clarification",
      ambiguousFields: ["tile.red"],
    };

    expect(() => buildStructuredComparisonSet({
      comparisonSetId: "comparison:not-ready",
      origin: "user_comparison",
      decisionLayerRef: "decision-layer:self-turn",
      candidates: [
        discard("2p", "user"),
        {
          result: notReady,
          decisionWindow: selfTurn as DecisionWindow,
        },
      ],
    })).toThrow(
      "Only ready candidates can enter comparison building: needs_clarification",
    );
  });
});
