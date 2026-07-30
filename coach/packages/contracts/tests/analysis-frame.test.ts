import { describe, expect, it } from "vitest";
import {
  AnalysisFrameSchema,
  CurrentSceneFrameSchema,
  ModifiedSceneFrameSchema,
} from "../src/index.js";

describe("analysis frame contracts", () => {
  it("accepts replay facts for the current scene", () => {
    const parsed = AnalysisFrameSchema.parse({
      kind: "current_scene",
      frameId: "frame:e1:t6",
      scope: { kind: "applied_decision" },
      sceneRef: "scene:e1:t6",
      facts: [
        { factId: "event-48", provenance: "raw_replay" },
      ],
    });

    expect(parsed.kind).toBe("current_scene");
  });

  it("preserves replaced and asserted facts in a modified scene", () => {
    const parsed = AnalysisFrameSchema.parse({
      kind: "modified_scene",
      frameId: "frame:e1:t6:modified",
      scope: { kind: "single_axis", axis: "efficiency" },
      baseSceneRef: "scene:e1:t6",
      baseFacts: [
        { factId: "event-48", provenance: "raw_replay" },
      ],
      modifications: [
        {
          modificationId: "mod:replace-draw",
          replacedFact: {
            factId: "event-48",
            provenance: "raw_replay",
          },
          assertedFact: {
            factId: "user-fact:draw-7s",
            provenance: "user_asserted",
          },
        },
      ],
    });

    expect(parsed.kind).toBe("modified_scene");
    if (parsed.kind === "modified_scene") {
      expect(parsed.modifications[0]?.replacedFact.factId).toBe("event-48");
      expect(parsed.modifications[0]?.assertedFact.factId).toBe(
        "user-fact:draw-7s",
      );
    }
  });

  it("keeps standalone hypotheses user-asserted and conceptual frames fact-free", () => {
    expect(AnalysisFrameSchema.parse({
      kind: "standalone_hypothesis",
      frameId: "frame:user:hand",
      scope: { kind: "flat_discard" },
      facts: [
        { factId: "user-fact:hand", provenance: "user_asserted" },
      ],
    }).kind).toBe("standalone_hypothesis");

    expect(AnalysisFrameSchema.parse({
      kind: "conceptual",
      frameId: "frame:concept:furiten",
      scope: { kind: "conceptual" },
      topic: "Why does temporary furiten end after the next draw?",
    }).kind).toBe("conceptual");
  });

  it("rejects cross-contaminated fact provenance", () => {
    expect(() => AnalysisFrameSchema.parse({
      kind: "current_scene",
      frameId: "frame:invalid-current",
      scope: { kind: "applied_decision" },
      sceneRef: "scene:e1:t6",
      facts: [
        { factId: "user-fact:hand", provenance: "user_asserted" },
      ],
    })).toThrow();

    expect(() => AnalysisFrameSchema.parse({
      kind: "standalone_hypothesis",
      frameId: "frame:invalid-standalone",
      scope: { kind: "flat_discard" },
      facts: [
        { factId: "event-48", provenance: "raw_replay" },
      ],
    })).toThrow();

    expect(() => AnalysisFrameSchema.parse({
      kind: "modified_scene",
      frameId: "frame:invalid-modified",
      scope: { kind: "flat_discard" },
      baseSceneRef: "scene:e1:t6",
      baseFacts: [
        { factId: "event-48", provenance: "raw_replay" },
      ],
      modifications: [
        {
          modificationId: "mod:missing-base-fact",
          replacedFact: {
            factId: "event-not-in-base",
            provenance: "raw_replay",
          },
          assertedFact: {
            factId: "user-fact:replacement",
            provenance: "user_asserted",
          },
        },
      ],
    })).toThrow();
  });

  it("rejects duplicate facts through the exported current-scene schema", () => {
    expect(() => CurrentSceneFrameSchema.parse({
      kind: "current_scene",
      frameId: "frame:duplicate-current",
      scope: { kind: "applied_decision" },
      sceneRef: "scene:e1:t6",
      facts: [
        { factId: "event-48", provenance: "raw_replay" },
        { factId: "event-48", provenance: "raw_replay" },
      ],
    })).toThrow();
  });

  it("rejects missing base facts through the exported modified-scene schema", () => {
    expect(() => ModifiedSceneFrameSchema.parse({
      kind: "modified_scene",
      frameId: "frame:invalid-modified-leaf",
      scope: { kind: "flat_discard" },
      baseSceneRef: "scene:e1:t6",
      baseFacts: [
        { factId: "event-48", provenance: "raw_replay" },
      ],
      modifications: [
        {
          modificationId: "mod:missing-base-fact",
          replacedFact: {
            factId: "event-not-in-base",
            provenance: "raw_replay",
          },
          assertedFact: {
            factId: "user-fact:replacement",
            provenance: "user_asserted",
          },
        },
      ],
    })).toThrow();
  });
});
