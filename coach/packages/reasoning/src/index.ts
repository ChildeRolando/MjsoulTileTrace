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
