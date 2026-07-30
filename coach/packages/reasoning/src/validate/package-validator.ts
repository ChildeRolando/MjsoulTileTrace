import { isDeepStrictEqual } from "node:util";
import {
  FactorEvidenceSchema,
  NormalizedDecisionSchema,
  NormalizedEventSchema,
  SceneSnapshotSchema,
  type ActionId,
  type FactorEvidence,
} from "@riichi-coach/contracts";
import {
  DIMENSION_CATALOG,
  DIMENSION_CATALOG_VERSION,
} from "../coverage/dimension-catalog.js";
import {
  derivePrimaryAxes,
  type FactorBuckets,
  type StrictAnalysisPackage,
} from "../package/build-strict-analysis-package.js";
import { judgeDecision } from "../policy/teaching-policy.js";

function actionSupportedBy(
  factor: FactorEvidence,
  actionId: ActionId,
): boolean {
  return (
    (factor.direction === "supports_subject" &&
      factor.subjectAction === actionId) ||
    (factor.direction === "supports_comparison" &&
      factor.comparisonAction === actionId)
  );
}

function allFactors(factors: FactorBuckets): FactorEvidence[] {
  return [
    ...factors.supportsModelAction,
    ...factors.supportsActualAction,
    ...factors.neutralFactors,
  ];
}

function validateFactorBuckets(result: StrictAnalysisPackage): void {
  const seen = new Set<string>();
  const buckets = [
    ["supportsModelAction", result.factors.supportsModelAction] as const,
    ["supportsActualAction", result.factors.supportsActualAction] as const,
    ["neutralFactors", result.factors.neutralFactors] as const,
  ];
  for (const [bucket, factors] of buckets) {
    for (const factorValue of factors) {
      const factor = FactorEvidenceSchema.parse(factorValue);
      if (seen.has(factor.factorId)) {
        throw new Error(
          `Factor ${factor.factorId} must appear in exactly one direction bucket`,
        );
      }
      seen.add(factor.factorId);
      const comparedActions = new Set([
        factor.subjectAction,
        factor.comparisonAction,
      ]);
      if (
        !comparedActions.has(result.decision.modelAction) ||
        !comparedActions.has(result.decision.actualAction)
      ) {
        throw new Error(
          `Factor ${factor.factorId} does not compare the trusted decision actions`,
        );
      }
      if (
        bucket === "supportsModelAction" &&
        !actionSupportedBy(factor, result.decision.modelAction)
      ) {
        throw new Error(`Factor ${factor.factorId} is in the wrong model bucket`);
      }
      if (
        bucket === "supportsActualAction" &&
        !actionSupportedBy(factor, result.decision.actualAction)
      ) {
        throw new Error(`Factor ${factor.factorId} is in the wrong actual bucket`);
      }
      if (bucket === "neutralFactors" && factor.direction !== "neutral") {
        throw new Error(`Factor ${factor.factorId} is not structurally neutral`);
      }
    }
  }
}

function validateEvidence(result: StrictAnalysisPackage): void {
  const referenced = new Set(
    allFactors(result.factors).flatMap((factor) => factor.evidenceIds),
  );
  const visible = new Set(result.scene.eventIds);
  for (const evidenceId of referenced) {
    const node = result.evidenceRegistry[evidenceId];
    if (!node) {
      throw new Error(`Unresolved evidence ID: ${evidenceId}`);
    }
    if (
      node.evidenceId !== evidenceId ||
      node.event.eventId !== evidenceId ||
      node.kind !== "replay_event" ||
      node.provenance !== "raw_replay"
    ) {
      throw new Error(`Malformed evidence node: ${evidenceId}`);
    }
    NormalizedEventSchema.parse(node.event);
    if (!visible.has(evidenceId)) {
      throw new Error(`Evidence is outside the decision boundary: ${evidenceId}`);
    }
  }
  for (const evidenceId of Object.keys(result.evidenceRegistry)) {
    if (!referenced.has(evidenceId)) {
      throw new Error(`Unreferenced evidence registry node: ${evidenceId}`);
    }
  }
}

function validateCoverage(result: StrictAnalysisPackage): void {
  if (result.coverageCatalogVersion !== DIMENSION_CATALOG_VERSION) {
    throw new Error("Coverage catalog version does not match runtime");
  }
  const expected = DIMENSION_CATALOG.map((entry) => entry.id);
  const actual = result.coverage.map((entry) => entry.dimension);
  if (
    new Set(actual).size !== actual.length ||
    !isDeepStrictEqual(new Set(actual), new Set(expected))
  ) {
    throw new Error("Coverage does not contain every catalog dimension once");
  }
}

function validateRules(result: StrictAnalysisPackage): void {
  const ruleIds = result.ruleRegistry.map((rule) => rule.id);
  if (new Set(ruleIds).size !== ruleIds.length) {
    throw new Error("Teaching rule registry contains duplicate IDs");
  }
  const known = new Set(ruleIds);
  for (const evaluation of result.blockedRules) {
    if (!known.has(evaluation.ruleId)) {
      throw new Error(`Unknown teaching rule: ${evaluation.ruleId}`);
    }
  }
  for (const ruleId of result.coachJudgement?.ruleIds ?? []) {
    if (!known.has(ruleId)) {
      throw new Error(`Unknown teaching rule: ${ruleId}`);
    }
  }

  const factors = allFactors(result.factors);
  const expected = judgeDecision({
    factors,
    candidateLedgers: result.candidateLedgers,
    coverage: result.coverage,
    ruleRegistry: result.ruleRegistry,
  });
  const expectedBlocked = expected.blockedRules.filter(
    (rule) => rule.status === "blocked",
  );
  if (!isDeepStrictEqual(result.blockedRules, expectedBlocked)) {
    throw new Error("Blocked teaching rules do not match policy evidence");
  }
  if (!isDeepStrictEqual(result.coachJudgement, expected.coachJudgement)) {
    throw new Error("Coach judgement is not supported by policy evidence");
  }
}

export function validateStrictAnalysisPackage(
  result: StrictAnalysisPackage,
): void {
  const decision = NormalizedDecisionSchema.parse(result.decision);
  const scene = SceneSnapshotSchema.parse(result.scene);
  if (decision.sceneEventId !== scene.decisionEventId) {
    throw new Error("Decision and scene event IDs do not match");
  }
  const candidateActions = decision.candidates.map(
    (candidate) => candidate.actionId,
  );
  if (!candidateActions.includes(decision.modelAction)) {
    throw new Error("Trusted model action is absent from candidates");
  }
  if (!candidateActions.includes(decision.actualAction)) {
    throw new Error("Trusted actual action is absent from candidates");
  }
  if (new Set(candidateActions).size !== candidateActions.length) {
    throw new Error("Decision candidates contain duplicate actions");
  }
  const ledgerActions = result.candidateLedgers.map(
    (candidate) => candidate.actionId,
  );
  if (!isDeepStrictEqual(new Set(ledgerActions), new Set(candidateActions))) {
    throw new Error("Candidate ledgers do not match trusted model candidates");
  }

  validateFactorBuckets(result);
  validateEvidence(result);
  validateCoverage(result);
  const expectedAxes = derivePrimaryAxes(result.factors);
  if (!isDeepStrictEqual(result.primaryAxes, expectedAxes)) {
    throw new Error("Package primary axes were not derived from its factors");
  }
  validateRules(result);
  if (result.deterministicExplanation.length === 0) {
    throw new Error("Deterministic explanation is empty");
  }
}
