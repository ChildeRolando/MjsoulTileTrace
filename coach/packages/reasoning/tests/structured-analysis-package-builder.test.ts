/**
 * M6-C Slice 2 — production assembly tests (spec "Slice 2 测 production
 * assembly"):
 *
 *   1. coverage_ready whole-game review results carry the FULL per-decision
 *      payloads (StructuredComparisonSet + ModelEvaluation + factor result)
 *      — nothing is dropped at the whole-game boundary anymore.
 *   2. buildStructuredAnalysisPackage consumes that result directly and
 *      projects a schema-valid StructuredAnalysisPackage.
 *   3. There is no re-run path: the builder is a pure, synchronous projection
 *      whose input carries no fact-engine port, no Mortal report, and no
 *      review-service seam (spec: 拼包过程不调用事实引擎、不访问 Mortal、
 *      不重跑 runBoundMortalDecisionReview).
 *   4. CR-4/CR-5 determinism: artifact-creation metadata (createdAt) never
 *      enters packageId / semanticContentHash; identity is stable.
 *   5. CR-6: a valid package faithfully records an incomplete analysis
 *      (no_mortal_entry → record.status integrity_failed).
 *
 * The E2E fixture (shared with the Slice 3 validator tests, see
 * ./fixtures/structured-review.ts) is the synthetic canonical self-turn
 * discard stream (draw 5p → discard 5p tsumogiri) with a canned fact engine
 * returning valid results — the ordinary self-turn discard surface carries no
 * coverage branches, so it reaches analysis_ready without lifting the coverage
 * gate.
 */
import { describe, expect, it } from "vitest";
import {
  StructuredAnalysisPackageSchema,
} from "@riichi-coach/contracts";
import {
  buildStructuredAnalysisPackage,
} from "../src/analysis/structured-analysis-package-builder.js";
import {
  componentVersions,
  entryFor,
  FROZEN_NOW,
  fixtureSetup,
  runFixtureReview,
} from "./fixtures/structured-review.js";

