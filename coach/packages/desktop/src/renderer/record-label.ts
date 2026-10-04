import type { RecordLabel } from "@riichi-coach/contracts";

const SEAT_NAMES = ["东位", "南位", "西位", "北位"] as const;

export type RecordLabelPlayerView = Readonly<{
  text: string;
  isSelf: boolean;
}>;

export type RecordLabelView = Readonly<{
  title: string;
  players: readonly RecordLabelPlayerView[];
}>;

function savedDate(updatedAt: string): string {
  const date = updatedAt.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/u.test(date) ? date : "日期未知";
}

function scoreText(score: number | null): string {
  return score === null ? "分数未知" : `${new Intl.NumberFormat("zh-CN").format(score)}点`;
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
    ];
    return Object.freeze({ text: parts.join(" · "), isSelf: label.selfSeat === player.seat });
  });
  return Object.freeze({ title: label.title, players: Object.freeze(players) });
}
