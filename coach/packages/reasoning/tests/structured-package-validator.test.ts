/**
 * M6-C Slice 3 — serialization / validator / provenance tests
 * (spec "Slice 3 测 serialization / validator / provenance"):
 *
 *  - JSON roundtrip 后仍通过校验；
 *  - stable IDs 确定（identity coherence is validator-enforced）；
 *  - version validation 拒绝空版本/解释侧版本；
 *  - cross-reference validation 拒绝悬空 evidenceId；
 *  - no LLM fields 拒绝含 CoachJudgment/ExplanationBullet 的包；
 *  - 有 no_mortal_entry 的 package 仍通过 schema 校验（CR-6）。
 *
 * Slice 3 acceptance-repair tests (review blockers 1-3) are appended in the
 * "M6-C Slice 3 acceptance repair" describe blocks:
 *  - producer-version provenance coherence (componentVersions vs payload
 *    provenance);
 *  - ready-decision reference integrity (one analysis_ready decision = one
 *    coherent candidate universe);
 *  - analysis-policy authority + independently recomputable packageId /
 *    semanticContentHash.
 *
 * The positive path goes through the real E2E seam: pinned fixture report +
 * canned fact engine → runMortalFullGameReview → buildStructuredAnalysisPackage
 * → validateStructuredAnalysisPackage. Negative cases tamper with a deep clone
 * of that package.
 */
import { describe, expect, it } from "vitest";
import type { StructuredAnalysisPackage } from "@riichi-coach/contracts";
import {
  buildStructuredAnalysisPackage,
} from "../src/analysis/structured-analysis-package-builder.js";
import {
  validateStructuredAnalysisPackage,
} from "../src/validate/structured-package-validator.js";
import {
  componentVersions,
  entryFor,
  FROZEN_NOW,
  fixtureSetup,
  runFixtureReview,
} from "./fixtures/structured-review.js";

/** The ordinary fixture: one self-surface discard window reaching
 *  analysis_ready, built through the real whole-game review seam. */
