import { describe, expect, it } from "vitest";
import {
  CandidateFactorLedgerSchema,
  canonicalActionRef,
  type ActionRef,
  type CandidateFactorLedger,
  type EngineIdentity,
  type FactorFact,
} from "@riichi-coach/contracts";
import { buildFactorDifferences } from "../src/factors/difference-builder.js";

const identity: EngineIdentity = {
  engine: "mahjong-helper",
  upstreamCommit: "514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0",
  adapterVersion: "0.1.0",
  protocolVersion: "mahjong-facts/v1",
};

const twoPin = canonicalActionRef({
  kind: "discard",
  tile: { id: "2p", red: false },
  discardMode: "tedashi",
});
const sixSou = canonicalActionRef({
  kind: "discard",
  tile: { id: "6s", red: false },
  discardMode: "tsumogiri",
});

function engineNumber(
  key: string,
  dimension: string,
  value: number,
  unit: string,
): FactorFact {
  return {
    factorKey: key,
    dimension,
    status: "calculated",
    evidenceClass: "deterministic_allowlisted",
    preferenceEligibility: "deterministic",
    engineIdentity: identity,
    value: { kind: "number", value, unit },
    evidenceIds: ["request:hand13"],
    limitations: [],
  };
}

function ukeire(entries: Array<{ tile34: number; count: number }>): FactorFact {
  return {
    factorKey: "efficiency.ukeire_remaining",
    dimension: "ukeire_remaining",
    status: "calculated",
    evidenceClass: "deterministic_under_assumptions",
    preferenceEligibility: "deterministic",
    engineIdentity: identity,
    value: { kind: "tile_counts", value: entries },
    evidenceIds: ["request:hand13"],
    limitations: ["Complete public visibility"],
  };
}

function helperRisk(value: number): FactorFact {
  return {
    factorKey: "defense.helper_risk.actor2",
    dimension: "helper_risk_scale:actor2",
    status: "calculated",
    evidenceClass: "versioned_upstream_estimate",
    preferenceEligibility: "heuristic_only",
    engineIdentity: identity,
    value: { kind: "number", value, unit: "helper_risk_scale" },
    evidenceIds: ["request:risk:2"],
    limitations: ["Not a calibrated Mortal deal-in probability"],
  };
}

function helperYaku(values: number[]): FactorFact {
  return {
    factorKey: "value.yaku_types",
    dimension: "yaku_types",
    status: "calculated",
    evidenceClass: "versioned_upstream_estimate",
    preferenceEligibility: "heuristic_only",
    engineIdentity: identity,
    value: { kind: "integer_ids", values },
    evidenceIds: ["request:hand13"],
    limitations: ["Pinned yaku IDs"],
  };
}

function helperClassification(value: string): FactorFact {
  return {
    factorKey: "defense.helper_classification.actor2",
    dimension: "helper_classification:actor2",
    status: "calculated",
    evidenceClass: "versioned_upstream_estimate",
    preferenceEligibility: "heuristic_only",
    engineIdentity: identity,
    value: { kind: "classification", value },
    evidenceIds: ["request:risk:2"],
    limitations: ["Pinned structural classification"],
  };
}

function ledger(
  actionRef: ActionRef,
  efficiencyFacts: FactorFact[],
  defenseFacts: FactorFact[] = [],
): CandidateFactorLedger {
  return CandidateFactorLedgerSchema.parse({
    actionRef,
    projectedStateRef: `state:${actionRef}`,
    axes: [
      {
        axis: "efficiency",
        status: efficiencyFacts.length > 0 ? "calculated" : "unsupported_dimension",
        facts: efficiencyFacts,
      },
      {
        axis: "defense",
        status: defenseFacts.length > 0 ? "calculated" : "unsupported_dimension",
        facts: defenseFacts,
      },
    ],
    diagnostics: [],
  });
}

describe("factor difference builder", () => {
  it("compares equal-shanten ukeire while preserving tile counts", () => {
    const result = buildFactorDifferences([
      ledger(twoPin, [
        engineNumber("efficiency.shanten", "shanten", 1, "shanten"),
        ukeire([{ tile34: 3, count: 3 }, { tile34: 6, count: 4 }]),
      ]),
      ledger(sixSou, [
        engineNumber("efficiency.shanten", "shanten", 1, "shanten"),
        ukeire([{ tile34: 3, count: 3 }]),
      ]),
    ]);

    expect(result.deterministic.find((entry) => entry.dimension === "shanten"))
      .toMatchObject({ direction: "neutral" });
    const ukeireDifference = result.deterministic.find(
      (entry) => entry.dimension === "ukeire_remaining",
    );
    expect(ukeireDifference).toMatchObject({ direction: "supports_left" });
    expect(ukeireDifference?.leftValue.kind).toBe("tile_counts");
  });

  it("does not compare ukeire when shanten differs", () => {
    const result = buildFactorDifferences([
      ledger(twoPin, [
        engineNumber("efficiency.shanten", "shanten", 1, "shanten"),
        ukeire([{ tile34: 3, count: 1 }]),
      ]),
      ledger(sixSou, [
        engineNumber("efficiency.shanten", "shanten", 2, "shanten"),
        ukeire([{ tile34: 3, count: 4 }]),
      ]),
    ]);

    expect(result.deterministic.find((entry) => entry.dimension === "shanten"))
      .toMatchObject({ direction: "supports_left" });
    expect(result.deterministic.some(
      (entry) => entry.dimension === "ukeire_remaining",
    )).toBe(false);
  });

  it("stores helper risk only as a heuristic difference", () => {
    const result = buildFactorDifferences([
      ledger(twoPin, [], [helperRisk(2)]),
      ledger(sixSou, [], [helperRisk(8)]),
    ]);

    expect(result.heuristic.some(
      (entry) => entry.dimension === "helper_risk_scale:actor2",
    )).toBe(true);
    expect(result.deterministic.some(
      (entry) => entry.dimension === "helper_risk_scale:actor2",
    )).toBe(false);
  });

  it("refuses to compare facts from different engine versions", () => {
    const changedIdentity = { ...identity, adapterVersion: "0.2.0" };
    const changed = {
      ...helperRisk(8),
      engineIdentity: changedIdentity,
    } as unknown as FactorFact;
    expect(() => ledger(sixSou, [], [changed])).toThrow();
  });

  it("preserves non-preferential heuristic set and class differences", () => {
    const yaku = buildFactorDifferences([
      ledger(twoPin, [], [helperYaku([1, 3])]),
      ledger(sixSou, [], [helperYaku([2])]),
    ]).heuristic[0];
    expect(yaku).toMatchObject({
      dimension: "yaku_types",
      direction: "neutral",
      valueRelation: "different",
    });

    const classification = buildFactorDifferences([
      ledger(twoPin, [], [helperClassification("suji")]),
      ledger(sixSou, [], [helperClassification("no_suji")]),
    ]).heuristic[0];
    expect(classification).toMatchObject({
      dimension: "helper_classification:actor2",
      direction: "neutral",
      valueRelation: "different",
    });
    expect(buildFactorDifferences([
      ledger(twoPin, [], [helperClassification("suji")]),
      ledger(sixSou, [], [helperClassification("no_suji")]),
    ]).deterministic).toEqual([]);
  });
});
