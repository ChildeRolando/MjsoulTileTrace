import {
  canonicalActionRef,
  CurrentSceneFrameSchema,
  NormalizedEventSchema,
  ResponseFuritenAnalysisV2Schema,
  StructuredComparisonSetSchema,
  type ActionRef,
  type CandidateFactorLedger,
  type DefenseMatrixV1,
  type KnownGameFacts,
  type NormalizedEvent,
  type Tile,
} from "@riichi-coach/contracts";
import {
  parseMjaiTile,
  type RegressionFixture,
} from "../import/mortal-report.js";
import { bridgeLegacyRegressionEvents } from
  "../import/legacy-event-stream-bridge.js";
import { freezeDecisionSnapshot } from "../replay/decision-snapshot.js";
import { projectKnownGameFactsV2 } from "../factors/known-game-facts-v2.js";
import { runStructuredAnalysisAssembly } from
  "../analysis/structured-analysis-assembly.js";
import { legacyDiscardActionIdToAction } from
  "../candidate/legacy-action-bridge.js";
import type { HandStructureFactEnginePort } from "../fact-engine/port.js";
import type {
  StructuredAnalysisAssemblyResult,
} from "../analysis/structured-analysis-assembly.js";

const honorNames: Record<string, string> = {
  "1z": "东",
  "2z": "南",
  "3z": "西",
  "4z": "北",
  "5z": "白",
  "6z": "发",
  "7z": "中",
};

function tileName(tile: Tile): string {
  const suit = tile.id[1];
  if (suit === "m" || suit === "p" || suit === "s") {
    const suitName = suit === "m" ? "万" : suit === "p" ? "筒" : "索";
    return `${tile.id[0]}${suitName}`;
  }
  return honorNames[tile.id] ?? tile.id;
}

function actionLabel(action: ReturnType<typeof legacyDiscardActionIdToAction>): string {
  if (action.kind !== "discard" && action.kind !== "riichi_discard") {
    return action.kind;
  }
  const base = tileName(action.tile);
  return action.discardMode === "tsumogiri" ? `摸切${base}` : `切${base}`;
}

function actionIdFromRaw(action: { type: string; pai?: string; tsumogiri?: boolean }): string {
  if (action.type !== "dahai" || action.pai === undefined) {
    throw new Error(`Unsupported prototype action: ${action.type}`);
  }
  const tile = parseMjaiTile(action.pai);
  const tileKey = `${tile.id}${tile.red ? "r" : ""}`;
  return `discard:${tileKey}:${action.tsumogiri ? "tsumogiri" : "tedashi"}`;
}

function normalizeEvent(
  raw: Record<string, unknown> & { type: string },
  index: number,
  selfActor: number,
): NormalizedEvent {
  const eventId = `event-${index}`;
  if (raw.type === "start_game") {
    return NormalizedEventSchema.parse({ type: "start_game", eventId, playerCount: 4 });
  }
  if (raw.type === "start_kyoku") {
    const hands = raw.tehais as string[][];
    return NormalizedEventSchema.parse({
      type: "start_kyoku",
      eventId,
      bakaze: raw.bakaze,
      kyoku: raw.kyoku,
      honba: raw.honba,
      kyotaku: raw.kyotaku,
      oya: raw.oya,
      scores: raw.scores,
      doraMarker: parseMjaiTile(raw.dora_marker as string),
      selfHand: hands[selfActor]?.map(parseMjaiTile),
    });
  }
  if (raw.type === "tsumo") {
    return NormalizedEventSchema.parse({
      type: "tsumo",
      eventId,
      actor: raw.actor,
      tile: raw.actor === selfActor ? parseMjaiTile(raw.pai as string) : null,
    });
  }
  if (raw.type === "dahai") {
    return NormalizedEventSchema.parse({
      type: "dahai",
      eventId,
      actor: raw.actor,
      tile: parseMjaiTile(raw.pai as string),
      tsumogiri: raw.tsumogiri,
    });
  }
  if (raw.type === "reach" || raw.type === "reach_accepted") {
    return NormalizedEventSchema.parse({
      type: raw.type,
      eventId,
      actor: raw.actor,
    });
  }
  if (
    raw.type === "chi" ||
    raw.type === "pon" ||
    raw.type === "daiminkan" ||
    raw.type === "ankan" ||
    raw.type === "kakan"
  ) {
    return NormalizedEventSchema.parse({
      type: raw.type,
      eventId,
      actor: raw.actor,
      target: raw.target ?? null,
      tile: parseMjaiTile(raw.pai as string),
      consumed: (raw.consumed as string[]).map(parseMjaiTile),
    });
  }
  if (raw.type === "end_kyoku" || raw.type === "end_game") {
    return NormalizedEventSchema.parse({ type: raw.type, eventId });
  }
  throw new Error(`Unsupported prototype event: ${raw.type}`);
}

