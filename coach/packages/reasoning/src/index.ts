import {
  importRegressionFixture,
  type RegressionFixture,
} from "./import/mortal-report.js";
import {
  buildStrictAnalysisPackage,
  type StrictAnalysisPackage,
} from "./package/build-strict-analysis-package.js";
import { replayToDecision } from "./replay/scene-replayer.js";
import { validateStrictAnalysisPackage } from "./validate/package-validator.js";

export function analyzeRegressionFixture(
  raw: RegressionFixture,
): StrictAnalysisPackage[] {
  const { events, decisions, selfActor } = importRegressionFixture(raw);
  return decisions.map((decision) => {
    const scene = replayToDecision(events, decision, selfActor);
    const result = buildStrictAnalysisPackage({
      events,
      decision,
      scene,
    });
    validateStrictAnalysisPackage(result);
    return result;
  });
}

export * from "./compare/action-comparator.js";
export * from "./coverage/dimension-catalog.js";
export * from "./evidence/evidence-registry.js";
export * from "./explain/deterministic-explanation.js";
export * from "./import/mortal-report.js";
export * from "./model/model-evaluation-builder.js";
export * from "./package/build-strict-analysis-package.js";
export * from "./policy/detail-policy.js";
export * from "./policy/teaching-policy.js";
export * from "./preference/preference-agreement.js";
export * from "./replay/scene-replayer.js";
export * from "./validate/package-validator.js";
export * from "./candidate/user-action-draft.js";
export * from "./candidate/candidate-normalizer.js";
export * from "./candidate/comparison-set-builder.js";
export * from "./candidate/legacy-action-bridge.js";
export * from "./analysis/structured-analysis-assembly.js";
export * from "./analysis/mortal-review-service.js";
export * from "./analysis/mortal-full-game-review.js";
export * from "./analysis/mortal-coverage-registry.js";
export * from "./analysis/mortal-coverage-evidence-manifest.js";
export * from "./analysis/acceptance-evidence.js";
export * from "./analysis/acceptance-core.js";
export * from "./import/action-adapter-port.js";
export * from "./import/mjai-action.js";
export * from "./import/structured-mortal.js";
export * from "./fact-engine/port.js";
export * from "./fact-engine/jsonl-client.js";
export * from "./fact-engine/hand-structure-validator.js";
export * from "./fact-engine/managed-sidecar.js";
export * from "./factors/candidate-projector.js";
export * from "./factors/hand-structure-projector.js";
export * from "./factors/furiten-merger.js";
export * from "./factors/defense-matrix.js";
export * from "./factors/hand-structure-ledger.js";
export * from "./factors/ledger-builder.js";
export * from "./factors/difference-builder.js";
export * from "./factors/deterministic-resolver.js";
export * from "./factors/structured-factor-pipeline.js";
export * from "./factors/known-game-facts-v2.js";
export * from "./replay/canonical-event-validator.js";
export * from "./replay/round-reducer.js";
export * from "./replay/decision-snapshot.js";
export * from "./replay/response-furiten.js";
export * from "./replay/stream-replayer.js";
export * from "./replay/dama-tsumo-discovery.js";
export * from "./replay/replay-audit.js";
export * from "./prototype/coach-report.js";
