import { describe, expect, it } from "vitest";
import {
  CandidateFactorLedgerSchema,
  StandaloneHypothesisFrameSchema,
  canonicalActionRef,
  type ActionRef,
  type CandidateFactorLedger,
  type ComparisonAnalysisFrame,
  type EngineIdentity,
  type FactorFact,
} from "@riichi-coach/contracts";
import { buildFactorDifferences } from "../src/factors/difference-builder.js";
import type { FactorDifferenceBuildResult } from "../src/factors/difference-builder.js";
import { resolveDeterministicPreference } from "../src/factors/deterministic-resolver.js";

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
const eightPin = canonicalActionRef({
  kind: "discard",
  tile: { id: "8p", red: false },
  discardMode: "tedashi",
});

function frame(scope: ComparisonAnalysisFrame["scope"]): ComparisonAnalysisFrame {
  return StandaloneHypothesisFrameSchema.parse({
    kind: "standalone_hypothesis",
    frameId: "frame:e1:t6",
    scope,
    facts: [{ factId: "facts:e1:t6", provenance: "user_asserted" }],
  });
}

function shanten(value: number): FactorFact {
  return {
    factorKey: "efficiency.shanten",
    dimension: "shanten",
    status: "calculated",
    evidenceClass: "deterministic_allowlisted",
    preferenceEligibility: "deterministic",
    engineIdentity: identity,
    value: { kind: "number", value, unit: "shanten" },
    evidenceIds: ["request:hand13"],
    limitations: [],
  };
}

function genbutsu(value: boolean): FactorFact {
  return {
    factorKey: "defense.genbutsu.actor2",
    dimension: "genbutsu:actor2",
    status: "calculated",
    evidenceClass: "deterministic_local_replay",
    preferenceEligibility: "deterministic",
    value: { kind: "boolean", value },
    evidenceIds: ["event:riichi:2"],
    limitations: [],
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
    limitations: ["Heuristic only"],
  };
}

function blockedDora(): FactorFact {
  return {
    factorKey: "value.dora_count",
    dimension: "dora_count",
    status: "blocked_missing_facts",
    evidenceClass: "deterministic_allowlisted",
    preferenceEligibility: "ineligible",
    evidenceIds: ["request:hand13"],
    limitations: ["dora indicators incomplete"],
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
    limitations: ["Heuristic only"],
  };
}

function ledger(
  actionRef: ActionRef,
  efficiency: FactorFact[],
  defense: FactorFact[],
): CandidateFactorLedger {
  return CandidateFactorLedgerSchema.parse({
    actionRef,
    projectedStateRef: `state:${actionRef}`,
    axes: [
      { axis: "efficiency", status: "calculated", facts: efficiency },
      { axis: "value", status: "unsupported_dimension", facts: [] },
      {
        axis: "defense",
        status: defense.length > 0 ? "calculated" : "unsupported_dimension",
        facts: defense,
      },
      { axis: "placement", status: "unsupported_dimension", facts: [] },
      { axis: "option_value", status: "unsupported_dimension", facts: [] },
    ],
    diagnostics: [],
  });
}

function eastOneLedgers(leftRisk = 99, rightRisk = 1) {
  return [
    ledger(twoPin, [shanten(1)], [genbutsu(false), helperRisk(leftRisk)]),
    ledger(sixSou, [shanten(2)], [genbutsu(true), helperRisk(rightRisk)]),
  ];
}

