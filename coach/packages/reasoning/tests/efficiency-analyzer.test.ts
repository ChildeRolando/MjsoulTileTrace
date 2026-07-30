import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { importRegressionFixture } from "../src/import/mortal-report.js";
import { replayToDecision } from "../src/replay/scene-replayer.js";
import {
  analyzeAllDiscardEfficiency,
  compareDiscardEfficiency,
} from "../src/analysis/efficiency-analyzer.js";

const fixtureUrl = new URL(
  "../../../fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json",
  import.meta.url,
);

async function loadRegression() {
  const raw = JSON.parse(await readFile(fixtureUrl, "utf8"));
  return importRegressionFixture(raw);
}

describe("efficiency analyzer", () => {
  it.each([
    [0, 2, 3, "discard:2p:tedashi", "discard:6s:tsumogiri"],
    [1, 1, 2, "discard:7p:tedashi", "discard:8p:tsumogiri"],
  ] as const)(
    "records lower standard-hand shanten as the efficiency factor in regression %s",
    async (index, actualShanten, modelShanten, actualAction, modelAction) => {
      const { selfActor, events, decisions } = await loadRegression();
      const scene = replayToDecision(events, decisions[index]!, selfActor);
      const result = compareDiscardEfficiency(scene, actualAction, modelAction);

      expect(result.metrics[actualAction]?.shanten).toBe(actualShanten);
      expect(result.metrics[modelAction]?.shanten).toBe(modelShanten);
      expect(result.factor).toMatchObject({
        axis: "efficiency",
        dimension: "standard_hand_shanten",
        direction: "supports_subject",
        subjectAction: actualAction,
        comparisonAction: modelAction,
        provenance: "deterministic",
        confidence: "certain",
        evidenceIds: [scene.decisionEventId],
      });
      expect(result.factor.statement).toContain("lower standard-hand shanten");
    },
  );

  it("keeps unadjusted ukeire as a diagnostic and never uses it to rank equal-shanten actions", async () => {
    const { selfActor, events, decisions } = await loadRegression();
    const scene = replayToDecision(events, decisions[1]!, selfActor);
    const diagnostics = analyzeAllDiscardEfficiency(scene);

    expect(diagnostics["6m"]).toMatchObject({
      shanten: 1,
      unadjustedUkeire: 37,
    });
    expect(diagnostics["7p"]).toMatchObject({
      shanten: 1,
      unadjustedUkeire: 28,
    });

    const result = compareDiscardEfficiency(
      scene,
      "discard:7p:tedashi",
      "discard:6m:tedashi",
    );

    expect(result.factor.direction).toBe("neutral");
    expect(result.factor.statement).toContain(
      "live ukeire is not compared",
    );
    expect(result.factor.limitations).toContain(
      "Unadjusted ukeire does not subtract public visible tiles and cannot rank equal-shanten actions",
    );
  });
});
