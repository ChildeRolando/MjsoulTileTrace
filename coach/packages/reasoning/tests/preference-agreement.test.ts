import { describe, expect, it } from "vitest";
import { ComparisonSetSchema } from "@riichi-coach/contracts";
import {
  computePreferenceAgreement,
  createActionPreference,
  createPreferenceState,
} from "../src/index.js";

describe("preference agreement", () => {
  it.each([
    [null, ["action:a"], "not_comparable"],
    [["action:a"], null, "not_comparable"],
    [["action:a"], ["action:a"], "agree"],
    [
      ["action:a", "action:b"],
      ["action:b", "action:c"],
      "partial_agreement",
    ],
    [["action:a"], ["action:b"], "conflict"],
  ] as const)(
    "maps %j and %j to %s",
    (modelPreference, coachPreference, expected) => {
      expect(computePreferenceAgreement(
        modelPreference,
        coachPreference,
      )).toBe(expected);
    },
  );

  it("rejects malformed duplicate preference sets", () => {
    expect(() => computePreferenceAgreement(
      ["action:a", "action:a"],
      ["action:a"],
    )).toThrow();
  });

  it("normalizes preference sets and rejects actions outside the comparison", () => {
    expect(createActionPreference([
      "action:b",
      "action:a",
      "action:b",
    ])).toEqual(["action:a", "action:b"]);

    const comparisonSet = ComparisonSetSchema.parse({
      comparisonSetId: "comparison:user:preference",
      origin: "user_comparison",
      decisionLayerRef: "decision-layer:user:preference",
      candidates: [
        { actionRef: "action:a", origins: ["user"] },
        { actionRef: "action:b", origins: ["user"] },
      ],
    });
    expect(createPreferenceState(
      comparisonSet,
      createActionPreference(["action:a"]),
      createActionPreference(["action:a", "action:b"]),
    ).agreement).toBe("partial_agreement");

    expect(() => createPreferenceState(
      comparisonSet,
      createActionPreference(["action:outside"]),
      null,
    )).toThrow();
  });
});
