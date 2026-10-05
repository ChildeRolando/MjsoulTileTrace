import type { RecordLabel } from "@riichi-coach/contracts";

const SEAT_NAMES = ["东位", "南位", "西位", "北位"] as const;

export type RecordLabelPlayerView = Readonly<{
  text: string;
  isSelf: boolean;
}>;

export type RecordLabelView = Readonly<{
  title: string;
  players: readonly RecordLabelPlayerView[];
  agreementDescription: string | null;
}>;

function savedDate(updatedAt: string): string {
  const date = updatedAt.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/u.test(date) ? date : "日期未知";
}

function scoreText(score: number | null): string {
  return score === null ? "分数未知" : `${new Intl.NumberFormat("zh-CN").format(score)}点`;
}

function signedText(value: number): string {
  return `${value > 0 ? "+" : ""}${new Intl.NumberFormat("zh-CN").format(value)}`;
}

function signedPearls(rawHundredths: number): string {
  const value = rawHundredths / 100;
  const sign = value > 0 ? "+" : value < 0 ? "-" : "+";
  return `${sign}${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(Math.abs(value))}`;
}

function gradeText(score: number | null, unit: "dan_pt" | "soul_pearl" | "unknown" | null): string | null {
  if (score === null) return null;
  if (unit === "dan_pt") return `段位 ${signedText(score)} pt`;
  if (unit === "soul_pearl") return `魂珠 ${signedPearls(score)}`;
  return "段位变化单位未知";
}

function isMahjongSoulRecord(recordId: string | null): boolean {
  const value = recordId?.startsWith("majsoul:") ? recordId.slice("majsoul:".length) : recordId;
  return value !== null && value !== undefined
    && /^\d{6}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(value);
}

type AgreementPresentation = Readonly<{ text: string; description: string }>;

function agreementPresentation(label: RecordLabel): AgreementPresentation | null {
  switch (label.mortalAgreementStatus) {
    case "not_applicable": return null;
    case "pending": return {
      text: "Mortal统计中",
      description: "正在从已保存分析读取Mortal有效已评分多候选决策；未评分和单候选决策不计。",
    };
    case "unavailable": return {
      text: "Mortal统计不可用",
      description: "无法验证已保存分析中的Mortal评分数据。",
    };
    case "ready": {
      const stats = label.mortalAgreement;
      if (stats === null) return {
        text: "Mortal统计不可用",
        description: "无法验证已保存分析中的Mortal评分数据。",
      };
      if (stats.scoredDecisionCount === 0) {
        return {
          text: "Mortal暂无数据（0个有效决策）",
          description: "分母为已验证、有效评分且至少有两个候选动作的Mortal决策数；未评分和单候选决策不计。实际操作对应的模型动作属于Mortal首选动作（并列首选也计吻合）；不读取教练偏好。",
        };
      }
      const percentage = Math.round(stats.agreementCount * 100 / stats.scoredDecisionCount);
      return {
        text: `Mortal ${percentage}%（${stats.agreementCount}/${stats.scoredDecisionCount}）`,
        description: `分母为${stats.scoredDecisionCount}个已验证、有效评分且至少有两个候选动作的Mortal决策；未评分和单候选决策不计。实际操作对应的模型动作属于Mortal首选动作（并列首选也计吻合）；不读取教练偏好。`,
      };
    }
  }
}

/** Project the local record label into short user-facing strings. */
export function recordLabelView(
  label: RecordLabel | null | undefined,
  updatedAt: string,
): RecordLabelView {
  if (label === null || label === undefined) {
    return Object.freeze({
      title: `牌谱复盘 · 保存于 ${savedDate(updatedAt)}`,
      players: Object.freeze([]),
      agreementDescription: null,
    });
  }
  const hasSessionFallback = label.recordId === null
    && label.selfSeat === null
    && label.startedAt === null;
  const orderedPlayers = [...label.players].sort((left, right) => {
    if (left.rank !== null && right.rank !== null) return left.rank - right.rank || left.seat - right.seat;
    if (left.rank !== null) return -1;
    if (right.rank !== null) return 1;
    return left.seat - right.seat;
  });
  const players = hasSessionFallback
    ? []
    : orderedPlayers.map(player => {
    const parts = [
      SEAT_NAMES[player.seat]!,
      player.displayName ?? "姓名未知",
      player.rank === null ? "名次未知" : `第${player.rank}名`,
      scoreText(player.finalScore),
      ...(gradeText(player.gradingScore, player.gradingScoreUnit) === null
        ? [] : [gradeText(player.gradingScore, player.gradingScoreUnit)!]),
    ];
    return Object.freeze({ text: parts.join(" · "), isSelf: label.selfSeat === player.seat });
  });
  let title = label.title;
  if (!hasSessionFallback && isMahjongSoulRecord(label.recordId)) {
    const room = label.rankedMode === null
      ? "段位房间未知"
      : label.rankedMode.label ?? "段位房间未知";
    const self = label.selfSeat === null ? undefined : label.players[label.selfSeat];
    const selfGrade = self === undefined ? null : gradeText(self.gradingScore, self.gradingScoreUnit);
    const grade = selfGrade === null ? "本局段位变化未知" : `本局${selfGrade}`;
    title += ` · ${room} · ${grade}`;
  }
  const agreement = agreementPresentation(label);
  if (agreement !== null) title += ` · ${agreement.text}`;
  return Object.freeze({
    title,
    players: Object.freeze(players),
    agreementDescription: agreement?.description ?? null,
  });
}
