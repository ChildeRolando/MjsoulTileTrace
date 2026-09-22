import {
  FixedReviewDetailSchema, FixedReviewSnapshotSchema,
  type FixedReviewDetailDto, type FixedReviewSnapshotDto,
  type ReviewReport, type ReviewSelectionResult, type StructuredAnalysisPackage,
} from "@riichi-coach/contracts";
import { composeReviewReadBackContext } from "@riichi-coach/reasoning";

const OUTCOMES = [
  "analysis_ready", "unsupported_action", "source_row_not_expected", "no_mortal_entry",
  "binding_mismatch", "model_output_incomplete", "analysis_blocked",
] as const;
const AXES = ["efficiency", "value", "defense", "placement", "option_value"] as const;

type ReadyDecision = Extract<StructuredAnalysisPackage["decisions"][number], { outcome: "analysis_ready" }>;
type GraphNode = ReturnType<typeof composeReviewReadBackContext>["currentGraph"]["nodes"][number];

function actionLabel(action: unknown): string {
  if (action === null || typeof action !== "object" || Array.isArray(action)) return "未知行动";
  const value = action as Record<string, unknown>;
  const tile = (candidate: unknown): string => {
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const id = (candidate as Record<string, unknown>).id;
      if (typeof id === "string") return id;
    }
    return "";
  };
  const names: Record<string, string> = {
    discard: "打牌", riichi_discard: "立直打牌", declare_riichi: "立直", tsumo: "自摸",
    ron: "荣和", chi: "吃", pon: "碰", daiminkan: "大明杠", ankan: "暗杠", kakan: "加杠", none: "跳过",
  };
  const kind = typeof value.kind === "string" ? value.kind : "unknown";
  const tileText = tile(value.tile) || tile(value.addedTile);
  return `${names[kind] ?? "行动"}${tileText === "" ? "" : ` ${tileText}`}`;
}

function readyDecision(pkg: StructuredAnalysisPackage, decisionId: string): ReadyDecision {
  const decision = pkg.decisions.find((candidate) => candidate.decisionId === decisionId);
  if (decision?.outcome !== "analysis_ready") throw new Error("fixed_review_unavailable");
  return decision;
}

function actionDto(decision: ReadyDecision, actionRef: string | null) {
  if (actionRef === null) {
    const action = decision.normalizedDecisionContext.actualAction;
    return action === null ? null : { actionRef: null, label: actionLabel(action) };
  }
  const candidate = decision.comparisonSet.candidates.find((item) => item.actionRef === actionRef);
  if (candidate === undefined) throw new Error("fixed_review_unavailable");
  return { actionRef, label: actionLabel(candidate.action) };
}

function actualActionDto(decision: ReadyDecision) {
  const candidate = decision.comparisonSet.candidates.find((item) => item.origins.includes("actual"));
  return candidate === undefined
    ? actionDto(decision, null)
    : { actionRef: candidate.actionRef, label: actionLabel(candidate.action) };
}

function mortalActions(decision: ReadyDecision) {
  const scoreMethodLabel = decision.modelEvaluation.scoreMethod === "mortal_probability_x100"
    ? "Mortal 行动概率 × 100" as const
    : "Akagi 选择分 softmax × 100" as const;
  return decision.modelEvaluation.preferredActions.map((actionRef) => {
    const score = decision.modelEvaluation.candidates.find((item) => item.actionRef === actionRef)?.modelSelectionScore;
    if (score === undefined) throw new Error("fixed_review_unavailable");
    return { ...actionDto(decision, actionRef)!, score, scoreUnit: "模型选择分" as const, scoreMethodLabel };
  });
}

function explanationStatus(report: ReviewReport | null, decisionId: string) {
  if (report === null) return "not_generated" as const;
  const entry = report.decisionEntries.find((item) => item.decisionId === decisionId);
  if (entry === undefined) throw new Error("fixed_review_unavailable");
  if (entry.explanationStatus === "not_selected") throw new Error("fixed_review_unavailable");
  return entry.explanationStatus;
}

function scalar(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : null;
}

