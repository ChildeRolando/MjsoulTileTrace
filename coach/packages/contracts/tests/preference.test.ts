import { describe, expect, it } from "vitest";
import {
  ComparisonPreferencesSchema,
  PreferenceSetSchema,
} from "../src/index.js";

describe("preference contracts", () => {
  it("accepts tied preferences and every agreement state", () => {
    expect(PreferenceSetSchema.parse([
      "action:a",
      "action:b",
    ])).toEqual(["action:a", "action:b"]);

    expect(ComparisonPreferencesSchema.parse({
      modelPreference: ["action:a"],
      coachPreference: ["action:a", "action:b"],
      agreement: "partial_agreement",
    }).agreement).toBe("partial_agreement");

    expect(ComparisonPreferencesSchema.parse({
      modelPreference: null,
      coachPreference: ["action:a"],
      agreement: "not_comparable",
    }).agreement).toBe("not_comparable");

    expect(ComparisonPreferencesSchema.parse({
      modelPreference: ["action:a"],
      coachPreference: null,
      agreement: "not_comparable",
    }).agreement).toBe("not_comparable");

    expect(ComparisonPreferencesSchema.parse({
      modelPreference: ["action:a", "action:b"],
      coachPreference: ["action:b", "action:a"],
      agreement: "agree",
    }).agreement).toBe("agree");

    expect(ComparisonPreferencesSchema.parse({
      modelPreference: ["action:a"],
      coachPreference: ["action:b"],
      agreement: "conflict",
    }).agreement).toBe("conflict");
  });

  it("rejects duplicate actions and empty preference sets", () => {
    expect(() => PreferenceSetSchema.parse([])).toThrow();
    expect(() => PreferenceSetSchema.parse([
      "action:a",
      "action:a",
    ])).toThrow();
  });

  it("rejects a forged agreement state", () => {
    expect(() => ComparisonPreferencesSchema.parse({
      modelPreference: ["action:a"],
      coachPreference: ["action:b"],
      agreement: "agree",
    })).toThrow();
  });
});
