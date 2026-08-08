import {
  CandidateFactorLedgerSchema,
  CompletedHandFactResultSchema,
  Hand13FactResultSchema,
  ThreatRiskFactResultSchema,
  type CandidateFactorLedger,
  type ComparisonScope,
  type CompletedHandFactResult,
  type EngineIdentity,
  type FactorAxisLedger,
  type FactorFact,
  type Hand13FactResult,
  type KnownGameFacts,
  type StructuredComparisonCandidate,
  type ThreatRiskFactResult,
} from "@riichi-coach/contracts";
import type { CandidateProjection } from "./candidate-projector.js";
import { tileIdTo34 } from "./tile34.js";
import { buildLocalDefenseFacts } from "./local-defense.js";

export type FactEngineOutcome<T> =
  | { status: "calculated"; result: T }
  | { status: "blocked_engine_failure"; diagnostic: string };

export type ThreatRiskEngineOutcome =
  | { status: "calculated"; result: ThreatRiskFactResult }
  | {
      status: "blocked_engine_failure";
      threatActor: number;
      diagnostic: string;
    };

type ReadyProjection = Extract<CandidateProjection, { status: "ready" }>;

export interface CandidateLedgerBuildInput {
  candidate: StructuredComparisonCandidate;
  facts: KnownGameFacts;
  scope: ComparisonScope;
  projection: ReadyProjection;
  hand13Outcome?: FactEngineOutcome<Hand13FactResult>;
  completedHandOutcome?: FactEngineOutcome<CompletedHandFactResult>;
  threatRiskOutcomes: ThreatRiskEngineOutcome[];
}

const axes = [
  "efficiency",
  "value",
  "defense",
  "placement",
  "option_value",
] as const;
type LedgerAxis = typeof axes[number];

const estimateDimensions = {
  yaku_types: ["value", "yaku_types"],
  dama_point: ["value", "dama_point"],
  riichi_point: ["value", "riichi_point"],
  mixed_waits_score: ["efficiency", "mixed_waits_score"],
  avg_agari_rate: ["efficiency", "avg_agari_rate"],
  furiten_rate: ["value", "furiten_rate"],
  mixed_round_point: ["placement", "helper_mixed_round_point"],
} as const satisfies Record<string, readonly [LedgerAxis, string]>;

const estimateUnits: Record<keyof typeof estimateDimensions, string> = {
  yaku_types: "yaku_ids",
  dama_point: "points",
  riichi_point: "points",
  mixed_waits_score: "helper_mixed_waits_score",
  avg_agari_rate: "percent",
  furiten_rate: "helper_furiten_rate",
  mixed_round_point: "helper_round_points",
};

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function resultEvidence(
  requestId: string,
  localEvidenceIds: readonly string[],
): string[] {
  return unique([requestId, ...localEvidenceIds]);
}

function deterministicFact(
  factorKey: string,
  dimension: string,
  value: FactorFact["value"],
  evidenceIds: string[],
  engineIdentity: EngineIdentity,
  evidenceClass: "deterministic_allowlisted" | "deterministic_under_assumptions" =
    "deterministic_allowlisted",
  limitations: string[] = [],
): FactorFact {
  if (value === undefined) throw new Error("deterministic fact requires value");
  return {
    factorKey,
    dimension,
    status: "calculated",
    evidenceClass,
    preferenceEligibility: "deterministic",
    engineIdentity,
    value,
    evidenceIds,
    limitations,
  };
}

function blockedDeterministicFact(
  factorKey: string,
  dimension: string,
  status: "blocked_missing_facts" | "blocked_engine_failure" |
    "unsupported_upstream_api",
  evidenceIds: string[],
  limitations: string[],
): FactorFact {
  return {
    factorKey,
    dimension,
    status,
    evidenceClass: "deterministic_allowlisted",
    preferenceEligibility: "ineligible",
    evidenceIds,
    limitations,
  };
}

