import { describe, expect, it } from "vitest";
import {
  CandidateFactorLedgerSchema,
  canonicalActionRef,
  type ActionRef,
  type CandidateFactorLedger,
  type EngineIdentity,
  type FactorFact,
  type FactorValue,
} from "@riichi-coach/contracts";
import { buildFactorDifferences } from "../src/factors/difference-builder.js";

const identity: EngineIdentity = {
  engine: "mahjong-helper",
  upstreamCommit: "514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0",
  adapterVersion: "0.2.0",
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

function shantenFact(value: number): FactorFact {
  return engineNumber("efficiency.shanten", "shanten", value, "shanten");
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

function helperRisk(
  value: number,
  dimension = "helper_risk_scale:actor2",
  unit = "helper_risk_scale",
): FactorFact {
  return {
    factorKey: "defense.helper_risk.actor2",
    dimension,
    status: "calculated",
    evidenceClass: "versioned_upstream_estimate",
    preferenceEligibility: "heuristic_only",
    engineIdentity: identity,
    value: { kind: "number", value, unit },
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

function genbutsu(
  actor: number,
  value: boolean,
  dimension = `genbutsu:actor${actor}`,
): FactorFact {
  return {
    factorKey: `defense.genbutsu.actor${actor}`,
    dimension,
    status: "calculated",
    evidenceClass: "deterministic_local_replay",
    preferenceEligibility: "deterministic",
    value: { kind: "boolean", value },
    evidenceIds: [`event:riichi:${actor}`],
    limitations: [],
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
        axis: "value",
        status: "unsupported_dimension",
        facts: [],
      },
      {
        axis: "defense",
        status: defenseFacts.length > 0 ? "calculated" : "unsupported_dimension",
        facts: defenseFacts,
      },
      {
        axis: "placement",
        status: "unsupported_dimension",
        facts: [],
      },
      {
        axis: "option_value",
        status: "unsupported_dimension",
        facts: [],
      },
    ],
    diagnostics: [],
  });
}

function localFact(
  key: string,
  dimension: string,
  value: FactorValue,
  preferenceEligibility: FactorFact["preferenceEligibility"] = "deterministic",
): FactorFact {
  return {
    factorKey: key,
    dimension,
    status: "calculated",
    evidenceClass: "deterministic_local_replay",
    preferenceEligibility,
    value,
    evidenceIds: ["state:canonical"],
    limitations: [],
  };
}

function ledgerWithAxis(
  actionRef: ActionRef,
  axis: "efficiency" | "value" | "defense",
  facts: FactorFact[],
  status: "calculated" | "blocked_missing_facts" = "calculated",
): CandidateFactorLedger {
  return CandidateFactorLedgerSchema.parse({
    actionRef,
    projectedStateRef: `state:${actionRef}`,
    axes: ["efficiency", "value", "defense", "placement", "option_value"].map(
      (entry) => entry === axis
        ? { axis: entry, status, facts }
        : { axis: entry, status: "unsupported_dimension", facts: [] },
    ),
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
    expect(result.deterministic.find(
      (entry) => entry.dimension === "ukeire_remaining",
    )).toMatchObject({
      preferenceEligibility: "ineligible",
      direction: "neutral",
      valueRelation: "different",
    });
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
    expect(result.heuristic[0]).toMatchObject({
      direction: "supports_left",
      preferenceEligibility: "heuristic_only",
    });

    const spoofed = buildFactorDifferences([
      ledger(twoPin, [], [helperRisk(2, "helper_risk_scale:actor2:spoof")]),
      ledger(sixSou, [], [helperRisk(8, "helper_risk_scale:actor2:spoof")]),
    ]).heuristic[0];
    expect(spoofed).toMatchObject({
      direction: "neutral",
      preferenceEligibility: "heuristic_only",
      valueRelation: "different",
    });

    const misplaced = buildFactorDifferences([
      ledgerWithAxis(twoPin, "efficiency", [helperRisk(2)]),
      ledgerWithAxis(sixSou, "efficiency", [helperRisk(8)]),
    ]).heuristic[0];
    expect(misplaced).toMatchObject({
      axis: "efficiency",
      direction: "neutral",
      preferenceEligibility: "heuristic_only",
      valueRelation: "different",
    });

    const wrongUnit = buildFactorDifferences([
      ledger(twoPin, [], [helperRisk(2, "helper_risk_scale:actor2", "points")]),
      ledger(sixSou, [], [helperRisk(8, "helper_risk_scale:actor2", "points")]),
    ]).heuristic[0];
    expect(wrongUnit).toMatchObject({
      axis: "defense",
      direction: "neutral",
      preferenceEligibility: "heuristic_only",
      valueRelation: "different",
    });
  });

  it("orders only exact actor-keyed genbutsu boolean dimensions", () => {
    const exact = buildFactorDifferences([
      ledger(twoPin, [], [genbutsu(2, true)]),
      ledger(sixSou, [], [genbutsu(2, false)]),
    ]).deterministic[0];
    expect(exact).toMatchObject({
      axis: "defense",
      dimension: "genbutsu:actor2",
      direction: "supports_left",
      preferenceEligibility: "deterministic",
    });

    for (const dimension of [
      "genbutsu:actor2:spoof",
      "genbutsu:actor4",
      "genbutsu:actor2:actor2",
    ]) {
      const spoofed = buildFactorDifferences([
        ledger(twoPin, [], [genbutsu(2, true, dimension)]),
        ledger(sixSou, [], [genbutsu(2, false, dimension)]),
      ]).deterministic[0];
      expect(spoofed).toMatchObject({
        axis: "defense",
        dimension,
        direction: "neutral",
        valueRelation: "different",
        preferenceEligibility: "ineligible",
      });
    }
  });

  it("never compares one threat actor's genbutsu cell with another actor", () => {
    const result = buildFactorDifferences([
      ledger(twoPin, [], [genbutsu(1, true)]),
      ledger(sixSou, [], [genbutsu(2, false)]),
    ]);

    expect(result.deterministic).toEqual([]);
  });

  it("requires local replay evidence for deterministic genbutsu", () => {
    const upstreamGenbutsu = (value: boolean): FactorFact => ({
      ...genbutsu(2, value),
      evidenceClass: "deterministic_allowlisted",
      engineIdentity: identity,
    });
    const difference = buildFactorDifferences([
      ledger(twoPin, [], [upstreamGenbutsu(true)]),
      ledger(sixSou, [], [upstreamGenbutsu(false)]),
    ]).deterministic[0];

    expect(difference).toMatchObject({
      dimension: "genbutsu:actor2",
      direction: "neutral",
      valueRelation: "different",
      preferenceEligibility: "ineligible",
    });
  });

  it("refuses to compare facts from different engine versions", () => {
    const changedIdentity = { ...identity, adapterVersion: "9.9.9" };
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

    const classificationSet = buildFactorDifferences([
      ledger(twoPin, [], [{
        ...helperClassification("suji"),
        dimension: "helper_classifications:actor2",
        value: { kind: "string_set", values: ["suji", "wall"] },
      }]),
      ledger(sixSou, [], [{
        ...helperClassification("no_suji"),
        dimension: "helper_classifications:actor2",
        value: { kind: "string_set", values: ["no_suji"] },
      }]),
    ]).heuristic[0];
    expect(classificationSet).toMatchObject({
      direction: "neutral",
      preferenceEligibility: "heuristic_only",
      valueRelation: "different",
    });
  });

  it("keys deterministic direction by both axis and dimension", () => {
    const misplaced = buildFactorDifferences([
      ledgerWithAxis(twoPin, "efficiency", [
        localFact("efficiency.fake_dora", "dora_count", {
          kind: "number", value: 3, unit: "count",
        }),
      ]),
      ledgerWithAxis(sixSou, "efficiency", [
        localFact("efficiency.fake_dora", "dora_count", {
          kind: "number", value: 1, unit: "count",
        }),
      ]),
    ]).deterministic[0];
    expect(misplaced).toMatchObject({
      axis: "efficiency",
      dimension: "dora_count",
      preferenceEligibility: "ineligible",
      direction: "neutral",
      valueRelation: "different",
    });

    const registered = buildFactorDifferences([
      ledgerWithAxis(twoPin, "value", [
        localFact("value.dora", "dora_count", {
          kind: "number", value: 3, unit: "dora_count",
        }),
      ]),
      ledgerWithAxis(sixSou, "value", [
        localFact("value.dora", "dora_count", {
          kind: "number", value: 1, unit: "dora_count",
        }),
      ]),
    ]).deterministic[0];
    expect(registered).toMatchObject({
      axis: "value",
      preferenceEligibility: "deterministic",
      direction: "supports_left",
      valueRelation: "ordered",
    });
  });

  it("compares only registered V2 overall efficiency dimensions", () => {
    const result = buildFactorDifferences([
      ledgerWithAxis(twoPin, "efficiency", [
        engineNumber("efficiency.overall_shanten", "overall_shanten", 1, "shanten"),
        localFact("efficiency.overall_effective", "overall_effective_tiles_remaining", {
          kind: "tile_counts", value: [{ tile34: 3, count: 2 }, { tile34: 6, count: 4 }],
        }),
        engineNumber("efficiency.standard_shanten", "standard_shanten", 2, "shanten"),
      ]),
      ledgerWithAxis(sixSou, "efficiency", [
        engineNumber("efficiency.overall_shanten", "overall_shanten", 1, "shanten"),
        localFact("efficiency.overall_effective", "overall_effective_tiles_remaining", {
          kind: "tile_counts", value: [{ tile34: 3, count: 2 }],
        }),
        engineNumber("efficiency.standard_shanten", "standard_shanten", 1, "shanten"),
      ]),
    ]);

    expect(result.deterministic.find((entry) =>
      entry.dimension === "overall_effective_tiles_remaining"
    )).toMatchObject({
      preferenceEligibility: "deterministic",
      direction: "supports_left",
    });
    expect(result.deterministic.find((entry) =>
      entry.dimension === "standard_shanten"
    )).toMatchObject({
      preferenceEligibility: "ineligible",
      direction: "neutral",
      valueRelation: "different",
    });
    expect(result.deterministicCoverage.map((entry) => entry.dimension).sort())
      .toEqual([
        "overall_effective_tiles_remaining",
        "overall_effective_tiles_remaining",
        "overall_shanten",
        "overall_shanten",
      ]);
  });

  it.each([
    [
      "classification",
      { kind: "classification", value: "ryanmen" },
      { kind: "classification", value: "kanchan" },
    ],
    [
      "string_set",
      { kind: "string_set", values: ["pinfu"] },
      { kind: "string_set", values: ["tanyao"] },
    ],
    [
      "boolean",
      { kind: "boolean", value: true },
      { kind: "boolean", value: false },
    ],
    [
      "integer_ids",
      { kind: "integer_ids", values: [1, 3] },
      { kind: "integer_ids", values: [2] },
    ],
    [
      "tile_counts",
      { kind: "tile_counts", value: [{ tile34: 1, count: 2 }] },
      { kind: "tile_counts", value: [{ tile34: 2, count: 2 }] },
    ],
  ] as const)("preserves deterministic descriptive %s changes", (_kind, left, right) => {
    const difference = buildFactorDifferences([
      ledgerWithAxis(twoPin, "efficiency", [
        localFact(
          "efficiency.description",
          "descriptive_shape",
          left as FactorValue,
        ),
      ]),
      ledgerWithAxis(sixSou, "efficiency", [
        localFact(
          "efficiency.description",
          "descriptive_shape",
          right as FactorValue,
        ),
      ]),
    ]).deterministic[0];
    expect(difference).toMatchObject({
      preferenceEligibility: "ineligible",
      direction: "neutral",
      valueRelation: "different",
      leftValue: left,
      rightValue: right,
    });
  });

  it("fail-fasts when an unparsed ledger repeats an axis dimension", () => {
    const duplicate = ledgerWithAxis(twoPin, "efficiency", [shantenFact(1)]);
    const firstAxis = duplicate.axes.find((axis) => axis.axis === "efficiency")!;
    const malformed = {
      ...duplicate,
      axes: duplicate.axes.map((axis) => axis.axis === "efficiency"
        ? {
          ...firstAxis,
          facts: [
            ...firstAxis.facts,
            { ...firstAxis.facts[0]!, factorKey: "efficiency.alias" },
          ],
        }
        : axis),
    } as CandidateFactorLedger;
    expect(() => buildFactorDifferences([malformed]))
      .toThrow("Duplicate factor dimension");
  });

  it("does not compare mixed evidence identity, units, or limitations", () => {
    const variants: FactorFact[] = [
      { ...engineNumber("efficiency.shanten", "shanten", 2, "shanten"),
        evidenceClass: "deterministic_under_assumptions" },
      engineNumber("efficiency.shanten", "shanten", 2, "tiles"),
      { ...engineNumber("efficiency.shanten", "shanten", 2, "shanten"),
        limitations: ["Different assumption"] },
    ];
    for (const variant of variants) {
      const result = buildFactorDifferences([
        ledgerWithAxis(twoPin, "efficiency", [shantenFact(1)]),
        ledgerWithAxis(sixSou, "efficiency", [variant]),
      ]);
      expect(result.deterministic).toEqual([]);
    }

    const changedIdentity = ledgerWithAxis(
      sixSou, "efficiency", [shantenFact(2)],
    );
    const changedFact = changedIdentity.axes[0]!.facts[0]!;
    const malformedIdentity = {
      ...changedIdentity,
      axes: changedIdentity.axes.map((axis, index) => index === 0
        ? {
          ...axis,
          facts: [{
            ...changedFact,
            engineIdentity: {
              ...changedFact.engineIdentity!,
              upstreamCommit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            },
          }],
        }
        : axis),
    } as CandidateFactorLedger;
    expect(buildFactorDifferences([
      ledgerWithAxis(twoPin, "efficiency", [shantenFact(1)]),
      malformedIdentity,
    ]).deterministic).toEqual([]);
  });

  it("keeps blocked registry facts out of differences without inventing zero", () => {
    const blocked = {
      ...engineNumber("efficiency.overall_shanten", "overall_shanten", 0, "shanten"),
      status: "blocked_missing_facts",
      preferenceEligibility: "ineligible",
      value: undefined,
    } as unknown as FactorFact;
    const left = ledgerWithAxis(
      twoPin, "efficiency", [blocked], "blocked_missing_facts",
    );
    const right = ledgerWithAxis(
      sixSou, "efficiency", [blocked], "blocked_missing_facts",
    );
    const result = buildFactorDifferences([left, right]);
    expect(result.deterministic).toEqual([]);
    expect(result.deterministicCoverage).toMatchObject([
      { status: "blocked_missing_facts", preferenceEligibility: "ineligible" },
      { status: "blocked_missing_facts", preferenceEligibility: "ineligible" },
    ]);
  });

  it("never promotes malicious heuristic or explicitly ineligible registered facts", () => {
    const malicious = {
      ...helperRisk(1),
      factorKey: "efficiency.overall_shanten",
      dimension: "overall_shanten",
      value: { kind: "number", value: 1, unit: "shanten" },
    } as FactorFact;
    const explicitlyIneligible = localFact(
      "efficiency.overall_shanten",
      "overall_shanten",
      { kind: "number", value: 1, unit: "shanten" },
      "ineligible",
    );
    const counterpart = localFact(
      "efficiency.overall_shanten",
      "overall_shanten",
      { kind: "number", value: 2, unit: "shanten" },
      "ineligible",
    );
    const heuristic = buildFactorDifferences([
      ledgerWithAxis(twoPin, "efficiency", [malicious]),
      ledgerWithAxis(sixSou, "efficiency", [{ ...malicious,
        value: { kind: "number", value: 2, unit: "shanten" } }]),
    ]);
    expect(heuristic.deterministic).toEqual([]);
    expect(heuristic.deterministicCoverage).toEqual([]);
    expect(heuristic.heuristic[0]).toMatchObject({
      preferenceEligibility: "heuristic_only",
    });

    const ineligible = buildFactorDifferences([
      ledgerWithAxis(twoPin, "efficiency", [explicitlyIneligible]),
      ledgerWithAxis(sixSou, "efficiency", [counterpart]),
    ]);
    expect(ineligible.deterministic[0]).toMatchObject({
      preferenceEligibility: "ineligible",
      direction: "neutral",
    });
  });
});
