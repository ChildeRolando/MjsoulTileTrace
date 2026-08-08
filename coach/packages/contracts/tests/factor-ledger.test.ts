import { describe, expect, it } from "vitest";
import {
  CandidateFactorLedgerSchema,
  DeterministicPreferenceSchema,
  FactorDifferenceSchema,
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
      evidenceClass: "versioned_upstream_estimate",
      engineIdentity: {
        engine: "mahjong-helper",
        upstreamCommit: "514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0",
        adapterVersion: "0.1.0",
        protocolVersion: "mahjong-facts/v1",
      },
      evidenceIds: ["event-riichi"],
      limitations: ["Same pinned helper version"],
    }).kind).toBe("heuristic_difference");
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
