import { isDeepStrictEqual } from "node:util";
import type {
  Axis,
  FactorEvidence,
  NormalizedDecision,
  NormalizedEvent,
  SceneSnapshot,
} from "@riichi-coach/contracts";
import {
  compareDecision,
  type CandidateLedger,
} from "../compare/action-comparator.js";
import {
  DIMENSION_CATALOG_VERSION,
} from "../coverage/dimension-catalog.js";
import {
  buildReplayEvidenceRegistry,
  type ReplayEvidenceRegistry,
} from "../evidence/evidence-registry.js";
import { renderDeterministicExplanation } from "../explain/deterministic-explanation.js";
import {
  judgeDecision,
  TEACHING_RULE_REGISTRY,
  type CoachJudgement,
  type RuleEvaluation,
  type TeachingRuleDefinition,
} from "../policy/teaching-policy.js";
import { replayToDecision } from "../replay/scene-replayer.js";

export type FactorBuckets = {
  supportsModelAction: FactorEvidence[];
  supportsActualAction: FactorEvidence[];
  neutralFactors: FactorEvidence[];
};

export type StrictAnalysisPackage = {
  decision: NormalizedDecision;
  scene: SceneSnapshot;
  visibleEvents: NormalizedEvent[];
  candidateLedgers: CandidateLedger[];
  factors: FactorBuckets;
  evidenceRegistry: ReplayEvidenceRegistry;
  coverage: ReturnType<typeof compareDecision>["coverage"];
  coverageCatalogVersion: string;
  ruleRegistry: readonly TeachingRuleDefinition[];
  blockedRules: RuleEvaluation[];
  coachJudgement: CoachJudgement | null;
  primaryAxes: Axis[];
  deterministicExplanation: string;
};

export function derivePrimaryAxes(factors: FactorBuckets): Axis[] {
  const directional = [
    ...factors.supportsModelAction,
    ...factors.supportsActualAction,
  ];
  const confidenceRank = {
    unknown: 0,
    low: 1,
    medium: 2,
    high: 3,
    certain: 4,
  } as const;
  const provenanceRank = {
    unknown: 0,
    raw_model: 1,
    derived_heuristic: 2,
    teaching_rule: 3,
    calibrated_statistic: 4,
    raw_replay: 5,
    deterministic: 5,
  } as const;
  const quality = (factor: FactorEvidence): number =>
    confidenceRank[factor.confidence] * 10 +
    provenanceRank[factor.provenance];
  const bestQuality = Math.max(...directional.map(quality));
  const primary = directional
    .filter((factor) => quality(factor) === bestQuality)
    .sort((left, right) => left.factorId.localeCompare(right.factorId));
  const axes: Axis[] = [];
  for (const factor of primary) {
    if (!axes.includes(factor.axis)) {
      axes.push(factor.axis);
    }
  }
  return axes;
}

export function buildStrictAnalysisPackage(input: {
  events: readonly NormalizedEvent[];
  decision: NormalizedDecision;
  scene: SceneSnapshot;
}): StrictAnalysisPackage {
  const visible = new Set(input.scene.eventIds);
  const visibleEvents = input.events.filter((event) =>
    visible.has(event.eventId),
  );
  if (
    !isDeepStrictEqual(
      visibleEvents.map((event) => event.eventId),
      input.scene.eventIds,
    )
  ) {
    throw new Error("Scene event IDs do not match the visible replay prefix");
  }
  const replayedScene = replayToDecision(
    visibleEvents,
    input.decision,
    input.scene.selfActor,
  );
  if (!isDeepStrictEqual(replayedScene, input.scene)) {
    throw new Error("Provided scene does not match visible replay");
  }

  const ledger = compareDecision(input.scene, input.decision);
  const factors: FactorBuckets = {
    supportsModelAction: ledger.supportsModelAction,
    supportsActualAction: ledger.supportsActualAction,
    neutralFactors: ledger.neutralFactors,
  };
  const allFactors = [
    ...factors.supportsModelAction,
    ...factors.supportsActualAction,
    ...factors.neutralFactors,
  ];
  const policy = judgeDecision({
    factors: allFactors,
    candidateLedgers: ledger.candidateLedgers,
    coverage: ledger.coverage,
    ruleRegistry: TEACHING_RULE_REGISTRY,
  });

  return {
    decision: input.decision,
    scene: input.scene,
    visibleEvents,
    candidateLedgers: ledger.candidateLedgers,
    factors,
    evidenceRegistry: buildReplayEvidenceRegistry({
      events: visibleEvents,
      visibleEventIds: input.scene.eventIds,
      factors: allFactors,
    }),
    coverage: ledger.coverage,
    coverageCatalogVersion: DIMENSION_CATALOG_VERSION,
    ruleRegistry: TEACHING_RULE_REGISTRY,
    blockedRules: policy.blockedRules.filter(
      (rule) => rule.status === "blocked",
    ),
    coachJudgement: policy.coachJudgement,
    primaryAxes: derivePrimaryAxes(factors),
    deterministicExplanation: renderDeterministicExplanation({
      decision: input.decision,
      ledger,
      policy,
    }),
  };
}
