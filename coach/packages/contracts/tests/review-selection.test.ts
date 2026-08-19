/**
 * DeterministicReviewSelector — Slice 1 contract tests.
 *
 * Spec Testing Decisions (Slice 1 — contract tests):
 *  - `ReviewSelectionResult` / `ReviewSelection` schema 接受最小合法样例；拒绝
 *    未知字段、非法 reason、rank 0 / 负 rank、非法 `analysisPackageStatus`；
 *  - `selected: []` 合法；`policyVersion` 必须等于 v1 literal；
 *  - `SelectorPolicyV1` 的 T=10 / N=10 以 schema literal 冻结：改常量字符串或
 *    数字即编译/测试失败；reason 词汇恰好两值，不含 pedagogy 词；
 *  - contract ownership：contracts 不反向依赖 reasoning（check:architecture 门禁）。
 */
import { describe, expect, it } from "vitest";
import {
  SELECTOR_POLICY_VERSION_V1,
  ReviewSelectionReasonSchema,
  ReviewSelectionResultSchema,
  ReviewSelectionSchema,
  SelectorPolicyV1Schema,
} from "../src/index.js";

const VALID_RESULT = {
  policyVersion: SELECTOR_POLICY_VERSION_V1,
  analysisPackageId: "package:sha256:abc123",
  analysisPackageStatus: "complete",
  selected: [
    { decisionId: "decision:game-1:self0:self:self_turn:game-1/0/3/0", rank: 1, selectionReason: "model_disagreement_above_threshold" },
  ],
};

