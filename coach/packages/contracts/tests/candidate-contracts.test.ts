import { describe, expect, it } from "vitest";
import {
  ActionDraftSchema,
  CandidateNormalizationResultSchema,
  KnownActionFactsSchema,
  SourceActionAdaptationResultSchema,
  StructuredComparisonBuildResultSchema,
  UserActionDraftSchema,
  canonicalActionRef,
} from "../src/index.js";

describe("candidate boundary contracts", () => {
  it("accepts an intentionally incomplete typed draft without trusting it", () => {
    expect(ActionDraftSchema.parse({
      kind: "riichi_discard",
    })).toEqual({ kind: "riichi_discard" });
    expect(ActionDraftSchema.parse({
      kind: "discard",
      tile: { id: "5p" },
    })).toEqual({
      kind: "discard",
      tile: { id: "5p" },
    });
  });

  it("rejects an explicitly impossible red identity in a typed draft", () => {
    expect(() => ActionDraftSchema.parse({
      kind: "discard",
      tile: { id: "1m", red: true },
    })).toThrow(/Only suited fives may be red/);
  });

  it("accepts Chinese action names and compact m/p/s/z notation", () => {
    expect(UserActionDraftSchema.parse({
      actionName: "吃",
      calledTile: "3m",
      consumedTiles: ["1m", "2m"],
      targetActor: 1,
    })).toEqual({
      actionName: "吃",
      calledTile: "3m",
      consumedTiles: ["1m", "2m"],
      targetActor: 1,
    });
    expect(UserActionDraftSchema.parse({
      actionName: "切牌",
      tile: "5pr",
      discardMode: "tedashi",
    })).toMatchObject({ tile: "5pr" });
    expect(() => UserActionDraftSchema.parse({
      actionName: "切牌",
      tile: "0p",
    })).toThrow();
  });

  it("distinguishes missing facts from known-empty facts", () => {
    const missing = KnownActionFactsSchema.parse({
      decisionWindow: {
        kind: "self_turn",
        actor: null,
        triggerEventRef: "user_asserted:draw",
      },
    });
    const knownEmpty = KnownActionFactsSchema.parse({
      decisionWindow: {
        kind: "self_turn",
        actor: null,
        triggerEventRef: "user_asserted:draw",
      },
      concealedTiles: [],
      currentDraw: null,
      melds: [],
    });

    expect("concealedTiles" in missing).toBe(false);
    expect(knownEmpty).toMatchObject({
      concealedTiles: [],
      currentDraw: null,
      melds: [],
    });
    expect(Object.is(KnownActionFactsSchema.parse(knownEmpty), knownEmpty))
      .toBe(false);
  });

  it("parses every single-candidate result state", () => {
    expect(CandidateNormalizationResultSchema.parse({
      status: "needs_clarification",
      ambiguousFields: ["tile.red"],
    }).status).toBe("needs_clarification");
    expect(CandidateNormalizationResultSchema.parse({
      status: "inconsistent_with_known_facts",
      conflictCodes: ["tsumogiri_draw_mismatch"],
      evidenceRefs: ["event:draw"],
    }).status).toBe("inconsistent_with_known_facts");
    expect(CandidateNormalizationResultSchema.parse({
      status: "unsupported_source_action",
      sourceType: "mystery_extension",
    }).status).toBe("unsupported_source_action");
  });

  it("binds missing-fact consistency to a non-empty unique check list", () => {
    const action = {
      kind: "discard",
      tile: { id: "2p", red: false },
      discardMode: "tedashi",
    } as const;
    const candidate = {
      actionRef: canonicalActionRef(action),
      action,
      origins: ["model"] as const,
    };

    expect(CandidateNormalizationResultSchema.parse({
      status: "ready",
      candidate,
      consistency: "consistent",
      skippedChecks: [],
    }).status).toBe("ready");
    expect(CandidateNormalizationResultSchema.parse({
      status: "ready",
      candidate,
      consistency: "unknown_due_to_missing_facts",
      skippedChecks: ["concealed_tiles"],
    }).status).toBe("ready");
    expect(() => CandidateNormalizationResultSchema.parse({
      status: "ready",
      candidate,
      consistency: "consistent",
      skippedChecks: ["concealed_tiles"],
    })).toThrow(/Consistent normalization cannot skip checks/);
    expect(() => CandidateNormalizationResultSchema.parse({
      status: "ready",
      candidate,
      consistency: "unknown_due_to_missing_facts",
      skippedChecks: [],
    })).toThrow(/Missing-fact normalization must name skipped checks/);
    expect(() => CandidateNormalizationResultSchema.parse({
      status: "ready",
      candidate,
      consistency: "unknown_due_to_missing_facts",
      skippedChecks: ["concealed_tiles", "concealed_tiles"],
    })).toThrow(/Skipped checks must be unique/);
  });

  it("keeps source-import and set-build diagnostics explicit", () => {
    expect(SourceActionAdaptationResultSchema.parse({
      status: "incomplete",
      sourceType: "mjai:reach",
      diagnosticCode: "reach_without_dahai",
      missingFields: ["tile", "discardMode"],
      factRefs: ["event:reach"],
    })).toMatchObject({ diagnosticCode: "reach_without_dahai" });
    expect(StructuredComparisonBuildResultSchema.parse({
      status: "not_comparable",
      code: "cross_decision_window",
      actionRefs: [],
      windowKinds: ["discard_response", "post_call_discard"],
    }).status).toBe("not_comparable");
  });

  it("rejects undeclared fields on drafts and known facts", () => {
    expect(() => ActionDraftSchema.parse({
      kind: "pass",
      responseEventRef: "event:discard",
      modelReason: "defense",
    })).toThrow();
    expect(() => KnownActionFactsSchema.parse({
      decisionWindow: {
        kind: "self_turn",
        actor: 0,
        triggerEventRef: "event:draw",
      },
      opponentHands: [[]],
    })).toThrow();
    expect(() => KnownActionFactsSchema.parse({
      decisionWindow: {
        kind: "self_turn",
        actor: 0,
        triggerEventRef: "event:draw",
      },
      melds: [{
        meldRef: "meld:forged-pon",
        kind: "pon",
        tiles: [
          { id: "5p", red: false },
          { id: "5p", red: true },
          { id: "7z", red: false },
        ],
      }],
    })).toThrow(/Known pon tiles/);
  });

  it("rejects duplicate known meld references", () => {
    expect(() => KnownActionFactsSchema.parse({
      decisionWindow: {
        kind: "self_turn",
        actor: 0,
        triggerEventRef: "event:draw",
      },
      melds: [{
        meldRef: "meld:1",
        kind: "pon",
        tiles: [
          { id: "5p", red: false },
          { id: "5p", red: false },
          { id: "5p", red: true },
        ],
      }, {
        meldRef: "meld:1",
        kind: "chi",
        tiles: [
          { id: "1s", red: false },
          { id: "2s", red: false },
          { id: "3s", red: false },
        ],
      }],
    })).toThrow(/Known meld references must be unique/);
  });
});