function heuristicFact(
  factorKey: string,
  dimension: string,
  value: FactorFact["value"],
  evidenceIds: string[],
  limitations: string[],
  engineIdentity: EngineIdentity,
): FactorFact {
  if (value === undefined) throw new Error("heuristic fact requires value");
  return {
    factorKey,
    dimension,
    status: "calculated",
    evidenceClass: "versioned_upstream_estimate",
    preferenceEligibility: "heuristic_only",
    engineIdentity,
    value,
    evidenceIds,
    limitations,
  };
}

function blockedHeuristicFact(
  factorKey: string,
  dimension: string,
  status: "blocked_missing_facts" | "blocked_engine_failure",
  evidenceIds: string[],
  limitations: string[],
): FactorFact {
  return {
    factorKey,
    dimension,
    status,
    evidenceClass: "versioned_upstream_estimate",
    preferenceEligibility: "heuristic_only",
    evidenceIds,
    limitations,
  };
}

function mapHand13(
  input: CandidateLedgerBuildInput,
  byAxis: Map<LedgerAxis, FactorFact[]>,
  diagnostics: string[],
): void {
  const outcome = input.hand13Outcome;
  const evidence = input.projection.localEvidenceIds;
  if (outcome === undefined || outcome.status === "blocked_engine_failure") {
    const diagnostic = outcome?.diagnostic ?? "hand13 result is missing";
    diagnostics.push(diagnostic);
    for (const [axis, dimension] of [
      ["efficiency", "shanten"],
      ["efficiency", "ukeire_remaining"],
      ["value", "dora_count"],
    ] as const) {
      byAxis.get(axis)!.push(blockedDeterministicFact(
        `${axis}.${dimension}`,
        dimension,
        "blocked_engine_failure",
        [...evidence],
        [diagnostic],
      ));
    }
    for (const [field, [axis, dimension]] of Object.entries(
      estimateDimensions,
    ) as Array<[keyof typeof estimateDimensions, readonly [LedgerAxis, string]]>) {
      byAxis.get(axis)!.push(blockedHeuristicFact(
        `${axis}.${dimension}`,
        dimension,
        "blocked_engine_failure",
        [...evidence],
        [`No ${field} result: ${diagnostic}`],
      ));
    }
    return;
  }

  const result = Hand13FactResultSchema.parse(outcome.result);
  const resultIds = resultEvidence(result.requestId, evidence);
  byAxis.get("efficiency")!.push(deterministicFact(
    "efficiency.shanten",
    "shanten",
    { kind: "number", value: result.shanten, unit: "shanten" },
    resultIds,
    result.identity,
  ));
  byAxis.get("efficiency")!.push(deterministicFact(
    "efficiency.effective_tile_types",
    "effective_tile_types",
    { kind: "integer_ids", values: [...result.effectiveTile34] },
    resultIds,
    result.identity,
  ));
  if (result.waitsRemainingStatus === "calculated") {
    byAxis.get("efficiency")!.push(deterministicFact(
      "efficiency.ukeire_remaining",
      "ukeire_remaining",
      { kind: "tile_counts", value: result.waitsRemaining.map((entry) => ({ ...entry })) },
      resultIds,
      result.identity,
      "deterministic_under_assumptions",
    ));
  } else {
    byAxis.get("efficiency")!.push(blockedDeterministicFact(
      "efficiency.ukeire_remaining",
      "ukeire_remaining",
      "blocked_missing_facts",
      resultIds,
      ["Complete public visibility is required for live remaining counts"],
    ));
  }
  for (const improve of result.improves) {
    byAxis.get("efficiency")!.push(deterministicFact(
      `efficiency.improve.draw${improve.drawTile34}`,
      `improve_waits:draw${improve.drawTile34}`,
      { kind: "tile_counts", value: improve.bestWaits.map((entry) => ({ ...entry })) },
      resultIds,
      result.identity,
      "deterministic_under_assumptions",
      input.projection.hand13Request?.visibleCountsComplete === false
        ? ["Uses theoretical unseen counts because public visibility is incomplete"]
        : [],
    ));
  }

  if (result.doraCountStatus === "calculated" && result.doraCount !== null) {
    byAxis.get("value")!.push(deterministicFact(
      "value.dora_count",
      "dora_count",
      { kind: "number", value: result.doraCount, unit: "dora_count" },
      resultIds,
      result.identity,
    ));
  } else {
    byAxis.get("value")!.push(blockedDeterministicFact(
      "value.dora_count",
      "dora_count",
      "blocked_missing_facts",
      resultIds,
      ["Complete dora indicators are required"],
    ));
  }

  const estimates = new Map(result.estimates.map((estimate) => [
    estimate.field,
    estimate,
  ]));
  for (const [field, [axis, dimension]] of Object.entries(
    estimateDimensions,
  ) as Array<[keyof typeof estimateDimensions, readonly [LedgerAxis, string]]>) {
    const estimate = estimates.get(field);
    if (estimate === undefined) {
      byAxis.get(axis)!.push(blockedHeuristicFact(
        `${axis}.${dimension}`,
        dimension,
        "blocked_missing_facts",
        resultIds,
        [`Required inputs for ${field} were not complete`],
      ));
      continue;
    }
    const value = estimate.numericValue !== undefined
      ? {
          kind: "number" as const,
          value: estimate.numericValue,
          unit: estimateUnits[field],
        }
      : {
          kind: "integer_ids" as const,
          values: [...(estimate.integerValues ?? [])],
        };
    byAxis.get(axis)!.push(heuristicFact(
      `${axis}.${dimension}`,
      dimension,
      value,
      resultIds,
      [
        ...estimate.limitations,
        `Pinned mahjong-helper commit ${result.identity.upstreamCommit}`,
      ],
      result.identity,
    ));
  }
  diagnostics.push(...result.diagnostics);
}

