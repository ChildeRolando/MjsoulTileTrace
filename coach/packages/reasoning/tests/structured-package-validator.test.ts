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
