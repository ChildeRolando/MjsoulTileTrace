import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  JsonlFactEngineClient,
  ManagedFactEngineTransport,
} from "../src/index.js";
import {
  analyzePrototypeGame,
  importPrototypeGame,
  renderCoachGameMarkdown,
} from "../src/prototype/coach-report.js";

const fixtureUrl = new URL(
  "../../../fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json",
  import.meta.url,
);
const resourcesUrl = new URL("../../../resources/", import.meta.url);

async function fixtureRaw() {
  return JSON.parse(await readFile(fileURLToPath(fixtureUrl), "utf8"));
}

function engine() {
  return new JsonlFactEngineClient(
    new ManagedFactEngineTransport(fileURLToPath(resourcesUrl)),
  );
}

describe("prototype coach report", () => {
  it("maps the East 1 fixture decisions to their replay scene events", async () => {
    const game = importPrototypeGame(await fixtureRaw());
    expect(game.sourceReportId).toBe("c1924cad66f66dd9");
    expect(game.selfActor).toBe(3);
    expect(game.decisions.map((entry) => entry.sceneEventRef))
      .toEqual(["event-50", "event-62"]);
    expect(game.decisions.map((entry) => entry.drawnTile.id))
      .toEqual(["6s", "8p"]);
    expect(game.decisions.map((entry) => entry.actualActionId))
      .toEqual(["discard:2p:tedashi", "discard:7p:tedashi"]);
  });

  it("keeps efficiency and defense on their correct axes end to end", async () => {
    const client = engine();
    try {
      const report = await analyzePrototypeGame(await fixtureRaw(), client);
      expect(report.decisions).toHaveLength(2);
      const turn6 = report.decisions[0]!;
      const turn7 = report.decisions[1]!;

      expect(turn6.preferences.efficiency).toEqual(["切2筒"]);
      expect(turn6.preferences.defense).toEqual(["摸切6索"]);
      expect(turn6.preferences.applied).toBeNull();
      expect(turn6.explanation).toContain("牌效支持切2筒");
      expect(turn6.explanation).toContain("现物");

      const sixSou = turn6.candidates.find((entry) => entry.label === "摸切6索");
      expect(sixSou).toBeDefined();
      expect(sixSou?.defense.find((cell) => cell.actor === 2)?.genbutsu)
        .toBe("genbutsu");
      expect(sixSou?.shanten).toBeTypeOf("number");

      expect(turn7.preferences.efficiency).toEqual(["切7筒"]);
      expect(turn7.preferences.defense).toEqual(["摸切8筒"]);
      expect(turn7.preferences.applied).toBeNull();
      const eightPin = turn7.candidates.find((entry) => entry.label === "摸切8筒");
      expect(eightPin?.defense.find((cell) => cell.actor === 2)?.genbutsu)
        .toBe("genbutsu");
      expect(turn7.explanation).toContain("综合攻守冲突");
    } finally {
      await client.close();
    }
  }, 30000);

  it("renders a readable markdown report with the evidence boundary", async () => {
    const client = engine();
    try {
      const report = await analyzePrototypeGame(await fixtureRaw(), client);
      const markdown = renderCoachGameMarkdown(report);
      expect(markdown).toContain("# 日麻教练分析报告");
      expect(markdown).toContain("牌效支持切2筒");
      expect(markdown).toContain("玩家2现物");
      expect(markdown).toContain("不是放铳概率");
      expect(markdown).toContain("legacy_regression_bridge_only");
    } finally {
      await client.close();
    }
  }, 30000);
});