function placeholderValue(nodes: readonly GraphNode[], token: string): { text: string; sourceRef: string } {
  const match = /^\{(diff|candidate):([^{}.]+)\.([^{}]+)\}$/.exec(token);
  if (match === null) throw new Error("fixed_review_unavailable");
  const [, kind, ref, path] = match;
  const nodeKind = kind === "diff" ? "FactorDifference" : "CandidateAction";
  const key = kind === "diff" ? "differenceId" : "actionRef";
  const node = nodes.find((candidate) => {
    const payload = candidate.payload as Record<string, unknown>;
    return candidate.nodeKind === nodeKind && payload[key] === ref;
  });
  if (node === undefined) throw new Error("fixed_review_unavailable");
  let value: unknown = node.payload;
  for (const segment of path!.split(".")) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("fixed_review_unavailable");
    value = (value as Record<string, unknown>)[segment];
  }
  const text = scalar(value);
  if (text === null) throw new Error("fixed_review_unavailable");
  return { text, sourceRef: node.nodeId };
}

function explanationSegments(nodes: readonly GraphNode[], text: string) {
  const tokens = text.split(/(\{[^{}]*\})/g).filter((part) => part !== "");
  return tokens.map((token) => token.startsWith("{")
    ? { kind: "evidence_value" as const, ...placeholderValue(nodes, token) }
    : { kind: "text" as const, text: token });
}

const AXIS_LABELS: Readonly<Record<string, string>> = {
  efficiency: "牌效率", value: "打点价值", defense: "防守", placement: "顺位", option_value: "选择空间",
};
const DIMENSION_LABELS: Readonly<Record<string, string>> = {
  overall_shanten: "整体向听数", overall_effective_tile_types: "有效牌种类",
  overall_effective_tiles_remaining: "有效进张", wait_tiles_remaining: "听牌剩余张数",
  wait_tiles: "听牌牌种", ron_eligible_wait_count: "可荣牌种数", ron_eligible_wait_tiles: "可荣牌种",
  dora_count: "宝牌数", dama_point: "默听打点", shape_claims: "牌形组成", wait_details: "听牌明细",
};
const UNIT_LABELS: Readonly<Record<string, string>> = {
  shanten: "向听", tiles_remaining: "张", tile_types: "种", points: "点", dora_count: "枚",
};

function tile34Label(tile34: number): string {
  if (tile34 < 0 || tile34 > 33) throw new Error("fixed_review_unavailable");
  if (tile34 < 9) return `${tile34 + 1}m`;
  if (tile34 < 18) return `${tile34 - 8}p`;
  if (tile34 < 27) return `${tile34 - 17}s`;
  return `${tile34 - 26}z`;
}

function dimensionLabel(dimension: unknown): string {
  if (typeof dimension !== "string") return "分析指标";
  const familyMatch = /^family_(.+):(standard|chiitoitsu|kokushi)$/.exec(dimension);
  if (familyMatch !== null) {
    const family = { standard: "一般形", chiitoitsu: "七对子", kokushi: "国士无双" }[familyMatch[2]!];
    const base = DIMENSION_LABELS[`overall_${familyMatch[1]}`] ?? "手牌指标";
    return `${family} · ${base}`;
  }
  return DIMENSION_LABELS[dimension] ?? "分析指标";
}

function scopeLabel(dimension: unknown): string | null {
  if (typeof dimension !== "string") return null;
  if (dimension.startsWith("overall_")) return "整手范围";
  const family = /:(standard|chiitoitsu|kokushi)$/.exec(dimension)?.[1];
  return family === undefined ? null : ({ standard: "一般形", chiitoitsu: "七对子", kokushi: "国士无双" }[family] ?? null);
}