describe("DeterministicReviewSelector Slice 1 contract", () => {
  it("accepts a minimal valid ReviewSelectionResult and parses its fields", () => {
    const parsed = ReviewSelectionResultSchema.parse(VALID_RESULT);
    expect(parsed.policyVersion).toBe(SELECTOR_POLICY_VERSION_V1);
    expect(parsed.analysisPackageId).toBe("package:sha256:abc123");
    expect(parsed.analysisPackageStatus).toBe("complete");
    expect(parsed.selected).toHaveLength(1);
    expect(parsed.selected[0]).toEqual({
      decisionId: "decision:game-1:self0:self:self_turn:game-1/0/3/0",
      rank: 1,
      selectionReason: "model_disagreement_above_threshold",
    });
  });

  it("accepts an empty selected list", () => {
    const parsed = ReviewSelectionResultSchema.parse({
      ...VALID_RESULT,
      selected: [],
    });
    expect(parsed.selected).toEqual([]);
  });

  it("pins policyVersion to the v1 literal", () => {
    expect(SELECTOR_POLICY_VERSION_V1).toBe("deterministic-review-selector/v1");
    expect(() => ReviewSelectionResultSchema.parse({
      ...VALID_RESULT,
      policyVersion: "deterministic-review-selector/v2",
    })).toThrow();
    expect(() => ReviewSelectionResultSchema.parse({
      ...VALID_RESULT,
      policyVersion: "something-else",
    })).toThrow();
  });

  it("rejects unknown fields on the result, selections, and reasons", () => {
    expect(() => ReviewSelectionResultSchema.parse({
      ...VALID_RESULT,
      selectionId: "selection:1",
    })).toThrow(/Unrecognized key/);
    expect(() => ReviewSelectionResultSchema.parse({
      ...VALID_RESULT,
      createdAt: "2026-08-19T00:00:00.000Z",
    })).toThrow(/Unrecognized key/);
    expect(() => ReviewSelectionResultSchema.parse({
      ...VALID_RESULT,
      selected: [{ ...VALID_RESULT.selected[0], semanticHash: "sha256:abc" }],
    })).toThrow(/Unrecognized key/);
  });

  it("rejects an invalid selection reason", () => {
    expect(() => ReviewSelectionResultSchema.parse({
      ...VALID_RESULT,
      selected: [{ ...VALID_RESULT.selected[0], selectionReason: "bad_push" }],
    })).toThrow();
    expect(() => ReviewSelectionResultSchema.parse({
      ...VALID_RESULT,
      selected: [{ ...VALID_RESULT.selected[0], selectionReason: "dangerous_decision" }],
    })).toThrow();
    expect(() => ReviewSelectionResultSchema.parse({
      ...VALID_RESULT,
      selected: [{ ...VALID_RESULT.selected[0], selectionReason: "important_learning_point" }],
    })).toThrow();
  });

  it("rejects rank 0 and negative ranks", () => {
    expect(() => ReviewSelectionResultSchema.parse({
      ...VALID_RESULT,
      selected: [{ ...VALID_RESULT.selected[0], rank: 0 }],
    })).toThrow();
    expect(() => ReviewSelectionResultSchema.parse({
      ...VALID_RESULT,
      selected: [{ ...VALID_RESULT.selected[0], rank: -1 }],
    })).toThrow();
  });

  it("rejects an invalid analysisPackageStatus", () => {
    expect(() => ReviewSelectionResultSchema.parse({
      ...VALID_RESULT,
      analysisPackageStatus: "succeeded",
    })).toThrow();
    expect(() => ReviewSelectionResultSchema.parse({
      ...VALID_RESULT,
      analysisPackageStatus: "complete_extra",
    })).toThrow();
  });

  it("keeps the three aggregate statuses aligned with the package record status", () => {
    for (const status of ["complete", "degraded", "integrity_failed"] as const) {
      expect(ReviewSelectionResultSchema.parse({
        ...VALID_RESULT,
        analysisPackageStatus: status,
      }).analysisPackageStatus).toBe(status);
    }
  });

  it("accepts both frozen selection reasons", () => {
    expect(ReviewSelectionReasonSchema.options).toEqual([
      "model_disagreement_above_threshold",
      "no_distinguishable_factor_difference",
    ]);
    expect(ReviewSelectionSchema.parse({
      decisionId: "decision:game-1:self0:self:self_turn:game-1/0/3/0",
      rank: 1,
      selectionReason: "no_distinguishable_factor_difference",
    }).selectionReason).toBe("no_distinguishable_factor_difference");
  });

  it("freezes policy v1 T=10 / N=10 as schema literals", () => {
    const policy = SelectorPolicyV1Schema.parse({
      policyVersion: SELECTOR_POLICY_VERSION_V1,
      errorGapThreshold: 10,
      maxSelections: 10,
    });
    expect(policy.errorGapThreshold).toBe(10);
    expect(policy.maxSelections).toBe(10);
    // Any T/N/version change is a compile/test failure — a new policy version
    // must be published instead of an in-place edit.
    expect(() => SelectorPolicyV1Schema.parse({
      policyVersion: SELECTOR_POLICY_VERSION_V1,
      errorGapThreshold: 11,
      maxSelections: 10,
    })).toThrow();
    expect(() => SelectorPolicyV1Schema.parse({
      policyVersion: SELECTOR_POLICY_VERSION_V1,
      errorGapThreshold: 10,
      maxSelections: 9,
    })).toThrow();
    expect(() => SelectorPolicyV1Schema.parse({
      policyVersion: "deterministic-review-selector/v2",
      errorGapThreshold: 10,
      maxSelections: 10,
    })).toThrow();
    // Unknown policy versions fail closed (no partial acceptance).
    expect(() => SelectorPolicyV1Schema.parse({
      policyVersion: "unknown-policy/v1",
      errorGapThreshold: 10,
      maxSelections: 10,
    })).toThrow();
  });

  it("keeps the reason vocabulary free of pedagogy / CoachJudgment wording", () => {
    const vocabulary = ReviewSelectionReasonSchema.options;
    for (const forbidden of [
      "bad_push",
      "dangerous_decision",
      "important_learning_point",
      "learning_opportunity",
    ]) {
      expect(vocabulary).not.toContain(forbidden);
    }
    expect(vocabulary).toHaveLength(2);
  });
});
