import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { importRegressionFixture } from "../src/import/mortal-report.js";
import { replayToDecision } from "../src/replay/scene-replayer.js";

const fixtureUrl = new URL(
  "../../../fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json",
  import.meta.url,
);

async function load() {
  return importRegressionFixture(JSON.parse(await readFile(fixtureUrl, "utf8")));
}

describe("scene replayer", () => {
  it("freezes turn 6 after the draw with actor 2 riichi and ippatsu alive", async () => {
    const { events, decisions } = await load();
    const scene = replayToDecision(events, decisions[0]!);

    expect(scene.currentDraw).toMatchObject({ id: "6s" });
    expect(scene.selfHand.map((tile) => tile.id)).toContain("2p");
    expect(scene.threats[2]).toMatchObject({
      actor: 2,
      riichi: true,
      declarationEventId: "event-47",
      ippatsuAlive: true,
    });
    expect(scene.rivers[2]!.map((discard) => discard.tile.id)).toEqual(
      expect.arrayContaining(["8p", "6s"]),
    );
    expect(scene.scores).toEqual([25000, 25000, 24000, 25000]);
    expect(scene.kyotaku).toBe(1);
  });

  it("keeps riichi but cancels ippatsu after the intervening pon at turn 7", async () => {
    const { events, decisions } = await load();
    const scene = replayToDecision(events, decisions[1]!);

    expect(scene.currentDraw).toMatchObject({ id: "8p" });
    expect(scene.threats[2]).toMatchObject({ riichi: true, ippatsuAlive: false });
    expect(scene.eventIds).toContain("event-58");
  });
});