export interface PrototypeDecision {
  decisionId: string;
  sceneEventRef: string;
  turn: number;
  drawnTile: Tile;
  modelActionId: string;
  actualActionId: string;
}

export interface PrototypeGame {
  sourceReportId: string;
  modelTag: string | null;
  selfActor: number;
  decisions: PrototypeDecision[];
  events: NormalizedEvent[];
}

export function importPrototypeGame(raw: RegressionFixture): PrototypeGame {
  const selfActor = raw.source.playerId;
  const events = raw.mjaiLog.map(
    (event, index) => normalizeEvent(event, index, selfActor),
  );
  const decisions: PrototypeDecision[] = [];
  let cursor = -1;
  for (const entry of raw.decisions) {
    const drawn = parseMjaiTile(entry.tile);
    let sceneIndex = -1;
    for (let index = cursor + 1; index < events.length; index++) {
      const event = events[index]!;
      if (
        event.type === "tsumo" &&
        event.actor === selfActor &&
        event.tile !== null &&
        event.tile.id === drawn.id
      ) {
        sceneIndex = index;
        break;
      }
    }
    if (sceneIndex < 0) {
      throw new Error(
        `Cannot map decision ${entry.junme} (drawn ${entry.tile}) to a replay event`,
      );
    }
    cursor = sceneIndex;
    decisions.push({
      decisionId: `turn${entry.junme}`,
      sceneEventRef: `event-${sceneIndex}`,
      turn: entry.junme,
      drawnTile: drawn,
      modelActionId: actionIdFromRaw(entry.expected),
      actualActionId: actionIdFromRaw(entry.actual),
    });
  }
  return {
    sourceReportId: (raw.source as { reportId?: string }).reportId ?? "prototype",
    modelTag: raw.source.modelTag ?? null,
    selfActor,
    decisions,
    events,
  };
}

function factNumber(
  ledger: CandidateFactorLedger,
  dimension: string,
): number | null {
  const fact = ledger.axes.flatMap((axis) => axis.facts)
    .find((entry) => entry.dimension === dimension);
  const value = fact?.value;
  if (value === undefined || value.kind !== "number") return null;
  return value.value;
}

function factSetSize(
  ledger: CandidateFactorLedger,
  dimension: string,
): number | null {
  const fact = ledger.axes.flatMap((axis) => axis.facts)
    .find((entry) => entry.dimension === dimension);
  const value = fact?.value;
  if (value === undefined) return null;
  if (value.kind === "integer_ids") return value.values.length;
  if (value.kind === "tile_counts") {
    return value.value.reduce((sum, entry) => sum + entry.count, 0);
  }
  return null;
}

export interface CoachCandidateReport {
  actionRef: ActionRef;
  label: string;
  isActual: boolean;
  shanten: number | null;
  effectiveTypes: number | null;
  effectiveRemaining: number | null;
  defense: Array<{
    actor: number;
    kind: string;
    genbutsu: "genbutsu" | "not_genbutsu" | "blocked" | "not_applicable" | "unknown";
    helperRisk: number | "blocked" | "unsupported" | null;
  }>;
}

