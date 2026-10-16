import { describe, it, expect } from "vitest";
import { PAIR_FEATURES, PairFitResultSchema } from "@riichi-coach/contracts";
import { pythonOperation } from "../src/learning.js";
import { predictPair } from "../src/pair-features.js";
import { digest } from "../src/config.js";

// Uses the separately pinned learning environment, never the Mortal environment.
describe.skipIf(process.env.COACH_QUESTION_LAB_NATIVE !== "1")("paired learning wire contract", () => {
  const rows = () => Array.from({ length: 60 }, (_, i) => ({
    pairId: digest(["pair", i]), sampleId: digest(["state", i]), groupId: digest(["source", Math.floor(i / 2)]),
    split: i < 48 ? "train" : "test", y: 0,
    features: Object.fromEntries(PAIR_FEATURES.map(f => [f, f === "deltaU" ? (i % 12 - 5.5) / 3 : 0])),
  }));
  const run = async (data: ReturnType<typeof rows>, evaluate = true) => PairFitResultSchema.parse(await pythonOperation({
    operation: "fit_pairs", rows: data, allFeatures: PAIR_FEATURES, featureSets: { full: ["deltaU"] },
    options: { maxTrainPairs: 6000, sensitiveGap: .01 }, evaluate,
  }));
  it("archives exact ties and small raw-Q differences without inventing confidence", async () => {
    const data = rows();
    for (const [i, row] of data.entries()) row.y = i % 3 === 0 ? 0 : i % 3 === 1 ? .005 : -.005;
    const result = await run(data), m = result.models.full!;
    expect(m.test).toMatchObject({ count: 12, exactTies: 4, sensitive: 12 });
    expect(m.test!.confusion[0]!.reduce((a, b) => a + b, 0)).toBe(0);
    expect(m.test!.confusion[2]!.reduce((a, b) => a + b, 0)).toBe(0);
    const changed = structuredClone(result); changed.evaluated = false;
    expect(() => PairFitResultSchema.parse(changed)).toThrow();
  });
  it("executes the serialized nonlinear kernel identically and keeps final evaluation out of fitting", async () => {
    const data = rows(); for (const row of data) row.y = row.features.deltaU! ** 2 - 1;
    const result = await run(data), m = result.models.full!;
    expect(m.model!.kernel).toBe("rbf");
    for (const p of m.predictions!) {
      const row = data.find(r => r.pairId === p.pairId)!;
      expect(predictPair(m.model!, row.features)).toBeCloseTo(p.predicted, 10);
    }
    const trainingOnly = await run(data, false);
    expect(trainingOnly.models.full!.model).toEqual(m.model);
    expect(trainingOnly.models.full!.oof).toEqual(m.oof);
    const incomplete = structuredClone(result); incomplete.models.full!.oof!.pop();
    expect(() => PairFitResultSchema.parse(incomplete)).toThrow();
  });
});
