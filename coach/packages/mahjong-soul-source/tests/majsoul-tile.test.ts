import { describe, expect, it } from "vitest";
import { parseMajsoulRoundWind, parseMajsoulTile } from "../src/majsoul-tile.js";

describe("Mahjong Soul tile parsing", () => {
  it("maps every suited and honor rank to a canonical tile", () => {
    expect(parseMajsoulTile("1m")).toEqual({ id: "1m", red: false });
    expect(parseMajsoulTile("9s")).toEqual({ id: "9s", red: false });
    expect(parseMajsoulTile("1z")).toEqual({ id: "1z", red: false });
    expect(parseMajsoulTile("7z")).toEqual({ id: "7z", red: false });
  });

  it("maps red fives to the canonical red flag", () => {
    expect(parseMajsoulTile("0m")).toEqual({ id: "5m", red: true });
    expect(parseMajsoulTile("0p")).toEqual({ id: "5p", red: true });
    expect(parseMajsoulTile("0s")).toEqual({ id: "5s", red: true });
  });

  it.each([
    "10m", "0z", "1w", "", "m", "0m0m",
    null, 42, {}, " 1m",
  ])("rejects an invalid tile %#", (value) => {
    expect(() => parseMajsoulTile(value))
      .toThrow("mahjong_soul_canonical_mapping_failed");
  });

  it("maps the round wind and rejects an unknown chang", () => {
    expect(parseMajsoulRoundWind(0)).toBe("E");
    expect(parseMajsoulRoundWind(1)).toBe("S");
    expect(parseMajsoulRoundWind(2)).toBe("W");
    expect(() => parseMajsoulRoundWind(3))
      .toThrow("mahjong_soul_canonical_mapping_failed");
  });
});
