import { describe, expect, it } from "vitest";
import { groupedSplit } from "../src/groups.js";
import { handFamily } from "../src/construct.js";
describe("family-isolated model evaluation", () => {
  it("unions shared variants and isomorphic families before reserving 20%", () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({
      groupId: `g${i}`,
      family: `f${i}`,
    }));
    rows.push({ groupId: "g0", family: "f1" });
    const split = groupedSplit(rows);
    expect(split.groupMap.g0).toBe(split.groupMap.g1);
    expect(split.testGroups).toHaveLength(2);
    const train = rows.filter(
      (r) => !split.testGroups.includes(split.groupMap[r.groupId]!),
    );
    const test = rows.filter((r) =>
      split.testGroups.includes(split.groupMap[r.groupId]!),
    );
    expect(train.some((a) => test.some((b) => a.family === b.family))).toBe(
      false,
    );
  });
  it("keeps a frozen holdout and rejects a later bridge from training", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
        groupId: `g${i}`,
        family: `f${i}`,
      })),
      split = groupedSplit(rows);
    const test = rows.find((r) =>
        split.testGroups.includes(split.groupMap[r.groupId]!),
      )!,
      train = rows.find(
        (r) => !split.testGroups.includes(split.groupMap[r.groupId]!),
      )!;
    expect(() =>
      groupedSplit(
        [...rows, { groupId: train.groupId, family: test.family }],
        split,
      ),
    ).toThrow("holdout_family_collision");
  });
  it("recognizes suit permutations and rank mirrors without inspecting answers", () => {
    expect(handFamily(["1m", "2m", "3m", "E"])).toBe(
      handFamily(["9p", "8p", "7p", "E"]),
    );
  });
});