function candidateAnalysis(
  action: ReturnType<typeof legacyDiscardActionIdToAction>,
  actionRef: ActionRef,
  ledger: CandidateFactorLedger | undefined,
  matrix: DefenseMatrixV1 | undefined,
  isActual: boolean,
): CoachCandidateReport {
  const defense = (matrix?.cells ?? []).map((cell) => {
    const genbutsu = cell.deterministicSafety.status === "calculated"
      ? cell.deterministicSafety.genbutsu ? "genbutsu" : "not_genbutsu"
      : cell.deterministicSafety.status === "blocked_missing_facts"
        ? "blocked"
        : cell.deterministicSafety.status === "not_applicable"
          ? "not_applicable"
          : "unknown";
    let helperRisk: number | "blocked" | "unsupported" | null = null;
    if (cell.structural.status === "calculated") {
      helperRisk = cell.structural.helperRiskScale;
    } else if (
      cell.structural.status === "blocked_missing_facts" ||
      cell.structural.status === "blocked_engine_failure"
    ) {
      helperRisk = "blocked";
    } else if (cell.structural.status === "unsupported_threat_kind") {
      helperRisk = "unsupported";
    }
    return {
      actor: cell.threat.actor,
      kind: cell.threat.kind,
      genbutsu: genbutsu as CoachCandidateReport["defense"][number]["genbutsu"],
      helperRisk,
    };
  });
  return {
    actionRef,
    label: actionLabel(action),
    isActual,
    shanten: ledger === undefined ? null : factNumber(ledger, "overall_shanten"),
    effectiveTypes: ledger === undefined
      ? null
      : factSetSize(ledger, "overall_effective_tile_types"),
    effectiveRemaining: ledger === undefined
      ? null
      : factSetSize(ledger, "overall_effective_tiles_remaining"),
    defense,
  };
}

export interface CoachDecisionReport {
  decisionId: string;
  sceneEventRef: string;
  turn: number;
  drawnTile: string;
  handTiles: string[];
  candidates: CoachCandidateReport[];
  preferences: { efficiency: string[]; defense: string[]; applied: string[] | null };
  threats: Array<{ actor: number; kind: string; ippatsu: boolean | "blocked" }>;
  explanation: string;
  diagnostics: string[];
}

export interface CoachGameReport {
  sourceReportId: string;
  modelTag: string | null;
  selfActor: number;
  decisions: CoachDecisionReport[];
}

function preferences(
  assembly: StructuredAnalysisAssemblyResult,
  labelsByRef: Map<ActionRef, string>,
): { efficiency: string[]; defense: string[]; applied: string[] | null } {
  const result = assembly.factorResult;
  const preferred = (axis: "efficiency" | "defense"): string[] => {
    const refs = result.differences.deterministic
      .filter((difference) =>
        difference.axis === axis && difference.direction !== "neutral"
      )
      .flatMap((difference) =>
        difference.direction === "supports_left"
          ? [difference.leftActionRef]
          : difference.direction === "supports_right"
            ? [difference.rightActionRef]
            : []
      );
    return [...new Set(refs)].map((ref) => labelsByRef.get(ref) ?? ref);
  };
  return {
    efficiency: preferred("efficiency"),
    defense: preferred("defense"),
    applied: result.deterministicPreference === null
      ? null
      : result.deterministicPreference.actionRefs.map((ref) =>
          labelsByRef.get(ref) ?? ref
        ),
  };
}

function explanation(prefs: {
  efficiency: string[];
  defense: string[];
  applied: string[] | null;
}, genbutsuLabels: string[]): string {
  const parts: string[] = [];
  if (prefs.efficiency.length > 0) {
    parts.push(`牌效支持${prefs.efficiency.join("、")}`);
  }
  if (prefs.defense.length > 0) {
    const detail = genbutsuLabels.length > 0
      ? `（对 ${genbutsuLabels.join("、")} 现物）`
      : "";
    parts.push(`防守支持${prefs.defense.join("、")}${detail}`);
  }
  if (prefs.applied === null && parts.length > 0) {
    parts.push("综合攻守冲突，未给出唯一确定偏好");
  } else if (prefs.applied !== null) {
    parts.push(`综合偏好：${prefs.applied.join("、")}`);
  }
  if (parts.length === 0) parts.push("无确定因素支持任一候选");
  return parts.join("；");
}

function renderChineseExplanation(
  assembly: StructuredAnalysisAssemblyResult,
  candidates: CoachCandidateReport[],
): string {
  const labelsByRef = new Map(
    candidates.map((entry) => [entry.actionRef, entry.label]),
  );
  const prefs = preferences(assembly, labelsByRef);
  const genbutsuLabels = [...new Set(
    candidates.flatMap((candidate) =>
      candidate.defense
        .filter((cell) => cell.genbutsu === "genbutsu")
        .map((cell) => `玩家${cell.actor}`)
    ),
  )];
  return explanation(prefs, genbutsuLabels);
}

function handTiles(facts: KnownGameFacts): string[] {
  return [
    ...facts.concealedTiles.map(tileName),
    ...(facts.currentDraw === null ? [] : [tileName(facts.currentDraw.tile)]),
  ];
}

