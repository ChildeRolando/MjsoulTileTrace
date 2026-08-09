import { describe, expect, it } from "vitest";
import {
  CandidateFactorLedgerSchema,
  DeterministicPreferenceSchema,
  FactorDifferenceSchema,
  FactorValueSchema,
  canonicalActionRef,
} from "../src/index.js";

const left = canonicalActionRef({
  kind: "discard",
  tile: { id: "6s", red: false },
  discardMode: "tsumogiri",
});
const right = canonicalActionRef({
  kind: "discard",
  tile: { id: "2p", red: false },
  discardMode: "tedashi",
});

const allAxes = ["efficiency", "value", "defense", "placement", "option_value"] as const;
function completeAxes(
  entry: { axis: typeof allAxes[number]; status: string; facts: unknown[] },
) {
  return allAxes.map((axis) => axis === entry.axis
    ? entry
    : { axis, status: "unsupported_dimension", facts: [] });
}

describe("structured factor ledger", () => {
  it("parses canonical typed shape claims without exposing decomposition refs", () => {
    expect(FactorValueSchema.parse({
      kind: "shape_claims",
      claims: [{
        certainty: "invariant",
        group: { kind: "sequence", tiles34: [0, 1, 2], occurrence: 1 },
        decompositionOrdinals: [0, 2],
      }],
    })).toEqual({
      kind: "shape_claims",
      claims: [{
        certainty: "invariant",
        group: { kind: "sequence", tiles34: [0, 1, 2], occurrence: 1 },
        decompositionOrdinals: [0, 2],
      }],
    });
  });

  it("rejects non-canonical shape claims, duplicate ordinals, and raw fields", () => {
    const claim = {
      certainty: "alternative",
      group: { kind: "pair_candidate", tiles34: [4, 4], occurrence: 1 },
      decompositionOrdinals: [0, 1],
    } as const;
    expect(() => FactorValueSchema.parse({
      kind: "shape_claims",
      claims: [claim, claim],
    })).toThrow();
    expect(() => FactorValueSchema.parse({
      kind: "shape_claims",
      claims: [{ ...claim, decompositionOrdinals: [1, 1] }],
    })).toThrow();
    expect(() => FactorValueSchema.parse({
      kind: "shape_claims",
      claims: [{ ...claim, decompositionRef: "raw:forbidden" }],
    })).toThrow();
  });

  it("rejects zero-based occurrences, empty proof, invalid shapes, and duplicate identities", () => {
    const base = {
      certainty: "invariant" as const,
      group: { kind: "sequence" as const, tiles34: [0, 1, 2], occurrence: 1 },
      decompositionOrdinals: [0],
    };
    for (const invalid of [
      { ...base, group: { ...base.group, occurrence: 0 } },
      { ...base, decompositionOrdinals: [] },
      { ...base, group: { ...base.group, tiles34: [0, 1, 3] } },
      { ...base, group: { ...base.group, tiles34: [2, 1, 0] } },
      {
        ...base,
        group: { kind: "pair_candidate", tiles34: [4, 5], occurrence: 1 },
      },
    ]) {
      expect(() => FactorValueSchema.parse({
        kind: "shape_claims",
        claims: [invalid],
      })).toThrow();
    }
    expect(() => FactorValueSchema.parse({
      kind: "shape_claims",
      claims: [base, { ...base, decompositionOrdinals: [1] }],
    })).toThrow();
    expect(() => FactorValueSchema.parse({
      kind: "shape_claims",
      claims: [{ ...base, group: { ...base.group, occurrence: 2 } }],
    })).toThrow();
    expect(() => FactorValueSchema.parse({
      kind: "shape_claims",
      claims: [base, {
        ...base,
        group: { ...base.group, occurrence: 3 },
        decompositionOrdinals: [1],
      }],
    })).toThrow();
  });

  it("parses canonical typed wait details and rejects wrong ordering", () => {
    const waits = [{
      tile34: 2,
      families: ["standard"],
      waitTypes: ["ryanmen", "shanpon"],
      remainingStatus: "calculated",
      remaining: 3,
      baseRonEligibility: "eligible",
      decompositionOrdinals: [0, 1],
    }, {
      tile34: 5,
      families: ["standard", "chiitoitsu"],
      waitTypes: ["tanki"],
      remainingStatus: "blocked_missing_facts",
      remaining: null,
      baseRonEligibility: "unknown_missing_situational_yaku_context",
      decompositionOrdinals: [],
    }] as const;
    expect(FactorValueSchema.parse({ kind: "wait_details", waits })).toEqual({
      kind: "wait_details",
      waits,
    });
    expect(() => FactorValueSchema.parse({
      kind: "wait_details",
      waits: [...waits].reverse(),
    })).toThrow();
    expect(() => FactorValueSchema.parse({
      kind: "wait_details",
      waits: [{ ...waits[0], waitTypes: ["shanpon", "ryanmen"] }],
    })).toThrow();
    expect(() => FactorValueSchema.parse({
      kind: "wait_details",
      waits: [{ ...waits[0], decompositionRef: "raw:forbidden" }],
    })).toThrow();
  });

  it("requires integer ID sets to use strict ascending canonical order", () => {
    expect(FactorValueSchema.parse({
      kind: "integer_ids",
      values: [1, 3, 8],
    })).toEqual({ kind: "integer_ids", values: [1, 3, 8] });
    expect(() => FactorValueSchema.parse({
      kind: "integer_ids",
      values: [3, 1],
    })).toThrow();
    expect(() => FactorValueSchema.parse({
      kind: "integer_ids",
      values: [1, 1],
    })).toThrow();
  });

  it("exports the ledger, difference, and preference schemas", () => {
    expect(CandidateFactorLedgerSchema).toBeDefined();
    expect(FactorDifferenceSchema).toBeDefined();
    expect(DeterministicPreferenceSchema).toBeDefined();
  });

  it("forbids heuristic evidence from deterministic eligibility", () => {
    expect(() => CandidateFactorLedgerSchema.parse({
      actionRef: left,
      projectedStateRef: "state:1",
      axes: completeAxes({
        axis: "defense",
        status: "calculated",
        facts: [{
          factorKey: "defense.helper_risk.actor2",
          dimension: "helper_risk_scale",
          status: "calculated",
          evidenceClass: "versioned_upstream_estimate",
          preferenceEligibility: "deterministic",
          value: { kind: "number", value: 7.2, unit: "helper_risk_scale" },
          evidenceIds: ["event-riichi"],
          limitations: ["Not a calibrated Mortal deal-in probability"],
        }],
      }),
      diagnostics: [],
    })).toThrow();
  });

  it("requires structured engine identity for calculated upstream facts", () => {
    expect(() => CandidateFactorLedgerSchema.parse({
      actionRef: left,
      projectedStateRef: "state:1",
      axes: completeAxes({
        axis: "value",
        status: "calculated",
        facts: [{
          factorKey: "value.dama_point",
          dimension: "dama_point",
          status: "calculated",
          evidenceClass: "versioned_upstream_estimate",
          preferenceEligibility: "heuristic_only",
          value: { kind: "number", value: 3900, unit: "points" },
          evidenceIds: ["request:1"],
          limitations: ["Pinned helper estimate"],
        }],
      }),
      diagnostics: [],
    })).toThrow("Calculated engine evidence requires structured engine identity");
  });

  it("requires calculated facts to contain values and blocked facts to omit them", () => {
    const baseFact = {
      factorKey: "efficiency.shanten",
      dimension: "shanten",
      evidenceClass: "deterministic_allowlisted",
      preferenceEligibility: "deterministic",
      evidenceIds: ["hand:1"],
      limitations: [],
    } as const;

    expect(() => CandidateFactorLedgerSchema.parse({
      actionRef: left,
      projectedStateRef: "state:1",
      axes: completeAxes({
        axis: "efficiency",
        status: "calculated",
        facts: [{ ...baseFact, status: "calculated" }],
      }),
      diagnostics: [],
    })).toThrow();

    expect(() => CandidateFactorLedgerSchema.parse({
      actionRef: left,
      projectedStateRef: "state:1",
      axes: completeAxes({
        axis: "efficiency",
        status: "blocked_missing_facts",
        facts: [{
          ...baseFact,
          status: "blocked_missing_facts",
          value: { kind: "number", value: 1, unit: "shanten" },
        }],
      }),
      diagnostics: [],
    })).toThrow();
  });

  it("parses a separate heuristic difference", () => {
    expect(FactorDifferenceSchema.parse({
      differenceId: "difference:risk",
      kind: "heuristic_difference",
      axis: "defense",
      dimension: "helper_risk_scale",
      leftActionRef: left,
      rightActionRef: right,
      direction: "supports_left",
      valueRelation: "ordered",
      leftValue: { kind: "number", value: 2.1, unit: "helper_risk_scale" },
      rightValue: { kind: "number", value: 8, unit: "helper_risk_scale" },
      preferenceEligibility: "heuristic_only",
      evidenceClass: "versioned_upstream_estimate",
      engineIdentity: {
        engine: "mahjong-helper",
        upstreamCommit: "514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0",
        adapterVersion: "0.2.0",
        protocolVersion: "mahjong-facts/v1",
      },
      evidenceIds: ["event-riichi"],
      limitations: ["Same pinned helper version"],
    }).kind).toBe("heuristic_difference");
  });

  it("rejects duplicate dimensions within one axis even when factor keys differ", () => {
    const fact = {
      dimension: "overall_shanten",
      status: "calculated",
      evidenceClass: "deterministic_local_replay",
      preferenceEligibility: "deterministic",
      value: { kind: "number", value: 1, unit: "shanten" },
      evidenceIds: ["state:1"],
      limitations: [],
    } as const;
    expect(() => CandidateFactorLedgerSchema.parse({
      actionRef: left,
      projectedStateRef: "state:duplicate-dimension",
      axes: completeAxes({
        axis: "efficiency",
        status: "calculated",
        facts: [
          { ...fact, factorKey: "efficiency.overall_shanten" },
          { ...fact, factorKey: "efficiency.alias_shanten" },
        ],
      }),
      diagnostics: [],
    })).toThrow("dimensions must be unique");
  });

  it("requires explicit preference eligibility on every difference kind", () => {
    const base = {
      differenceId: "difference:shape",
      axis: "efficiency",
      dimension: "wait_shape",
      leftActionRef: left,
      rightActionRef: right,
      direction: "neutral",
      valueRelation: "different",
      leftValue: { kind: "classification", value: "ryanmen" },
      rightValue: { kind: "classification", value: "kanchan" },
      evidenceIds: ["state:1"],
      limitations: [],
    } as const;

    expect(FactorDifferenceSchema.parse({
      ...base,
      kind: "deterministic_difference",
      preferenceEligibility: "ineligible",
      evidenceClass: "deterministic_local_replay",
    }).preferenceEligibility).toBe("ineligible");
    expect(() => FactorDifferenceSchema.parse({
      ...base,
      kind: "deterministic_difference",
      preferenceEligibility: "heuristic_only",
      evidenceClass: "deterministic_local_replay",
    })).toThrow();
    expect(() => FactorDifferenceSchema.parse({
      ...base,
      kind: "heuristic_difference",
      preferenceEligibility: "deterministic",
      evidenceClass: "versioned_upstream_estimate",
      engineIdentity: {
        engine: "mahjong-helper",
        upstreamCommit: "514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0",
        adapterVersion: "0.2.0",
        protocolVersion: "mahjong-facts/v1",
      },
    })).toThrow();
  });

  it("forces ineligible deterministic differences to remain descriptive", () => {
    const base = {
      differenceId: "difference:shape",
      kind: "deterministic_difference",
      preferenceEligibility: "ineligible",
      axis: "efficiency",
      dimension: "wait_shape",
      leftActionRef: left,
      rightActionRef: right,
      leftValue: { kind: "classification", value: "ryanmen" },
      rightValue: { kind: "classification", value: "kanchan" },
      evidenceClass: "deterministic_local_replay",
      evidenceIds: ["state:1"],
      limitations: [],
    } as const;

    expect(() => FactorDifferenceSchema.parse({
      ...base,
      direction: "supports_left",
      valueRelation: "ordered",
    })).toThrow("Ineligible deterministic differences must be neutral");
    expect(FactorDifferenceSchema.parse({
      ...base,
      direction: "neutral",
      valueRelation: "different",
    }).valueRelation).toBe("different");
    expect(() => FactorDifferenceSchema.parse({
      ...base,
      direction: "neutral",
      valueRelation: "equal",
    })).toThrow("Unequal factor values require a different relation");
    expect(() => FactorDifferenceSchema.parse({
      ...base,
      rightValue: base.leftValue,
      direction: "neutral",
      valueRelation: "different",
    })).toThrow("Equal factor values require an equal relation");
    expect(FactorDifferenceSchema.parse({
      ...base,
      rightValue: base.leftValue,
      direction: "neutral",
      valueRelation: "equal",
    }).valueRelation).toBe("equal");
  });

  it("requires eligible deterministic direction and value relation to agree", () => {
    const base = {
      differenceId: "difference:shanten",
      kind: "deterministic_difference",
      preferenceEligibility: "deterministic",
      axis: "efficiency",
      dimension: "overall_shanten",
      leftActionRef: left,
      rightActionRef: right,
      leftValue: { kind: "number", value: 1, unit: "shanten" },
      rightValue: { kind: "number", value: 2, unit: "shanten" },
      evidenceClass: "deterministic_local_replay",
      evidenceIds: ["state:1"],
      limitations: [],
    } as const;

    expect(() => FactorDifferenceSchema.parse({
      ...base,
      direction: "neutral",
      valueRelation: "different",
    })).toThrow("Eligible neutral differences must represent equal values");
    expect(() => FactorDifferenceSchema.parse({
      ...base,
      direction: "supports_left",
      valueRelation: "equal",
    })).toThrow("Eligible directional differences must order values");
    expect(() => FactorDifferenceSchema.parse({
      ...base,
      rightValue: base.leftValue,
      direction: "supports_left",
      valueRelation: "ordered",
    })).toThrow("Directional differences require unequal factor values");
    expect(FactorDifferenceSchema.parse({
      ...base,
      rightValue: base.leftValue,
      direction: "neutral",
      valueRelation: "equal",
    }).direction).toBe("neutral");
    expect(FactorDifferenceSchema.parse({
      ...base,
      direction: "supports_left",
      valueRelation: "ordered",
    }).direction).toBe("supports_left");
  });

  it("requires heuristic direction, relation, and canonical values to agree", () => {
    const base = {
      differenceId: "difference:risk",
      kind: "heuristic_difference",
      preferenceEligibility: "heuristic_only",
      axis: "defense",
      dimension: "helper_risk_scale:actor2",
      leftActionRef: left,
      rightActionRef: right,
      leftValue: { kind: "number", value: 2, unit: "helper_risk_scale" },
      rightValue: { kind: "number", value: 8, unit: "helper_risk_scale" },
      evidenceClass: "versioned_upstream_estimate",
      engineIdentity: {
        engine: "mahjong-helper",
        upstreamCommit: "514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0",
        adapterVersion: "0.2.0",
        protocolVersion: "mahjong-facts/v1",
      },
      evidenceIds: ["request:risk"],
      limitations: [],
    } as const;

    expect(() => FactorDifferenceSchema.parse({
      ...base,
      direction: "supports_left",
      valueRelation: "different",
    })).toThrow("Directional differences must order values");
    expect(() => FactorDifferenceSchema.parse({
      ...base,
      rightValue: base.leftValue,
      direction: "supports_left",
      valueRelation: "ordered",
    })).toThrow("Directional differences require unequal factor values");
    expect(() => FactorDifferenceSchema.parse({
      ...base,
      direction: "neutral",
      valueRelation: "ordered",
    })).toThrow("Neutral differences cannot order values");
    expect(() => FactorDifferenceSchema.parse({
      ...base,
      direction: "neutral",
      valueRelation: "equal",
    })).toThrow("Unequal factor values require a different relation");
    expect(() => FactorDifferenceSchema.parse({
      ...base,
      rightValue: base.leftValue,
      direction: "neutral",
      valueRelation: "different",
    })).toThrow("Equal factor values require an equal relation");
  });

  it("requires the exact canonical five-axis ledger shape", () => {
    const axes = allAxes.map((axis) => ({
      axis,
      status: "unsupported_dimension",
      facts: [],
    }));
    expect(CandidateFactorLedgerSchema.parse({
      actionRef: left,
      projectedStateRef: "state:complete",
      axes,
      diagnostics: [],
    }).axes).toHaveLength(5);
    expect(() => CandidateFactorLedgerSchema.parse({
      actionRef: left,
      projectedStateRef: "state:missing",
      axes: axes.slice(0, 4),
      diagnostics: [],
    })).toThrow("canonical five axes");
  });

  it("rejects a deterministic preference with duplicate actions", () => {
    expect(() => DeterministicPreferenceSchema.parse({
      actionRefs: [left, left],
      scope: "efficiency_only",
      decisiveDifferenceIds: ["difference:shanten"],
      coverage: "complete",
    })).toThrow();
  });

  it("allows a null preference when deterministic axes conflict", () => {
    expect(DeterministicPreferenceSchema.nullable().parse(null)).toBeNull();
  });
});
