import assert from "node:assert/strict";
import test from "node:test";

test("workspace packages import as emitted JavaScript", async () => {
  const contracts = await import("@riichi-coach/contracts");
  const source = await import("@riichi-coach/mahjong-soul-source");
  const reasoning = await import("@riichi-coach/reasoning");
  const desktop = await import("@riichi-coach/desktop/session-api");

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
  assert.equal(contracts.MahjongSoulRegionSchema.parse("cn"), "cn");
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
  assert.equal(typeof reasoning.replayCanonicalStream, "function");
  assert.equal(typeof reasoning.buildMahjongSoulReplayAudit, "function");
  assert.equal(typeof reasoning.serializeMahjongSoulReplayAudit, "function");
  assert.equal(
    source.MAHJONG_SOUL_PROTOCOL_BUNDLE_VERSION,
    "mahjong-soul-cn-protocol/v1",
  );
  assert.equal(typeof source.loadMahjongSoulProtocolBundle, "function");
  assert.equal(typeof source.createLiqiCodec, "function");
  assert.equal(typeof source.extractCapturedLoginCredential, "function");
  assert.equal(typeof source.createMahjongSoulLoginCapture, "function");
  assert.equal(typeof source.createMahjongSoulSessionController, "function");
  assert.equal(typeof source.fetchMahjongSoulRecord, "function");
  assert.equal(typeof source.mapMahjongSoulRecord, "function");
  assert.equal(typeof source.parseMajsoulTile, "function");
  assert.equal(typeof desktop.parseMahjongSoulSessionStatus, "function");
  assert.equal(reasoning.bridgeLegacyRegressionEvents, undefined);
  assert.equal(reasoning.buildLegacyRegressionPipelineInput, undefined);
});
