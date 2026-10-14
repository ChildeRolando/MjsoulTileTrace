import { describe, expect, it } from "vitest";
import {
  LOCAL_MORTAL_ADAPTER_VERSION,
  LOCAL_MORTAL_PROTOCOL_VERSION,
  LOCAL_MORTAL_SCORING_PROTOCOL_VERSION,
  canonicalActionRef,
  type ArenaCoachSubmission,
  type ArenaBlindObservation,
  type ArenaReferenceLabel,
  type ArenaScoringCaseInput,
  type ArenaToolBinding,
  type RiichiAction,
} from "@riichi-coach/contracts";
import { createArenaScoringCaseInput, scoreArenaBatch } from "../src/blind-discard-arena-scorer.js";

type DiscardAction = Extract<RiichiAction, { kind: "discard" }>;
const action = (tileId: "1m" | "2m" | "5m", red: boolean, discardMode: "tedashi" | "tsumogiri"): DiscardAction => ({
  kind: "discard", tile: { id: tileId, red }, discardMode,
});
const primaryAction = action("1m", false, "tedashi");
const primaryRef = canonicalActionRef(primaryAction);
const primaryPhysicalAction = action("1m", false, "tsumogiri");
const physicalRef = canonicalActionRef(primaryPhysicalAction);
const secondAction = action("2m", false, "tedashi");
const secondRef = canonicalActionRef(secondAction);
const caseRef = (index: number) => `arena-case:v1:00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
const runtimeIdentity = {
  runtimeImplementation: "Equim-chan/Mortal" as const,
  runtimeRevision: "1".repeat(40),
  runtimeVersion: "Mortal V4" as const,
  runtimeArtifactSha256: "2".repeat(64),
  runtimeModelSha256: "3".repeat(64),
  runtimeEngineSha256: "4".repeat(64),
  checkpointRepository: "Yuchen1457/mortal-582500" as const,
  checkpointRevision: "5".repeat(40),
  checkpointModelTag: "mortal-hpc@582500" as const,
  checkpointFileSha256: "6".repeat(64),
  protocolVersion: LOCAL_MORTAL_PROTOCOL_VERSION,
  adapterVersion: LOCAL_MORTAL_ADAPTER_VERSION,
  nativeArtifactSha256: "7".repeat(64),
};
const ruleIdentity = {
  implementation: "Equim-chan/Mortal/libriichi" as const,
  revision: "8".repeat(40),
  nativeArtifactSha256: "9".repeat(64),
  wrapperSha256: "a".repeat(64),
  normalizationVersion: "libriichi-actions/v2" as const,
};

function candidate(actionValue: DiscardAction, realizations?: readonly DiscardAction[]) {
  const actionRef = canonicalActionRef(actionValue);
  return {
    actionRef,
    action: actionValue,
    physicalRealizations: (realizations ?? [actionValue]).map((realization) => ({
      actionRef: canonicalActionRef(realization),
      action: realization,
    })),
  };
}

function label(caseIndex: number, actionRef = primaryRef): ArenaReferenceLabel {
  return {
    schemaVersion: "blind-discard-arena-reference/v1",
    caseRef: caseRef(caseIndex),
    actionRef,
    runtimeIdentity,
    runtimeConfigSha256: "b".repeat(64),
    ruleIdentity,
    scoringProtocolVersion: LOCAL_MORTAL_SCORING_PROTOCOL_VERSION,
  };
}

function submission(caseIndex: number, actionRef = primaryRef): ArenaCoachSubmission {
  return {
    caseRef: caseRef(caseIndex),
    actionRef,
    rationale: "The connected shape and remaining public tiles support this discard.",
    evidenceRefs: [],
    sourceRefs: [],
    mainAlternative: null,
    uncertainty: "The opposing hands remain unknown.",
  };
}

function scoringCase(index: number, attempt: ArenaScoringCaseInput["attempt"], reference: ArenaScoringCaseInput["reference"] = {
  status: "available", label: label(index),
}): ArenaScoringCaseInput {
  return {
    caseRef: caseRef(index),
    candidates: [candidate(primaryAction, [primaryAction, primaryPhysicalAction]), candidate(secondAction)],
    reference,
    attempt,
  };
}

describe("Blind Discard Arena independent scorer", () => {
  it("keeps every included failure in the main denominator and reports the label-available conditional rate", () => {
    const records: ArenaScoringCaseInput[] = [
      scoringCase(0, { status: "submitted", submission: submission(0) }),
      scoringCase(1, { status: "submitted", submission: submission(1, secondRef) }),
      scoringCase(2, { status: "invalid_submission" }),
      scoringCase(3, { status: "missing_submission" }),
      scoringCase(4, { status: "timeout" }),
      scoringCase(5, { status: "tool_failure" }),
      scoringCase(6, { status: "budget_exhausted" }),
      scoringCase(7, { status: "provider_error" }),
      scoringCase(8, { status: "provider_unavailable" }),
      scoringCase(9, { status: "submitted", submission: submission(9) }, { status: "binding_failure", reason: "candidate_mismatch" }),
      scoringCase(10, { status: "submitted", submission: submission(10) }, { status: "unavailable", reason: "mortal_timeout" }),
    ];
    const score = scoreArenaBatch(records);

    expect(score.includedCaseCount).toBe(11);
    expect(score.matchedCaseCount).toBe(1);
    expect(score.unmatchedCaseCount).toBe(10);
    expect(score.primaryMatchRate).toEqual({ status: "available", numerator: 1, denominator: 11, value: 1 / 11 });
    expect(score.labelAvailableCaseCount).toBe(9);
    expect(score.conditionalMatchRate).toEqual({ status: "available", numerator: 1, denominator: 2, value: 0.5 });
    expect(score.failures).toEqual({
      invalidSubmission: 1,
      missingSubmission: 1,
      providerUnavailable: 1,
      providerError: 1,
      timeout: 1,
      cancelled: 0,
      toolFailure: 1,
      budgetExhausted: 1,
      labelUnavailable: 1,
      labelBindingFailure: 1,
    });
    expect(score.cases.map(row => row.caseRef)).toEqual(records.map(row => row.caseRef));
    expect(score).toEqual(scoreArenaBatch(records));
  });

  it("uses validated same-tile physical realizations for equivalence and keeps red fives distinct", () => {
    const aliasLabel = scoringCase(12, { status: "submitted", submission: submission(12) }, {
      status: "available", label: label(12, physicalRef),
    });
    const aliasScore = scoreArenaBatch([aliasLabel]);
    expect(aliasScore.matchedCaseCount).toBe(1);

    const redAction = action("5m", true, "tedashi");
    const plainFive = action("5m", false, "tsumogiri");
    expect(canonicalActionRef(redAction)).not.toBe(canonicalActionRef(action("5m", false, "tedashi")));
    const invalidEquivalence = {
      ...aliasLabel,
      candidates: [
        {
          actionRef: canonicalActionRef(redAction),
          action: redAction,
          physicalRealizations: [
            { actionRef: canonicalActionRef(redAction), action: redAction },
            { actionRef: canonicalActionRef(plainFive), action: plainFive },
          ],
        },
        candidate(secondAction),
      ],
      reference: { status: "available" as const, label: label(12, canonicalActionRef(redAction)) },
    };
    expect(() => scoreArenaBatch([invalidEquivalence])).toThrow("arena_scoring_input_invalid");
  });

  it("treats zero included cases as not available instead of reporting a false zero rate", () => {
    const score = scoreArenaBatch([]);
    expect(score.primaryMatchRate).toEqual({ status: "not_available", numerator: 0, denominator: 0, value: null });
    expect(score.conditionalMatchRate).toEqual({ status: "not_available", numerator: 0, denominator: 0, value: null });
  });

  it("counts an unbound preferred action as label binding failure, not as a removed case", () => {
    const badLabel = scoringCase(14, { status: "submitted", submission: submission(14) }, {
      status: "available",
      label: label(14, canonicalActionRef(action("5m", false, "tedashi"))),
    });
    const score = scoreArenaBatch([badLabel]);
    expect(score.includedCaseCount).toBe(1);
    expect(score.matchedCaseCount).toBe(0);
    expect(score.failures.labelBindingFailure).toBe(1);
    expect(score.cases[0]).toMatchObject({ status: "unscorable", reason: "reference_not_bound_to_case_candidates" });
  });

  it("keeps cross-case submissions and label bindings in the included denominator", () => {
    const selectedCaseRef = caseRef(18);
    const input = createArenaScoringCaseInput({
      observation: { caseRef: selectedCaseRef } as unknown as ArenaBlindObservation,
      toolBinding: {
        caseRef: selectedCaseRef,
        candidates: [candidate(primaryAction, [primaryAction, primaryPhysicalAction]), candidate(secondAction)],
      } as unknown as ArenaToolBinding,
      reference: { status: "available", label: label(19) },
      attempt: { status: "submitted", submission: submission(20) },
    });
    const score = scoreArenaBatch([input]);

    expect(input.reference).toEqual({ status: "binding_failure", reason: "candidate_mismatch" });
    expect(input.attempt).toEqual({ status: "invalid_submission" });
    expect(score.includedCaseCount).toBe(1);
    expect(score.primaryMatchRate).toEqual({ status: "available", numerator: 0, denominator: 1, value: 0 });
    expect(score.failures).toMatchObject({ invalidSubmission: 1, labelBindingFailure: 1 });
  });
});
