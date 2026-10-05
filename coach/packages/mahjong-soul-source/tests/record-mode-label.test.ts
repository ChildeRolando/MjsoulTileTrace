import { describe, expect, it } from "vitest";
import {
  MAHJONG_SOUL_MODE_LABEL_MAP_VERSION,
  resolveMahjongSoulRecordModeLabel,
} from "../src/record-mode-label.js";

describe("versioned Mahjong Soul record mode labels", () => {
  it("maps source-documented four-player room and length IDs", () => {
    expect(MAHJONG_SOUL_MODE_LABEL_MAP_VERSION).toBe("majsoul-api-mode-table-2026-10-06");
    expect([2, 3, 5, 6, 8, 9, 11, 12, 13, 14, 15, 16].map(resolveMahjongSoulRecordModeLabel)).toEqual([
      "四人铜之间 · 东风",
      "四人铜之间 · 半庄",
      "四人银之间 · 东风",
      "四人银之间 · 半庄",
      "四人金之间 · 东风",
      "四人金之间 · 半庄",
      "四人玉之间 · 东风",
      "四人玉之间 · 半庄",
      "四人大会战 · 乱斗之间 · 东风",
      "四人大会战 · 乱斗之间 · 半庄",
      "四人王座之间 · 东风",
      "四人王座之间 · 半庄",
    ]);
  });

  it("maps three-player rows distinctly and leaves undocumented IDs unknown", () => {
    expect(resolveMahjongSoulRecordModeLabel(17)).toBe("三人铜之间 · 东风");
    expect(resolveMahjongSoulRecordModeLabel(18)).toBe("三人铜之间 · 半庄");
    expect(resolveMahjongSoulRecordModeLabel(4)).toBeNull();
    expect(resolveMahjongSoulRecordModeLabel(99)).toBeNull();
    expect(resolveMahjongSoulRecordModeLabel(undefined)).toBeNull();
  });
});
