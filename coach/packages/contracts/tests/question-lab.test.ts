import { describe, expect, it } from "vitest";
import {
  QuestionLabConfigSchema,
  CanonicalSourceKindSchema,
} from "../src/index.js";

describe("question lab config trust boundary", () => {
  it("expands explicit reproducible defaults and admits synthetic provenance", () => {
    const config = QuestionLabConfigSchema.parse({
      schemaVersion: "question-lab-config/v1",
      seed: 42,
    });
    expect(config.budget.concurrency).toBe(2);
    expect(config.budget.refinementRounds).toBe(3);
    expect(config.hypotheses.map((row) => row.id)).toEqual([
      "shanten",
      "ukeire",
      "dora",
    ]);
    expect(CanonicalSourceKindSchema.parse("synthetic")).toBe("synthetic");
  });
  it("rejects unknown fields, unsupported predicates and impossible domains", () => {
    for (const input of [
      { secret: true },
      { scene: { selfActor: { range: [4, 5] } } },
      { constraints: { predicate: "invented", args: [] } },
      { budget: { concurrency: 0 } },
    ])
      expect(() =>
        QuestionLabConfigSchema.parse({
          schemaVersion: "question-lab-config/v1",
          seed: 1,
          ...input,
        }),
      ).toThrow();
  });
});
