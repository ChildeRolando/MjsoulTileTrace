import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { Axis } from "@riichi-coach/contracts";
import { importRegressionFixture } from "../src/import/mortal-report.js";
import {
  buildStrictAnalysisPackage,
  type StrictAnalysisPackage,
} from "../src/package/build-strict-analysis-package.js";
import { replayToDecision } from "../src/replay/scene-replayer.js";
import { validateStrictAnalysisPackage } from "../src/validate/package-validator.js";

const fixtureUrl = new URL(
  "../../../fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json",
  import.meta.url,
);

async function buildRegression(index: 0 | 1): Promise<StrictAnalysisPackage> {
  const raw = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const { events, decisions, selfActor } = importRegressionFixture(raw);
  const decision = decisions[index]!;
  const scene = replayToDecision(events, decision, selfActor);
  return buildStrictAnalysisPackage({ events, decision, scene });
}

function clonePackage(value: StrictAnalysisPackage): StrictAnalysisPackage {
  return structuredClone(value);
}

describe("strict public analysis package", () => {
  it.each([
    [
      0,
      "切2筒后为2向听",
      "摸切6索后为3向听",
      "摸切6索对actor 2是现物",
      "一发窗口仍有效",
    ],
    [
      1,
      "切7筒后为1向听",
      "摸切8筒后为2向听",
      "摸切8筒对actor 2是现物",
      "一发窗口已经结束",
    ],
  ] as const)(
    "builds auditable regression %s without inventing a coach recommendation",
    async (
      index,
      actualEfficiency,
      modelEfficiency,
      safety,
      ippatsuState,
    ) => {
      const result = await buildRegression(index);

      expect(() => validateStrictAnalysisPackage(result)).not.toThrow();
      expect(result.coachJudgement).toBeNull();
      expect(result.blockedRules.map((rule) => rule.ruleId)).toEqual([
        "PF-03@1",
      ]);
      expect(result.primaryAxes).toEqual(["defense", "efficiency"]);
      expect(
        result.factors.supportsModelAction.every(
          (factor) => typeof factor !== "string",
        ),
      ).toBe(true);
      expect(
        result.factors.supportsActualAction.every(
          (factor) => typeof factor !== "string",
        ),
      ).toBe(true);
      expect(result.deterministicExplanation).toContain(actualEfficiency);
      expect(result.deterministicExplanation).toContain(modelEfficiency);
      expect(result.deterministicExplanation).toContain(safety);
      expect(result.deterministicExplanation).toContain(ippatsuState);
      expect(result.deterministicExplanation).toContain(
        "完整价值、顺位结果路径、校准放铳概率仍未知",
      );
      expect(result.deterministicExplanation).toContain(
        "无法知道Mortal的内部原因",
      );
      expect(result.deterministicExplanation).toContain(
        "教练暂不给最终攻守建议",
      );
      expect(result.deterministicExplanation).not.toContain("冗余");
      expect(result.deterministicExplanation).not.toContain("Mortal因为");
    },
  );

  it("rejects a factor placed in two direction buckets", async () => {
    const result = clonePackage(await buildRegression(0));
    result.factors.supportsActualAction.push(
      result.factors.supportsModelAction[0]!,
    );

    expect(() => validateStrictAnalysisPackage(result)).toThrow(
      /exactly one direction bucket/,
    );
  });

  it("rejects a dangling evidence reference structurally", async () => {
    const result = clonePackage(await buildRegression(0));
    result.factors.supportsModelAction[0]!.evidenceIds = ["event-missing"];

    expect(() => validateStrictAnalysisPackage(result)).toThrow(
      /Unresolved evidence ID/,
    );
  });

  it("rejects primary axes that were not derived from directional factors", async () => {
    const result = clonePackage(await buildRegression(0));
    result.primaryAxes = ["value"] as Axis[];

    expect(() => validateStrictAnalysisPackage(result)).toThrow(
      /primary axes/,
    );
  });

  it("rejects unknown rule references and forged judgements", async () => {
    const unknownRule = clonePackage(await buildRegression(0));
    unknownRule.blockedRules[0]!.ruleId = "PF-unknown@1";
    expect(() => validateStrictAnalysisPackage(unknownRule)).toThrow(
      /Unknown teaching rule/,
    );

    const forgedJudgement = clonePackage(await buildRegression(0));
    forgedJudgement.coachJudgement = {
      recommendedAction: forgedJudgement.decision.modelAction,
      ruleIds: ["PF-03@1"],
      confidence: "high",
    };
    expect(() => validateStrictAnalysisPackage(forgedJudgement)).toThrow(
      /policy evidence/,
    );
  });

  it("rejects model facts that no longer match the candidate table", async () => {
    const result = clonePackage(await buildRegression(0));
    result.decision.modelAction = "discard:1z:tedashi";

    expect(() => validateStrictAnalysisPackage(result)).toThrow(
      /model action is absent from candidates/,
    );
  });
});