describe("deterministic preference resolver", () => {
  it("returns null for an applied efficiency-versus-defense conflict", () => {
    const differences = buildFactorDifferences(eastOneLedgers());
    expect(resolveDeterministicPreference(
      frame({ kind: "applied_decision" }),
      differences,
    )).toBeNull();
  });

  it("returns 2p for an efficiency-only scope", () => {
    const differences = buildFactorDifferences(eastOneLedgers());
    expect(resolveDeterministicPreference(
      frame({ kind: "single_axis", axis: "efficiency" }),
      differences,
    )?.actionRefs).toEqual([twoPin]);
  });

  it("ignores reversed helper risk values", () => {
    const first = resolveDeterministicPreference(
      frame({ kind: "single_axis", axis: "efficiency" }),
      buildFactorDifferences(eastOneLedgers(1, 99)),
    );
    const reversed = resolveDeterministicPreference(
      frame({ kind: "single_axis", axis: "efficiency" }),
      buildFactorDifferences(eastOneLedgers(99, 1)),
    );
    expect(first).toEqual(reversed);
  });

  it("does not let heuristic value facts conceal blocked deterministic value", () => {
    const ledgers = [
      CandidateFactorLedgerSchema.parse({
        actionRef: twoPin,
        projectedStateRef: "state:2p",
        axes: [
          { axis: "efficiency", status: "calculated", facts: [shanten(1)] },
          { axis: "value", status: "calculated", facts: [blockedDora(), helperYaku([1])] },
          { axis: "defense", status: "unsupported_dimension", facts: [] },
          { axis: "placement", status: "unsupported_dimension", facts: [] },
          { axis: "option_value", status: "unsupported_dimension", facts: [] },
        ],
        diagnostics: [],
      }),
      CandidateFactorLedgerSchema.parse({
        actionRef: sixSou,
        projectedStateRef: "state:6s",
        axes: [
          { axis: "efficiency", status: "calculated", facts: [shanten(2)] },
          { axis: "value", status: "calculated", facts: [blockedDora(), helperYaku([2])] },
          { axis: "defense", status: "unsupported_dimension", facts: [] },
          { axis: "placement", status: "unsupported_dimension", facts: [] },
          { axis: "option_value", status: "unsupported_dimension", facts: [] },
        ],
        diagnostics: [],
      }),
    ];
    const differences = buildFactorDifferences(ledgers);

    expect(resolveDeterministicPreference(
      frame({ kind: "flat_discard" }),
      differences,
    )).toBeNull();
    expect(resolveDeterministicPreference(
      frame({ kind: "single_axis", axis: "efficiency" }),
      differences,
    )?.actionRefs).toEqual([twoPin]);
  });

  it("uses registered equal deterministic differences as a winner tie", () => {
    const differences = buildFactorDifferences([
      ledger(twoPin, [shanten(1)], []),
      ledger(sixSou, [shanten(1)], []),
      ledger(eightPin, [shanten(2)], []),
    ]);
    const preference = resolveDeterministicPreference(
      frame({ kind: "single_axis", axis: "efficiency" }),
      differences,
    );
    expect(preference?.actionRefs).toEqual([twoPin, sixSou]);
    expect(preference?.decisiveDifferenceIds.every((id) =>
      id.includes(":shanten:")
    )).toBe(true);
  });

  it("ignores an ineligible difference even if malformed input gives it direction", () => {
    const signature = JSON.stringify({
      evidenceClass: "deterministic_local_replay",
      limitations: [],
      valueShape: { kind: "number", unit: "shanten" },
    });
    const malformed = {
      candidateRefs: [twoPin, sixSou],
      deterministic: [{
        differenceId: "difference:malicious",
        kind: "deterministic_difference",
        preferenceEligibility: "ineligible",
        axis: "efficiency",
        dimension: "overall_shanten",
        leftActionRef: twoPin,
        rightActionRef: sixSou,
        direction: "supports_left",
        valueRelation: "ordered",
        leftValue: { kind: "number", value: 1, unit: "shanten" },
        rightValue: { kind: "number", value: 2, unit: "shanten" },
        evidenceClass: "deterministic_local_replay",
        evidenceIds: ["state:1"],
        limitations: [],
      }],
      heuristic: [],
      coverage: [],
      deterministicCoverage: [twoPin, sixSou].map((actionRef) => ({
        actionRef,
        axis: "efficiency",
        dimension: "overall_shanten",
        status: "calculated",
        preferenceEligibility: "deterministic",
        comparisonSignature: signature,
      })),
    } as FactorDifferenceBuildResult;

    expect(resolveDeterministicPreference(
      frame({ kind: "single_axis", axis: "efficiency" }),
      malformed,
    )).toBeNull();
  });

  it.each([
    [
      "wrong unit",
      { kind: "number", value: 2, unit: "points" },
      { kind: "number", value: 1, unit: "points" },
    ],
    [
      "wrong value kind",
      { kind: "classification", value: "two" },
      { kind: "classification", value: "one" },
    ],
  ] as const)("does not resolve overall shanten with the same %s on both sides", (
    _case,
    leftValue,
    rightValue,
  ) => {
    const invalidOverall = (value: typeof leftValue | typeof rightValue): FactorFact => ({
      factorKey: "efficiency.overall_shanten",
      dimension: "overall_shanten",
      status: "calculated",
      evidenceClass: "deterministic_local_replay",
      preferenceEligibility: "deterministic",
      value: value as FactorFact["value"],
      evidenceIds: ["state:1"],
      limitations: [],
    });
    const differences = buildFactorDifferences([
      ledger(twoPin, [invalidOverall(leftValue)], []),
      ledger(sixSou, [invalidOverall(rightValue)], []),
    ]);

    expect(differences.deterministic[0]).toMatchObject({
      preferenceEligibility: "ineligible",
      direction: "neutral",
      valueRelation: "different",
    });
    expect(differences.deterministicCoverage.every((entry) =>
      entry.preferenceEligibility === "ineligible"
    )).toBe(true);
    expect(resolveDeterministicPreference(
      frame({ kind: "single_axis", axis: "efficiency" }),
      differences,
    )).toBeNull();
  });
});
