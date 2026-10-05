import { describe, expect, it } from "vitest";
import {
  MAHJONG_SOUL_GRADING_UNIT_MAP_VERSION,
  resolveMahjongSoulGradingUnit,
} from "../src/record-grading-unit.js";

describe("Mahjong Soul grading score display units", () => {
  it("uses the matching four-player/four-player and three-player rank ID families", () => {
    expect(resolveMahjongSoulGradingUnit(6, 10501, 20202)).toBe("dan_pt");
    expect(resolveMahjongSoulGradingUnit(22, 10501, 20703)).toBe("soul_pearl");
  });

  it("keeps old Soul rank IDs as rank points and unknown or unranked IDs unlabelled", () => {
    expect(resolveMahjongSoulGradingUnit(6, 10601, 0)).toBe("dan_pt");
    expect(resolveMahjongSoulGradingUnit(6, 10721, 0)).toBe("unknown");
    expect(resolveMahjongSoulGradingUnit(14, 10703, 0)).toBe("unknown");
    expect(resolveMahjongSoulGradingUnit(99, 10501, 0)).toBe("unknown");
    expect(resolveMahjongSoulGradingUnit(6, undefined, 20202)).toBe("unknown");
    expect(MAHJONG_SOUL_GRADING_UNIT_MAP_VERSION).toBe("majsoul-api-rank-ids-2026-10-06");
  });
});