function evidenceValue(value: unknown, dimension: unknown): { value: string; tiles: Array<{ tile: string; count: number | null }> } {
  if (value === undefined) return { value: "暂不可用", tiles: [] };
  if (value === null || typeof value !== "object" || Array.isArray(value)) return { value: String(value), tiles: [] };
  const item = value as Record<string, unknown>;
  if (item.kind === "number" && typeof item.value === "number") {
    const unit = typeof item.unit === "string" ? (UNIT_LABELS[item.unit] ?? "") : "";
    return { value: `${item.value}${unit}`, tiles: [] };
  }
  if (item.kind === "tile_counts" && Array.isArray(item.value)) {
    const tiles = item.value.map((entry) => {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) throw new Error("fixed_review_unavailable");
      const pair = entry as Record<string, unknown>;
      if (!Number.isInteger(pair.tile34) || !Number.isInteger(pair.count) || Number(pair.count) < 0) throw new Error("fixed_review_unavailable");
      return { tile: tile34Label(Number(pair.tile34)), count: Number(pair.count) };
    });
    return { value: `${tiles.length} 种，共 ${tiles.reduce((sum, tile) => sum + (tile.count ?? 0), 0)} 张`, tiles };
  }
  if (item.kind === "integer_ids" && Array.isArray(item.values) && typeof dimension === "string" && /tile/.test(dimension)) {
    const tiles = item.values.map((entry) => ({ tile: tile34Label(Number(entry)), count: null }));
    return { value: tiles.length === 0 ? "无" : `${tiles.length} 种（剩余张数未知）`, tiles };
  }
  if (item.kind === "classification" && typeof item.value === "string") {
    return { value: ({ applicable: "适用", unavailable: "不可用" } as Record<string, string>)[item.value] ?? "已分类", tiles: [] };
  }
  if (item.kind === "string_set" && Array.isArray(item.values)) return { value: `${item.values.length} 项`, tiles: [] };
  return { value: "已记录（详细结构不在本页面展示）", tiles: [] };
}

function summarizeEvidence(node: GraphNode): string {
  const payload = node.payload as Record<string, unknown>;
  if (node.nodeKind === "FactorDifference") {
    const relation = payload.valueRelation === "equal" ? "两项相同" : payload.direction === "supports_left" ? "左侧行动更优" : payload.direction === "supports_right" ? "右侧行动更优" : "两项存在差异";
    return `${AXIS_LABELS[String(payload.axis)] ?? "确定性比较"} · ${dimensionLabel(payload.dimension)} · ${relation}`;
  }
  if (node.nodeKind === "FactorFact") {
    const rendered = evidenceValue(payload.value, payload.dimension);
    return `${AXIS_LABELS[String(payload.axis)] ?? "候选事实"} · ${dimensionLabel(payload.dimension)}：${rendered.value}`;
  }
  if (node.nodeKind === "KnownGameFact") return "牌谱记录与重放确认的当前局面事实";
  return typeof payload.statement === "string" ? payload.statement : "教练基于当前证据形成的推断";
}

function provenanceDetails(node: GraphNode, decision: ReadyDecision) {
  const payload = node.payload as Record<string, unknown>;
  if (node.nodeKind === "FactorFact") {
    const rendered = evidenceValue(payload.value, payload.dimension);
    return [{ label: dimensionLabel(payload.dimension), value: rendered.value, scope: scopeLabel(payload.dimension), tiles: rendered.tiles }];
  }
  if (node.nodeKind === "FactorDifference") {
    const left = evidenceValue(payload.leftValue, payload.dimension);
    const right = evidenceValue(payload.rightValue, payload.dimension);
    return [
      { label: `左侧 ${actionDto(decision, String(payload.leftActionRef))!.label}`, value: left.value, scope: scopeLabel(payload.dimension), tiles: left.tiles },
      { label: `右侧 ${actionDto(decision, String(payload.rightActionRef))!.label}`, value: right.value, scope: scopeLabel(payload.dimension), tiles: right.tiles },
    ];
  }
  return [];
}

export function presentFixedReviewSnapshot(input: {
  analysisPackage: StructuredAnalysisPackage;
  selection: ReviewSelectionResult;
  activeReport?: ReviewReport | null;
  activeReportRefId?: string | null;
}): FixedReviewSnapshotDto {
  const context = composeReviewReadBackContext(input.analysisPackage, input.selection, input.activeReport ?? null);
  const report = context.report;
  const outcomeCounts = Object.fromEntries(OUTCOMES.map((outcome) => [outcome, 0])) as Record<typeof OUTCOMES[number], number>;
  for (const decision of context.analysisPackage.decisions) outcomeCounts[decision.outcome] += 1;
  const items = context.selection.selected.map((selected) => {
    const decision = readyDecision(context.analysisPackage, selected.decisionId);
    const presentAxes = new Set(decision.factorDifferences.map((difference) => difference.axis));
    return {
      ...selected,
      roundOrdinal: decision.roundOrdinal,
      decisionWindowKind: decision.normalizedDecisionContext.decisionWindowKind,
      actualAction: actualActionDto(decision),
      mortalPreferredActions: mortalActions(decision),
      errorGap: decision.modelEvaluation.errorGap,
      tags: AXES.filter((axis) => presentAxes.has(axis)),
      explanationStatus: explanationStatus(report, selected.decisionId),
    };
  });
  const explanationCounts = { ready: 0, provider_unavailable: 0, request_failed: 0, invalid_output: 0 };
  for (const item of items) if (item.explanationStatus !== "not_generated") explanationCounts[item.explanationStatus] += 1;
  return Object.freeze(FixedReviewSnapshotSchema.parse({
    schemaVersion: "fixed-review-view/v1",
    packageId: context.analysisPackage.packageId,
    analysisStatus: context.analysisPackage.record.status,
    outcomeCounts,
    selection: { policyVersion: context.selection.policyVersion, selectedCount: items.length, items },
    activeReportRefId: input.activeReportRefId ?? null,
    activeReportStatus: report?.generationStatus ?? "not_generated",
    explanationCounts,
  }));
}