function mapCompletedHand(
  input: CandidateLedgerBuildInput,
  byAxis: Map<LedgerAxis, FactorFact[]>,
  diagnostics: string[],
): void {
  const outcome = input.completedHandOutcome;
  const evidence = input.projection.localEvidenceIds;
  if (outcome === undefined || outcome.status === "blocked_engine_failure") {
    const diagnostic = outcome?.diagnostic ?? "completed-hand result is missing";
    diagnostics.push(diagnostic);
    byAxis.get("value")!.push(blockedDeterministicFact(
      "value.completed_hand_point",
      "completed_hand_point",
      "blocked_engine_failure",
      [...evidence],
      [diagnostic],
    ));
    return;
  }
  const result = CompletedHandFactResultSchema.parse(outcome.result);
  const resultIds = resultEvidence(result.requestId, evidence);
  byAxis.get("value")!.push(deterministicFact(
    "value.completed_hand_point",
    "completed_hand_point",
    { kind: "number", value: result.point, unit: "points" },
    resultIds,
    result.identity,
  ));
  byAxis.get("value")!.push(heuristicFact(
    "value.completed_hand_fixed_point",
    "completed_hand_fixed_point",
    { kind: "number", value: result.fixedPoint, unit: "points" },
    resultIds,
    [...result.limitations],
    result.identity,
  ));
  for (const dimension of ["han", "fu"] as const) {
    byAxis.get("value")!.push(blockedDeterministicFact(
      `value.${dimension}`,
      dimension,
      "unsupported_upstream_api",
      resultIds,
      [...result.limitations],
    ));
  }
  diagnostics.push(...result.diagnostics);
}