async function buildFixturePackage(): Promise<StructuredAnalysisPackage> {
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

/** The incomplete fixture: no source row → no_mortal_entry → record.status
 *  integrity_failed (CR-6 must still accept the package as schema-valid). */
async function buildIncompleteFixturePackage(): Promise<StructuredAnalysisPackage> {
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

/** Deep clone (packages are plain JSON) so tampering never touches the
 *  original builder output. */
function clonePackage<T>(pkg: T): T {
  return JSON.parse(JSON.stringify(pkg)) as T;
}

/** The fixture's single decision is analysis_ready. */
function readyDecisionOf(pkg: StructuredAnalysisPackage) {
  const decision = pkg.decisions[0]!;
  if (decision.outcome !== "analysis_ready") {
    throw new Error("fixture decision must be analysis_ready");
  }
  return decision;
}

describe("M6-C Slice 3 serialization / validator / provenance", () => {
  it("accepts a builder-produced package", async () => {
    const pkg = await buildFixturePackage();
    expect(() => validateStructuredAnalysisPackage(pkg)).not.toThrow();
  });

  it("JSON roundtrip survives validation unchanged", async () => {
    const pkg = await buildFixturePackage();
    const roundtripped =
      JSON.parse(JSON.stringify(pkg)) as StructuredAnalysisPackage;
    expect(roundtripped).toEqual(pkg);
    expect(() => validateStructuredAnalysisPackage(roundtripped)).not.toThrow();
  });

  it("rejects non-JSON values (payload JSON-serializability is a Slice 3 gate)", async () => {
    const pkg = await buildFixturePackage();
    const tampered = clonePackage(pkg);
    // The z.unknown() registry payload sink: NaN serializes to null, so the
    // roundtrip changes the package.
    const requestKey = Object.keys(tampered.evidenceRegistry)
      .find((key) => tampered.evidenceRegistry[key]!.kind === "fact_engine_request")!;
    (tampered.evidenceRegistry[requestKey]!.payload as Record<string, unknown>)
      .stateHash = Number.NaN;
    expect(() => validateStructuredAnalysisPackage(tampered))
      .toThrow(/m6c_validator_json_roundtrip_mismatch/);
  });

  it("stable IDs: repeated builds carry identical identity; identity coherence is enforced", async () => {
    const first = await buildFixturePackage();
    const second = await buildFixturePackage();
    expect(first.analysisKey).toBe(second.analysisKey);
    expect(first.packageId).toBe(second.packageId);
    expect(first.decisions.map((decision) => decision.decisionId)).toEqual(
      second.decisions.map((decision) => decision.decisionId),
    );
    // A decision id that does not derive from record.recordId is rejected.
    const tampered = clonePackage(first);
    tampered.decisions[0]!.decisionId =
      "decision:other-game:self0:self_turn:game:fixture/0/3/0";
    expect(() => validateStructuredAnalysisPackage(tampered))
      .toThrow(/m6c_validator_decision_identity/);
  });

  it("version validation: rejects empty versions", async () => {
    const pkg = await buildFixturePackage();
    // Empty string fails the schema's min(1) version constraint.
    expect(() => validateStructuredAnalysisPackage({
      ...pkg,
      componentVersions: { ...pkg.componentVersions, factorPipeline: "" },
    })).toThrow(/m6c_validator_schema/);
    // Whitespace-only versions pass min(1) but are still blank (explicit gate).
    expect(() => validateStructuredAnalysisPackage({
      ...pkg,
      componentVersions: { ...pkg.componentVersions, factorPipeline: " " },
    })).toThrow(/m6c_validator_empty_version/);
  });

  it("version validation: rejects explanation-side (ReviewReport) versions", async () => {
    const pkg = await buildFixturePackage();
    expect(() => validateStructuredAnalysisPackage({
      ...pkg,
      componentVersions: { ...pkg.componentVersions, promptVersion: "prompt/v3" },
    })).toThrow(/m6c_validator_explanation_side_version:promptVersion/);
    expect(() => validateStructuredAnalysisPackage({
      ...pkg,
      componentVersions: { ...pkg.componentVersions, llmProviderVersion: "gpt-x" },
    })).toThrow(/m6c_validator_explanation_side_version:llmProviderVersion/);
  });

  it("cross-reference validation: rejects a dangling evidence id at decision level", async () => {
    const pkg = await buildFixturePackage();
    const tampered = clonePackage(pkg);
    readyDecisionOf(tampered).evidenceIds.push("game:fixture/0/99/0");
    expect(() => validateStructuredAnalysisPackage(tampered))
      .toThrow(/m6c_validator_unresolved_evidence:game:fixture\/0\/99\/0/);
  });

  it("cross-reference validation: rejects a dangling id deep inside a candidate ledger fact", async () => {
    const pkg = await buildFixturePackage();
    const tampered = clonePackage(pkg);
    const fact = readyDecisionOf(tampered).candidateFactorLedgers[0]!.axes[0]!.facts[0]!;
    fact.evidenceIds.push("game:fixture/0/99/1");
    expect(() => validateStructuredAnalysisPackage(tampered))
      .toThrow(/m6c_validator_unresolved_evidence:game:fixture\/0\/99\/1/);
  });

  it("cross-reference validation: rejects a dangling id in KnownGameFacts", async () => {
    const pkg = await buildFixturePackage();
    const tampered = clonePackage(pkg);
    tampered.decisions[0]!.knownGameFacts.evidenceIds.push("game:fixture/0/99/2");
    expect(() => validateStructuredAnalysisPackage(tampered))
      .toThrow(/m6c_validator_unresolved_evidence:game:fixture\/0\/99\/2/);
  });

  it("cross-reference validation: rejects an unreferenced registry node", async () => {
    const pkg = await buildFixturePackage();
    const tampered = clonePackage(pkg);
    tampered.evidenceRegistry["game:fixture/0/77/0"] = {
      evidenceId: "game:fixture/0/77/0",
      kind: "canonical_event",
      producer: "canonical-replay",
      producerVersion: "canonical-riichi-events/v2",
      sourceRefs: [],
      payload: { eventId: "game:fixture/0/77/0", type: "round_started" },
    };
    expect(() => validateStructuredAnalysisPackage(tampered))
      .toThrow(/m6c_validator_unreferenced_evidence:game:fixture\/0\/77\/0/);
  });

  it("cross-reference validation: rejects evidence payloads that do not match their kind", async () => {
    const pkg = await buildFixturePackage();
    // A canonical_event descriptor whose eventId disagrees with its registry key.
    const canonicalKey = Object.keys(pkg.evidenceRegistry)
      .find((key) => pkg.evidenceRegistry[key]!.kind === "canonical_event")!;
    const tamperedDescriptor = clonePackage(pkg);
    (tamperedDescriptor.evidenceRegistry[canonicalKey]!.payload as Record<string, unknown>)
      .eventId = "game:fixture/0/0/9";
    expect(() => validateStructuredAnalysisPackage(tamperedDescriptor))
      .toThrow(/m6c_validator_evidence_payload/);
    // A fact_engine_request payload carrying an opaque fragment (stateHash).
    const requestKey = Object.keys(pkg.evidenceRegistry)
      .find((key) => pkg.evidenceRegistry[key]!.kind === "fact_engine_request")!;
    const tamperedRequest = clonePackage(pkg);
    (tamperedRequest.evidenceRegistry[requestKey]!.payload as Record<string, unknown>)
      .stateHash = "sha256:fragment";
    expect(() => validateStructuredAnalysisPackage(tamperedRequest))
      .toThrow(/m6c_validator_evidence_payload/);
  });

  it("no LLM fields: rejects packages carrying CoachJudgment / ExplanationBullet artifacts", async () => {
    const pkg = await buildFixturePackage();
    // Top-level smuggled LLM artifact.
    expect(() => validateStructuredAnalysisPackage({
      ...pkg,
      coachJudgement: [{
        decisionId: pkg.decisions[0]!.decisionId,
        verdict: "supported",
      }],
    })).toThrow(/m6c_validator_llm_boundary:coachJudgement/);
    // Nested inside an analysis_ready decision (via the schema-unknown sink).
    const nested = clonePackage(pkg);
    (readyDecisionOf(nested) as unknown as Record<string, unknown>)
      .explanationBullets = [{ text: "tampered explanation" }];
    expect(() => validateStructuredAnalysisPackage(nested))
      .toThrow(/m6c_validator_llm_boundary:explanationBullets/);
    // ReviewReport embedding is equally rejected.
    expect(() => validateStructuredAnalysisPackage({
      ...pkg,
      reviewReport: { reportId: "report:1" },
    })).toThrow(/m6c_validator_llm_boundary:reviewReport/);
  });

  it("no privileged raw payload: rejects http(s) URLs anywhere in the package", async () => {
    const pkg = await buildFixturePackage();
    expect(() => validateStructuredAnalysisPackage({
      ...pkg,
      componentVersions: {
        ...pkg.componentVersions,
        mortalSourceModel: {
          ...pkg.componentVersions.mortalSourceModel,
          modelTag: "https://game.maj-soul.com/1/?paipu=000001-00000000-0000-0000-0000-000000000000_a0",
        },
      },
    })).toThrow(/m6c_validator_privileged_payload/);
  });

  it("CR-6: a package with no_mortal_entry still passes schema validation", async () => {
    const pkg = await buildIncompleteFixturePackage();
    expect(pkg.record.status).toBe("integrity_failed");
    expect(pkg.decisions[0]!.outcome).toBe("no_mortal_entry");
    // Schema validity ≠ analysis completeness: the validator never rejects a
    // structurally valid package for an incomplete / failed analysis.
    expect(() => validateStructuredAnalysisPackage(pkg)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Slice 3 acceptance repair — blocker 1: producer-version provenance coherence
// ---------------------------------------------------------------------------

describe("M6-C Slice 3 acceptance repair: producer-version provenance coherence", () => {
  it("fact-engine versions are pinned by the literal EngineIdentitySchema (declaration mutation rejected at schema level)", async () => {
    const pkg = await buildFixturePackage();
    const tampered = clonePackage(pkg);
    // EngineIdentitySchema is fully literal (engine / upstreamCommit /
    // adapterVersion / protocolVersion), so ANY declaration mutation is
    // rejected by the schema itself — a schema-valid package can never claim
    // arbitrary fact-engine versions. The validator's named producer checks
    // (m6c_validator_producer_version_mismatch:factEngine:...) stay as
    // defense-in-depth for the registry's free-string producerVersion and for
    // a future relaxation of the literal schema.
    (tampered.componentVersions.factEngine as { adapterVersion: string })
      .adapterVersion = "0.2.1";
    expect(() => validateStructuredAnalysisPackage(tampered))
      .toThrow(/m6c_validator_schema/);
  });

  it("fact-engine payload identities are pinned by the literal EngineIdentitySchema (payload mutation rejected at schema level)", async () => {
    const pkg = await buildFixturePackage();
    const tampered = clonePackage(pkg);
    const decision = readyDecisionOf(tampered);
    const fact = decision.candidateFactorLedgers
      .flatMap((ledger) => ledger.axes.flatMap((axis) => axis.facts))
      .find((candidate) => candidate.engineIdentity !== undefined)!;
    (fact.engineIdentity as unknown as { adapterVersion: string })
      .adapterVersion = "0.2.1";
    expect(() => validateStructuredAnalysisPackage(tampered))
      .toThrow(/m6c_validator_schema/);
  });

  it("rejects a Mortal/model declaration contradicting the model evaluation", async () => {
    const pkg = await buildFixturePackage();
    const tampered = clonePackage(pkg);
    // Mutate the DECLARATION side; ModelEvaluation.adapterVersion stays
    // "mortal-source/2".
    tampered.componentVersions.mortalSourceModel.version = "mortal-source/3";
    expect(() => validateStructuredAnalysisPackage(tampered))
      .toThrow(/m6c_validator_producer_version_mismatch:mortalSourceModel/);
  });

  it("rejects a model-evaluation adapter version contradicting the declaration", async () => {
    const pkg = await buildFixturePackage();
    const tampered = clonePackage(pkg);
    readyDecisionOf(tampered).modelEvaluation.adapterVersion = "mortal-source/3";
    expect(() => validateStructuredAnalysisPackage(tampered))
      .toThrow(/m6c_validator_producer_version_mismatch:mortalSourceModel/);
  });

  it("rejects an evidence-registry canonical producer version contradicting componentVersions", async () => {
    const pkg = await buildFixturePackage();
    const tampered = clonePackage(pkg);
    const canonicalKey = Object.keys(tampered.evidenceRegistry)
      .find((key) => tampered.evidenceRegistry[key]!.kind === "canonical_event")!;
    tampered.evidenceRegistry[canonicalKey]!.producerVersion =
      "canonical-riichi-events/v3";
    expect(() => validateStructuredAnalysisPackage(tampered))
      .toThrow(/m6c_validator_producer_version_mismatch:canonicalReplay/);
  });

  it("rejects an evidence-registry request producer version contradicting componentVersions", async () => {
    const pkg = await buildFixturePackage();
    const tampered = clonePackage(pkg);
    const requestKey = Object.keys(tampered.evidenceRegistry)
      .find((key) => tampered.evidenceRegistry[key]!.kind === "fact_engine_request")!;
    tampered.evidenceRegistry[requestKey]!.producerVersion = "0.2.1";
    expect(() => validateStructuredAnalysisPackage(tampered))
      .toThrow(/m6c_validator_producer_version_mismatch:factEngine:request/);
  });
});

// ---------------------------------------------------------------------------
// Slice 3 acceptance repair — blocker 2: ready-decision reference integrity
// ---------------------------------------------------------------------------

describe("M6-C Slice 3 acceptance repair: ready-decision reference integrity", () => {
  it("rejects a comparisonSetId that disagrees with the model evaluation", async () => {
    const pkg = await buildFixturePackage();
    const tampered = clonePackage(pkg);
    readyDecisionOf(tampered).comparisonSet.comparisonSetId =
      "mortal-comparison:other";
    expect(() => validateStructuredAnalysisPackage(tampered))
      .toThrow(/m6c_validator_comparison_identity/);
  });

  it("rejects a duplicate ledger actionRef", async () => {
    const pkg = await buildFixturePackage();
    const tampered = clonePackage(pkg);
    const ledgers = readyDecisionOf(tampered).candidateFactorLedgers;
    expect(ledgers.length).toBeGreaterThanOrEqual(2);
    (ledgers[1]! as { actionRef: string }).actionRef =
      ledgers[0]!.actionRef as string;
    expect(() => validateStructuredAnalysisPackage(tampered))
      .toThrow(/m6c_validator_ledger_duplicate/);
  });

  it("rejects a ledger actionRef outside the candidate universe", async () => {
    const pkg = await buildFixturePackage();
    const tampered = clonePackage(pkg);
    (readyDecisionOf(tampered).candidateFactorLedgers[0]! as { actionRef: string })
      .actionRef = "action:v1:ghost";
    expect(() => validateStructuredAnalysisPackage(tampered))
      .toThrow(/m6c_validator_ledger_candidate_extra/);
  });

  it("rejects a comparison candidate without a ledger", async () => {
    const pkg = await buildFixturePackage();
    const tampered = clonePackage(pkg);
    const decision = readyDecisionOf(tampered);
    expect(decision.candidateFactorLedgers.length).toBeGreaterThanOrEqual(2);
    decision.candidateFactorLedgers.splice(1, 1);
    expect(() => validateStructuredAnalysisPackage(tampered))
      .toThrow(/m6c_validator_ledger_candidate_missing/);
  });

  it("rejects a FactorDifference action ref outside the candidate universe", async () => {
    const pkg = await buildFixturePackage();
    const tampered = clonePackage(pkg);
    const decision = readyDecisionOf(tampered);
    expect(decision.factorDifferences.length).toBeGreaterThan(0);
    (decision.factorDifferences[0]! as { leftActionRef: string }).leftActionRef =
      "action:v1:ghost";
    expect(() => validateStructuredAnalysisPackage(tampered))
      .toThrow(/m6c_validator_difference_action_ref/);
  });

  it("rejects a model-evaluation scored candidate outside the model-origin universe", async () => {
    const pkg = await buildFixturePackage();
    const tampered = clonePackage(pkg);
    const evaluation = readyDecisionOf(tampered).modelEvaluation;
    expect(evaluation.candidates.length).toBeGreaterThanOrEqual(2);
    (evaluation.candidates[1]! as { actionRef: string }).actionRef =
      "action:v1:foreign-score";
    expect(() => validateStructuredAnalysisPackage(tampered))
      .toThrow(/m6c_validator_evaluation_action_ref/);
  });

  it("rejects an actualActionRef outside the candidate universe", async () => {
    const pkg = await buildFixturePackage();
    const tampered = clonePackage(pkg);
    (readyDecisionOf(tampered).modelEvaluation as unknown as {
      actualActionRef: string;
    }).actualActionRef = "action:v1:ghost-actual";
    expect(() => validateStructuredAnalysisPackage(tampered))
      .toThrow(/m6c_validator_evaluation_action_ref/);
  });

  it("rejects a scored actual-model carrier that ignores the actual↔model correspondence", async () => {
    const pkg = await buildFixturePackage();
    const tampered = clonePackage(pkg);
    const evaluation = readyDecisionOf(tampered).modelEvaluation;
    // The fixture's actual is directly model-scored (no correspondence), so the
    // scored carrier MUST be the actual's own ref — moving it to another scored
    // alternative breaks the correspondence mapping.
    expect(evaluation.candidates.length).toBeGreaterThanOrEqual(2);
    evaluation.scoredActualModelActionRef = evaluation.candidates[1]!.actionRef;
    evaluation.errorGap = 60;
    expect(() => validateStructuredAnalysisPackage(tampered))
      .toThrow(/m6c_validator_evaluation_action_ref/);
  });

  it("rejects a DeterministicPreference ref outside the candidate universe", async () => {
    const pkg = await buildFixturePackage();
    const tampered = clonePackage(pkg);
    const decision = readyDecisionOf(tampered);
    decision.deterministicPreference = {
      actionRefs: ["action:v1:ghost-pref"],
      scope: "applied_decision",
      decisiveDifferenceIds: ["difference:v1:ghost"],
      coverage: "complete",
    } as unknown as typeof decision.deterministicPreference;
    expect(() => validateStructuredAnalysisPackage(tampered))
      .toThrow(/m6c_validator_preference_action_ref/);
  });
});

// ---------------------------------------------------------------------------
// Slice 3 acceptance repair — blocker 3: analysis-policy authority + artifact
// identity (recomputable packageId / semanticContentHash)
// ---------------------------------------------------------------------------

describe("M6-C Slice 3 acceptance repair: analysis policy and artifact identity", () => {
  it("rejects a package analysis policy that contradicts every detailPolicy", async () => {
    const pkg = await buildFixturePackage();
    const tampered = clonePackage(pkg);
    tampered.analysisPolicy.threshold = 50;
    expect(() => validateStructuredAnalysisPackage(tampered))
      .toThrow(/m6c_validator_policy_mismatch/);
  });

  it("rejects a ModelEvaluation detailPolicy that contradicts the package policy", async () => {
    const pkg = await buildFixturePackage();
    const tampered = clonePackage(pkg);
    readyDecisionOf(tampered).modelEvaluation.detailPolicy.threshold = 50;
    expect(() => validateStructuredAnalysisPackage(tampered))
      .toThrow(/m6c_validator_policy_mismatch/);
  });

  it("rejects a mutated FactorFact value while keeping the old semanticContentHash", async () => {
    const pkg = await buildFixturePackage();
    const tampered = clonePackage(pkg);
    const fact = readyDecisionOf(tampered).candidateFactorLedgers
      .flatMap((ledger) => ledger.axes.flatMap((axis) => axis.facts))
      .find((candidate) =>
        candidate.status === "calculated" && candidate.value?.kind === "number"
      )!;
    expect(fact).toBeDefined();
    if (fact.value?.kind === "number") fact.value.value = 5;
    expect(() => validateStructuredAnalysisPackage(tampered))
      .toThrow(/m6c_validator_semantic_hash_mismatch/);
  });

  it("rejects mutated componentVersions while keeping the old packageId", async () => {
    const pkg = await buildFixturePackage();
    const tampered = clonePackage(pkg);
    tampered.componentVersions.factorPipeline = "factor-pipeline/v2";
    expect(() => validateStructuredAnalysisPackage(tampered))
      .toThrow(/m6c_validator_package_id_mismatch/);
  });

  it("rejects a stale packageId after any content change", async () => {
    const pkg = await buildFixturePackage();
    const tampered = clonePackage(pkg);
    tampered.packageId = "package:sha256:deadbeef";
    expect(() => validateStructuredAnalysisPackage(tampered))
      .toThrow(/m6c_validator_package_id_mismatch/);
  });

  it("binds package.analysisPolicy into packageId even with zero analysis_ready decisions", async () => {
    const pkg = await buildIncompleteFixturePackage();
    expect(pkg.decisions.every((decision) => decision.outcome !== "analysis_ready"))
      .toBe(true);
    const tampered = clonePackage(pkg);
    tampered.analysisPolicy.threshold = 50;
    expect(() => validateStructuredAnalysisPackage(tampered))
      .toThrow(/m6c_validator_package_id_mismatch/);
  });

  it("keeps accepting a different wall-clock frozenAt (excluded from semantic identity)", async () => {
    const pkg = await buildFixturePackage();
    const tampered = clonePackage(pkg);
    readyDecisionOf(tampered).modelEvaluation.detailPolicy.frozenAt =
      "2026-07-01T00:00:00.000Z";
    expect(() => validateStructuredAnalysisPackage(tampered)).not.toThrow();
  });

  it("keeps accepting a different createdAt (provenance only)", async () => {
    const pkg = await buildFixturePackage();
    const tampered = clonePackage(pkg);
    tampered.createdAt = "2026-07-01T00:00:00.000Z";
    expect(() => validateStructuredAnalysisPackage(tampered)).not.toThrow();
  });
});
