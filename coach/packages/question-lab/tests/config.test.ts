import { describe, it, expect } from "vitest";
import { condition, scanChoice } from "../src/config.js";
import { LabConditionSchema } from "@riichi-coach/contracts";
describe("formal condition semantics", () => {
  it("scans each configured value once before cycling", () => {
    expect(
      [0, 1, 2].map(
        (i) => scanChoice({ oneOf: ["a", "b", "c"] }, "b", i).value,
      ),
    ).toEqual(["b", "c", "a"]);
    expect(scanChoice({ range: [2, 6], step: 2 }, 4, 1).value).toBe(6);
  });
  it("does not turn missing estimates into evidence by negation", () => {
    const rule = {
      not: {
        field: "candidate.valueEstimate" as const,
        op: "gt" as const,
        value: 1000,
      },
    };
    expect(condition(rule, { "candidate.valueEstimate": null })).toBe(false);
    expect(condition(rule, { "candidate.valueEstimate": 500 })).toBe(true);
    expect(
      condition(
        { all: [rule, { field: "turn", op: "eq", value: 3 }] },
        { "candidate.valueEstimate": null, turn: 3 },
      ),
    ).toBe(false);
  });
  it("rejects operands that do not match their formal feature types", () => {
    expect(() =>
      LabConditionSchema.parse({ field: "turn", op: "eq", value: "3" }),
    ).toThrow();
    expect(() =>
      LabConditionSchema.parse({
        field: "candidate.red",
        op: "eq",
        value: true,
      }),
    ).not.toThrow();
  });
});
