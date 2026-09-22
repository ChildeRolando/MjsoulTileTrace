import {
  FixedReviewDetailSchema, FixedReviewSnapshotSchema,
  sortTilesCanonical,
  type FixedReviewDetailDto, type FixedReviewSnapshotDto,
  type ReviewReport, type ReviewSelectionResult, type RiichiAction,
  type StructuredAnalysisPackage, type Tile,
} from "@riichi-coach/contracts";
import { composeReviewReadBackContext } from "@riichi-coach/reasoning";

const OUTCOMES = [
  "analysis_ready", "unsupported_action", "source_row_not_expected", "no_mortal_entry",
  "binding_mismatch", "model_output_incomplete", "analysis_blocked",
] as const;
const AXES = ["efficiency", "value", "defense", "placement", "option_value"] as const;

type ReadyDecision = Extract<StructuredAnalysisPackage["decisions"][number], { outcome: "analysis_ready" }>;
type GraphNode = ReturnType<typeof composeReviewReadBackContext>["currentGraph"]["nodes"][number];

function tileLabel(tile: Tile): string {
  return tile.red ? `赤${tile.id}` : tile.id;
}

function tileGroup(tiles: readonly Tile[]): string {
  return sortTilesCanonical(tiles).map(tileLabel).join("-");
}

function assertNever(value: never): never {
  throw new Error(`fixed_review_unavailable:${String(value)}`);
}

export function actionLabel(action: RiichiAction): string {
  switch (action.kind) {
    case "discard": return `打牌 ${tileLabel(action.tile)}`;
    case "riichi_discard": return `立直打牌 ${tileLabel(action.tile)}`;
    case "declare_riichi": return "立直";
    case "chi": return `吃 ${tileGroup([action.calledTile, ...action.consumedTiles])}（鸣牌 ${tileLabel(action.calledTile)}）`;
    case "pon": return `碰 ${tileGroup([action.calledTile, ...action.consumedTiles])}（鸣牌 ${tileLabel(action.calledTile)}）`;
    case "daiminkan": return `大明杠 ${tileGroup([action.calledTile, ...action.consumedTiles])}（鸣牌 ${tileLabel(action.calledTile)}）`;
    case "ankan": return `暗杠 ${tileGroup(action.tiles)}`;
    case "kakan": return `加杠 ${tileLabel(action.addedTile)}`;
    case "tsumo": return `自摸 ${tileLabel(action.winningTile)}`;
    case "ron": return `荣和 ${tileLabel(action.winningTile)}`;
    case "kyuushu_kyuuhai": return "九种九牌";
    case "pass": return "过";
    default: return assertNever(action);
  }
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
  discard_furiten: "舍牌振听", temporary_furiten: "同巡振听", riichi_furiten: "立直振听",
  best_families: "最优手牌类型", non_dominated_decomposition_count: "非支配分解数",
  decomposition_truncated: "牌形分解是否截断", base_ron_eligibility: "基础荣和资格",
  final_ron_eligibility_status: "最终荣和资格状态", effective_tile_types: "有效牌种类",
  ukeire_remaining: "有效进张", riichi_point: "立直打点", mixed_waits_score: "综合待牌速度",
  avg_agari_rate: "上游估算和率", furiten_rate: "上游振听率", helper_mixed_round_point: "上游局收支",
  completed_hand_point: "和牌点数", completed_hand_fixed_point: "固定场况和牌点数", han: "番数", fu: "符数",
  yaku_ids: "役种编号", yaku_names: "役种", family_applicability: "手牌类型适用性",
  family_shanten: "手牌类型向听数", family_effective_tile_types: "手牌类型有效牌",
  family_effective_tiles_remaining: "手牌类型有效进张", riichi_threat: "立直威胁",
  ippatsu_alive: "一发状态", genbutsu: "现物", helper_risk_scale: "结构风险刻度",
  helper_classifications: "结构风险分类", helper_honor: "字牌安全度",
};
const UNIT_LABELS: Readonly<Record<string, string>> = {
  shanten: "向听", tiles_remaining: "张", tile_types: "种", points: "点", dora_count: "枚",
  percent: "%", decompositions: "种", helper_mixed_waits_score: "（版本化待牌速度刻度）",
  helper_furiten_rate: "（版本化振听刻度）", helper_round_points: "点（上游局收支）",
  helper_risk_scale: "（版本化结构风险刻度）",
};
const FAMILY_LABELS: Readonly<Record<string, string>> = { standard: "一般形", chiitoitsu: "七对子", kokushi: "国士无双" };
const STRUCTURAL_CLASSIFICATION_LABELS: Readonly<Record<string, string>> = {
  suji: "筋", half_suji: "半筋", double_suji: "双筋", no_suji: "无筋", wall: "壁",
  no_chance: "无机会", double_no_chance: "双无机会", one_chance: "单机会",
  double_one_chance: "双单机会", mixed_one_chance: "混合单机会", early_outside: "早巡外侧牌",
};
const CLASSIFICATION_LABELS: Readonly<Record<string, string>> = {
  applicable: "适用", unavailable: "不可用", calculated: "已计算",
  ineligible: "不可荣", eligible: "可荣", unknown_missing_situational_yaku_context: "缺少场况役信息，资格未知",
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
    const family = FAMILY_LABELS[familyMatch[2]!]!;
    const base = DIMENSION_LABELS[`family_${familyMatch[1]}`] ?? "手牌指标";
    return `${family} · ${base}`;
  }
  const actorMatch = /^(.+):actor([0-3])$/.exec(dimension);
  if (actorMatch !== null) return DIMENSION_LABELS[actorMatch[1]!] ?? "防守指标";
  if (/^improve_waits:draw(?:[0-9]|[12][0-9]|3[0-3])$/.test(dimension)) return "摸入后有效进张";
  return DIMENSION_LABELS[dimension] ?? "分析指标";
}

