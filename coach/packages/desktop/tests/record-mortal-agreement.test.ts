import { describe, expect, it } from "vitest";
import {
  summarizeMortalAgreement,
  type MortalAgreementDecision,
} from "../src/record-mortal-agreement.js";

function mortalDecision(input: {
  preferredActions: string[];
  scoredActualModelActionRef: string;
  candidateRefs?: string[];
}): MortalAgreementDecision {
  const candidateRefs = input.candidateRefs ?? [
    input.scoredActualModelActionRef,
    "action:v1:discard:other",
  ];
  return {
    outcome: "analysis_ready",
    modelEvaluation: {
      engineId: "mortal",
      candidates: candidateRefs.map(actionRef => ({ actionRef })),
      preferredActions: input.preferredActions,
      scoredActualModelActionRef: input.scoredActualModelActionRef,
    },
  };
}

describe("summarizeMortalAgreement", () => {
  it("counts ties as agreement and compares the scored model action to preferred actions", () => {
    const tiedMappedActual = {
      ...mortalDecision({
        preferredActions: ["action:v1:declare_riichi", "action:v1:discard:other"],
        scoredActualModelActionRef: "action:v1:declare_riichi",
      }),
      actualActionRef: "action:v1:riichi_discard:5p",
    };
    const disagreement = mortalDecision({
      preferredActions: ["action:v1:discard:other"],
      scoredActualModelActionRef: "action:v1:discard:scored",
      candidateRefs: ["action:v1:discard:scored", "action:v1:discard:other"],
    });
    const native = {
      outcome: "analysis_ready",
      modelEvaluation: { engineId: "akagi_native" },
    } as unknown as MortalAgreementDecision;
    const incomplete = { outcome: "no_mortal_entry" } as const;

    expect(summarizeMortalAgreement([
      tiedMappedActual,
      disagreement,
      native,
      incomplete,
    ])).toEqual({ agreementCount: 1, scoredDecisionCount: 2 });
  });

  it("leaves partial single-candidate decisions outside the scored denominator", () => {
    const partial = mortalDecision({
      preferredActions: [],
      scoredActualModelActionRef: "action:v1:discard:only",
      candidateRefs: ["action:v1:discard:only"],
    });
    expect(summarizeMortalAgreement([partial])).toEqual({
      agreementCount: 0,
      scoredDecisionCount: 0,
    });
  });

  it.each([
    { label: "missing evaluation", value: { outcome: "analysis_ready" } },
    { label: "duplicate candidates", value: mortalDecision({
      preferredActions: ["action:v1:discard:scored"],
      scoredActualModelActionRef: "action:v1:discard:scored",
      candidateRefs: ["action:v1:discard:scored", "action:v1:discard:scored"],
    }) },
    { label: "scored action absent", value: mortalDecision({
      preferredActions: ["action:v1:discard:other"],
      scoredActualModelActionRef: "action:v1:discard:missing",
      candidateRefs: ["action:v1:discard:scored", "action:v1:discard:other"],
    }) },
    { label: "unknown outcome", value: { outcome: "guessed" } },
  ])("rejects $label instead of manufacturing a count", ({ value }) => {
    expect(() => summarizeMortalAgreement([
      value as MortalAgreementDecision,
    ])).toThrow("record_mortal_agreement_invalid");
  });
});
