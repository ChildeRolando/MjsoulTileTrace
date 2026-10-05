/** Display units for GameEndResult.PlayerItem.grading_score.
 *
 * Source: majsoul-api's raw `AccountLevel` ID table and record reader, read
 * 2026-10-06. The same record detail supplies AccountInfo.level / level3 and
 * GameMetaData.mode_id. The table distinguishes ordinary rank IDs from Soul
 * IDs introduced with Soul Pearls; unknown IDs remain unit-unknown.
 * https://wikiwiki.jp/majsoul-api/%E7%89%8C%E8%AD%9C%E3%82%92%E8%AA%AD%E3%82%80%E3%81%AB%E3%82%83
 * https://wikiwiki.jp/majsoul-api/%E5%AE%9A%E6%95%B0%E4%B8%80%E8%A6%A7%E3%81%AB%E3%82%83
 */
export const MAHJONG_SOUL_GRADING_UNIT_MAP_VERSION = "majsoul-api-rank-ids-2026-10-06" as const;

export type MahjongSoulGradingUnit = "dan_pt" | "soul_pearl" | "unknown";

const FOUR_PLAYER_RANKED_MODES = new Set([2, 3, 5, 6, 8, 9, 11, 12, 15, 16]);
const THREE_PLAYER_RANKED_MODES = new Set([17, 18, 19, 20, 21, 22, 23, 24, 25, 26]);

function playerUnit(levelId: unknown, playerCount: 3 | 4): MahjongSoulGradingUnit {
  if (typeof levelId !== "number" || !Number.isInteger(levelId)) return "unknown";
  const prefix = playerCount === 4 ? 1 : 2;
  const rankTier = Math.floor(levelId / 100);
  const rankStar = levelId % 100;
  if (rankTier >= prefix * 100 + 1 && rankTier <= prefix * 100 + 5
    && rankStar >= 1 && rankStar <= 3) return "dan_pt";
  if (levelId === (playerCount === 4 ? 10_601 : 20_601)) return "dan_pt";
  const soulTier = prefix * 100 + 7;
  if (Math.floor(levelId / 100) === soulTier && levelId % 100 >= 1 && levelId % 100 <= 20) {
    return "soul_pearl";
  }
  return "unknown";
}

/** Classify only ranked mode IDs whose source table identifies a rank room. */
export function resolveMahjongSoulGradingUnit(
  modeId: unknown,
  fourPlayerLevelId: unknown,
  threePlayerLevelId: unknown,
): MahjongSoulGradingUnit {
  if (typeof modeId !== "number" || !Number.isInteger(modeId)) return "unknown";
  if (FOUR_PLAYER_RANKED_MODES.has(modeId)) return playerUnit(fourPlayerLevelId, 4);
  if (THREE_PLAYER_RANKED_MODES.has(modeId)) return playerUnit(threePlayerLevelId, 3);
  return "unknown";
}
