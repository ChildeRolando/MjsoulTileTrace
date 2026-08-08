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
import { resolveDeterministicPreference } from "../src/factors/deterministic-resolver.js";

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
      { axis: "defense", status: "calculated", facts: defense },
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
        ],
        diagnostics: [],
      }),
      CandidateFactorLedgerSchema.parse({
        actionRef: sixSou,
        projectedStateRef: "state:6s",
        axes: [
          { axis: "efficiency", status: "calculated", facts: [shanten(2)] },
          { axis: "value", status: "calculated", facts: [blockedDora(), helperYaku([2])] },
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
});
