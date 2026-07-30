import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { importRegressionFixture } from "../src/import/mortal-report.js";
import { replayToDecision } from "../src/replay/scene-replayer.js";
import { compareDeterministicSafety } from "../src/analysis/tile-safety-analyzer.js";

const fixtureUrl = new URL(
  "../../../fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json",
  import.meta.url,
);

describe("tile safety analyzer", () => {
  it.each([
    [0, "discard:6s:tsumogiri", "discard:2p:tedashi", "event-48"],
    [1, "discard:8p:tsumogiri", "discard:7p:tedashi", "event-39"],
  ] as const)(
    "proves model action genbutsu against actor 2 in regression %s",
    async (index, safeAction, otherAction, sourceEvent) => {
      const raw = JSON.parse(await readFile(fixtureUrl, "utf8"));
      const { selfActor, events, decisions } = importRegressionFixture(raw);
      const scene = replayToDecision(events, decisions[index]!, selfActor);
      const factor = compareDeterministicSafety(scene, safeAction, otherAction);

      expect(factor).not.toBeNull();
      if (!factor) {
        throw new Error("Expected deterministic safety evidence");
      }
      expect(factor.subjectAction).toBe(safeAction);
      expect(factor.direction).toBe("supports_subject");
      expect(factor.statement).toContain("actor 2");
      expect(factor.evidenceIds).toContain(sourceEvent);
      expect(factor.limitations).toContain("Safety applies to actor 2 only");
    },
  );

  it("does not describe one-player genbutsu as table-wide safety", async () => {
    const raw = JSON.parse(await readFile(fixtureUrl, "utf8"));
    const { selfActor, events, decisions } = importRegressionFixture(raw);
    const scene = replayToDecision(events, decisions[0]!, selfActor);
    const factor = compareDeterministicSafety(
      scene,
      "discard:6s:tsumogiri",
      "discard:2p:tedashi",
    );

    expect(factor).not.toBeNull();
    if (!factor) {
      throw new Error("Expected deterministic safety evidence");
    }
    expect(factor.statement).not.toContain("safe against everyone");
    expect(factor.statement).not.toContain("completely safe");
  });
});
