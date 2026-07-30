import type {
  ActionId,
  NormalizedDecision,
} from "@riichi-coach/contracts";
import type {
  CandidateLedger,
  DecisionLedger,
} from "../compare/action-comparator.js";
import type { TeachingPolicyResult } from "../policy/teaching-policy.js";

const honorNames: Record<string, string> = {
  "1z": "东",
  "2z": "南",
  "3z": "西",
  "4z": "北",
  "5z": "白",
  "6z": "发",
  "7z": "中",
};

export function formatActionLabel(actionId: ActionId): string {
  const [, encodedTile, mode] = actionId.split(":");
  const red = encodedTile!.endsWith("r");
  const tile = encodedTile!.replace(/r$/, "");
  const suit = tile[1];
  const baseName =
    suit === "m"
      ? `${tile[0]}万`
      : suit === "p"
        ? `${tile[0]}筒`
        : suit === "s"
          ? `${tile[0]}索`
          : honorNames[tile] ?? tile;
  const tileName = red ? `赤${baseName}` : baseName;
  return mode === "tsumogiri" ? `摸切${tileName}` : `切${tileName}`;
}

function candidate(
  ledgers: readonly CandidateLedger[],
  actionId: ActionId,
): CandidateLedger {
  const result = ledgers.find((item) => item.actionId === actionId);
  if (!result) {
    throw new Error(`Missing candidate ledger for ${actionId}`);
  }
  return result;
}

function unknown(
  ledger: DecisionLedger,
  dimension: string,
): boolean {
  return ledger.coverage.some(
    (entry) =>
      entry.dimension === dimension && entry.status !== "implemented",
  );
}

export function renderDeterministicExplanation(input: {
  decision: NormalizedDecision;
  ledger: DecisionLedger;
  policy: TeachingPolicyResult;
}): string {
  const { decision, ledger, policy } = input;
  const actual = candidate(ledger.candidateLedgers, decision.actualAction);
  const model = candidate(ledger.candidateLedgers, decision.modelAction);
  const actualShanten = actual.axes.efficiency.consequence?.shanten;
  const modelShanten = model.axes.efficiency.consequence?.shanten;
  const sentences: string[] = [];

  if (actualShanten !== undefined && modelShanten !== undefined) {
    const efficiencySide =
      actualShanten < modelShanten
        ? `因此标准形向听支持${formatActionLabel(decision.actualAction)}`
        : modelShanten < actualShanten
          ? `因此标准形向听支持${formatActionLabel(decision.modelAction)}`
          : "两者的标准形向听数相同，未校正进张不能用于同向听排序";
    sentences.push(
      "牌效（仅按当前标准形向听计算）：" +
      `${formatActionLabel(decision.actualAction)}后为${actualShanten}向听，` +
      `${formatActionLabel(decision.modelAction)}后为${modelShanten}向听，` +
      `${efficiencySide}。`,
    );
  }

  const actualByActor = new Map(
    actual.axes.defense.byThreat.map((item) => [item.actor, item]),
  );
  const modelByActor = new Map(
    model.axes.defense.byThreat.map((item) => [item.actor, item]),
  );
  const modelAdvantages = model.axes.defense.byThreat.filter(
    (item) =>
      item.classification === "genbutsu" &&
      actualByActor.get(item.actor)?.classification !== "genbutsu",
  );
  for (const advantage of modelAdvantages) {
    sentences.push(
      `防守：${formatActionLabel(decision.modelAction)}对actor ${advantage.actor}是现物，` +
      `${formatActionLabel(decision.actualAction)}没有针对该玩家的确定安全证据。`,
    );
  }
  const actualAdvantages = actual.axes.defense.byThreat.filter(
    (item) =>
      item.classification === "genbutsu" &&
      modelByActor.get(item.actor)?.classification !== "genbutsu",
  );
  for (const advantage of actualAdvantages) {
    sentences.push(
      `防守：${formatActionLabel(decision.actualAction)}对actor ${advantage.actor}是现物，` +
      `${formatActionLabel(decision.modelAction)}没有针对该玩家的确定安全证据。`,
    );
  }

  const threatStates = ledger.neutralFactors.filter(
    (factor) => factor.dimension === "defense.riichi_threat_state",
  );
  for (const factor of threatStates) {
    const actor = factor.actors?.[0];
    const ippatsuAlive =
      factor.magnitude.value === "riichi_ippatsu_alive";
    sentences.push(
      `actor ${actor ?? "未知"}的一发窗口` +
      `${ippatsuAlive ? "仍有效" : "已经结束"}。`,
    );
  }

  const unknowns: string[] = [];
  if (unknown(ledger, "value.confirmed_and_potential_yaku")) {
    unknowns.push("完整价值");
  }
  if (unknown(ledger, "placement.outcome_path_rank_impact")) {
    unknowns.push("顺位结果路径");
  }
  if (unknown(ledger, "defense.calibrated_dealin_probability")) {
    unknowns.push("校准放铳概率");
  }
  if (unknowns.length > 0) {
    sentences.push(`${unknowns.join("、")}仍未知。`);
  }

  const engine = decision.modelName.split(/\s+/)[0] ?? decision.modelName;
  sentences.push(`这些是可观察后果，无法知道${engine}的内部原因。`);
  if (policy.coachJudgement === null) {
    const blockedIds = policy.blockedRules
      .filter((rule) => rule.status === "blocked")
      .map((rule) => rule.ruleId)
      .join("、");
    sentences.push(
      `${blockedIds || "现有教学规则"}的前提不完整，教练暂不给最终攻守建议。`,
    );
  } else {
    sentences.push(
      `教练依据${policy.coachJudgement.ruleIds.join("、")}建议` +
      `${formatActionLabel(policy.coachJudgement.recommendedAction)}。`,
    );
  }
  return sentences.join("");
}
