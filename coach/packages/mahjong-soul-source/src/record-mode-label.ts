/**
 * Versioned presentation projection for GameMetaData.mode_id.
 *
 * Mapping source: majsoul-api's direct reverse-engineered “Game Meta Mode”
 * table, read 2026-10-06:
 * https://wikiwiki.jp/majsoul-api/%E5%AE%9A%E6%95%B0%E4%B8%80%E8%A6%A7%E3%81%AB%E3%82%83#bd8d1986
 * The field definition and separation from GameMode.mode are documented in
 * “牌譜を読むにゃ”:
 * https://wikiwiki.jp/majsoul-api/%E7%89%8C%E8%AD%9C%E3%82%92%E8%AA%AD%E3%82%80%E3%81%AB%E3%82%83
 *
 * This resolver receives only GameMetaData.mode_id. GameMode.mode (2 = South)
 * is never treated as a room. IDs without a source row stay unknown.
 */
export const MAHJONG_SOUL_MODE_LABEL_MAP_VERSION = "majsoul-api-mode-table-2026-10-06" as const;

const MODE_LABELS: ReadonlyMap<number, string> = new Map([
  [2, "四人铜之间 · 东风"],
  [3, "四人铜之间 · 半庄"],
  [5, "四人银之间 · 东风"],
  [6, "四人银之间 · 半庄"],
  [8, "四人金之间 · 东风"],
  [9, "四人金之间 · 半庄"],
  [11, "四人玉之间 · 东风"],
  [12, "四人玉之间 · 半庄"],
  [13, "四人大会战 · 乱斗之间 · 东风"],
  [14, "四人大会战 · 乱斗之间 · 半庄"],
  [15, "四人王座之间 · 东风"],
  [16, "四人王座之间 · 半庄"],
  [17, "三人铜之间 · 东风"],
  [18, "三人铜之间 · 半庄"],
  [19, "三人银之间 · 东风"],
  [20, "三人银之间 · 半庄"],
  [21, "三人金之间 · 东风"],
  [22, "三人金之间 · 半庄"],
  [23, "三人玉之间 · 东风"],
  [24, "三人玉之间 · 半庄"],
  [25, "三人王座之间 · 东风"],
  [26, "三人王座之间 · 半庄"],
]);

/** Return a room/match label only for a mode ID with a source table entry. */
export function resolveMahjongSoulRecordModeLabel(modeId: number | null | undefined): string | null {
  if (typeof modeId !== "number" || !Number.isInteger(modeId)) return null;
  return MODE_LABELS.get(modeId) ?? null;
}
