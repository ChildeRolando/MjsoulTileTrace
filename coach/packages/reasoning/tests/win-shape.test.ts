/**
 * Winning-shape prefilter unit tests. The checker must be exhaustive in the
 * permissive direction: every decomposable shape is accepted (standard,
 * chiitoitsu, kokushi, plus deliberately illegal-but-even shapes that the
 * engine rules out); a miss here would silently drop real dama candidates.
 */
import { describe, expect, it } from "vitest";
import { isCompleteHandShape } from "../src/factors/win-shape.js";

function counts(ids: readonly string[]): number[] {
  const vector = Array<number>(34).fill(0);
  for (const id of ids) {
    const suit = id[1]!;
    const rank = Number(id[0]);
    const index = suit === "m" ? rank - 1
      : suit === "p" ? rank + 8
      : suit === "s" ? rank + 17
      : rank + 26;
    vector[index] = vector[index]! + 1;
  }
  return vector;
}

describe("isCompleteHandShape", () => {
  it("accepts an ordinary standard-form hand", () => {
    expect(isCompleteHandShape(
      counts(["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p", "4p"]),
    )).toBe(true);
  });

  it("accepts honors as triplet and pair, and mixed-suit runs", () => {
    expect(isCompleteHandShape(
      counts(["1m", "2m", "3m", "7p", "8p", "9p", "1s", "2s", "3s", "5z", "5z", "5z", "7z", "7z"]),
    )).toBe(true);
  });

  it("accepts pure nine gates (multi-decomposition hand)", () => {
    expect(isCompleteHandShape(
      counts(["1m", "1m", "1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "9m", "9m", "5m"]),
    )).toBe(true);
  });

  it("accepts chiitoitsu", () => {
    expect(isCompleteHandShape(
      counts(["1m", "1m", "3m", "3m", "5m", "5m", "2p", "2p", "4p", "4p", "6s", "6s", "8s", "8s"]),
    )).toBe(true);
  });

  it("is deliberately permissive on all-even counts a strict chiitoi rule rejects", () => {
    // Four of a kind read as two pairs: illegal chiitoitsu, but the checker
    // must hand the verdict to the engine, not skip the window.
    expect(isCompleteHandShape(
      counts(["1m", "1m", "1m", "1m", "3m", "3m", "5m", "5m", "2p", "2p", "4p", "4p", "6s", "6s"]),
    )).toBe(true);
  });

  it("accepts kokushi musou with any doubled orphan", () => {
    expect(isCompleteHandShape(
      counts(["1m", "9m", "1p", "9p", "1s", "9s", "1z", "2z", "3z", "4z", "5z", "6z", "7z", "1m"]),
    )).toBe(true);
  });

  it("rejects kokushi missing one orphan kind", () => {
    expect(isCompleteHandShape(
      counts(["1m", "9m", "1p", "9p", "1s", "9s", "1z", "2z", "3z", "4z", "5z", "6z", "6z", "1m"]),
    )).toBe(false);
  });

  it("rejects a tripled orphan shape that is neither kokushi nor anything else", () => {
    // 1z x3 + six honor pairs + 7z: not kokushi (a triple), not all-even,
    // no standard decomposition (honor sets are triplets only).
    expect(isCompleteHandShape(
      counts(["1z", "1z", "1z", "2z", "2z", "3z", "3z", "4z", "4z", "5z", "5z", "6z", "6z", "7z"]),
    )).toBe(false);
  });

  it("rejects tenpai shapes (13-tile-complete is not a winning hand)", () => {
    // 123m 456m 789m 123p + 4p alone: 13 kinds of tiles, one single short.
    expect(isCompleteHandShape(
      counts(["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p", "7s"]),
    )).toBe(false);
  });

  it("rejects runs across suit boundaries", () => {
    // 789m would need a 7m; 8m9m1p is not a run. No decomposition exists.
    expect(isCompleteHandShape(
      counts(["8m", "9m", "1p", "8m", "9m", "1p", "2p", "3p", "4p", "5p", "6p", "7s", "8s", "9s"]),
    )).toBe(false);
  });

  it("rejects a near-miss that tempts a wrong pair choice", () => {
    // 3 sets + 3 partial sets, no pair: every decomposition fails.
    expect(isCompleteHandShape(
      counts(["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "5s", "7s"]),
    )).toBe(false);
  });

  it("rejects invalid vectors outright", () => {
    expect(isCompleteHandShape(Array<number>(34).fill(0))).toBe(false);
    expect(isCompleteHandShape(counts(["1m"]))).toBe(false);
    expect(isCompleteHandShape(Array<number>(33).fill(0))).toBe(false);
    expect(isCompleteHandShape(
      Array<number>(34).fill(0).map((_, index) => (index === 0 ? 0.5 : 0)),
    )).toBe(false);
    // Five of one kind is physically impossible and rejected defensively,
    // even though the four-of-a-kind version IS decomposable (triplet+run).
    const five = counts(["1m", "1m", "1m", "1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p"]);
    five[0] = five[0]! + 1;
    expect(five[0]).toBe(5);
    expect(isCompleteHandShape(five)).toBe(false);
    expect(isCompleteHandShape(
      counts(["1m", "1m", "1m", "1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "1p"]),
    )).toBe(true);
  });
});