function mapThreatRisk(
  input: CandidateLedgerBuildInput,
  byAxis: Map<LedgerAxis, FactorFact[]>,
  diagnostics: string[],
): void {
  if (
    input.candidate.action.kind !== "discard" &&
    input.candidate.action.kind !== "riichi_discard"
  ) {
    return;
  }
  const tile34 = tileIdTo34(input.candidate.action.tile.id);
  for (const outcome of input.threatRiskOutcomes) {
    if (outcome.status === "blocked_engine_failure") {
      diagnostics.push(outcome.diagnostic);
      byAxis.get("defense")!.push(blockedHeuristicFact(
        `defense.helper_risk.actor${outcome.threatActor}`,
        `helper_risk_scale:actor${outcome.threatActor}`,
        "blocked_engine_failure",
        [...input.projection.localEvidenceIds],
        [outcome.diagnostic],
      ));
      continue;
    }
    const result = ThreatRiskFactResultSchema.parse(outcome.result);
    const evidence = resultEvidence(
      result.requestId,
      unique([...input.projection.localEvidenceIds, ...result.evidenceIds]),
    );
    byAxis.get("defense")!.push(heuristicFact(
      `defense.helper_risk.actor${result.threatActor}`,
      `helper_risk_scale:actor${result.threatActor}`,
      {
        kind: "number",
        value: result.riskScale[tile34]!,
        unit: "helper_risk_scale",
      },
      evidence,
      [...result.limitations],
      result.identity,
    ));
    for (const classification of result.classifications.filter(
      (classification) => classification.tile34 === tile34,
    )) {
      byAxis.get("defense")!.push(heuristicFact(
        `defense.helper_classification.actor${result.threatActor}.${classification.kind}`,
        `helper_classification:actor${result.threatActor}:${classification.kind}`,
        { kind: "classification", value: classification.kind },
        evidence,
        [...result.limitations],
        result.identity,
      ));
    }
    byAxis.get("defense")!.push(heuristicFact(
      `defense.helper_left_no_suji.actor${result.threatActor}`,
      `helper_left_no_suji:actor${result.threatActor}`,
      { kind: "boolean", value: result.leftNoSujiTile34.includes(tile34) },
      evidence,
      [...result.limitations],
      result.identity,
    ));
    diagnostics.push(...result.diagnostics);
  }
}

function axisInScope(axis: LedgerAxis, scope: ComparisonScope): boolean {
  if (scope.kind === "single_axis") return axis === scope.axis;
  if (scope.kind === "flat_discard") {
    return axis === "efficiency" || axis === "value";
  }
  return true;
}

function axisStatus(facts: FactorFact[]): FactorAxisLedger["status"] {
  if (facts.some((fact) => fact.status === "calculated")) return "calculated";
  if (facts.some((fact) => fact.status === "blocked_engine_failure")) {
    return "blocked_engine_failure";
  }
  if (facts.some((fact) => fact.status === "blocked_missing_facts")) {
    return "blocked_missing_facts";
  }
  if (facts.some((fact) => fact.status === "unsupported_action_in_slice")) {
    return "unsupported_action_in_slice";
  }
  return "unsupported_dimension";
}

export function buildCandidateLedger(
  input: CandidateLedgerBuildInput,
): CandidateFactorLedger {
  const byAxis = new Map<LedgerAxis, FactorFact[]>(
    axes.map((axis) => [axis, []]),
  );
  const diagnostics = [...input.projection.diagnostics];
  if (input.projection.hand13Request !== undefined) {
    mapHand13(input, byAxis, diagnostics);
  }
  if (input.projection.completedHandRequest !== undefined) {
    mapCompletedHand(input, byAxis, diagnostics);
  }
  byAxis.get("defense")!.push(
    ...buildLocalDefenseFacts(input.candidate, input.facts),
  );
  mapThreatRisk(input, byAxis, diagnostics);

  const ledgers: FactorAxisLedger[] = axes.map((axis) => {
    if (!axisInScope(axis, input.scope)) {
      return { axis, status: "skipped_out_of_scope", facts: [] };
    }
    let facts = byAxis.get(axis)!;
    if (
      input.scope.kind === "single_axis" &&
      input.scope.dimension !== undefined
    ) {
      const dimension = input.scope.dimension;
      facts = facts.filter((fact) => fact.dimension === dimension);
    }
    return { axis, status: axisStatus(facts), facts };
  });
  return CandidateFactorLedgerSchema.parse({
    actionRef: input.candidate.actionRef,
    projectedStateRef: input.projection.projectedStateRef,
    axes: ledgers,
    diagnostics: unique(diagnostics),
  });
}