function scopeLabel(dimension: unknown): string | null {
  if (typeof dimension !== "string") return null;
  if (dimension.startsWith("overall_")) return "整手范围";
  const actor = /^.+:actor([0-3])$/.exec(dimension)?.[1];
  if (actor !== undefined) return `玩家 ${Number(actor) + 1}（威胁对象）`;
  const draw = /^improve_waits:draw([0-9]|[12][0-9]|3[0-3])$/.exec(dimension)?.[1];
  if (draw !== undefined) return `摸入 ${tile34Label(Number(draw))} 后`;
  const family = /:(standard|chiitoitsu|kokushi)$/.exec(dimension)?.[1];
  return family === undefined ? null : (FAMILY_LABELS[family] ?? null);
}

function stringSetValue(values: unknown[], dimension: string): string {
  if (values.length === 0) return "无";
  if (!values.every((entry) => typeof entry === "string")) return `${values.length} 项`;
  const members = values as string[];
  if (dimension === "best_families") return members.map((entry) => FAMILY_LABELS[entry] ?? "其他手牌类型").join("、");
  if (/^helper_classifications:actor[0-3]$/.test(dimension)) {
    return members.map((entry) => STRUCTURAL_CLASSIFICATION_LABELS[entry] ?? "其他结构分类").join("、");
  }
  if (dimension === "base_ron_eligibility") return members.map((entry) => {
    const match = /^(\d|[12]\d|3[0-3]):(.+)$/.exec(entry);
    return match === null ? "资格记录不可读" : `${tile34Label(Number(match[1]))}：${CLASSIFICATION_LABELS[match[2]!] ?? "状态未知"}`;
  }).join("、");
  if (dimension === "yaku_names") return members.join("、");
  return `${members.length} 项`;
}

function evidenceValue(value: unknown, dimension: unknown): { value: string; tiles: Array<{ tile: string; count: number | null }> } {
  if (value === undefined) return { value: "暂不可用", tiles: [] };
  if (value === null || typeof value !== "object" || Array.isArray(value)) return { value: String(value), tiles: [] };
  const item = value as Record<string, unknown>;
  if (item.kind === "number" && typeof item.value === "number") {
    const unit = typeof item.unit === "string" ? (UNIT_LABELS[item.unit] ?? "") : "";
    return { value: `${item.value}${unit}`, tiles: [] };
  }
  if (item.kind === "boolean" && typeof item.value === "boolean") {
    return { value: item.value ? "是" : "否", tiles: [] };
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
    return { value: CLASSIFICATION_LABELS[item.value] ?? "已分类", tiles: [] };
  }
  if (item.kind === "string_set" && Array.isArray(item.values) && typeof dimension === "string") {
    return { value: stringSetValue(item.values, dimension), tiles: [] };
  }
  if (item.kind === "honor_safety" && Number.isInteger(item.remainingCount) && (item.category === "yakuhai" || item.category === "guest_wind")) {
    return { value: `${item.category === "yakuhai" ? "役牌" : "客风牌"}，剩余 ${item.remainingCount} 张`, tiles: [] };
  }
  if (item.kind === "shape_claims" && Array.isArray(item.claims)) return { value: `${item.claims.length} 项牌形组成`, tiles: [] };
  if (item.kind === "wait_details" && Array.isArray(item.waits)) return { value: item.waits.length === 0 ? "无" : `${item.waits.length} 种听牌`, tiles: [] };
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
  if (node.nodeKind === "KnownGameFact") {
    const concealed = Array.isArray(payload.concealedTiles) ? payload.concealedTiles.length : 0;
    const riverCount = Array.isArray(payload.rivers)
      ? payload.rivers.reduce((sum, river) => sum + (Array.isArray(river) ? river.length : 0), 0)
      : 0;
    return `局面事实：手牌 ${concealed} 张、公开牌河 ${riverCount} 张、自家${payload.selfRiichi === true ? "已" : "未"}立直`;
  }
  return typeof payload.statement === "string" ? payload.statement : "教练基于当前证据形成的推断";
}

