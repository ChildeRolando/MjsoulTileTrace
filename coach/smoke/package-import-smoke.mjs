import assert from "node:assert/strict";
import test from "node:test";

test("workspace packages import as emitted JavaScript", async () => {
  const contracts = await import("@riichi-coach/contracts");
  const reasoning = await import("@riichi-coach/reasoning");

  assert.equal(typeof contracts.AnalysisRequestSchema.parse, "function");
  assert.equal(typeof contracts.ModelEvaluationSchema.parse, "function");
  assert.equal(typeof contracts.RiichiActionSchema.parse, "function");
  assert.equal(typeof contracts.DecisionWindowSchema.parse, "function");
  assert.equal(typeof contracts.canonicalActionRef, "function");
  assert.equal(
    typeof contracts.StructuredComparisonSetSchema.parse,
    "function",
  );
  assert.equal(typeof contracts.toComparisonSet, "function");
  assert.equal(contracts.HAND_STRUCTURE_SCHEMA_VERSION, "hand-structure/v2");
  assert.equal(typeof contracts.HandStructureResultV2Schema.parse, "function");
  assert.equal(contracts.DEFENSE_MATRIX_SCHEMA_VERSION, "defense-matrix/v1");
  assert.equal(typeof contracts.DefenseMatrixV1Schema.parse, "function");
  assert.equal(
    typeof contracts.CandidateNormalizationResultSchema.parse,
    "function",
  );
  assert.equal(typeof reasoning.analyzeRegressionFixture, "function");
  assert.equal(typeof reasoning.buildMortalModelEvaluation, "function");
  assert.equal(typeof reasoning.buildAkagiModelEvaluation, "function");
  assert.equal(typeof reasoning.freezeDetailPolicy, "function");
  assert.equal(typeof reasoning.classifyModelEvaluationDetail, "function");
  assert.equal(typeof reasoning.computePreferenceAgreement, "function");
  assert.equal(typeof reasoning.createPreferenceState, "function");
  assert.equal(typeof reasoning.validateStrictAnalysisPackage, "function");
  assert.equal(typeof reasoning.userActionDraftToActionDraft, "function");
  assert.equal(typeof reasoning.normalizeCandidate, "function");
  assert.equal(typeof reasoning.buildStructuredComparisonSet, "function");
  assert.equal(typeof reasoning.runTypedActionAdapter, "function");
  assert.equal(typeof reasoning.adaptMjaiActionSequence, "function");
  assert.equal(
    typeof reasoning.importStructuredMortalComparison,
    "function",
  );
  assert.equal(
    typeof reasoning.legacyDiscardActionIdToAction,
    "function",
  );
  assert.equal(
    typeof reasoning.actionToLegacyDiscardActionId,
    "function",
  );
  assert.equal(typeof reasoning.buildHandStructureRequestV2, "function");
  assert.equal(typeof reasoning.mergeHandStructureFuriten, "function");
  assert.equal(
    typeof reasoning.mapMergedHandFuritenToEfficiencyFacts,
    "function",
  );
  assert.equal(typeof reasoning.deriveResponseFuriten, "function");
  assert.equal(typeof reasoning.projectAnalyzedKnownGameFactsV2, "function");
  assert.equal(typeof reasoning.runStructuredAnalysisAssembly, "function");
  assert.equal(typeof reasoning.validateHandStructureResult, "function");
  assert.equal(typeof reasoning.buildDeterministicDefenseMatrix, "function");
  assert.equal(typeof reasoning.assembleDefenseMatrix, "function");
  assert.equal(reasoning.bridgeLegacyRegressionEvents, undefined);
  assert.equal(reasoning.buildLegacyRegressionPipelineInput, undefined);
});