export async function analyzePrototypeGame(
  raw: RegressionFixture,
  engine: HandStructureFactEnginePort,
): Promise<CoachGameReport> {
  const game = importPrototypeGame(raw);
  const bridged = bridgeLegacyRegressionEvents(
    game.events,
    game.selfActor,
    { sourceKind: "fixture", gameId: `prototype:${game.sourceReportId}` },
  );
  if (bridged.status !== "ready") throw new Error(bridged.code);

  const decisions: CoachDecisionReport[] = [];
  for (const decision of game.decisions) {
    const triggerEventRef = bridged.legacyEventRefToCanonicalEventRefs[
      decision.sceneEventRef
    ]?.[0];
    if (triggerEventRef === undefined) {
      throw new Error(`no canonical ref for ${decision.sceneEventRef}`);
    }
    const snapshot = freezeDecisionSnapshot(bridged.stream, {
      kind: "self_turn",
      actor: game.selfActor,
      triggerEventRef,
    });
    const facts = projectKnownGameFactsV2({
      stream: bridged.stream,
      decisionWindow: snapshot.privateState.decisionWindow,
      cachedSnapshot: snapshot,
    });
    if (
      facts.currentDraw !== null &&
      facts.currentDraw.tile.id !== decision.drawnTile.id
    ) {
      throw new Error(
        `scene mapping mismatch for ${decision.decisionId}: drew ${facts.currentDraw.tile.id}, expected ${decision.drawnTile.id}`,
      );
    }
    const threats: CoachDecisionReport["threats"] = facts.defenseThreats.map(
      (threat) => ({
        actor: threat.actor,
        kind: threat.kind,
        ippatsu: threat.ippatsu.status === "calculated"
          ? threat.ippatsu.value
          : "blocked" as const,
      }),
    );
    const common = {
      decisionId: decision.decisionId,
      sceneEventRef: decision.sceneEventRef,
      turn: decision.turn,
      drawnTile: tileName(decision.drawnTile),
      handTiles: handTiles(facts),
      threats,
    };

    const actions = [decision.actualActionId, decision.modelActionId].map(
      (actionId) => {
        try {
          return legacyDiscardActionIdToAction(actionId);
        } catch {
          return null;
        }
      },
    );
    const discardActions = actions.filter((action) => action !== null);
    if (discardActions.length === 0) {
      decisions.push({
        ...common,
        candidates: [],
        preferences: { efficiency: [], defense: [], applied: null },
        explanation: "该动作不在本原型支持范围内（仅处理弃牌/立直弃牌）",
        diagnostics: [],
      });
      continue;
    }

    const comparisonSet = StructuredComparisonSetSchema.parse({
      comparisonSetId: `prototype:${decision.decisionId}`,
      origin: "automatic_review",
      decisionLayerRef: `prototype:${decision.decisionId}:layer`,
      decisionWindow: facts.decisionWindow,
      candidates: discardActions.map((action, index) => ({
        actionRef: canonicalActionRef(action),
        action,
        origins: index === 0 ? ["actual", "model"] : ["model"],
      })),
    });
    const frame = CurrentSceneFrameSchema.parse({
      kind: "current_scene",
      frameId: `prototype:${decision.decisionId}:frame`,
      scope: { kind: "applied_decision" },
      sceneRef: facts.decisionEventRef,
      facts: [{ factId: facts.factSetId, provenance: "raw_replay" }],
    });
    const responseFuriten = ResponseFuritenAnalysisV2Schema.parse({
      binding: {
        source: "unavailable",
        factSetId: facts.factSetId,
        decisionEventRef: facts.decisionEventRef,
        selfActor: facts.actor,
        reason: "response_history_not_provided",
        engineIdentityStatus: "unknown",
        engineIdentity: null,
      },
      temporary: {
        status: "unknown",
        unknownReason: "response_history_not_provided",
        evidenceIds: [],
        analysisRefs: [],
        riichiAcceptanceEventRef: null,
      },
      riichi: {
        status: "unknown",
        unknownReason: "response_history_not_provided",
        evidenceIds: [],
        analysisRefs: [],
        riichiAcceptanceEventRef: null,
      },
    });
    const assembly = await runStructuredAnalysisAssembly({
      frame,
      comparisonSet,
      facts,
      responseFuriten,
      engine,
      modelEvaluation: null,
    });
    const result = assembly.factorResult;
    const analyzed = discardActions.map((action, index) => {
      const actionRef = canonicalActionRef(action);
      const ledger = result.ledgers.find((entry) => entry.actionRef === actionRef);
      const matrix = result.defenseMatrices.find(
        (entry) => entry.actionRef === actionRef,
      );
      return candidateAnalysis(action, actionRef, ledger, matrix, index === 0);
    });
    const labelsByRef = new Map(
      analyzed.map((entry) => [entry.actionRef, entry.label]),
    );
    decisions.push({
      ...common,
      candidates: analyzed,
      preferences: preferences(assembly, labelsByRef),
      explanation: renderChineseExplanation(assembly, analyzed),
      diagnostics: result.diagnostics.map(
        (entry) => `${entry.actionRef} ${entry.stage} ${entry.status}`,
      ),
    });
  }
  return {
    sourceReportId: game.sourceReportId,
    modelTag: game.modelTag,
    selfActor: game.selfActor,
    decisions,
  };
}

