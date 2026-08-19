/**
 * M6-D1 — shared test packages (spec "Prior art": 投影测试直接消费 M6-C 测试
 * 已证明有效的 package 构造路径 — 不在 M6-D1 重跑 M6-C 的 golden 构建链).
 *
 * The base package is built through the SAME proven M6-C seam as the Slice 2/3
 * tests (`runFixtureReview` + `buildStructuredAnalysisPackage` on the pinned
 * synthetic canonical fixture with the canned fact engine). Derived packages
 * add decisions / change versions on deep clones; every derived package is
 * re-parsed with the frozen `StructuredAnalysisPackageSchema` (the projector's
 * own input contract) before it is returned, so fixtures can never silently
 * become schema-invalid.
 */
import {
  StructuredAnalysisPackageSchema,
  type DecisionAnalysis,
  type KnownGameFacts,
  type StructuredAnalysisPackage,
} from "@riichi-coach/contracts";
import {
  buildStructuredAnalysisPackage,
} from "../../src/analysis/structured-analysis-package-builder.js";
import {
  derivePackageId,
  deriveSemanticContentHash,
} from "../../src/analysis/package-identity.js";
import {
  componentVersions,
  entryFor,
  FROZEN_NOW,
  fixtureSetup,
  runFixtureReview,
} from "./structured-review.js";

function clonePackage(pkg: StructuredAnalysisPackage): StructuredAnalysisPackage {
  return JSON.parse(JSON.stringify(pkg)) as StructuredAnalysisPackage;
}

/** One analysis_ready decision over the pinned canonical fixture (the M6-C
 *  Slice 2/3 positive fixture, built through the real whole-game review seam).
 */
export async function buildSingleDecisionPackage(): Promise<StructuredAnalysisPackage> {
  const { stream, decisions } = fixtureSetup();
  const review = await runFixtureReview(stream, decisions, [entryFor(decisions[0]!)]);
  const retained = review.retainedAnalyses[0]!;
  return buildStructuredAnalysisPackage({
    review,
    stream,
    decisions,
    componentVersions,
    frozenPolicySnapshot: retained.modelEvaluation.detailPolicy,
    now: () => FROZEN_NOW,
  });
}

/** A no_mortal_entry-only package (record.status integrity_failed; CR-6 still
 *  schema-valid). */
export async function buildFailedDecisionPackage(): Promise<StructuredAnalysisPackage> {
  const { stream, decisions } = fixtureSetup();
  const review = await runFixtureReview(stream, decisions, []);
  return buildStructuredAnalysisPackage({
    review,
    stream,
    decisions,
    componentVersions,
    frozenPolicySnapshot: {
      threshold: 10,
      unit: "model_selection_score_points",
      boundary: "greater_than_or_equal_is_detailed",
      policyVersion: "mortal-review/v1",
      frozenAt: new Date(FROZEN_NOW).toISOString(),
    },
    now: () => FROZEN_NOW,
  });
}

/** A response-surface no_mortal_entry decision sharing the ready decision's
 *  evidence (cloned KnownGameFacts), schema-valid. */
function makeNoMortalEntryDecision(
  ready: Extract<DecisionAnalysis, { outcome: "analysis_ready" }>,
  triggerRef: string,
): DecisionAnalysis {
  const facts: KnownGameFacts = {
    ...ready.knownGameFacts,
    factSetId: `legacy-regression:${triggerRef}`,
    decisionEventRef: triggerRef,
    decisionWindow: {
      kind: "discard_response",
      actor: ready.knownGameFacts.actor,
      triggerEventRef: triggerRef,
      sourceActor: (ready.knownGameFacts.actor + 1) % 4,
      offeredTile: { id: "1m", red: false },
    },
    currentDraw: null,
  };
  return {
    decisionId: `decision:game:fixture:self${ready.knownGameFacts.actor}:discard_response:${triggerRef}`,
    surface: "response",
    roundOrdinal: 0,
    outcome: "no_mortal_entry",
    normalizedDecisionContext: {
      decisionWindowKind: "discard_response",
      selfActor: ready.knownGameFacts.actor,
      triggerEventRef: triggerRef,
      actualAction: null,
    },
    knownGameFacts: facts,
    analysisProvider: { kind: "mortal", outcome: "no_mortal_entry", reason: null },
  };
}

function assertSchemaValid(pkg: StructuredAnalysisPackage): StructuredAnalysisPackage {
  StructuredAnalysisPackageSchema.parse(pkg);
  return pkg;
}

/** Two decisions: one analysis_ready + one no_mortal_entry response window
 *  sharing the ready decision's evidence — the shared-evidence substrate for
 *  decision-subgraph / slice tests. */
export async function buildTwoDecisionPackage(): Promise<StructuredAnalysisPackage> {
  const base = await buildSingleDecisionPackage();
  const ready = base.decisions[0];
  if (ready === undefined || ready.outcome !== "analysis_ready") {
    throw new Error("fixture must carry an analysis_ready decision");
  }
  const failed = makeNoMortalEntryDecision(ready, "game:fixture/0/6/2");
  const two = clonePackage(base);
  two.decisions = [ready, failed];
  two.record = { ...two.record, status: "integrity_failed" };
  return assertSchemaValid(two);
}

/** Two analysis_ready decisions (the ready decision cloned under a second
 *  decision id) — the multi-selection ordering / dedup substrate. */
export async function buildTwoReadyPackage(): Promise<StructuredAnalysisPackage> {
  const base = await buildSingleDecisionPackage();
  const ready = base.decisions[0];
  if (ready === undefined || ready.outcome !== "analysis_ready") {
    throw new Error("fixture must carry an analysis_ready decision");
  }
  const clone = JSON.parse(JSON.stringify(ready)) as DecisionAnalysis;
  clone.decisionId = `${ready.decisionId}:alt`;
  const two = clonePackage(base);
  two.decisions = [ready, clone];
  return assertSchemaValid(two);
}

/** The same decisions under a DIFFERENT producer chain (mortal source
 *  version) → a different packageId with identical decisionIds — the
 *  packageId-only same-source proof substrate (guard 3). The artifact
 *  identity is recomputed with the shared builder derivation (the schema
 *  itself does not recompute packageId). */
export async function buildVariantPackage(): Promise<StructuredAnalysisPackage> {
  const base = await buildSingleDecisionPackage();
  const variant = clonePackage(base);
  variant.componentVersions = {
    ...variant.componentVersions,
    mortalSourceModel: {
      ...variant.componentVersions.mortalSourceModel,
      version: "mortal-source/3",
    },
  };
  variant.packageId = derivePackageId({
    analysisKey: variant.analysisKey,
    componentVersions: variant.componentVersions,
    analysisPolicy: variant.analysisPolicy,
  });
  variant.semanticContentHash = deriveSemanticContentHash({
    analysisKey: variant.analysisKey,
    record: variant.record,
    componentVersions: variant.componentVersions,
    analysisPolicy: variant.analysisPolicy,
    decisions: variant.decisions,
    evidenceRegistry: variant.evidenceRegistry,
  });
  return assertSchemaValid(variant);
}
