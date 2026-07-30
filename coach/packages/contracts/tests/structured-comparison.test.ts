import { describe, expect, it } from "vitest";
import {
  StructuredComparisonSetSchema,
  canonicalActionRef,
  toComparisonSet,
  type RiichiAction,
} from "../src/index.js";

const modelAction: RiichiAction = {
  kind: "discard",
  tile: { id: "6s", red: false },
  discardMode: "tsumogiri",
};
const actualAction: RiichiAction = {
  kind: "discard",
  tile: { id: "2p", red: false },
  discardMode: "tedashi",
};

const validAutomaticSet = {
  comparisonSetId: "comparison:e1:t6:structured",
  origin: "automatic_review",
  decisionLayerRef: "decision-layer:e1:t6",
  decisionWindow: {
    kind: "self_turn",
    actor: 3,
    triggerEventRef: "event-50",
  },
  candidates: [
    {
      actionRef: canonicalActionRef(modelAction),
      action: modelAction,
      origins: ["model"],
    },
    {
      actionRef: canonicalActionRef(actualAction),
      action: actualAction,
      origins: ["model", "actual"],
    },
  ],
} as const;

describe("structured comparison sets", () => {
  it("accepts an action-bound automatic comparison and projects it explicitly", () => {
    const structured = StructuredComparisonSetSchema.parse(validAutomaticSet);
    const legacyView = toComparisonSet(structured);

    expect(legacyView).toEqual({
      comparisonSetId: validAutomaticSet.comparisonSetId,
      origin: "automatic_review",
      decisionLayerRef: validAutomaticSet.decisionLayerRef,
      candidates: structured.candidates.map(({ actionRef, origins }) => ({
        actionRef,
        origins,
      })),
    });
    expect(Object.keys(legacyView)).not.toContain("decisionWindow");
    expect(Object.keys(legacyView.candidates[0]!)).not.toContain("action");
  });

  it("recomputes ActionRef and rejects a forged action/ref binding", () => {
    expect(() => StructuredComparisonSetSchema.parse({
      ...validAutomaticSet,
      candidates: [
        {
          ...validAutomaticSet.candidates[0],
          actionRef: canonicalActionRef(actualAction),
        },
        validAutomaticSet.candidates[1],
      ],
    })).toThrow(/canonical codec/);
  });

  it("rejects duplicate actions and invalid automatic origins", () => {
    expect(() => StructuredComparisonSetSchema.parse({
      ...validAutomaticSet,
      candidates: [
        validAutomaticSet.candidates[0],
        {
          ...validAutomaticSet.candidates[0],
          origins: ["model", "actual"],
        },
      ],
    })).toThrow(/unique structured actions/);
    expect(() => StructuredComparisonSetSchema.parse({
      ...validAutomaticSet,
      candidates: [
        validAutomaticSet.candidates[0],
        {
          ...validAutomaticSet.candidates[1],
          origins: ["actual"],
        },
      ],
    })).toThrow(/must come from the model/);
  });

  it("rejects actions that do not belong to the frozen window", () => {
    const chi: RiichiAction = {
      kind: "chi",
      calledTile: { id: "2m", red: false },
      consumedTiles: [
        { id: "1m", red: false },
        { id: "3m", red: false },
      ],
      targetActor: 1,
      responseEventRef: "event:discard",
    };
    expect(() => StructuredComparisonSetSchema.parse({
      comparisonSetId: "comparison:wrong-window",
      origin: "user_comparison",
      decisionLayerRef: "decision-layer:wrong-window",
      decisionWindow: {
        kind: "post_call_discard",
        actor: 0,
        triggerEventRef: "event:chi",
      },
      candidates: [
        {
          actionRef: canonicalActionRef(chi),
          action: chi,
          origins: ["user"],
        },
        {
          actionRef: canonicalActionRef(actualAction),
          action: actualAction,
          origins: ["user"],
        },
      ],
    })).toThrow(/action_not_allowed_in_window/);
  });

  it("rejects response-event and kan-kind mismatches", () => {
    const wrongRon: RiichiAction = {
      kind: "ron",
      winningTile: { id: "5p", red: true },
      targetActor: 1,
      responseEventRef: "event:other",
      winContext: "ankan",
    };
    const pass: RiichiAction = {
      kind: "pass",
      responseEventRef: "event:kakan",
      responseKind: "kakan",
    };
    expect(() => StructuredComparisonSetSchema.parse({
      comparisonSetId: "comparison:kan-response",
      origin: "user_comparison",
      decisionLayerRef: "decision-layer:kan-response",
      decisionWindow: {
        kind: "kan_response",
        actor: 0,
        triggerEventRef: "event:kakan",
        sourceActor: 1,
        offeredTile: { id: "5p", red: true },
        kanKind: "kakan",
      },
      candidates: [
        {
          actionRef: canonicalActionRef(wrongRon),
          action: wrongRon,
          origins: ["user"],
        },
        {
          actionRef: canonicalActionRef(pass),
          action: pass,
          origins: ["user"],
        },
      ],
    })).toThrow(/response_event_mismatch|response_kind_mismatch/);
  });
});
