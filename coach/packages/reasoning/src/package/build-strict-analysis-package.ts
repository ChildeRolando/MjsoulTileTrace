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

export type FactorBuckets = {
  supportsModelAction: FactorEvidence[];
  supportsActualAction: FactorEvidence[];
  neutralFactors: FactorEvidence[];
};

export type StrictAnalysisPackage = {
  decision: NormalizedDecision;
  scene: SceneSnapshot;
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
  ].sort((left, right) => left.factorId.localeCompare(right.factorId));
  const axes: Axis[] = [];
  for (const factor of directional) {
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
    candidateLedgers: ledger.candidateLedgers,
    factors,
    evidenceRegistry: buildReplayEvidenceRegistry({
      events: input.events,
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
