import { describe, expect, it } from "vitest";
import type { CanonicalGameEvent } from "@riichi-coach/contracts";
import { validateCanonicalEventStream } from "../src/index.js";
import {
  canonicalSelfDrawDiscardEvents,
  canonicalSelfHand,
  canonicalStartEvents,
  canonicalStream,
  canonicalTile,
} from "./fixtures/canonical-stream.js";

function opponentAnkanEvents(): CanonicalGameEvent[] {
  return [
    ...canonicalSelfDrawDiscardEvents(),
    {
      type: "tile_drawn",
      eventId: "game:fixture/0/4/0",
      sourceRecordRef: "record:4",
      actor: 1,
      tile: { visibility: "hidden" },
      from: "live_wall",
    },
    {
      type: "ankan_declared",
      eventId: "game:fixture/0/5/0",
      sourceRecordRef: "record:5",
      actor: 1,
      tiles: [
        canonicalTile("9s"), canonicalTile("9s"),
        canonicalTile("9s"), canonicalTile("9s"),
      ],
    },
  ];
}

describe("canonical event semantic validator", () => {
  it("accepts a valid self draw and discard sequence", () => {
    expect(validateCanonicalEventStream(
      canonicalStream(canonicalSelfDrawDiscardEvents()),
    )).toEqual({ status: "valid" });
  });

  it("rejects a discard before the actor draws", () => {
    const events: CanonicalGameEvent[] = [
      ...canonicalStartEvents(),
      {
        type: "tile_discarded",
        eventId: "game:fixture/0/2/0",
        sourceRecordRef: "record:2",
        actor: 0,
        tile: canonicalTile("1m"),
        discardMode: "tedashi",
        riichiDeclarationEventRef: null,
      },
    ];
    expect(validateCanonicalEventStream(canonicalStream(events))).toEqual({
      status: "invalid",
      code: "unexpected_event_for_phase",
      eventRef: "game:fixture/0/2/0",
    });
  });

  it("rejects a call that consumes an already-called discard", () => {
    const events: CanonicalGameEvent[] = [
      ...canonicalSelfDrawDiscardEvents(),
      {
        type: "pon_called",
        eventId: "game:fixture/0/4/0",
        sourceRecordRef: "record:4",
        actor: 1,
        targetActor: 0,
        calledTile: canonicalTile("5p"),
        consumedTiles: [canonicalTile("5p"), canonicalTile("5p")],
        calledDiscardEventRef: "game:fixture/0/3/0",
      },
      {
        type: "tile_discarded",
        eventId: "game:fixture/0/5/0",
        sourceRecordRef: "record:5",
        actor: 1,
        tile: canonicalTile("1s"),
        discardMode: "tedashi",
        riichiDeclarationEventRef: null,
      },
      {
        type: "pon_called",
        eventId: "game:fixture/0/6/0",
        sourceRecordRef: "record:6",
        actor: 2,
        targetActor: 0,
        calledTile: canonicalTile("5p"),
        consumedTiles: [canonicalTile("5p"), canonicalTile("5p")],
        calledDiscardEventRef: "game:fixture/0/3/0",
      },
    ];
    expect(validateCanonicalEventStream(canonicalStream(events))).toMatchObject({
      status: "invalid",
      code: "called_discard_already_consumed",
      eventRef: "game:fixture/0/6/0",
    });
  });

  it("rejects an orphan kakan", () => {
    const events: CanonicalGameEvent[] = [
      ...canonicalStartEvents(),
      {
        type: "tile_drawn",
        eventId: "game:fixture/0/2/0",
        sourceRecordRef: "record:2",
        actor: 0,
        tile: { visibility: "visible", tile: canonicalTile("5p") },
        from: "live_wall",
      },
      {
        type: "kakan_declared",
        eventId: "game:fixture/0/3/0",
        sourceRecordRef: "record:3",
        actor: 0,
        addedTile: canonicalTile("5p"),
        upgradedPonEventRef: "event:missing-pon",
      },
    ];
    expect(validateCanonicalEventStream(canonicalStream(events))).toMatchObject({
      status: "invalid",
      code: "kakan_pon_not_found",
      eventRef: "game:fixture/0/3/0",
    });
  });

  it("rejects a self discard that is not owned", () => {
    const events = canonicalSelfDrawDiscardEvents();
    events[3] = {
      ...events[3] as Extract<CanonicalGameEvent, { type: "tile_discarded" }>,
      tile: canonicalTile("6p"),
      discardMode: "tedashi",
    };
    expect(validateCanonicalEventStream(canonicalStream(events))).toMatchObject({
      status: "invalid",
      code: "self_tile_not_owned",
    });
  });

  it("rejects chi from a player other than the discarder left", () => {
    const events: CanonicalGameEvent[] = [
      ...canonicalSelfDrawDiscardEvents(),
      {
        type: "chi_called",
        eventId: "game:fixture/0/4/0",
        sourceRecordRef: "record:4",
        actor: 2,
        targetActor: 0,
        calledTile: canonicalTile("5p"),
        consumedTiles: [canonicalTile("4p"), canonicalTile("6p")],
        calledDiscardEventRef: "game:fixture/0/3/0",
      },
    ];
    expect(validateCanonicalEventStream(canonicalStream(events))).toMatchObject({
      status: "invalid",
      code: "chi_target_not_left",
    });
  });

  it("rejects a call targeting the caller", () => {
    const events: CanonicalGameEvent[] = [
      ...canonicalSelfDrawDiscardEvents(),
      {
        type: "pon_called",
        eventId: "game:fixture/0/4/0",
        sourceRecordRef: "record:4",
        actor: 0,
        targetActor: 0,
        calledTile: canonicalTile("5p"),
        consumedTiles: [canonicalTile("5p"), canonicalTile("5p")],
        calledDiscardEventRef: "game:fixture/0/3/0",
      },
    ];
    expect(validateCanonicalEventStream(canonicalStream(events))).toMatchObject({
      status: "invalid",
      code: "call_target_invalid",
    });
  });

  it("rejects more than four known physical copies", () => {
    const impossibleHand = [
      canonicalTile("1m"), canonicalTile("1m"), canonicalTile("1m"),
      canonicalTile("1m"), ...canonicalSelfHand.slice(4),
    ];
    const events = canonicalStartEvents(impossibleHand, canonicalTile("1m"));
    expect(validateCanonicalEventStream(canonicalStream(events))).toMatchObject({
      status: "invalid",
      code: "physical_tile_overflow",
      eventRef: "game:fixture/0/1/0",
    });
  });

  it("enforces red-five conservation and declared red rules", () => {
    const twoRed = [
      canonicalTile("5m", true), canonicalTile("5m", true),
      ...canonicalSelfHand.filter((tile) => tile.id !== "5m").slice(0, 11),
    ];
    expect(validateCanonicalEventStream(canonicalStream(
      canonicalStartEvents(twoRed),
    ))).toMatchObject({ status: "invalid", code: "red_five_rule_mismatch" });

    const withRed = canonicalStream(canonicalStartEvents([
      canonicalTile("5m", true),
      ...canonicalSelfHand.filter((tile) => tile.id !== "5m"),
    ]));
    expect(validateCanonicalEventStream({
      ...withRed,
      ruleSet: {
        ...withRed.ruleSet,
        redFives: { ...withRed.ruleSet.redFives, man: 0 },
      },
    })).toMatchObject({ status: "invalid", code: "red_five_rule_mismatch" });
  });

  it("rejects tsumogiri immediately after a call", () => {
    const events: CanonicalGameEvent[] = [
      ...canonicalSelfDrawDiscardEvents(),
      {
        type: "pon_called",
        eventId: "game:fixture/0/4/0",
        sourceRecordRef: "record:4",
        actor: 1,
        targetActor: 0,
        calledTile: canonicalTile("5p"),
        consumedTiles: [canonicalTile("5p"), canonicalTile("5p")],
        calledDiscardEventRef: "game:fixture/0/3/0",
      },
      {
        type: "tile_discarded",
        eventId: "game:fixture/0/5/0",
        sourceRecordRef: "record:5",
        actor: 1,
        tile: canonicalTile("1s"),
        discardMode: "tsumogiri",
        riichiDeclarationEventRef: null,
      },
    ];
    expect(validateCanonicalEventStream(canonicalStream(events)))
      .toMatchObject({ status: "invalid", code: "post_call_tsumogiri_invalid" });
  });

  it("rejects riichi after opening the hand", () => {
    const events: CanonicalGameEvent[] = [
      ...canonicalSelfDrawDiscardEvents(),
      {
        type: "pon_called", eventId: "game:fixture/0/4/0", sourceRecordRef: "record:4",
        actor: 1, targetActor: 0, calledTile: canonicalTile("5p"),
        consumedTiles: [canonicalTile("5p"), canonicalTile("5p")],
        calledDiscardEventRef: "game:fixture/0/3/0",
      },
      { type: "tile_discarded", eventId: "game:fixture/0/5/0", sourceRecordRef: "record:5", actor: 1, tile: canonicalTile("1s"), discardMode: "tedashi", riichiDeclarationEventRef: null },
      { type: "tile_drawn", eventId: "game:fixture/0/6/0", sourceRecordRef: "record:6", actor: 2, tile: { visibility: "hidden" }, from: "live_wall" },
      { type: "tile_discarded", eventId: "game:fixture/0/7/0", sourceRecordRef: "record:7", actor: 2, tile: canonicalTile("2s"), discardMode: "tsumogiri", riichiDeclarationEventRef: null },
      { type: "tile_drawn", eventId: "game:fixture/0/8/0", sourceRecordRef: "record:8", actor: 3, tile: { visibility: "hidden" }, from: "live_wall" },
      { type: "tile_discarded", eventId: "game:fixture/0/9/0", sourceRecordRef: "record:9", actor: 3, tile: canonicalTile("3s"), discardMode: "tsumogiri", riichiDeclarationEventRef: null },
      { type: "tile_drawn", eventId: "game:fixture/0/10/0", sourceRecordRef: "record:10", actor: 0, tile: { visibility: "visible", tile: canonicalTile("6p") }, from: "live_wall" },
      { type: "tile_discarded", eventId: "game:fixture/0/11/0", sourceRecordRef: "record:11", actor: 0, tile: canonicalTile("6p"), discardMode: "tsumogiri", riichiDeclarationEventRef: null },
      { type: "tile_drawn", eventId: "game:fixture/0/12/0", sourceRecordRef: "record:12", actor: 1, tile: { visibility: "hidden" }, from: "live_wall" },
      { type: "riichi_declared", eventId: "game:fixture/0/13/0", sourceRecordRef: "record:13", actor: 1 },
    ];
    expect(validateCanonicalEventStream(canonicalStream(events)))
      .toMatchObject({ status: "invalid", code: "riichi_state_invalid" });
  });

  it("accepts multiple ron winners bound to the same discard", () => {
    const events: CanonicalGameEvent[] = [
      ...canonicalSelfDrawDiscardEvents(),
      {
        type: "win_declared",
        eventId: "game:fixture/0/4/0",
        sourceRecordRef: "record:4",
        winnerActor: 1,
        targetActor: 0,
        method: "ron",
        winningTile: canonicalTile("5p"),
        winSourceEventRef: "game:fixture/0/3/0",
        scoreDeltas: null,
      },
      {
        type: "win_declared",
        eventId: "game:fixture/0/4/1",
        sourceRecordRef: "record:4",
        winnerActor: 2,
        targetActor: 0,
        method: "ron",
        winningTile: canonicalTile("5p"),
        winSourceEventRef: "game:fixture/0/3/0",
        scoreDeltas: null,
      },
    ];
    expect(validateCanonicalEventStream(canonicalStream(events)))
      .toEqual({ status: "valid" });
  });

  it("binds kan dora and rinshan draws to the pending kan", () => {
    const wrongDora: CanonicalGameEvent[] = [
      ...opponentAnkanEvents(),
      {
        type: "dora_revealed",
        eventId: "game:fixture/0/6/0",
        sourceRecordRef: "record:6",
        indicator: canonicalTile("2s"),
        kanEventRef: "event:wrong-kan",
      },
    ];
    expect(validateCanonicalEventStream(canonicalStream(wrongDora)))
      .toMatchObject({ status: "invalid", code: "dora_kan_mismatch" });

    const wrongDraw: CanonicalGameEvent[] = [
      ...opponentAnkanEvents(),
      {
        type: "tile_drawn",
        eventId: "game:fixture/0/6/0",
        sourceRecordRef: "record:6",
        actor: 1,
        tile: { visibility: "hidden" },
        from: "live_wall",
      },
    ];
    expect(validateCanonicalEventStream(canonicalStream(wrongDraw)))
      .toMatchObject({ status: "invalid", code: "draw_source_mismatch" });

    const missingDora: CanonicalGameEvent[] = [
      ...opponentAnkanEvents(),
      {
        type: "tile_drawn",
        eventId: "game:fixture/0/6/0",
        sourceRecordRef: "record:6",
        actor: 1,
        tile: { visibility: "hidden" },
        from: "rinshan",
      },
    ];
    expect(validateCanonicalEventStream(canonicalStream(missingDora)))
      .toMatchObject({ status: "invalid", code: "dora_kan_mismatch" });

    const daiminkanMissingDora: CanonicalGameEvent[] = [
      ...canonicalSelfDrawDiscardEvents(),
      {
        type: "daiminkan_called", eventId: "game:fixture/0/4/0", sourceRecordRef: "record:4",
        actor: 1, targetActor: 0, calledTile: canonicalTile("5p"),
        consumedTiles: [canonicalTile("5p"), canonicalTile("5p"), canonicalTile("5p")],
        calledDiscardEventRef: "game:fixture/0/3/0",
      },
      { type: "tile_drawn", eventId: "game:fixture/0/5/0", sourceRecordRef: "record:5", actor: 1, tile: { visibility: "hidden" }, from: "rinshan" },
    ];
    expect(validateCanonicalEventStream(canonicalStream(daiminkanMissingDora)))
      .toMatchObject({ status: "invalid", code: "dora_kan_mismatch" });
  });

  it("binds tsumo to the current actor, draw event, and visible tile", () => {
    const drawEvents = canonicalSelfDrawDiscardEvents().slice(0, 3);
    const invalidWins: CanonicalGameEvent[] = [
      {
        type: "win_declared",
        eventId: "game:fixture/0/3/0",
        sourceRecordRef: "record:3",
        winnerActor: 1,
        targetActor: null,
        method: "tsumo",
        winningTile: canonicalTile("5p"),
        winSourceEventRef: "game:fixture/0/2/0",
        scoreDeltas: null,
      },
      {
        type: "win_declared",
        eventId: "game:fixture/0/3/0",
        sourceRecordRef: "record:3",
        winnerActor: 0,
        targetActor: null,
        method: "tsumo",
        winningTile: canonicalTile("6p"),
        winSourceEventRef: "game:fixture/0/2/0",
        scoreDeltas: null,
      },
      {
        type: "win_declared",
        eventId: "game:fixture/0/3/0",
        sourceRecordRef: "record:3",
        winnerActor: 0,
        targetActor: null,
        method: "tsumo",
        winningTile: canonicalTile("5p"),
        winSourceEventRef: "event:wrong-draw",
        scoreDeltas: null,
      },
    ];
    for (const win of invalidWins) {
      expect(validateCanonicalEventStream(canonicalStream([...drawEvents, win])))
        .toMatchObject({ status: "invalid", code: "win_source_mismatch" });
    }
  });

  it("binds ron to the exact discard or robbable kan tile", () => {
    const wrongDiscardTile: CanonicalGameEvent[] = [
      ...canonicalSelfDrawDiscardEvents(),
      {
        type: "win_declared",
        eventId: "game:fixture/0/4/0",
        sourceRecordRef: "record:4",
        winnerActor: 1,
        targetActor: 0,
        method: "ron",
        winningTile: canonicalTile("6p"),
        winSourceEventRef: "game:fixture/0/3/0",
        scoreDeltas: null,
      },
    ];
    expect(validateCanonicalEventStream(canonicalStream(wrongDiscardTile)))
      .toMatchObject({ status: "invalid", code: "win_source_mismatch" });

    const wrongKanSource: CanonicalGameEvent[] = [
      ...opponentAnkanEvents(),
      {
        type: "win_declared",
        eventId: "game:fixture/0/6/0",
        sourceRecordRef: "record:6",
        winnerActor: 0,
        targetActor: 1,
        method: "ron",
        winningTile: canonicalTile("9s"),
        winSourceEventRef: "event:wrong-kan",
        scoreDeltas: null,
      },
    ];
    expect(validateCanonicalEventStream(canonicalStream(wrongKanSource)))
      .toMatchObject({ status: "invalid", code: "win_source_mismatch" });
  });

  it("binds score settlement once to the terminal event and checks explicit deltas", () => {
    const terminal: CanonicalGameEvent[] = [
      ...canonicalStartEvents(),
      { type: "round_drawn", eventId: "game:fixture/0/2/0", sourceRecordRef: "record:2", reason: "exhaustive", tenpaiActors: [] },
    ];
    const wrongRef: CanonicalGameEvent[] = [...terminal, {
      type: "scores_updated", eventId: "game:fixture/0/3/0", sourceRecordRef: "record:3",
      scores: [25000, 25000, 25000, 25000], settlementEventRef: "event:wrong",
    }];
    expect(validateCanonicalEventStream(canonicalStream(wrongRef)))
      .toMatchObject({ status: "invalid", code: "settlement_binding_invalid" });

    const once: CanonicalGameEvent = {
      type: "scores_updated", eventId: "game:fixture/0/3/0", sourceRecordRef: "record:3",
      scores: [25000, 25000, 25000, 25000], settlementEventRef: "game:fixture/0/2/0",
    };
    expect(validateCanonicalEventStream(canonicalStream([
      ...terminal, once, {
        ...once,
        eventId: "game:fixture/0/4/0",
        sourceRecordRef: "record:4",
      },
    ]))).toMatchObject({ status: "invalid", code: "settlement_binding_invalid" });

    const win: CanonicalGameEvent[] = [
      ...canonicalStartEvents(),
      { type: "tile_drawn", eventId: "game:fixture/0/2/0", sourceRecordRef: "record:2", actor: 0, tile: { visibility: "visible", tile: canonicalTile("5p") }, from: "live_wall" },
      { type: "win_declared", eventId: "game:fixture/0/3/0", sourceRecordRef: "record:3", winnerActor: 0, targetActor: null, method: "tsumo", winningTile: canonicalTile("5p"), winSourceEventRef: "game:fixture/0/2/0", scoreDeltas: [3000, -1000, -1000, -1000] },
      { type: "scores_updated", eventId: "game:fixture/0/4/0", sourceRecordRef: "record:4", scores: [27000, 24000, 24000, 24000], settlementEventRef: "game:fixture/0/3/0" },
    ];
    expect(validateCanonicalEventStream(canonicalStream(win)))
      .toMatchObject({ status: "invalid", code: "settlement_score_mismatch" });

    expect(validateCanonicalEventStream(canonicalStream([
      ...terminal,
      { type: "round_ended", eventId: "game:fixture/0/3/0", sourceRecordRef: "record:3", terminalEventRef: "event:wrong" },
    ]))).toMatchObject({ status: "invalid", code: "settlement_binding_invalid" });

    expect(validateCanonicalEventStream(canonicalStream([
      ...terminal,
      { type: "scores_updated", eventId: "game:fixture/0/3/0", sourceRecordRef: "record:3", scores: [25000, 25000, 25000, 25000], settlementEventRef: "game:fixture/0/2/0" },
      { type: "round_ended", eventId: "game:fixture/0/4/0", sourceRecordRef: "record:4", terminalEventRef: "game:fixture/0/2/0" },
    ]))).toEqual({ status: "valid" });

    const ronBase: CanonicalGameEvent[] = [
      ...canonicalSelfDrawDiscardEvents(),
      { type: "win_declared", eventId: "game:fixture/0/4/0", sourceRecordRef: "record:4", winnerActor: 1, targetActor: 0, method: "ron", winningTile: canonicalTile("5p"), winSourceEventRef: "game:fixture/0/3/0", scoreDeltas: null },
      { type: "scores_updated", eventId: "game:fixture/0/5/0", sourceRecordRef: "record:5", scores: [23000, 27000, 25000, 25000], settlementEventRef: "game:fixture/0/4/0" },
      { type: "win_declared", eventId: "game:fixture/0/6/0", sourceRecordRef: "record:6", winnerActor: 2, targetActor: 0, method: "ron", winningTile: canonicalTile("5p"), winSourceEventRef: "game:fixture/0/3/0", scoreDeltas: null },
    ];
    expect(validateCanonicalEventStream(canonicalStream(ronBase)))
      .toMatchObject({ status: "invalid", code: "settlement_binding_invalid" });
  });
});
