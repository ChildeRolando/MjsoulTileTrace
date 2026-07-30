import type {
  ActionId,
  CoverageEntry,
  FactorEvidence,
} from "@riichi-coach/contracts";
import type { CandidateLedger } from "../compare/action-comparator.js";

export type TeachingRuleDefinition = {
  id: string;
  title: string;
  activation: "pending_complete_analyzers";
  requiredCoverage: readonly string[];
  requiredFactors: readonly {
    dimension: string;
    acceptedMagnitudeValues: readonly (string | number)[];
    description: string;
  }[];
  applicability: readonly string[];
  counterconditions: readonly string[];
  sources: readonly string[];
  limitations: readonly string[];
};

export const TEACHING_RULE_REGISTRY: readonly TeachingRuleDefinition[] = [
  {
    id: "PF-03@1",
    title: "Far-from-tenpai defense during a riichi ippatsu window",
    activation: "pending_complete_analyzers",
    requiredCoverage: [
      "efficiency.standard_hand_shanten",
      "efficiency.legal_action_completeness",
      "value.confirmed_and_potential_yaku",
      "value.fu_han_and_point_range",
      "defense.riichi_threat_state",
      "defense.per_threat_genbutsu",
      "defense.multi_threat_per_opponent",
      "defense.calibrated_dealin_probability",
      "defense.multi_threat_risk_combination",
      "placement.strategic_objective",
      "placement.outcome_path_rank_impact",
      "option_value.current_and_future_safe_inventory",
    ],
    requiredFactors: [
      {
        dimension: "defense.riichi_threat_state",
        acceptedMagnitudeValues: ["riichi_ippatsu_alive"],
        description: "At least one riichi threat still has an ippatsu window",
      },
      {
        dimension: "value.confirmed_and_potential_yaku",
        acceptedMagnitudeValues: ["no_strong_attack_signal"],
        description: "Value analysis found no strong attack signal",
      },
      {
        dimension: "placement.strategic_objective",
        acceptedMagnitudeValues: ["no_forced_attack"],
        description: "Placement analysis found no forced-attack objective",
      },
    ],
    applicability: [
      "At least one opponent has declared riichi and ippatsu is alive",
      "The best legal discard remains two-shanten or farther",
      "No value or placement factor requires a push",
      "A candidate is deterministic genbutsu against every active riichi threat",
    ],
    counterconditions: [
      "A high-value factor supports attacking",
      "Placement requires winning, tenpai, or dealer continuation",
      "No candidate is proven safe against every simultaneous threat",
    ],
    sources: [
      "Daina Chiba, Riichi Book I",
      "Approved evidence-grounded reasoning specification, section 8",
    ],
    limitations: [
      "Genbutsu is evaluated separately for each riichi threat",
      "The rule does not estimate calibrated deal-in probability",
      "The rule is blocked unless every listed prerequisite is explicit",
    ],
  },
] as const;

export type MissingRuleRequirement = {
  kind: "coverage" | "factor" | "candidate" | "rule";
  code: string;
  dimension: string | null;
  detail: string;
};

export type RuleEvaluation = {
  ruleId: string;
  status: "applicable" | "blocked";
  missingRequirements: MissingRuleRequirement[];
};

export type CoachJudgement = {
  recommendedAction: ActionId;
  ruleIds: string[];
  confidence: "high" | "medium" | "low";
};

export type TeachingPolicyInput = {
  factors: readonly FactorEvidence[];
  candidateLedgers: readonly CandidateLedger[];
  coverage: readonly CoverageEntry[];
  ruleRegistry: readonly TeachingRuleDefinition[];
};

export type TeachingPolicyResult = {
  coachJudgement: CoachJudgement | null;
  blockedRules: RuleEvaluation[];
};

function coverageRequirements(
  rule: TeachingRuleDefinition,
  coverage: readonly CoverageEntry[],
): MissingRuleRequirement[] {
  const byDimension = new Map(
    coverage.map((entry) => [entry.dimension, entry]),
  );
  return rule.requiredCoverage.flatMap((dimension) => {
    const entry = byDimension.get(dimension);
    return entry?.status === "implemented"
      ? []
      : [{
          kind: "coverage" as const,
          code: entry ? `coverage_${entry.status}` : "coverage_missing",
          dimension,
          detail: entry?.reason ?? `No coverage entry exists for ${dimension}`,
        }];
  });
}

