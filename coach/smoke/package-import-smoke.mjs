import assert from "node:assert/strict";
import test from "node:test";

test("workspace packages import as emitted JavaScript", async () => {
  const contracts = await import("@riichi-coach/contracts");
  const reasoning = await import("@riichi-coach/reasoning");

  assert.equal(typeof contracts.AnalysisRequestSchema.parse, "function");
  assert.equal(typeof contracts.ModelEvaluationSchema.parse, "function");
  assert.equal(typeof reasoning.analyzeRegressionFixture, "function");
  assert.equal(typeof reasoning.buildMortalModelEvaluation, "function");
  assert.equal(typeof reasoning.buildAkagiModelEvaluation, "function");
  assert.equal(typeof reasoning.freezeDetailPolicy, "function");
  assert.equal(typeof reasoning.classifyModelEvaluationDetail, "function");
  assert.equal(typeof reasoning.computePreferenceAgreement, "function");
  assert.equal(typeof reasoning.createPreferenceState, "function");
  assert.equal(typeof reasoning.validateStrictAnalysisPackage, "function");
});