export function presentFixedReviewDetail(input: {
  analysisPackage: StructuredAnalysisPackage;
  selection: ReviewSelectionResult;
  activeReport?: ReviewReport | null;
  activeReportRefId?: string | null;
  decisionId: string;
}): FixedReviewDetailDto {
  const context = composeReviewReadBackContext(input.analysisPackage, input.selection, input.activeReport ?? null);
  const decision = readyDecision(context.analysisPackage, input.decisionId);
  const scoped = context.decisionContext(input.decisionId);
  const judgments = scoped.nodes.filter((node) => node.nodeKind === "CoachJudgment").map((node) => {
    const payload = node.payload as { recommendation: string; confidence: "high" | "medium" | "low"; premiseRefs: string[] };
    for (const ref of payload.premiseRefs) context.resolveDecisionRef(input.decisionId, ref);
    return { recommendation: actionDto(decision, payload.recommendation)!, confidence: payload.confidence, premiseRefs: payload.premiseRefs };
  });
  const explanations = scoped.nodes.filter((node) => node.nodeKind === "Explanation").map((node) => {
    const payload = node.payload as { text: string; claims: Array<{ evidenceRef: string }> };
    const evidenceRefs = payload.claims.map((claim) => context.resolveDecisionRef(input.decisionId, claim.evidenceRef).nodeId);
    return { segments: explanationSegments(scoped.nodes, payload.text), evidenceRefs };
  });
  const provenance = scoped.nodes.filter((node) =>
    node.nodeKind === "KnownGameFact" || node.nodeKind === "FactorDifference" || node.nodeKind === "FactorFact" || node.nodeKind === "CoachInference"
  ).map((node) => {
    const payload = node.payload as Record<string, unknown>;
    const actionRef = node.nodeKind === "FactorFact" && typeof payload.actionRef === "string" ? payload.actionRef : null;
    const parentRefs = node.nodeKind === "CoachInference" && Array.isArray(payload.premiseRefs)
      ? payload.premiseRefs.map(String)
      : [];
    for (const ref of parentRefs) context.resolveDecisionRef(input.decisionId, ref);
    return ({
    displayRef: node.nodeId,
    category: node.nodeKind === "CoachInference" ? "coach_inference" as const
      : node.authority === "advisory" ? "advisory_signal" as const : "hard_evidence" as const,
    label: node.nodeKind === "KnownGameFact" ? "局面事实" : node.nodeKind === "FactorDifference" ? "候选差异" : node.nodeKind === "FactorFact" ? "候选事实" : "教练推断",
    summary: summarizeEvidence(node),
    relatedAction: actionRef === null ? null : actionDto(decision, actionRef),
    details: provenanceDetails(node, decision),
    parentRefs,
    producer: node.producer,
    producerVersion: node.producerVersion,
    sourceRefs: [...node.provenance],
  }); });
  return Object.freeze(FixedReviewDetailSchema.parse({
    schemaVersion: "fixed-review-detail/v1",
    packageId: context.analysisPackage.packageId,
    activeReportRefId: input.activeReportRefId ?? null,
    decisionId: input.decisionId,
    actual: actualActionDto(decision),
    mortal: mortalActions(decision),
    coachJudgments: judgments,
    explanations,
    provenance,
    explanationStatus: explanationStatus(context.report, input.decisionId),
  }));
}
