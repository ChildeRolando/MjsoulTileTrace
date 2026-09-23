import { describe, expect, it } from "vitest";
import { FIXED_REVIEW_OUTCOMES, FixedReviewDetailSchema, FixedReviewSnapshotSchema } from "../src/fixed-review-view.js";
import { MortalDecisionOutcomeSchema } from "../src/structured-analysis-package.js";

const snapshot = {
  schemaVersion: "fixed-review-view/v1", packageId: "package:1", analysisStatus: "complete",
  outcomeCounts: { analysis_ready: 1, unsupported_action: 0, source_row_not_expected: 0, no_mortal_entry: 0, binding_mismatch: 0, model_output_incomplete: 0, analysis_blocked: 0 },
  selection: { policyVersion: "deterministic-review-selector/v1", selectedCount: 0, items: [] },
  activeReportRefId: null, activeReportStatus: "not_generated",
  explanationCounts: { ready: 0, provider_unavailable: 0, request_failed: 0, invalid_output: 0 },
};

describe("fixed review renderer contracts", () => {
  it("keeps the view counter vocabulary exhaustive with the canonical package outcomes", () => {
    expect(FIXED_REVIEW_OUTCOMES).toEqual(MortalDecisionOutcomeSchema.options);
  });
  it("accepts only the narrowed active-report snapshot", () => {
    expect(FixedReviewSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    for (const hostile of [
      { ...snapshot, reportCatalog: [] }, { ...snapshot, reportRefs: [] },
      { ...snapshot, provider: "secret-provider" }, { ...snapshot, path: "C:/raw/package.json" },
    ]) expect(() => FixedReviewSnapshotSchema.parse(hostile)).toThrow();
  });

  it("requires all seven outcome counters and rejects unknown statuses", () => {
    const { analysis_blocked: _removed, ...missing } = snapshot.outcomeCounts;
    expect(() => FixedReviewSnapshotSchema.parse({ ...snapshot, outcomeCounts: missing })).toThrow();
    expect(() => FixedReviewSnapshotSchema.parse({ ...snapshot, activeReportStatus: "internal_error" })).toThrow();
  });

  it("keeps detail typed and strict", () => {
    const detail = {
      schemaVersion: "fixed-review-detail/v1", packageId: "package:1", activeReportRefId: null,
      decisionId: "decision:1", actual: null, mortal: [], coachJudgments: [], explanations: [],
      referenceTargets: [{ displayRef: "node:1", authority: "model", label: "模型评估", summary: "模型偏好：打牌 1m", relatedAction: null }],
      provenance: [], explanationStatus: "not_generated",
    };
    expect(FixedReviewDetailSchema.parse(detail)).toEqual(detail);
    expect(() => FixedReviewDetailSchema.parse({ ...detail, graph: { nodes: [] } })).toThrow();
    expect(() => FixedReviewDetailSchema.parse({ ...detail, referenceTargets: [{ ...detail.referenceTargets[0], payload: { raw: true } }] })).toThrow();
  });
});
