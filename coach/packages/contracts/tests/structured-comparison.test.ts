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

  it("keeps the riichi actual separate and binds it by explicit correspondence", () => {
    // M6-A3 completion (ADR-0001): the model's declare_riichi stays tile-less
    // and model-only; the concrete riichi_discard actual keeps its own exact
    // identity. The semantic relation survives as a typed correspondence —
    // never as a rewrite of the model row and never via actionRef equality.
    const declareRiichi: RiichiAction = { kind: "declare_riichi" };
    const riichiDiscard: RiichiAction = {
      kind: "riichi_discard",
      tile: { id: "3m", red: false },
      discardMode: "tedashi",
    };
    const riichiWindow = {
      comparisonSetId: "comparison:riichi-window",
      origin: "automatic_review",
      decisionLayerRef: "decision-layer:riichi-window",
      decisionWindow: {
        kind: "self_turn",
        actor: 3,
        triggerEventRef: "event-50",
      },
      candidates: [
        {
          actionRef: canonicalActionRef(declareRiichi),
          action: declareRiichi,
          origins: ["model"],
        },
        {
          actionRef: canonicalActionRef(modelAction),
          action: modelAction,
          origins: ["model"],
        },
        {
          actionRef: canonicalActionRef(riichiDiscard),
          action: riichiDiscard,
          origins: ["actual"],
        },
      ],
      correspondences: [{
        actualActionRef: canonicalActionRef(riichiDiscard),
        scoredModelActionRef: canonicalActionRef(declareRiichi),
        relation: "realizes",
      }],
    } as const;

    const parsed = StructuredComparisonSetSchema.parse(riichiWindow);
    expect(parsed.candidates.map((candidate) => candidate.origins)).toEqual([
      ["model"],
      ["model"],
      ["actual"],
    ]);
    expect(parsed.correspondences).toEqual([{
      actualActionRef: canonicalActionRef(riichiDiscard),
      scoredModelActionRef: canonicalActionRef(declareRiichi),
      relation: "realizes",
    }]);

    // Without the correspondence the actual-only candidate is illegal.
    const { correspondences: _omitted, ...withoutCorrespondence } =
      riichiWindow;
    expect(() => StructuredComparisonSetSchema.parse(withoutCorrespondence))
      .toThrow(/must come from the model/);
  });

  it("rejects malformed riichi correspondences", () => {
    const declareRiichi: RiichiAction = { kind: "declare_riichi" };
    const riichiDiscard: RiichiAction = {
      kind: "riichi_discard",
      tile: { id: "3m", red: false },
      discardMode: "tedashi",
    };
    const riichiWindow = {
      comparisonSetId: "comparison:riichi-correspondence",
      origin: "automatic_review",
      decisionLayerRef: "decision-layer:riichi-correspondence",
      decisionWindow: {
        kind: "self_turn",
        actor: 3,
        triggerEventRef: "event-50",
      },
      candidates: [
        {
          actionRef: canonicalActionRef(declareRiichi),
          action: declareRiichi,
          origins: ["model"],
        },
        {
          actionRef: canonicalActionRef(riichiDiscard),
          action: riichiDiscard,
          origins: ["actual"],
        },
      ],
      correspondences: [],
    } as const;

    // Empty correspondence list leaves the actual-only candidate unbound.
    expect(() => StructuredComparisonSetSchema.parse(riichiWindow)).toThrow(
      /must come from the model/,
    );

    // The correspondence must point at a scored model candidate.
    expect(() => StructuredComparisonSetSchema.parse({
      ...riichiWindow,
      correspondences: [{
        actualActionRef: canonicalActionRef(riichiDiscard),
        scoredModelActionRef: canonicalActionRef(modelAction),
        relation: "realizes",
      }],
    })).toThrow(/correspondence/);

    // A plain discard actual may not claim a declare_riichi correspondence.
    expect(() => StructuredComparisonSetSchema.parse({
      ...riichiWindow,
      candidates: [
        riichiWindow.candidates[0],
        {
          actionRef: canonicalActionRef(actualAction),
          action: actualAction,
          origins: ["actual"],
        },
      ],
      correspondences: [{
        actualActionRef: canonicalActionRef(actualAction),
        scoredModelActionRef: canonicalActionRef(declareRiichi),
        relation: "realizes",
      }],
    })).toThrow(/correspondence/);

    // An actual that is already exactly scored needs no correspondence.
    expect(() => StructuredComparisonSetSchema.parse({
      ...riichiWindow,
      candidates: [
        riichiWindow.candidates[0],
        {
          actionRef: canonicalActionRef(riichiDiscard),
          action: riichiDiscard,
          origins: ["model", "actual"],
        },
      ],
      correspondences: [{
        actualActionRef: canonicalActionRef(riichiDiscard),
        scoredModelActionRef: canonicalActionRef(declareRiichi),
        relation: "realizes",
      }],
    })).toThrow(/correspondence/);
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
