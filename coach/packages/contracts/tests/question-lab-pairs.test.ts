import { it, expect } from "vitest";
import { PairStudyConfigSchema, PairSvrModelSchema, QuestionLabConfigSchema } from "../src/index.js";
it("expands the strict paired study without changing v1 hypothesis semantics", () => {
  const config = PairStudyConfigSchema.parse({ schemaVersion: "question-lab-pairs-config/v2" });
  expect(config.budget).toMatchObject({ maxAttempts: 40000, timeLimitSeconds: 3600, reserveSeconds: 300, concurrency: 2 });
  expect(config.scans).toMatchObject({ anchorCount: 24, variantsPerAnchor: 48, threats: true });
  const old = QuestionLabConfigSchema.parse({ schemaVersion: "question-lab-config/v1", seed: 1 });
  expect(old.hypotheses.find(h => h.id === "dora")!.recommend).toEqual({ metric: "dora", direction: "max" });
  expect(() => PairStudyConfigSchema.parse({ ...config, initialCount: 3 })).toThrow();
  expect(() => PairStudyConfigSchema.parse({ ...config, rules: "custom" })).toThrow();
  expect(() => PairStudyConfigSchema.parse({ ...config, learning: { ...config.learning, robustGap: .001 } })).toThrow();
});
it("rejects invalid SVR dimensions and answer-bearing feature names", () => {
  const model = { schemaVersion: "question-lab-svr/v2", features: ["deltaU"], mean: [0], scale: [1],
    supportVectors: [[1]], coefficients: [2], intercept: 0, kernel: "linear", gamma: 1, C: 1, epsilon: .01 };
  expect(PairSvrModelSchema.parse(model).features).toEqual(["deltaU"]);
  expect(() => PairSvrModelSchema.parse({ ...model, features: ["mortalQ"] })).toThrow();
  expect(() => PairSvrModelSchema.parse({ ...model, supportVectors: [[1, 2]] })).toThrow();
});
