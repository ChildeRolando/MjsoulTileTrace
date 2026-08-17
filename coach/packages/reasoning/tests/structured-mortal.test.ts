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

  it("imports an isolated reach as the tile-less declare_riichi candidate in a dama window", () => {
    const result = importStructuredMortalComparison({
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
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.comparisonSet.candidates).toHaveLength(2);
    const declareRiichi = result.comparisonSet.candidates.find(
      (candidate) => candidate.action.kind === "declare_riichi",
    );
    expect(declareRiichi).toBeDefined();
    expect(declareRiichi!.action).toEqual({ kind: "declare_riichi" });
    expect(declareRiichi!.origins).toEqual(["model"]);
    // Test A (handoff §7): no riichi was declared, so no riichi_discard
    // candidate and no correspondence may exist anywhere — the actual stays
    // the exact ordinary discard with no inferred riichi tile.
    expect(result.comparisonSet.candidates.some(
      (candidate) => candidate.action.kind === "riichi_discard",
    )).toBe(false);
    expect(result.comparisonSet.correspondences ?? []).toEqual([]);
    const actual = result.comparisonSet.candidates.find(
      (candidate) => candidate.origins.includes("actual"),
    );
    expect(actual?.action).toMatchObject({ kind: "discard", tile: { id: "2p" } });
    expect(
      result.scores.find(
        (score) => score.actionRef === declareRiichi!.actionRef,
      ),
    ).toEqual({
      actionRef: declareRiichi!.actionRef,
      probability: 0.5,
    });
  });

  it("keeps the declare_riichi model row and the riichi_discard actual as separate exact identities", () => {
    const result = importStructuredMortalComparison({
      comparisonSetId: "comparison:riichi-window",
      decisionLayerRef: "decision-layer:riichi-window",
      facts,
      modelCandidates: [{
        actions: [{
          eventRef: "model:reach",
          action: { type: "reach", actor: 3 },
        }],
        probability: 0.6,
        qValue: 0.9,
      }, modelTwoPin],
      actual: {
        actions: [
          {
            eventRef: "actual:reach",
            action: { type: "reach", actor: 3 },
          },
          {
            eventRef: "actual:riichi-dahai",
            action: {
              type: "dahai",
              actor: 3,
              pai: "2p",
              tsumogiri: false,
            },
          },
        ],
      },
    });

    // Test B (handoff §7): both exact action identities survive — the
    // tile-less declare_riichi stays model-only, the concrete riichi_discard
    // stays actual-only, and their relation is an explicit typed
    // correspondence rather than an actionRef rewrite.
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.comparisonSet.candidates).toHaveLength(3);
    const declareRiichi = result.comparisonSet.candidates.find(
      (candidate) => candidate.action.kind === "declare_riichi",
    );
    expect(declareRiichi).toBeDefined();
    expect(declareRiichi!.action).toEqual({ kind: "declare_riichi" });
    expect(declareRiichi!.origins).toEqual(["model"]);
    const actualCandidates = result.comparisonSet.candidates.filter(
      (candidate) => candidate.origins.includes("actual"),
    );
    expect(actualCandidates).toHaveLength(1);
    expect(actualCandidates[0]!.action).toEqual({
      kind: "riichi_discard",
      tile: { id: "2p", red: false },
      discardMode: "tedashi",
    });
    expect(actualCandidates[0]!.origins).toEqual(["actual"]);
    expect(actualCandidates[0]!.actionRef).not.toBe(
      declareRiichi!.actionRef,
    );
    expect(result.comparisonSet.correspondences).toEqual([{
      actualActionRef: actualCandidates[0]!.actionRef,
      scoredModelActionRef: declareRiichi!.actionRef,
      relation: "realizes",
    }]);
    // The Mortal probability/q-value stays attached to declare_riichi; the
    // actual tile never becomes model-supplied data.
    expect(
      result.scores.find(
        (score) => score.actionRef === declareRiichi!.actionRef,
      ),
    ).toEqual({
      actionRef: declareRiichi!.actionRef,
      probability: 0.6,
      qValue: 0.9,
    });
    expect(result.scores.some(
      (score) => score.actionRef === actualCandidates[0]!.actionRef,
    )).toBe(false);
  });

  it("never leaks the actual riichi tile into the model representation", () => {
    // Test C (handoff §7): the same model reach row meets two different
    // riichi actuals — the declare_riichi actionRef, score identity, and
    // tile-less shape must stay identical while only the actual refs differ.
    const modelReach = [{
      actions: [{
        eventRef: "model:reach",
        action: { type: "reach", actor: 3 },
      }],
      probability: 0.6,
      qValue: 0.9,
    }, modelTwoPin];
    // A hand holding every tile either actual may discard tedashi.
    const antiLeakFacts = {
      decisionWindow: {
        kind: "self_turn" as const,
        actor: 3,
        triggerEventRef: "event:draw",
      },
      concealedTiles: [
        { id: "3m" as const, red: false },
        { id: "7s" as const, red: false },
        { id: "2p" as const, red: false },
      ],
      currentDraw: {
        tile: { id: "6s" as const, red: false },
        eventRef: "event:draw",
      },
    };
    const importFor = (pai: string) => importStructuredMortalComparison({
      comparisonSetId: `comparison:anti-leak:${pai}`,
      decisionLayerRef: `decision-layer:anti-leak:${pai}`,
      facts: antiLeakFacts,
      modelCandidates: modelReach,
      actual: {
        actions: [
          {
            eventRef: "actual:reach",
            action: { type: "reach", actor: 3 },
          },
          {
            eventRef: "actual:riichi-dahai",
            action: {
              type: "dahai",
              actor: 3,
              pai,
              tsumogiri: false,
            },
          },
        ],
      },
    });

    const threeMan = importFor("3m");
    const sevenSou = importFor("7s");
    expect(threeMan.status).toBe("ready");
    expect(sevenSou.status).toBe("ready");
    if (threeMan.status !== "ready" || sevenSou.status !== "ready") return;

    const declareOf = (result: typeof threeMan) =>
      result.comparisonSet.candidates.find(
        (candidate) => candidate.action.kind === "declare_riichi",
      )!;
    const actualOf = (result: typeof threeMan) =>
      result.comparisonSet.candidates.find(
        (candidate) => candidate.origins.includes("actual"),
      )!;

    expect(declareOf(threeMan).actionRef).toBe(declareOf(sevenSou).actionRef);
    expect(declareOf(threeMan).action).toEqual({ kind: "declare_riichi" });
    expect(declareOf(sevenSou).action).toEqual({ kind: "declare_riichi" });
    expect(
      JSON.stringify(threeMan.scores.find(
        (score) => score.actionRef === declareOf(threeMan).actionRef,
      )),
    ).toBe(
      JSON.stringify(sevenSou.scores.find(
        (score) => score.actionRef === declareOf(sevenSou).actionRef,
      )),
    );
    expect(actualOf(threeMan).actionRef).not.toBe(
      actualOf(sevenSou).actionRef,
    );
    expect(actualOf(threeMan).action).toMatchObject({ tile: { id: "3m" } });
    expect(actualOf(sevenSou).action).toMatchObject({ tile: { id: "7s" } });
  });

  it("fails closed when a riichi actual has no declare_riichi model row", () => {
    expect(importStructuredMortalComparison({
      comparisonSetId: "comparison:unscored-riichi-actual",
      decisionLayerRef: "decision-layer:unscored-riichi-actual",
      facts,
      modelCandidates: [modelSixSou],
      actual: {
        actions: [
          {
            eventRef: "actual:reach",
            action: { type: "reach", actor: 3 },
          },
          {
            eventRef: "actual:riichi-dahai",
            action: {
              type: "dahai",
              actor: 3,
              pai: "2p",
              tsumogiri: false,
            },
          },
        ],
      },
    })).toEqual({
      status: "incomplete",
      diagnostics: ["actual_action_not_scored"],
    });
  });

  // M6-A3 completion: ekyu's reviewer serializes the pon-extension kan
  // alternative as an ankan of all four tiles while the actual carries the
  // kakan shape (observed on real reports 2026-08-17 — the model scored the
  // kan at p=0.25 yet every kakan actual row died as not scored).
  const kakanFacts = {
    decisionWindow: {
      kind: "self_turn" as const,
      actor: 3,
      triggerEventRef: "event:draw",
    },
    concealedTiles: [
      { id: "5z" as const, red: false },
      { id: "5z" as const, red: false },
      { id: "5z" as const, red: false },
      { id: "5z" as const, red: false },
    ],
    currentDraw: {
      tile: { id: "7z" as const, red: false },
      eventRef: "event:draw",
    },
    melds: [{
      meldRef: "meld:pon-c-0",
      kind: "pon" as const,
      tiles: [
        { id: "7z" as const, red: false },
        { id: "7z" as const, red: false },
        { id: "7z" as const, red: false },
      ],
    }],
  };
  const modelKanGreenDragon = {
    actions: [{
      eventRef: "model:ankan",
      action: {
        type: "ankan",
        actor: 3,
        consumed: ["C", "C", "C", "C"],
      },
    }],
    probability: 0.25,
    qValue: -0.1,
  };
  const modelWhiteDahai = {
    actions: [{
      eventRef: "model:dahai",
      action: {
        type: "dahai",
        actor: 3,
        pai: "P",
        tsumogiri: false,
      },
    }],
    probability: 0.72,
    qValue: 0.01,
  };
  const actualKakanGreenDragon = {
    actions: [{
      eventRef: "actual:kakan",
      action: {
        type: "kakan",
        actor: 3,
        pai: "C",
        consumed: ["C", "C", "C"],
        existingMeldRef: "meld:pon-c-0",
      },
    }],
  };

  it("binds a kakan actual to the ankan-shaped scored kan alternative via a realizes correspondence", () => {
    const result = importStructuredMortalComparison({
      comparisonSetId: "comparison:kakan-window",
      decisionLayerRef: "decision-layer:kakan-window",
      facts: kakanFacts,
      modelCandidates: [modelKanGreenDragon, modelWhiteDahai],
      actual: actualKakanGreenDragon,
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.comparisonSet.candidates).toHaveLength(3);
    const kanRow = result.comparisonSet.candidates.find(
      (candidate) => candidate.action.kind === "ankan",
    );
    expect(kanRow).toBeDefined();
    expect(kanRow!.origins).toEqual(["model"]);
    const actualCandidate = result.comparisonSet.candidates.find(
      (candidate) => candidate.origins.includes("actual"),
    );
    expect(actualCandidate).toBeDefined();
    expect(actualCandidate!.action).toEqual({
      kind: "kakan",
      addedTile: { id: "7z", red: false },
      existingMeldRef: "meld:pon-c-0",
    });
    expect(actualCandidate!.origins).toEqual(["actual"]);
    expect(actualCandidate!.actionRef).not.toBe(kanRow!.actionRef);
    expect(result.comparisonSet.correspondences).toEqual([{
      actualActionRef: actualCandidate!.actionRef,
      scoredModelActionRef: kanRow!.actionRef,
      relation: "realizes",
    }]);
    // The Mortal probability/q-value stays attached to the ankan row; the
    // kakan actual carries no model-supplied score of its own.
    expect(
      result.scores.find((score) => score.actionRef === kanRow!.actionRef),
    ).toEqual({
      actionRef: kanRow!.actionRef,
      probability: 0.25,
      qValue: -0.1,
    });
    expect(result.scores.some(
      (score) => score.actionRef === actualCandidate!.actionRef,
    )).toBe(false);
  });

  it("fails closed when a kakan actual has no kan of that tile scored", () => {
    expect(importStructuredMortalComparison({
      comparisonSetId: "comparison:unscored-kakan-actual",
      decisionLayerRef: "decision-layer:unscored-kakan-actual",
      facts: kakanFacts,
      modelCandidates: [modelWhiteDahai],
      actual: actualKakanGreenDragon,
    })).toEqual({
      status: "incomplete",
      diagnostics: ["actual_action_not_scored"],
    });
  });

  it("fails closed when the only scored kan is of a different tile than the kakan actual", () => {
    expect(importStructuredMortalComparison({
      comparisonSetId: "comparison:wrong-tile-kakan-actual",
      decisionLayerRef: "decision-layer:wrong-tile-kakan-actual",
      facts: kakanFacts,
      modelCandidates: [{
        actions: [{
          eventRef: "model:ankan",
          action: {
            type: "ankan",
            actor: 3,
            consumed: ["P", "P", "P", "P"],
          },
        }],
        probability: 0.25,
      }, modelWhiteDahai],
      actual: actualKakanGreenDragon,
    })).toEqual({
      status: "incomplete",
      diagnostics: ["actual_action_not_scored"],
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
