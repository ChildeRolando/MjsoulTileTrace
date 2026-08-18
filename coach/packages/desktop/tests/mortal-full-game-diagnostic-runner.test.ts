import { describe, expect, it } from "vitest";
import {
  buildMortalFullGameResultPath,
  formatMortalFullGameConsoleLine,
  serializeMortalFullGameDiagnosticResult,
} from "../src/mortal-full-game-diagnostic-runner.js";

const SYNTHETIC_REPORT_ID = "0123456789abcdef";
const SYNTHETIC_RECORD_ID = "260810-00000000-0000-0000-0000-000000000000";

function fakeCoverageReview() {
  return {
    status: "coverage_ready",
    summary: {
      replayDecisionCount: 2,
      mortalSelfEntryCount: 1,
      responseEntryCount: 0,
      localConservation: 2,
      sourceConservation: 1,
      outcomes: {
        analysis_ready: 1,
        unsupported_action: 0,
        source_row_not_expected: 0,
        no_mortal_entry: 1,
        binding_mismatch: 0,
        model_output_incomplete: 0,
        analysis_blocked: 0,
      },
      binding: { bound: 1, noMortalEntry: 1, ambiguous: 0 },
      supportedPairCount: 1,
      unsupportedReasons: {},
      modelIncompleteReasons: {},
      analysisBlockedReasons: {},
    },
    sourceCoverage: {
      mortalSelfEntryCount: 1,
      responseEntryCount: 0,
      boundMortalEntryCount: 1,
      unboundMortalEntryCount: 0,
      ambiguousMortalEntryCount: 0,
      entries: [],
    },
    decisions: [{
      decisionOrdinal: 0,
      roundOrdinal: 0,
      binding: "bound",
      support: "supported",
      outcome: "analysis_ready",
      reason: null,
      sourceEntryRef: `sha256:${SYNTHETIC_REPORT_ID}`,
      sourceOrdinal: 0,
      modelSummary: {
        actualActionRef: "action:v1:actual",
        preferredActions: ["action:v1:actual"],
        topModelProbabilityPercent: 100,
        errorGap: 0,
        detailClass: "not_error",
        factorAnalysisMode: "v2",
        deterministicPreference: null,
      },
    }],
  };
}

describe("mortal-full-game diagnostic privacy", () => {
  it("never serializes raw report/record identifiers or internal refs", () => {
    const serialized = serializeMortalFullGameDiagnosticResult(
      { status: "acquired", selfSeat: 1 } as never,
      fakeCoverageReview() as never,
    );
    expect(serialized).not.toContain(SYNTHETIC_REPORT_ID);
    expect(serialized).not.toContain(SYNTHETIC_RECORD_ID);
    expect(serialized).not.toContain("decisionEventRef");
    expect(serialized).not.toContain("comparisonSetId");
    expect(serialized).not.toContain("evaluationId");
    expect(serialized).not.toContain("https://");
  });

  it("prints aggregate console output only", () => {
    const line = formatMortalFullGameConsoleLine({
      replayDecisionCount: 120,
      mortalSelfEntryCount: 113,
      responseEntryCount: 37,
      bound: 100,
      ready: 90,
      unsupported: 5,
      missing: 3,
      sourceRowNotExpected: 12,
      bindingMismatch: 0,
      modelIncomplete: 0,
      blocked: 0,
    });
    expect(line).toContain("replay=120");
    expect(line).toContain("mortal=113");
    expect(line).toContain("response=37");
    expect(line).toContain("notExpected=12");
    expect(line).not.toContain(SYNTHETIC_REPORT_ID);
    expect(line).not.toContain("https://");
    expect(line).not.toContain("action:v1");
  });

  it("never embeds identifiers in the result path", () => {
    const path = buildMortalFullGameResultPath("C:\\temp\\results", 1234567890);
    expect(path).not.toContain(SYNTHETIC_REPORT_ID);
    expect(path).not.toContain(SYNTHETIC_RECORD_ID);
    expect(path).toContain("mortal-full-game-result-1234567890.json");
  });
});
