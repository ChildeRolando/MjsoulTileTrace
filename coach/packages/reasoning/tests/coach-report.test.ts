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

async function mutableFixture() {
  return structuredClone(await fixtureRaw());
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

  it("binds junme to the exact numbered self draw instead of an earlier equal tile", async () => {
    const raw = await mutableFixture();
    raw.mjaiLog[40].pai = "6s";

    const game = importPrototypeGame(raw);

    expect(game.decisions[0]?.sceneEventRef).toBe("event-50");
  });

  it("rejects a decision whose numbered self draw has a different tile including red identity", async () => {
    const wrongTurn = await mutableFixture();
    wrongTurn.decisions[0].junme = 5;
    expect(() => importPrototypeGame(wrongTurn)).toThrowError(
      /^prototype_decision_scene_mismatch$/,
    );

    const wrongRed = await mutableFixture();
    wrongRed.mjaiLog[50].pai = "5s";
    wrongRed.decisions[0].tile = "5sr";
    expect(() => importPrototypeGame(wrongRed)).toThrowError(
      /^prototype_decision_scene_mismatch$/,
    );
  });

  it.each(["at_self_chi_pon", "at_self_riichi", "at_opponent_kakan"])(
    "fails closed for the unsupported %s decision window",
    async (flag) => {
      const raw = await mutableFixture();
      raw.decisions[0][flag] = true;

      expect(() => importPrototypeGame(raw)).toThrowError(
        /^prototype_decision_window_unsupported$/,
      );
    },
  );

  it("fails closed when the actual action is absent from model-scored details", async () => {
    const raw = await mutableFixture();
    const actual = raw.decisions[0].actual;
    raw.decisions[0].details = raw.decisions[0].details.filter(
      (detail: { action: unknown }) =>
        JSON.stringify(detail.action) !== JSON.stringify(actual),
    );

    expect(() => importPrototypeGame(raw)).toThrowError(
      /^prototype_actual_action_not_model_scored$/,
    );
  });

  it("fails closed when the model action is absent from model-scored details", async () => {
    const raw = await mutableFixture();
    const expected = raw.decisions[0].expected;
    raw.decisions[0].details = raw.decisions[0].details.filter(
      (detail: { action: unknown }) =>
        JSON.stringify(detail.action) !== JSON.stringify(expected),
    );

    expect(() => importPrototypeGame(raw)).toThrowError(
      /^prototype_model_action_not_model_scored$/,
    );
  });

  it("deduplicates equal actual and model actions by canonical actionRef", async () => {
    const raw = await mutableFixture();
    raw.decisions = [raw.decisions[0]];
    raw.decisions[0].expected = structuredClone(raw.decisions[0].actual);
    const client = engine();
    try {
      const report = await analyzePrototypeGame(raw, client);

      expect(report.decisions).toHaveLength(1);
      expect(report.decisions[0]?.candidates).toEqual([
        expect.objectContaining({
          isActual: true,
          origins: ["model", "actual"],
        }),
      ]);
    } finally {
      await client.close();
    }
  }, 30000);

  it("keeps distinct actual and model candidate origins separate", async () => {
    const client = engine();
    try {
      const report = await analyzePrototypeGame(await fixtureRaw(), client);
      const candidates = report.decisions[0]?.candidates ?? [];

      expect(candidates).toHaveLength(2);
      expect(candidates.find((entry) => entry.isActual)?.origins)
        .toEqual(["model", "actual"]);
      expect(candidates.find((entry) => !entry.isActual)?.origins)
        .toEqual(["model"]);
    } finally {
      await client.close();
    }
  }, 30000);

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

  it("attributes each actor-keyed genbutsu difference only to its supported action", async () => {
    const raw = await mutableFixture();
    raw.decisions = [raw.decisions[0]];
    raw.mjaiLog.splice(37, 0, { type: "reach", actor: 1 });
    raw.mjaiLog.splice(39, 0, { type: "reach_accepted", actor: 1 });
    raw.mjaiLog[47].tsumogiri = true;
    raw.mjaiLog = raw.mjaiLog.slice(0, 53);
    const client = engine();
    try {
      const report = await analyzePrototypeGame(raw, client);
      const explanation = report.decisions[0]?.explanation ?? "";

      expect(explanation).toContain("防守支持摸切6索（对 玩家2 现物）");
      expect(explanation).not.toContain("玩家1");
    } finally {
      await client.close();
    }
  }, 30000);
});
