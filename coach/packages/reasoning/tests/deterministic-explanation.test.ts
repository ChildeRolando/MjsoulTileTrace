import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { SceneSnapshot } from "@riichi-coach/contracts";
import { compareDecision } from "../src/compare/action-comparator.js";
import {
  formatActionLabel,
  renderDeterministicExplanation,
} from "../src/explain/deterministic-explanation.js";
import { importRegressionFixture } from "../src/import/mortal-report.js";
import {
  judgeDecision,
  TEACHING_RULE_REGISTRY,
} from "../src/policy/teaching-policy.js";
import { replayToDecision } from "../src/replay/scene-replayer.js";

const fixtureUrl = new URL(
  "../../../fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json",
  import.meta.url,
);

describe("deterministic explanation rendering", () => {
  it("keeps red-five identity in user-facing action labels", () => {
    expect(formatActionLabel("discard:5pr:tedashi")).toBe("切赤5筒");
    expect(formatActionLabel("discard:5p:tedashi")).toBe("切5筒");
    expect(formatActionLabel("discard:5mr:tsumogiri")).toBe("摸切赤5万");
  });

  it("describes deterministic safety on the actual-action side symmetrically", async () => {
    const raw = JSON.parse(await readFile(fixtureUrl, "utf8"));
    const { events, decisions, selfActor } = importRegressionFixture(raw);
    const decision = decisions[0]!;
    const scene = replayToDecision(events, decision, selfActor);
    const actualSafeScene: SceneSnapshot = {
      ...scene,
      rivers: scene.rivers.map((river, actor) =>
        river.map((discard) =>
          actor === 2 && discard.eventId === "event-48"
            ? { ...discard, tile: { id: "2p", red: false } }
            : discard,
        ),
      ),
    };
    const ledger = compareDecision(actualSafeScene, decision);
    const factors = [
      ...ledger.supportsModelAction,
      ...ledger.supportsActualAction,
      ...ledger.neutralFactors,
    ];
    const policy = judgeDecision({
      factors,
      candidateLedgers: ledger.candidateLedgers,
      coverage: ledger.coverage,
      ruleRegistry: TEACHING_RULE_REGISTRY,
    });
    const text = renderDeterministicExplanation({
      decision,
      ledger,
      policy,
    });

    expect(text).toContain("切2筒对actor 2是现物");
    expect(text).toContain("摸切6索没有针对该玩家的确定安全证据");
  });
});