export function renderCoachGameMarkdown(report: CoachGameReport): string {
  const lines: string[] = [];
  lines.push("# 日麻教练分析报告");
  lines.push("");
  lines.push(`- 牌谱：${report.sourceReportId}`);
  lines.push(`- 模型：${report.modelTag ?? "未提供"}`);
  lines.push(`- 主视角玩家：${report.selfActor}`);
  lines.push(`- 决策数：${report.decisions.length}`);
  lines.push("- 数据来源：legacy_regression_bridge_only（本地文件回归桥，非生产牌谱映射）");
  lines.push("- 说明：教练只报告可审计的确定事实与启发式；未覆盖精确符番、放铳概率、顺位 EV、对手手牌推断与模型内部原因。");
  for (const decision of report.decisions) {
    lines.push("");
    lines.push(`## ${decision.decisionId}（第 ${decision.turn} 巡，摸 ${decision.drawnTile}）`);
    lines.push("");
    lines.push(`手牌：${decision.handTiles.join(" ")}`);
    lines.push("");
    if (decision.threats.length === 0) {
      lines.push("威胁：无（无立直/副露威胁者）");
    } else {
      lines.push(
        `威胁：${decision.threats.map((threat) =>
          `玩家${threat.actor}（${threat.kind}，一发=${threat.ippatsu === "blocked" ? "未知" : threat.ippatsu ? "中" : "否"}）`
        ).join("；")}`,
      );
    }
    lines.push("");
    lines.push("| 候选 | 动作 | 向听 | 有效牌种 | 剩余有效 | 防守现物 | 结构风险 |");
    lines.push("|---|---|---|---|---|---|---|");
    for (const candidate of decision.candidates) {
      const genbutsu = candidate.defense.length === 0
        ? "-"
        : candidate.defense.map((cell) =>
            cell.genbutsu === "genbutsu"
              ? `玩家${cell.actor}现物`
              : cell.genbutsu === "not_genbutsu"
                ? `玩家${cell.actor}非现物`
                : cell.genbutsu === "blocked"
                  ? `玩家${cell.actor}未知`
                  : "不适用"
          ).join("；");
      const risk = candidate.defense.length === 0
        ? "-"
        : candidate.defense.map((cell) =>
            typeof cell.helperRisk === "number"
              ? `玩家${cell.actor}=${cell.helperRisk}`
              : cell.helperRisk === "blocked"
                ? `玩家${cell.actor}=阻塞`
                : cell.helperRisk === "unsupported"
                  ? `玩家${cell.actor}=不支持`
                  : `玩家${cell.actor}=?`
          ).join("；");
      lines.push(
        `| ${candidate.isActual ? "实战" : "模型"} | ${candidate.label} | ` +
        `${candidate.shanten ?? "-"} | ${candidate.effectiveTypes ?? "-"} | ` +
        `${candidate.effectiveRemaining ?? "-"} | ${genbutsu} | ${risk} |`,
      );
    }
    lines.push("");
    lines.push(`教练结论：${decision.explanation}`);
    if (decision.diagnostics.length > 0) {
      lines.push("");
      lines.push(`诊断：${decision.diagnostics.join("；")}`);
    }
  }
  lines.push("");
  lines.push("> 证据边界：确定现物只对同一威胁者有效；结构风险为版本化启发式，不是放铳概率；多威胁不合并。");
  return lines.join("\n");
}