describe("M6-C Slice 2 production assembly", () => {
  it("coverage_ready retains the full per-decision payload (no drop at the whole-game boundary)", async () => {
    const { stream, decisions } = fixtureSetup();
    const review = await runFixtureReview(stream, decisions, [entryFor(decisions[0]!)]);
    expect(review.summary.outcomes.analysis_ready).toBe(1);
    expect(review.retainedAnalyses).toHaveLength(1);
    const retained = review.retainedAnalyses[0]!;
    expect(retained.surface).toBe("self");
    expect(retained.decisionOrdinal).toBe(0);
    // The full payload the old path compressed into a modelSummary.
    expect(retained.comparisonSet.candidates.length).toBeGreaterThanOrEqual(2);
    expect(retained.modelEvaluation.engineId).toBe("mortal");
    expect(retained.factorResult.ledgers.length).toBeGreaterThan(0);
    // The ledger row still carries the compact summary for existing consumers.
    expect(review.decisions[0]!.modelSummary).not.toBeNull();
  });

  it("buildStructuredAnalysisPackage projects a schema-valid package from the retained result", async () => {
    const { stream, decisions } = fixtureSetup();
    const review = await runFixtureReview(stream, decisions, [entryFor(decisions[0]!)]);
    const retained = review.retainedAnalyses[0]!;
    const pkg = buildStructuredAnalysisPackage({
      review,
      stream,
      decisions,
      componentVersions,
      frozenPolicySnapshot: retained.modelEvaluation.detailPolicy,
      now: () => FROZEN_NOW,
    });
    // The single build entry produces a structurally valid package.
    expect(StructuredAnalysisPackageSchema.parse(pkg)).toEqual(pkg);
    // Single record-identity authority: record.recordId, analysisKey and
    // decisionId all derive from the canonical stream's gameId — there is no
    // caller-supplied record id to disagree with the embedded evidence.
    expect(pkg.record.recordId).toBe(stream.gameId);
    expect(pkg.analysisKey).toBe("analysis:game:fixture:actor0:mortal");
    expect(pkg.decisions[0]!.decisionId.startsWith(`decision:${stream.gameId}:self0:`))
      .toBe(true);
    expect(pkg.record).toEqual({
      recordId: "game:fixture",
      selfActor: 0,
      status: "complete",
    });
    expect(pkg.decisions).toHaveLength(1);
    const decision = pkg.decisions[0]!;
    if (decision.outcome !== "analysis_ready") {
      throw new Error("expected an analysis_ready decision");
    }
    // Type-level payload binding: the full analysis payload is present.
    expect(decision.comparisonSet.comparisonSetId).toContain("mortal-comparison:");
    expect(decision.candidateFactorLedgers.length).toBeGreaterThan(0);
    expect(decision.modelEvaluation.actualActionRef).toBe(
      decision.comparisonSet.candidates.find(
        (candidate) => candidate.origins.includes("actual"),
      )?.actionRef,
    );
    expect(decision.evidenceIds.length).toBeGreaterThan(0);
    // The decision-level evidence footprint resolves into the registry.
    for (const evidenceId of decision.evidenceIds) {
      expect(pkg.evidenceRegistry[evidenceId]).toBeDefined();
    }
    // CR-4 identity: packageId != semanticContentHash, and neither contains
    // wall-clock artifact-creation metadata.
    expect(pkg.packageId).not.toBe(pkg.semanticContentHash);
    expect(pkg.packageId.startsWith("package:sha256:")).toBe(true);
    expect(pkg.semanticContentHash.startsWith("sha256:")).toBe(true);
  });

  it("CR-3: every evidence id referenced anywhere in the package resolves through evidenceRegistry", async () => {
    const { stream, decisions } = fixtureSetup();
    const review = await runFixtureReview(stream, decisions, [entryFor(decisions[0]!)]);
    const retained = review.retainedAnalyses[0]!;
    const pkg = buildStructuredAnalysisPackage({
      review,
      stream,
      decisions,
      componentVersions,
      frozenPolicySnapshot: retained.modelEvaluation.detailPolicy,
      now: () => FROZEN_NOW,
    });

    // Recursively collect the FULL CR-3 footprint: KnownGameFacts.evidenceIds,
    // every nested CandidateFactorLedger FactorFact.evidenceIds, every
    // FactorDifference.evidenceIds, and decision-level evidenceIds — not just
    // DecisionAnalysis.evidenceIds.
    const referenced = new Set<string>();
    for (const decision of pkg.decisions) {
      for (const id of decision.knownGameFacts.evidenceIds) referenced.add(id);
      if (decision.outcome !== "analysis_ready") continue;
      for (const id of decision.evidenceIds) referenced.add(id);
      for (const ledger of decision.candidateFactorLedgers) {
        for (const axis of ledger.axes) {
          for (const fact of axis.facts) {
            for (const id of fact.evidenceIds) referenced.add(id);
          }
        }
      }
      for (const difference of decision.factorDifferences) {
        for (const id of difference.evidenceIds) referenced.add(id);
      }
    }
    expect(referenced.size).toBeGreaterThan(0);

    // The completion invariant: referenced ⊆ keys(evidenceRegistry). The
    // registry only ever contains canonical_event + fact_engine_request
    // records, so this also proves no stateHash / actionRef / factSetId
    // fragment survived as a peer evidence id.
    for (const id of [...referenced].sort()) {
      expect(pkg.evidenceRegistry[id], `unresolved evidence id ${id}`)
        .toBeDefined();
    }

    // This fixture reaches the hand-structure path that previously emitted
    // [requestId, stateHash, actionRef] as three peer evidence ids. The
    // request must be registered and referenced; the fragments must be gone.
    const requestIds = [...referenced].filter((id) =>
      pkg.evidenceRegistry[id]?.kind === "fact_engine_request"
    );
    expect(requestIds.some((id) => id.includes(":hand-structure:"))).toBe(true);
    expect([...referenced].some((id) =>
      id.startsWith("sha256:") || id.startsWith("action:v1:")
    )).toBe(false);
    for (const id of [...referenced].sort()) {
      const record = pkg.evidenceRegistry[id]!;
      expect(record.evidenceId).toBe(id);
      if (record.kind === "fact_engine_request") {
        expect(record.payload).toEqual({ requestId: id, kind: expect.any(String) });
      } else {
        // Canonical event evidence stays self-contained with its descriptor.
        expect(id.startsWith(`${stream.gameId}/`)).toBe(true);
        expect(record.payload).toMatchObject({ eventId: id });
      }
    }
  });

  it("is deterministic: createdAt is provenance only; identity and content hash are stable", async () => {
    const { stream, decisions } = fixtureSetup();
    const review = await runFixtureReview(stream, decisions, [entryFor(decisions[0]!)]);
    const retained = review.retainedAnalyses[0]!;
    const base = {
      review,
      stream,
      decisions,
      componentVersions,
      frozenPolicySnapshot: retained.modelEvaluation.detailPolicy,
    };
    const first = buildStructuredAnalysisPackage({ ...base, now: () => FROZEN_NOW });
    const second = buildStructuredAnalysisPackage({
      ...base,
      now: () => FROZEN_NOW + 60_000,
    });
    // Same semantic inputs + same frozen policy snapshot → same artifact
    // identity and same content hash; only the creation timestamp differs.
    expect(first.packageId).toBe(second.packageId);
    expect(first.semanticContentHash).toBe(second.semanticContentHash);
    expect(first.createdAt).not.toBe(second.createdAt);
    expect(StructuredAnalysisPackageSchema.parse(first)).toEqual(first);
    expect(StructuredAnalysisPackageSchema.parse(second)).toEqual(second);

    // CR-4/CR-5: the wall-clock frozenAt is artifact-creation metadata — a
    // different frozenAt (same semantic snapshot) leaves packageId AND
    // semanticContentHash unchanged.
    const otherFrozenAt = buildStructuredAnalysisPackage({
      ...base,
      frozenPolicySnapshot: {
        ...retained.modelEvaluation.detailPolicy,
        frozenAt: "2026-07-01T00:00:00.000Z",
      },
      now: () => FROZEN_NOW,
    });
    expect(otherFrozenAt.packageId).toBe(first.packageId);
    expect(otherFrozenAt.semanticContentHash).toBe(first.semanticContentHash);

    // The artifact identity DOES bind the producer chain: a different
    // factor-pipeline version yields a different packageId (Blocker 3A).
    const otherPipeline = buildStructuredAnalysisPackage({
      ...base,
      componentVersions: {
        ...componentVersions,
        factorPipeline: "factor-pipeline/v2",
      },
      now: () => FROZEN_NOW,
    });
    expect(otherPipeline.packageId).not.toBe(first.packageId);
    expect(otherPipeline.semanticContentHash).not.toBe(first.semanticContentHash);
  });

  it("has no re-run path: the builder is synchronous and takes no engine/report/review seam", async () => {
    const { stream, decisions } = fixtureSetup();
    const review = await runFixtureReview(stream, decisions, [entryFor(decisions[0]!)]);
    const retained = review.retainedAnalyses[0]!;
    const input = {
      review,
      stream,
      decisions,
      componentVersions,
      frozenPolicySnapshot: retained.modelEvaluation.detailPolicy,
      now: () => FROZEN_NOW,
    };
    // The builder input carries no fact-engine port, no Mortal report, and no
    // review service — structurally it cannot re-run runBoundMortalDecisionReview
    // (spec: 拼包过程不调用事实引擎、不访问 Mortal、不重跑 review).
    expect("engine" in input).toBe(false);
    expect("report" in input).toBe(false);
    // No caller-supplied record id exists: the canonical stream's gameId is
    // the sole record-identity authority (no API path can disagree).
    expect("recordId" in input).toBe(false);
    // Synchronous: the result is the package itself, never a Promise.
    const pkg = buildStructuredAnalysisPackage(input);
    expect(pkg instanceof Promise).toBe(false);
    expect(pkg.decisions).toHaveLength(1);
  });

  it("CR-6: a valid package faithfully records an incomplete analysis (no_mortal_entry → integrity_failed)", async () => {
    const { stream, decisions } = fixtureSetup();
    // No source row: the window is not locally proven single-candidate, so the
    // absent row stays a loud no_mortal_entry (green runs require 0).
    const review = await runFixtureReview(stream, decisions, []);
    expect(review.summary.outcomes.no_mortal_entry).toBe(1);
    const pkg = buildStructuredAnalysisPackage({
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
    // Schema validity ≠ analysis completeness (CR-6): the package is valid and
    // marks the aggregate truth — it never disguises the failure as success.
    expect(StructuredAnalysisPackageSchema.parse(pkg)).toEqual(pkg);
    expect(pkg.record.status).toBe("integrity_failed");
    expect(pkg.decisions[0]!.outcome).toBe("no_mortal_entry");
    if (pkg.decisions[0]!.outcome === "no_mortal_entry") {
      expect(pkg.decisions[0]!.analysisProvider.reason).toBeNull();
    }
  });
});