function factorRequirements(
  rule: TeachingRuleDefinition,
  factors: readonly FactorEvidence[],
): MissingRuleRequirement[] {
  return rule.requiredFactors.flatMap((requirement) => {
    const matching = factors.find(
      (factor) =>
        factor.dimension === requirement.dimension &&
        requirement.acceptedMagnitudeValues.includes(factor.magnitude.value) &&
        (factor.provenance === "deterministic" ||
          factor.provenance === "raw_replay") &&
        factor.confidence === "certain",
    );
    return matching
      ? []
      : [{
          kind: "factor" as const,
          code: "required_factor_missing",
          dimension: requirement.dimension,
          detail: requirement.description,
        }];
  });
}

function riichiActors(factors: readonly FactorEvidence[]): number[] {
  return factors.flatMap((factor) =>
    factor.dimension === "defense.riichi_threat_state"
      ? factor.actors ?? []
      : [],
  );
}

function candidatesSafeAgainstEveryThreat(
  factors: readonly FactorEvidence[],
  candidateLedgers: readonly CandidateLedger[],
): CandidateLedger[] {
  const actors = [...new Set(riichiActors(factors))];
  if (actors.length === 0) {
    return [];
  }
  return candidateLedgers.filter((candidate) =>
    actors.every((actor) =>
      candidate.axes.defense.byThreat.some(
        (safety) =>
          safety.actor === actor && safety.classification === "genbutsu",
      ),
    ),
  );
}

function candidateRequirements(
  factors: readonly FactorEvidence[],
  candidateLedgers: readonly CandidateLedger[],
): {
  missing: MissingRuleRequirement[];
  safeCandidates: CandidateLedger[];
} {
  const missing: MissingRuleRequirement[] = [];
  const shantenValues = candidateLedgers.flatMap((candidate) =>
    candidate.axes.efficiency.consequence
      ? [candidate.axes.efficiency.consequence.shanten]
      : [],
  );
  if (
    shantenValues.length !== candidateLedgers.length ||
    Math.min(...shantenValues) < 2
  ) {
    missing.push({
      kind: "candidate",
      code: "best_candidate_two_shanten_or_farther",
      dimension: "efficiency.standard_hand_shanten",
      detail:
        "Every analyzed discard candidate needs standard-hand shanten and the best result must be two-shanten or farther",
    });
  }

  const safeCandidates = candidatesSafeAgainstEveryThreat(
    factors,
    candidateLedgers,
  );
  if (safeCandidates.length === 0) {
    missing.push({
      kind: "candidate",
      code: "candidate_safe_against_all_riichi_threats",
      dimension: "defense.multi_threat_per_opponent",
      detail:
        "No candidate has deterministic genbutsu evidence against every active riichi threat",
    });
  }
  return { missing, safeCandidates };
}

export function judgeDecision(input: TeachingPolicyInput): TeachingPolicyResult {
  const {
    factors,
    candidateLedgers,
    coverage,
    ruleRegistry,
  } = input;
  const evaluations = ruleRegistry.map((rule) => {
    const candidateResult = candidateRequirements(factors, candidateLedgers);
    const missingRequirements = [
      {
        kind: "rule" as const,
        code: "rule_activation_pending",
        dimension: null,
        detail:
          "This rule is registered for audit but cannot activate until complete analyzers have their own approved milestone",
      },
      ...coverageRequirements(rule, coverage),
      ...factorRequirements(rule, factors),
      ...candidateResult.missing,
    ];
    return {
      evaluation: {
        ruleId: rule.id,
        status: missingRequirements.length === 0
          ? "applicable" as const
          : "blocked" as const,
        missingRequirements,
      },
      safeCandidates: candidateResult.safeCandidates,
    };
  });
  return {
    coachJudgement: null,
    blockedRules: evaluations.map((item) => item.evaluation),
  };
}