function referenceTarget(node: GraphNode, decision: ReadyDecision) {
  const payload = node.payload as Record<string, unknown>;
  if (node.nodeKind === "CandidateAction") {
    const action = actionDto(decision, String(payload.actionRef));
    return { displayRef: node.nodeId, authority: node.authority, label: "候选行动", summary: action!.label, relatedAction: action };
  }
  if (node.nodeKind === "ModelEvaluation") {
    const preferred = Array.isArray(payload.preferredActions)
      ? payload.preferredActions.map((ref) => actionDto(decision, String(ref))!.label).join("、")
      : "未提供";
    return { displayRef: node.nodeId, authority: node.authority, label: "模型评估", summary: `模型偏好：${preferred}`, relatedAction: null };
  }
  if (node.nodeKind === "Decision") {
    return { displayRef: node.nodeId, authority: node.authority, label: "决策窗口", summary: "当前复盘条目的决策范围", relatedAction: actualActionDto(decision) };
  }
  if (node.nodeKind === "DeterministicPreference") {
    const preferred = Array.isArray(payload.preferredActions)
      ? payload.preferredActions.map((ref) => actionDto(decision, String(ref))!.label).join("、")
      : "无单一偏好";
    return { displayRef: node.nodeId, authority: node.authority, label: "确定性偏好信号", summary: preferred, relatedAction: null };
  }
  if (node.nodeKind === "Evidence") {
    return { displayRef: node.nodeId, authority: node.authority, label: "证据来源", summary: "已验证的当前决策证据来源", relatedAction: null };
  }
  throw new Error("fixed_review_unavailable");
}

function countedTiles(tiles: readonly Tile[]): Array<{ tile: string; count: number | null }> {
  const counts = new Map<string, number>();
  for (const tile of tiles) counts.set(tileLabel(tile), (counts.get(tileLabel(tile)) ?? 0) + 1);
  return [...counts].map(([tile, count]) => ({ tile, count }));
}

function knownGameFactDetails(payload: Record<string, unknown>) {
  const facts = payload as unknown as ReadyDecision["knownGameFacts"];
  const details = [
    { label: "场风 / 自风", value: `${facts.roundWind}场 / ${facts.seatWind}家`, scope: "当前决策", tiles: [] },
    { label: "自家立直", value: facts.selfRiichi ? "是" : "否", scope: "当前决策", tiles: [] },
    { label: "手牌", value: `${facts.concealedTiles.length} 张`, scope: "当前决策", tiles: countedTiles(facts.concealedTiles) },
    { label: "当前摸牌", value: facts.currentDraw === null ? "无" : tileLabel(facts.currentDraw.tile), scope: "当前决策", tiles: facts.currentDraw === null ? [] : countedTiles([facts.currentDraw.tile]) },
    { label: "宝牌指示牌", value: facts.doraIndicators.length === 0 ? "无" : `${facts.doraIndicators.length} 张`, scope: "当前决策", tiles: countedTiles(facts.doraIndicators) },
    { label: "剩余摸牌", value: facts.remainingDraws === null ? "未知" : `${facts.remainingDraws} 张`, scope: "当前决策", tiles: [] },
  ];
  facts.rivers.forEach((river, actor) => details.push({
    label: `玩家 ${actor + 1} 牌河`,
    value: river.length === 0 ? "无" : river.map((discard) => `${tileLabel(discard.tile)}${discard.tsumogiri ? "（摸切）" : "（手切）"}`).join("、"),
    scope: "当前决策",
    tiles: countedTiles(river.map((discard) => discard.tile)),
  }));
  facts.melds.forEach((meld, index) => details.push({
    label: `副露 ${index + 1}`,
    value: `${({ chi: "吃", pon: "碰", daiminkan: "大明杠", ankan: "暗杠", kakan: "加杠" } as const)[meld.kind]} ${tileGroup(meld.tiles)}`,
    scope: "当前决策",
    tiles: countedTiles(meld.tiles),
  }));
  return details;
}

function provenanceDetails(node: GraphNode, decision: ReadyDecision) {
  const payload = node.payload as Record<string, unknown>;
  if (node.nodeKind === "KnownGameFact") return knownGameFactDetails(payload);
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
  const directlyRenderedRefs = new Set<string>();
  for (const judgment of judgments) for (const ref of judgment.premiseRefs) directlyRenderedRefs.add(ref);
  for (const node of scoped.nodes) {
    if (node.nodeKind !== "CoachInference") continue;
    const payload = node.payload as { premiseRefs?: unknown };
    if (Array.isArray(payload.premiseRefs)) for (const ref of payload.premiseRefs) directlyRenderedRefs.add(String(ref));
  }
  const provenanceKinds = new Set(["KnownGameFact", "FactorDifference", "FactorFact", "CoachInference"]);
  const referenceTargets = scoped.nodes
    .filter((node) => directlyRenderedRefs.has(node.nodeId) && !provenanceKinds.has(node.nodeKind))
    .map((node) => referenceTarget(node, decision));
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
    referenceTargets,
    provenance,
    explanationStatus: explanationStatus(context.report, input.decisionId),
  }));
}
