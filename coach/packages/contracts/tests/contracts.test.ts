import { describe, expect, it } from "vitest";
import {
  ActionIdSchema,
  DecisionExplanationSchema,
  FactorEvidenceSchema,
  SceneSnapshotSchema,
} from "../src/index.js";

describe("strict reasoning contracts", () => {
  it("accepts only declared provenance and keeps red-five actions distinct", () => {
    const factor = {
      factorId: "factor:e1:t6:defense:6s:actor2",
      axis: "defense",
      dimension: "genbutsu",
      subjectAction: "discard:6s:tsumogiri",
      comparisonAction: "discard:2p:tedashi",
      direction: "supports_subject",
      magnitude: { kind: "ordinal", value: "decisive" },
      statement: "6s is genbutsu against actor 2; 2p has no deterministic safety evidence",
      provenance: "deterministic",
      confidence: "certain",
      evidenceIds: ["event-48"],
      limitations: ["Safety applies to actor 2 only"],
    };

    expect(FactorEvidenceSchema.parse(factor)).toEqual(factor);
    expect(() => FactorEvidenceSchema.parse({ ...factor, provenance: "mortal_dealin_rate" }))
      .toThrow();
    expect(ActionIdSchema.parse("discard:5pr:tedashi")).not.toBe(
      ActionIdSchema.parse("discard:5p:tedashi"),
    );
  });

  it("requires modelReason to remain unknown", () => {
    const parsed = DecisionExplanationSchema.safeParse({
      decisionId: "e1-turn6",
      modelFact: {
        engine: "Mortal 4.1b",
        recommendedAction: "discard:6s:tsumogiri",
        recommendedScore: 99.2823,
        actualAction: "discard:2p:tedashi",
        actualScore: 0.0103,
        modelReason: "defense",
      },
      observedTradeoffs: {
        supportsModelAction: [],
        supportsActualAction: [],
        neutralFactors: [],
        unknownOrUnmeasured: [],
      },
      coverage: [],
      primaryAxes: [],
      coachJudgement: null,
      deterministicExplanation: "",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects provenance and confidence combinations that overstate evidence", () => {
    const base = {
      factorId: "factor:test",
      axis: "defense",
      dimension: "heuristic_risk",
      subjectAction: "discard:6s:tsumogiri",
      comparisonAction: "discard:2p:tedashi",
      direction: "supports_subject",
      magnitude: { kind: "ordinal", value: "small" },
      statement: "A heuristic risk tier differs",
      provenance: "derived_heuristic",
      confidence: "medium",
      evidenceIds: ["scene:test"],
      limitations: ["This is not a calibrated deal-in probability"],
    };

    expect(() => FactorEvidenceSchema.parse({ ...base, confidence: "certain" })).toThrow();
    expect(() => FactorEvidenceSchema.parse({
      ...base,
      provenance: "unknown",
      magnitude: { kind: "ordinal", value: "decisive" },
    })).toThrow();
    expect(() => FactorEvidenceSchema.parse({
      ...base,
      provenance: "derived_heuristic",
      magnitude: { kind: "probability", value: 0.12 },
    })).toThrow();
    expect(() => FactorEvidenceSchema.parse({
      ...base,
      provenance: "calibrated_statistic",
      magnitude: { kind: "probability", value: 0.12 },
    })).toThrow();
    expect(FactorEvidenceSchema.parse({
      ...base,
      provenance: "calibrated_statistic",
      magnitude: { kind: "probability", value: 0.12 },
      calibration: {
        dataset: "tenhou-houou-2025",
        modelVersion: "risk-1.0.0",
        population: "four-player red-five hanchan",
        metric: "deal-in probability conditioned on declared riichi",
      },
    }).calibration?.modelVersion).toBe("risk-1.0.0");
  });

  it("does not allow opponent concealed hands in a scene snapshot", () => {
    const keys = Object.keys(SceneSnapshotSchema.shape);
    expect(keys).not.toContain("opponentHands");
    expect(keys).not.toContain("allHands");

    const sceneWithHiddenInformation = {
      decisionEventId: "event-1",
      selfActor: 3,
      bakaze: "E",
      kyoku: 1,
      honba: 0,
      kyotaku: 0,
      oya: 0,
      scores: [25000, 25000, 25000, 25000],
      doraMarkers: [{ id: "2s", red: false }],
      selfHand: [],
      currentDraw: null,
      rivers: [[], [], [], []],
      threats: [0, 1, 2, 3].map((actor) => ({
        actor,
        riichi: false,
        declarationEventId: null,
        ippatsuAlive: false,
      })),
      eventIds: ["event-1"],
      complete: true,
      missingData: [],
      opponentHands: [[], [], []],
    };
    expect(SceneSnapshotSchema.safeParse(sceneWithHiddenInformation).success).toBe(false);
  });
});
