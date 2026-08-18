import { describe, expect, it } from "vitest";
import {
  adaptMjaiActionSequence,
} from "../src/import/mjai-action.js";

const selfTurn = {
  decisionWindow: {
    kind: "self_turn" as const,
    actor: 3,
    triggerEventRef: "event:draw",
  },
};
const discardResponse = {
  decisionWindow: {
    kind: "discard_response" as const,
    actor: 3,
    triggerEventRef: "event:discard",
    sourceActor: 1,
    offeredTile: { id: "5p" as const, red: true },
  },
};

describe("MJAI action adapter", () => {
  it("adapts ordinary dahai and atomically pairs reach plus dahai", () => {
    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:dahai",
        action: {
          type: "dahai",
          actor: 3,
          pai: "6s",
          tsumogiri: true,
        },
      },
    ], selfTurn)).toMatchObject({
      status: "ready",
      draft: {
        kind: "discard",
        tile: { id: "6s", red: false },
        discardMode: "tsumogiri",
      },
      factRefs: ["event:dahai"],
    });

    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:reach",
        action: { type: "reach", actor: 3 },
      },
      {
        eventRef: "event:riichi-dahai",
        action: {
          type: "dahai",
          actor: 3,
          pai: "5pr",
          tsumogiri: false,
        },
      },
    ], selfTurn)).toMatchObject({
      status: "ready",
      draft: {
        kind: "riichi_discard",
        tile: { id: "5p", red: true },
        discardMode: "tedashi",
      },
      factRefs: ["event:reach", "event:riichi-dahai"],
    });
  });

  it("keeps missing fields as import diagnostics", () => {
    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:incomplete-dahai",
        action: {
          type: "dahai",
          actor: 3,
          tsumogiri: true,
        },
      },
    ], selfTurn)).toEqual({
      status: "incomplete",
      sourceType: "mjai",
      diagnosticCode: "missing_action_fields",
      missingFields: ["pai"],
      factRefs: ["event:incomplete-dahai"],
    });
    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:reach",
        action: { type: "reach", actor: 3 },
      },
      {
        eventRef: "event:incomplete-riichi-dahai",
        action: {
          type: "dahai",
          pai: "6s",
          tsumogiri: true,
        },
      },
    ], selfTurn)).toEqual({
      status: "incomplete",
      sourceType: "mjai",
      diagnosticCode: "missing_action_fields",
      missingFields: ["actor"],
      factRefs: ["event:reach", "event:incomplete-riichi-dahai"],
    });
  });

  it("adapts an isolated reach as the tile-less declare_riichi candidate", () => {
    // M6-A3 (ADR-0001): Mortal's reach detail carries no tile — the model-side
    // riichi alternative is tile-less wherever the player may still declare.
    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:reach",
        action: { type: "reach", actor: 3 },
      },
    ], selfTurn)).toEqual({
      status: "ready",
      sourceType: "mjai",
      draft: { kind: "declare_riichi" },
      factRefs: ["event:reach"],
    });
    // Riichi requires a concealed hand: a chi/pon call opens it, so a
    // post-call window rejects the reach alternative outright.
    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:post-call-reach",
        action: { type: "reach", actor: 3 },
      },
    ], {
      decisionWindow: {
        kind: "post_call_discard" as const,
        actor: 3,
        triggerEventRef: "event:chi",
      },
    })).toEqual({
      status: "unsupported",
      sourceType: "mjai_reach_window_mismatch",
    });
    // Riichi cannot be declared in a response window or after acceptance.
    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:response-reach",
        action: { type: "reach", actor: 3 },
      },
    ], discardResponse)).toEqual({
      status: "unsupported",
      sourceType: "mjai_reach_window_mismatch",
    });
    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:post-riichi-reach",
        action: { type: "reach", actor: 3 },
      },
    ], {
      decisionWindow: {
        kind: "post_riichi_discard" as const,
        actor: 3,
        triggerEventRef: "event:riichi_accepted",
      },
    })).toEqual({
      status: "unsupported",
      sourceType: "mjai_reach_window_mismatch",
    });
  });

  it("rejects MJAI actions owned by a different window actor", () => {
    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:other-player-dahai",
        action: {
          type: "dahai",
          actor: 2,
          pai: "6s",
          tsumogiri: true,
        },
      },
    ], selfTurn)).toEqual({
      status: "unsupported",
      sourceType: "mjai_actor_mismatch",
    });
    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:other-player-none",
        action: { type: "none", actor: 2 },
      },
    ], discardResponse)).toEqual({
      status: "unsupported",
      sourceType: "mjai_actor_mismatch",
    });
    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:other-player-reach",
        action: { type: "reach", actor: 2 },
      },
      {
        eventRef: "event:other-player-riichi-dahai",
        action: {
          type: "dahai",
          actor: 2,
          pai: "6s",
          tsumogiri: true,
        },
      },
    ], selfTurn)).toEqual({
      status: "unsupported",
      sourceType: "mjai_actor_mismatch",
    });
    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:reach",
        action: { type: "reach", actor: 3 },
      },
      {
        eventRef: "event:other-player-riichi-dahai",
        action: {
          type: "dahai",
          actor: 2,
          pai: "6s",
          tsumogiri: true,
        },
      },
    ], selfTurn)).toEqual({
      status: "unsupported",
      sourceType: "mjai_actor_mismatch",
    });
    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:other-player-chi",
        action: {
          type: "chi",
          actor: 2,
          target: 1,
          pai: "3m",
          consumed: ["1m", "2m"],
        },
      },
    ], discardResponse)).toEqual({
      status: "unsupported",
      sourceType: "mjai_actor_mismatch",
    });
  });

  it("rejects self-turn hora whose target is not the winner", () => {
    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:invalid-tsumo",
        action: { type: "hora", actor: 3, target: 1, pai: "6s" },
      },
    ], selfTurn)).toEqual({
      status: "unsupported",
      sourceType: "hora_context_mismatch",
    });
  });

  it("rejects response calls targeting the calling actor", () => {
    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:self-pon",
        action: {
          type: "pon",
          actor: 3,
          target: 3,
          pai: "5pr",
          consumed: ["5p", "5p"],
        },
      },
    ], discardResponse)).toEqual({
      status: "unsupported",
      sourceType: "mjai_target_mismatch",
    });
  });

  it("rejects response hora targeting the winning actor", () => {
    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:self-ron",
        action: { type: "hora", actor: 3, target: 3, pai: "5pr" },
      },
    ], discardResponse)).toEqual({
      status: "unsupported",
      sourceType: "hora_context_mismatch",
    });
  });

  it("rejects trailing events after an atomic reach plus dahai pair", () => {
    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:reach",
        action: { type: "reach", actor: 3 },
      },
      {
        eventRef: "event:riichi-dahai",
        action: {
          type: "dahai",
          actor: 3,
          pai: "6s",
          tsumogiri: true,
        },
      },
      {
        eventRef: "event:trailing-extension",
        action: { type: "future_engine_extension" },
      },
    ], selfTurn)).toEqual({
      status: "unsupported",
      sourceType: "mjai_sequence",
    });
  });

  it.each([
    [
      "chi",
      {
        type: "chi",
        actor: 3,
        target: 1,
        pai: "3m",
        consumed: ["1m", "2m"],
      },
    ],
    [
      "pon",
      {
        type: "pon",
        actor: 3,
        target: 1,
        pai: "5pr",
        consumed: ["5p", "5p"],
      },
    ],
    [
      "daiminkan",
      {
        type: "daiminkan",
        actor: 3,
        target: 1,
        pai: "5pr",
        consumed: ["5p", "5p", "5p"],
      },
    ],
    [
      "ankan",
      {
        type: "ankan",
        actor: 3,
        consumed: ["5p", "5p", "5p", "5pr"],
      },
    ],
    [
      "kakan",
      {
        type: "kakan",
        actor: 3,
        pai: "5pr",
        existingMeldRef: "meld:pon:5p",
      },
    ],
  ] as const)("adapts the %s call form", (kind, action) => {
    const context = kind === "chi" || kind === "pon" || kind === "daiminkan"
      ? discardResponse
      : selfTurn;
    const result = adaptMjaiActionSequence([
      { eventRef: `event:${kind}`, action },
    ], context);

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.draft.kind).toBe(kind);
    }
  });

  it("maps hora to tsumo or ron from the decision window", () => {
    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:hora",
        action: { type: "hora", actor: 3, target: 3, pai: "6s" },
      },
    ], selfTurn)).toMatchObject({
      status: "ready",
      draft: {
        kind: "tsumo",
        winningTile: { id: "6s", red: false },
        drawEventRef: "event:draw",
      },
    });
    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:hora",
        action: { type: "hora", actor: 3, target: 1, pai: "5pr" },
      },
    ], discardResponse)).toMatchObject({
      status: "ready",
      draft: {
        kind: "ron",
        winningTile: { id: "5p", red: true },
        targetActor: 1,
        responseEventRef: "event:discard",
        winContext: "discard",
      },
    });
  });

  it("maps agari identically to hora (ACTION_SPACE win vocabulary alias)", () => {
    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:agari",
        action: { type: "agari", actor: 3, target: 3, pai: "6s" },
      },
    ], selfTurn)).toMatchObject({
      status: "ready",
      draft: {
        kind: "tsumo",
        winningTile: { id: "6s", red: false },
        drawEventRef: "event:draw",
      },
    });
    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:agari",
        action: { type: "agari", actor: 3, target: 1, pai: "5pr" },
      },
    ], discardResponse)).toMatchObject({
      status: "ready",
      draft: {
        kind: "ron",
        winningTile: { id: "5p", red: true },
        targetActor: 1,
      },
    });
  });

  it("maps nine-terminals abort and none/pass, then rejects extensions", () => {
    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:ryukyoku",
        action: {
          type: "ryukyoku",
          actor: 3,
          reason: "kyuushu_kyuuhai",
        },
      },
    ], selfTurn)).toMatchObject({
      status: "ready",
      draft: {
        kind: "kyuushu_kyuuhai",
        drawEventRef: "event:draw",
      },
    });
    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:none",
        action: { type: "none", actor: 3 },
      },
    ], discardResponse)).toMatchObject({
      status: "ready",
      draft: {
        kind: "pass",
        responseEventRef: "event:discard",
        responseKind: "discard",
      },
    });
    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:extension",
        action: { type: "future_engine_extension" },
      },
    ], selfTurn)).toEqual({
      status: "unsupported",
      sourceType: "future_engine_extension",
    });
  });

  // M6-A4.2 real-data pins (H2 response report): the response pass serializes
  // as `none` WITHOUT an actor, a response daiminkan candidate serializes as an
  // `ankan` of four copies of the offered tile, and a response win alternative
  // omits `pai` (the winning tile is the offered discard, local-authoritative).

  it("accepts an actor-less response pass (`none` without actor)", () => {
    expect(adaptMjaiActionSequence([
      { eventRef: "event:none", action: { type: "none" } },
    ], discardResponse)).toMatchObject({
      status: "ready",
      draft: {
        kind: "pass",
        responseEventRef: "event:discard",
        responseKind: "discard",
      },
    });
  });

  it("bridges a response-window ankan-of-the-offered-tile to a daiminkan draft", () => {
    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:ankan",
        action: { type: "ankan", actor: 3, consumed: ["5p", "5p", "5p", "5pr"] },
      },
    ], discardResponse)).toMatchObject({
      status: "ready",
      draft: {
        kind: "daiminkan",
        calledTile: { id: "5p", red: true },
        targetActor: 1,
        responseEventRef: "event:discard",
      },
    });
  });

  it("falls back to the offered tile for a response ron whose hora omits pai", () => {
    expect(adaptMjaiActionSequence([
      { eventRef: "event:hora", action: { type: "hora", actor: 3, target: 1 } },
    ], discardResponse)).toMatchObject({
      status: "ready",
      draft: {
        kind: "ron",
        winningTile: { id: "5p", red: true },
        targetActor: 1,
        winContext: "discard",
      },
    });
  });

  it("maps the bare scored ryukyoku alternative on the self turn only", () => {
    // Real-evidence pin (ekyu report, 2026-08-17): the scored kyuushu
    // alternative carries neither actor nor reason — the abort is a player
    // choice only on the self turn, so the bare shape is admissible exactly
    // there. An attributed shape without a reason and any off-turn round
    // abort stay unsupported, as does a non-kyuushu reason.
    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:ryukyoku",
        action: { type: "ryukyoku", deltas: [0, 0, 0, 0] },
      },
    ], selfTurn)).toMatchObject({
      status: "ready",
      draft: {
        kind: "kyuushu_kyuuhai",
        drawEventRef: "event:draw",
      },
    });
    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:ryukyoku",
        action: { type: "ryukyoku", actor: 3 },
      },
    ], selfTurn)).toEqual({
      status: "unsupported",
      sourceType: "ryukyoku:unattributed",
    });
    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:ryukyoku",
        action: { type: "ryukyoku" },
      },
    ], discardResponse)).toEqual({
      status: "unsupported",
      sourceType: "ryukyoku:unattributed",
    });
    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:ryukyoku",
        action: { type: "ryukyoku", actor: 3, reason: "suufonrenda" },
      },
    ], selfTurn)).toEqual({
      status: "unsupported",
      sourceType: "ryukyoku:suufonrenda",
    });
  });
});
