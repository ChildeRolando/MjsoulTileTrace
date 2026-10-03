import { describe, expect, it } from "vitest";
import { normalizeTokenUsage, combineReportedTokenUsage } from "../src/llm-provider/token-usage.js";

describe("provider-independent reported Token counters", () => {
  it("keeps partial valid counters unknown elsewhere and derives totals only when supported", () => {
    expect(normalizeTokenUsage({ inputTokens: 12, cachedInputTokens: -1, outputTokens: "8" })).toEqual({ inputTokens: 12 });
    expect(normalizeTokenUsage({ inputTokens: 12, outputTokens: 8 })).toEqual({ inputTokens: 12, outputTokens: 8 });
    expect(normalizeTokenUsage({ inputTokens: 12, outputTokens: 8, cachedInputTokens: 9 }, true)).toEqual({ inputTokens: 12, outputTokens: 8, cachedInputTokens: 9, totalTokens: 20 });
    expect(normalizeTokenUsage({})).toBeUndefined();
    expect(normalizeTokenUsage({ inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: 1 }, true)?.totalTokens).toBeUndefined();
  });
  it("retains known failed-attempt usage without estimating unreported attempts", () => {
    const first = { inputTokens: 10, cachedInputTokens: 3, outputTokens: 2, totalTokens: 12 };
    expect(combineReportedTokenUsage(first, undefined)).toEqual(first);
    expect(combineReportedTokenUsage(first, { inputTokens: 20, cachedInputTokens: 7, outputTokens: 4, totalTokens: 24 })).toEqual({ inputTokens: 30, cachedInputTokens: 10, outputTokens: 6, totalTokens: 36 });
    expect(combineReportedTokenUsage(undefined, undefined)).toBeUndefined();
    expect(combineReportedTokenUsage({ inputTokens: Number.MAX_SAFE_INTEGER }, { inputTokens: 1 })).toBeUndefined();
  });
});
