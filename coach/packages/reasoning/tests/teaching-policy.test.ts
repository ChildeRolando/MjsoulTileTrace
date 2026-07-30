import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type {
  CoverageEntry,
  FactorEvidence,
  NormalizedDecision,
  SceneSnapshot,
} from "@riichi-coach/contracts";
import { compareDecision, type DecisionLedger } from "../src/compare/action-comparator.js";
import { importRegressionFixture } from "../src/import/mortal-report.js";
import {
  judgeDecision,
  TEACHING_RULE_REGISTRY,
  type TeachingPolicyInput,
} from "../src/policy/teaching-policy.js";
import { replayToDecision } from "../src/replay/scene-replayer.js";

const fixtureUrl = new URL(
  "../../../fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json",
  import.meta.url,
);

async function loadRegression(index: 0 | 1): Promise<{
  decision: NormalizedDecision;
  scene: SceneSnapshot;
  ledger: DecisionLedger;
}> {
  const raw = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const { events, decisions, selfActor } = importRegressionFixture(raw);
  const decision = decisions[index]!;
  const scene = replayToDecision(events, decision, selfActor);
  return {
    decision,
    scene,
    ledger: compareDecision(scene, decision),
  };
}

function policyInput(ledger: DecisionLedger): TeachingPolicyInput {
  return {
    factors: [
      ...ledger.supportsModelAction,
      ...ledger.supportsActualAction,
      ...ledger.neutralFactors,
    ],
    candidateLedgers: ledger.candidateLedgers,
    coverage: ledger.coverage,
    ruleRegistry: TEACHING_RULE_REGISTRY,
  };
}

describe("fail-closed teaching policy", () => {
  it.each([0, 1] as const)(
    "withholds judgement for incomplete regression %s and reports PF-03 prerequisites",
    async (index) => {
      const { ledger } = await loadRegression(index);
      const result = judgeDecision(policyInput(ledger));
      const pf03 = result.blockedRules.find(
        (evaluation) => evaluation.ruleId === "PF-03@1",
      );

      expect(result.coachJudgement).toBeNull();
      expect(TEACHING_RULE_REGISTRY.map((rule) => rule.id)).toEqual(["PF-03@1"]);
      expect(pf03?.status).toBe("blocked");
      expect(pf03?.missingRequirements).toContainEqual(
        expect.objectContaining({
          kind: "rule",
          code: "rule_activation_pending",
        }),
      );
      expect(pf03?.missingRequirements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "coverage",
            dimension: "value.confirmed_and_potential_yaku",
          }),
          expect.objectContaining({
            kind: "coverage",
            dimension: "placement.outcome_path_rank_impact",
          }),
          expect.objectContaining({
            kind: "factor",
            dimension: "value.confirmed_and_potential_yaku",
          }),
          expect.objectContaining({
            kind: "factor",
            dimension: "placement.strategic_objective",
          }),
        ]),
      );
    },
  );

  it("ignores model and actual labels even when callers attach them", async () => {
    const { decision, ledger } = await loadRegression(0);
    const input = policyInput(ledger);
    const withLabels = {
      ...input,
      modelAction: decision.modelAction,
      actualAction: decision.actualAction,
    } as TeachingPolicyInput;
    const withSwappedLabels = {
      ...input,
      modelAction: decision.actualAction,
      actualAction: decision.modelAction,
    } as TeachingPolicyInput;

    expect(judgeDecision(withLabels)).toEqual(judgeDecision(withSwappedLabels));
  });

  it("does not treat one-player genbutsu as sufficient under multiple threats", async () => {
    const { ledger } = await loadRegression(0);
    const allImplemented = ledger.coverage.map(
      (entry): CoverageEntry => ({ ...entry, status: "implemented" }),
    );
    const factors: FactorEvidence[] = [
      ...policyInput(ledger).factors,
      {
        factorId: "factor:synthetic:actor1-riichi",
        axis: "defense",
        dimension: "defense.riichi_threat_state",
        subjectAction: ledger.candidateLedgers[0]!.actionId,
        comparisonAction: ledger.candidateLedgers[1]!.actionId,
        direction: "neutral",
        magnitude: { kind: "ordinal", value: "riichi_ippatsu_alive" },
        statement: "actor 1 has declared riichi and ippatsu is alive",
        provenance: "raw_replay",
        confidence: "certain",
        evidenceIds: ["event-synthetic-actor1-riichi"],
        actors: [1],
        limitations: ["Threat state does not estimate hand value"],
      },
      {
        factorId: "factor:synthetic:no-high-value",
        axis: "value",
        dimension: "value.confirmed_and_potential_yaku",
        subjectAction: ledger.candidateLedgers[0]!.actionId,
        comparisonAction: ledger.candidateLedgers[1]!.actionId,
        direction: "neutral",
        magnitude: { kind: "ordinal", value: "no_strong_attack_signal" },
        statement: "No strong value-based attack signal was established",
        provenance: "deterministic",
        confidence: "certain",
        evidenceIds: ["evidence:value"],
        limitations: ["Synthetic policy-gate fixture"],
      },
      {
        factorId: "factor:synthetic:no-forced-attack",
        axis: "placement",
        dimension: "placement.strategic_objective",
        subjectAction: ledger.candidateLedgers[0]!.actionId,
        comparisonAction: ledger.candidateLedgers[1]!.actionId,
        direction: "neutral",
        magnitude: { kind: "ordinal", value: "no_forced_attack" },
        statement: "Placement does not force an attack",
        provenance: "deterministic",
        confidence: "certain",
        evidenceIds: ["evidence:placement"],
        limitations: ["Synthetic policy-gate fixture"],
      },
    ];
    const candidateLedgers = ledger.candidateLedgers.map((candidate) => ({
      ...candidate,
      axes: {
        ...candidate.axes,
        defense: {
          ...candidate.axes.defense,
          byThreat: [
            ...candidate.axes.defense.byThreat,
            {
              actor: 1,
              classification: "unknown" as const,
              evidenceIds: [],
            },
          ],
        },
      },
    }));
    const result = judgeDecision({
      factors,
      candidateLedgers,
      coverage: allImplemented,
      ruleRegistry: TEACHING_RULE_REGISTRY,
    });
    const pf03 = result.blockedRules.find(
      (evaluation) => evaluation.ruleId === "PF-03@1",
    );

    expect(result.coachJudgement).toBeNull();
    expect(pf03?.missingRequirements).toContainEqual(
      expect.objectContaining({
        kind: "candidate",
        code: "candidate_safe_against_all_riichi_threats",
      }),
    );
  });
});
