import assert from "node:assert/strict";
import test from "node:test";

test("reasoning workspace package imports as emitted JavaScript", async () => {
  const reasoning = await import("@riichi-coach/reasoning");

  assert.equal(typeof reasoning.analyzeRegressionFixture, "function");
  assert.equal(typeof reasoning.validateStrictAnalysisPackage, "function");
});
