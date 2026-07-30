import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  analyzeRegressionFixture,
  validateStrictAnalysisPackage,
  type StrictAnalysisPackage,
} from "../src/index.js";

const fixtureUrl = new URL(
  "../../../fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json",
  import.meta.url,
);

describe("public strict reasoning pipeline", () => {
  it("returns two validated, serializable East 1 analysis packages", async () => {
    const raw = JSON.parse(await readFile(fixtureUrl, "utf8"));
    const results = analyzeRegressionFixture(raw);

    expect(results).toHaveLength(2);
    expect(results.map((result) => result.decision.decisionId)).toEqual([
      "east1-turn6",
      "east1-turn7",
    ]);
    for (const result of results) {
      expect(result.decision.modelReason).toBe("unknown");
      expect(result.coachJudgement).toBeNull();
      expect(result.factors.supportsModelAction.length).toBeGreaterThan(0);
      expect(result.factors.supportsActualAction.length).toBeGreaterThan(0);
      const roundTrip = JSON.parse(
        JSON.stringify(result),
      ) as StrictAnalysisPackage;
      expect(() => validateStrictAnalysisPackage(roundTrip)).not.toThrow();
    }
  });
});
