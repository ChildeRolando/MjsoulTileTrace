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
  type FactEngineDiagnostic,
  type FactEngineLimitationCode,
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
  dama_point: ["value", "dama_point"],
  riichi_point: ["value", "riichi_point"],
  mixed_waits_score: ["efficiency", "mixed_waits_score"],
  avg_agari_rate: ["efficiency", "avg_agari_rate"],
  furiten_rate: ["value", "furiten_rate"],
  mixed_round_point: ["placement", "helper_mixed_round_point"],
} as const satisfies Record<string, readonly [LedgerAxis, string]>;

const estimateUnits: Record<keyof typeof estimateDimensions, string> = {
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

const limitationMessages: Record<FactEngineLimitationCode, string> = {
  helper_yaku_mapping_versioned: "役种 ID 与名称来自固定版本 mahjong-helper",
  helper_dama_point_estimate: "默听或副露打点是固定版本 mahjong-helper 的估算",
  helper_riichi_point_estimate: "立直打点是固定版本 mahjong-helper 的估算",
  helper_mixed_waits_score: "综合待牌速度是固定版本 mahjong-helper 的启发式指标",
  helper_avg_agari_rate_not_calibrated: "和率是上游估算，不是本项目校准概率",
  helper_furiten_rate: "振听率是固定版本 mahjong-helper 的启发式指标",
  helper_mixed_round_point_not_placement_ev: "局收支是上游估算，不是本项目的顺位 EV",
  theoretical_visibility: "公共可见信息不完整，使用理论剩余枚数",
  completed_hand_han_fu_unavailable: "上游公开接口不提供番数与符数",
  completed_hand_context_limited: "未提供的包牌和场况役不会被推断",
  helper_risk_not_mortal_probability: "危险度是固定版本启发式量，不是 Mortal 放铳概率",
  threats_analyzed_independently: "各威胁者独立分析，不能合并为单一概率",
  structural_labels_separate: "筋、壁与 one-chance 标签分别保留",
};

function mapLimitations(codes: readonly FactEngineLimitationCode[]): string[] {
  return codes.map((code) => limitationMessages[code]);
}

function mapDiagnostics(diagnostics: readonly FactEngineDiagnostic[]): string[] {
  return diagnostics.map((diagnostic) => {
    if (diagnostic.code === "dora_count_blocked_missing_facts") {
      return "宝牌指示牌信息不完整，宝牌数未计算";
    }
    if (diagnostic.code === "estimate_blocked_missing_facts") {
      return `计算 ${diagnostic.field} 所需事实不完整`;
    }
    return `上游返回的 ${diagnostic.field} 超出约定范围`;
  });
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
  const yakuEstimate = estimates.get("yaku_types");
  if (yakuEstimate?.field === "yaku_types") {
    const yakuLimitations = [
      ...mapLimitations(yakuEstimate.limitations),
      `Pinned mahjong-helper commit ${result.identity.upstreamCommit}`,
    ];
    byAxis.get("value")!.push(heuristicFact(
      "value.yaku_ids",
      "yaku_ids",
      { kind: "integer_ids", values: yakuEstimate.yakuValues.map((yaku) => yaku.id) },
      resultIds,
      yakuLimitations,
      result.identity,
    ));
    byAxis.get("value")!.push(heuristicFact(
      "value.yaku_names",
      "yaku_names",
      {
        kind: "string_set",
        values: yakuEstimate.yakuValues.map((yaku) => yaku.name).sort(),
      },
      resultIds,
      yakuLimitations,
      result.identity,
    ));
  } else {
    for (const dimension of ["yaku_ids", "yaku_names"] as const) {
      byAxis.get("value")!.push(blockedHeuristicFact(
        `value.${dimension}`,
        dimension,
        "blocked_missing_facts",
        resultIds,
        ["Required inputs for yaku_types were not complete"],
      ));
    }
  }
  for (const [field, [axis, dimension]] of Object.entries(
    estimateDimensions,
  ) as Array<[keyof typeof estimateDimensions, readonly [LedgerAxis, string]]>) {
    const estimate = estimates.get(field);
    if (estimate === undefined || !("numericValue" in estimate)) {
      byAxis.get(axis)!.push(blockedHeuristicFact(
        `${axis}.${dimension}`,
        dimension,
        "blocked_missing_facts",
        resultIds,
        [`Required inputs for ${field} were not complete`],
      ));
      continue;
    }
    const value = {
      kind: "number" as const,
      value: estimate.numericValue,
      unit: estimateUnits[field],
    };
    byAxis.get(axis)!.push(heuristicFact(
      `${axis}.${dimension}`,
      dimension,
      value,
      resultIds,
      [
        ...mapLimitations(estimate.limitations),
        `Pinned mahjong-helper commit ${result.identity.upstreamCommit}`,
      ],
      result.identity,
    ));
  }
  diagnostics.push(...mapDiagnostics(result.diagnostics));
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
    "deterministic_under_assumptions",
    mapLimitations(result.limitations),
  ));
  byAxis.get("value")!.push(deterministicFact(
    "value.completed_hand_fixed_point",
    "completed_hand_fixed_point",
    { kind: "number", value: result.fixedPoint, unit: "points" },
    resultIds,
    result.identity,
    "deterministic_under_assumptions",
    mapLimitations(result.limitations),
  ));
  for (const dimension of ["han", "fu"] as const) {
    byAxis.get("value")!.push(blockedDeterministicFact(
      `value.${dimension}`,
      dimension,
      "unsupported_upstream_api",
      resultIds,
      mapLimitations(result.limitations),
    ));
  }
  diagnostics.push(...mapDiagnostics(result.diagnostics));
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
      mapLimitations(result.limitations),
      result.identity,
    ));
    const classifications = unique(result.classifications
      .filter((classification) => classification.tile34 === tile34)
      .map((classification) => classification.kind))
      .sort();
    if (classifications.length > 0) {
      byAxis.get("defense")!.push(heuristicFact(
        `defense.helper_classifications.actor${result.threatActor}`,
        `helper_classifications:actor${result.threatActor}`,
        { kind: "string_set", values: classifications },
        evidence,
        mapLimitations(result.limitations),
        result.identity,
      ));
    }
    const honor = result.honorClassifications.find(
      (classification) => classification.tile34 === tile34,
    );
    if (honor !== undefined) {
      byAxis.get("defense")!.push(heuristicFact(
        `defense.helper_honor.actor${result.threatActor}`,
        `helper_honor:actor${result.threatActor}`,
        {
          kind: "honor_safety",
          remainingCount: honor.remainingCount,
          category: honor.category,
        },
        evidence,
        mapLimitations(result.limitations),
        result.identity,
      ));
    }
    byAxis.get("defense")!.push(heuristicFact(
      `defense.helper_left_no_suji.actor${result.threatActor}`,
      `helper_left_no_suji:actor${result.threatActor}`,
      { kind: "boolean", value: result.leftNoSujiTile34.includes(tile34) },
      evidence,
      mapLimitations(result.limitations),
      result.identity,
    ));
    diagnostics.push(...mapDiagnostics(result.diagnostics));
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
