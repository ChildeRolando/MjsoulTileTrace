import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { importRegressionFixture } from "../src/import/mortal-report.js";

const fixtureUrl = new URL(
  "../../../fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json",
  import.meta.url,
);

describe("Mortal report importer", () => {
  it("preserves model facts but fixes modelReason to unknown", async () => {
    const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
    const imported = importRegressionFixture(fixture);

    expect(imported.selfActor).toBe(3);
    expect(imported.decisions).toHaveLength(2);
    expect(imported.decisions[0]).toMatchObject({
      decisionId: "east1-turn6",
      sceneEventId: "event-50",
      modelAction: "discard:6s:tsumogiri",
      actualAction: "discard:2p:tedashi",
      modelReason: "unknown",
    });
    expect(imported.decisions[0]?.candidates[0]?.probability).toBeCloseTo(0.992823, 6);
    expect(imported.decisions[1]).toMatchObject({
      decisionId: "east1-turn7",
      sceneEventId: "event-62",
      modelAction: "discard:8p:tsumogiri",
      actualAction: "discard:7p:tedashi",
      modelReason: "unknown",
    });
  });
});
