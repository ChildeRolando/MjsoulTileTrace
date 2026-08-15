import { describe, expect, it } from "vitest";
import { replayCanonicalStream } from "../src/replay/stream-replayer.js";
import {
  canonicalSelfDrawDiscardEvents,
  canonicalSelfHand,
  canonicalStartEvents,
  canonicalStream,
  canonicalTile,
} from "./fixtures/canonical-stream.js";

describe("canonical stream replayer", () => {
  it("freezes a self-turn decision for every visible self draw", () => {
    const stream = canonicalStream(canonicalSelfDrawDiscardEvents());
    const decisions = replayCanonicalStream(stream);

    expect(decisions).toHaveLength(1);
    const decision = decisions[0]!;
    expect(decision.decisionEventRef).toBe("game:fixture/0/2/0");
    expect(decision.snapshot.selfActor).toBe(0);
    expect(decision.facts.factSetId).toBeTruthy();
    expect(decision.facts.currentDraw?.tile.id).toBe("5p");
    expect(decision.facts.concealedTiles).toHaveLength(13);
    expect(decision.actualDiscard).toMatchObject({
      type: "tile_discarded",
      actor: 0,
      tile: { id: "5p", red: false },
      discardMode: "tsumogiri",
    });
  });

  it("skips non-self draws and hidden draws", () => {
    const stream = canonicalStream([
      ...canonicalStartEvents(),
      // a non-self draw (opponent)
      {
        type: "tile_drawn",
        eventId: "game:fixture/0/2/0",
        sourceRecordRef: "record:2",
        actor: 1,
        tile: { visibility: "hidden" },
        from: "live_wall",
      },
      {
        type: "tile_discarded",
        eventId: "game:fixture/0/3/0",
        sourceRecordRef: "record:3",
        actor: 1,
        tile: { id: "5p", red: false },
        discardMode: "tsumogiri",
        riichiDeclarationEventRef: null,
      },
    ]);
    const decisions = replayCanonicalStream(stream);
    expect(decisions).toHaveLength(0);
  });

  it("binds each self draw to its own immediate discard across turns", () => {
    const stream = canonicalStream([
      ...canonicalStartEvents(),
      // self turn 1: tedashi discard of a hand tile.
      {
        type: "tile_drawn",
        eventId: "game:fixture/0/2/0",
        sourceRecordRef: "record:2",
        actor: 0,
        tile: { visibility: "visible", tile: canonicalTile("5p") },
        from: "live_wall",
      },
      {
        type: "tile_discarded",
        eventId: "game:fixture/0/3/0",
        sourceRecordRef: "record:3",
        actor: 0,
        tile: canonicalTile("9m"),
        discardMode: "tedashi",
        riichiDeclarationEventRef: null,
      },
      // opponents cycle the turn back to self.
      {
        type: "tile_drawn",
        eventId: "game:fixture/0/4/0",
        sourceRecordRef: "record:4",
        actor: 1,
        tile: { visibility: "hidden" },
        from: "live_wall",
      },
      {
        type: "tile_discarded",
        eventId: "game:fixture/0/5/0",
        sourceRecordRef: "record:5",
        actor: 1,
        tile: canonicalTile("1z"),
        discardMode: "tedashi",
        riichiDeclarationEventRef: null,
      },
      {
        type: "tile_drawn",
        eventId: "game:fixture/0/6/0",
        sourceRecordRef: "record:6",
        actor: 2,
        tile: { visibility: "hidden" },
        from: "live_wall",
      },
      {
        type: "tile_discarded",
        eventId: "game:fixture/0/7/0",
        sourceRecordRef: "record:7",
        actor: 2,
        tile: canonicalTile("2z"),
        discardMode: "tedashi",
        riichiDeclarationEventRef: null,
      },
      {
        type: "tile_drawn",
        eventId: "game:fixture/0/8/0",
        sourceRecordRef: "record:8",
        actor: 3,
        tile: { visibility: "hidden" },
        from: "live_wall",
      },
      {
        type: "tile_discarded",
        eventId: "game:fixture/0/9/0",
        sourceRecordRef: "record:9",
        actor: 3,
        tile: canonicalTile("3z"),
        discardMode: "tedashi",
        riichiDeclarationEventRef: null,
      },
      // self turn 2: tsumogiri discard of the freshly drawn tile.
      {
        type: "tile_drawn",
        eventId: "game:fixture/0/10/0",
        sourceRecordRef: "record:10",
        actor: 0,
        tile: { visibility: "visible", tile: canonicalTile("6p") },
        from: "live_wall",
      },
      {
        type: "tile_discarded",
        eventId: "game:fixture/0/11/0",
        sourceRecordRef: "record:11",
        actor: 0,
        tile: canonicalTile("6p"),
        discardMode: "tsumogiri",
        riichiDeclarationEventRef: null,
      },
    ]);
    const decisions = replayCanonicalStream(stream);
    expect(decisions).toHaveLength(2);
    expect(decisions[0]!.actualDiscard).toMatchObject({
      type: "tile_discarded",
      tile: { id: "9m" },
      discardMode: "tedashi",
    });
    expect(decisions[1]!.actualDiscard).toMatchObject({
      type: "tile_discarded",
      tile: { id: "6p" },
      discardMode: "tsumogiri",
    });
  });

  it("returns null for a tsumo-ending draw and does not leak the next round's discard", () => {
    const stream = canonicalStream([
      {
        type: "game_started",
        eventId: "game:fixture/0/0/0",
        sourceRecordRef: "record:0",
      },
      {
        type: "round_started",
        eventId: "game:fixture/0/1/0",
        sourceRecordRef: "record:1",
        roundOrdinal: 0,
        roundWind: "E",
        hand: 1,
        honba: 0,
        riichiSticks: 0,
        dealer: 0,
        scores: [25000, 25000, 25000, 25000],
        doraIndicator: canonicalTile("1s"),
        selfHand: [...canonicalSelfHand],
        remainingDraws: 70,
      },
      {
        type: "tile_drawn",
        eventId: "game:fixture/0/2/0",
        sourceRecordRef: "record:2",
        actor: 0,
        tile: { visibility: "visible", tile: canonicalTile("5p") },
        from: "live_wall",
      },
      {
        type: "win_declared",
        eventId: "game:fixture/0/3/0",
        sourceRecordRef: "record:3",
        winnerActor: 0,
        targetActor: null,
        method: "tsumo",
        winningTile: canonicalTile("5p"),
        winSourceEventRef: "game:fixture/0/2/0",
        scoreDeltas: null,
      },
      {
        type: "round_ended",
        eventId: "game:fixture/0/4/0",
        sourceRecordRef: "record:4",
        terminalEventRef: "game:fixture/0/3/0",
      },
      {
        type: "round_started",
        eventId: "game:fixture/1/5/0",
        sourceRecordRef: "record:5",
        roundOrdinal: 1,
        roundWind: "E",
        hand: 2,
        honba: 0,
        riichiSticks: 0,
        dealer: 0,
        scores: [25000, 25000, 25000, 25000],
        doraIndicator: canonicalTile("1s"),
        selfHand: [...canonicalSelfHand],
        remainingDraws: 70,
      },
      {
        type: "tile_drawn",
        eventId: "game:fixture/1/6/0",
        sourceRecordRef: "record:6",
        actor: 0,
        tile: { visibility: "visible", tile: canonicalTile("6p") },
        from: "live_wall",
      },
      {
        type: "tile_discarded",
        eventId: "game:fixture/1/7/0",
        sourceRecordRef: "record:7",
        actor: 0,
        tile: canonicalTile("6p"),
        discardMode: "tsumogiri",
        riichiDeclarationEventRef: null,
      },
    ]);
    const decisions = replayCanonicalStream(stream);
    expect(decisions).toHaveLength(2);
    expect(decisions[0]!.actualDiscard).toBeNull();
    expect(decisions[1]!.actualDiscard).toMatchObject({
      type: "tile_discarded",
      tile: { id: "6p" },
      discardMode: "tsumogiri",
    });
  });

  it("derives the tsumo terminal actual for a draw resolved by a win", () => {
    const stream = canonicalStream([
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
        type: "win_declared",
        eventId: "game:fixture/0/3/0",
        sourceRecordRef: "record:3",
        winnerActor: 0,
        targetActor: null,
        method: "tsumo",
        winningTile: canonicalTile("5p"),
        winSourceEventRef: "game:fixture/0/2/0",
        scoreDeltas: null,
      },
      {
        type: "round_ended",
        eventId: "game:fixture/0/4/0",
        sourceRecordRef: "record:4",
        terminalEventRef: "game:fixture/0/3/0",
      },
    ]);
    const decisions = replayCanonicalStream(stream);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.actualAction).toEqual({
      kind: "tsumo",
      winningTile: canonicalTile("5p"),
      drawEventRef: "game:fixture/0/2/0",
    });
  });

  it("derives the ankan terminal actual for a draw resolved by a concealed kan", () => {
    const ankanHand = [
      canonicalTile("1m"), canonicalTile("1m"), canonicalTile("1m"),
      canonicalTile("1m"),
      canonicalTile("4m"), canonicalTile("5m"), canonicalTile("6m"),
      canonicalTile("7m"), canonicalTile("8m"), canonicalTile("9m"),
      canonicalTile("1p"), canonicalTile("2p"), canonicalTile("3p"),
    ];
    const stream = canonicalStream([
      ...canonicalStartEvents(ankanHand),
      {
        type: "tile_drawn",
        eventId: "game:fixture/0/2/0",
        sourceRecordRef: "record:2",
        actor: 0,
        tile: { visibility: "visible", tile: canonicalTile("4p") },
        from: "live_wall",
      },
      {
        type: "ankan_declared",
        eventId: "game:fixture/0/3/0",
        sourceRecordRef: "record:3",
        actor: 0,
        tiles: [
          canonicalTile("1m"),
          canonicalTile("1m"),
          canonicalTile("1m"),
          canonicalTile("1m"),
        ],
      },
      {
        type: "dora_revealed",
        eventId: "game:fixture/0/3/1",
        sourceRecordRef: "record:3",
        kanEventRef: "game:fixture/0/3/0",
        indicator: canonicalTile("2s"),
      },
      {
        type: "tile_drawn",
        eventId: "game:fixture/0/4/0",
        sourceRecordRef: "record:4",
        actor: 0,
        tile: { visibility: "visible", tile: canonicalTile("4p") },
        from: "rinshan",
      },
      {
        type: "tile_discarded",
        eventId: "game:fixture/0/5/0",
        sourceRecordRef: "record:5",
        actor: 0,
        tile: canonicalTile("4p"),
        discardMode: "tsumogiri",
        riichiDeclarationEventRef: null,
      },
    ]);
    const decisions = replayCanonicalStream(stream);
    expect(decisions).toHaveLength(2);
    expect(decisions[0]!.actualAction).toEqual({
      kind: "ankan",
      tiles: [
        canonicalTile("1m"),
        canonicalTile("1m"),
        canonicalTile("1m"),
        canonicalTile("1m"),
      ],
    });
    // The rinshan draw opens its own ordinary self-turn window.
    expect(decisions[1]!.actualAction).toEqual({
      kind: "discard",
      tile: canonicalTile("4p"),
      discardMode: "tsumogiri",
    });
  });

  it("derives the kyuushu terminal actual for a draw resolved by a nine-terminal abort", () => {
    // 8 distinct terminals concealed; the drawn tile is the 9th.
    const kyuushuHand = [
      canonicalTile("1m"), canonicalTile("9m"),
      canonicalTile("1p"), canonicalTile("9p"),
      canonicalTile("1s"), canonicalTile("9s"),
      canonicalTile("1z"), canonicalTile("2z"),
      canonicalTile("3m"), canonicalTile("3m"),
      canonicalTile("4p"), canonicalTile("4p"),
      canonicalTile("5s"),
    ];
    const stream = canonicalStream([
      ...canonicalStartEvents(kyuushuHand),
      {
        type: "tile_drawn",
        eventId: "game:fixture/0/2/0",
        sourceRecordRef: "record:2",
        actor: 0,
        tile: { visibility: "visible", tile: canonicalTile("3z") },
        from: "live_wall",
      },
      {
        type: "round_drawn",
        eventId: "game:fixture/0/3/0",
        sourceRecordRef: "record:3",
        reason: "kyuushu_kyuuhai",
        tenpaiActors: [],
      },
      {
        type: "round_ended",
        eventId: "game:fixture/0/4/0",
        sourceRecordRef: "record:4",
        terminalEventRef: "game:fixture/0/3/0",
      },
    ]);
    const decisions = replayCanonicalStream(stream);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.actualAction).toEqual({
      kind: "kyuushu_kyuuhai",
      drawEventRef: "game:fixture/0/2/0",
    });
  });

  it("keeps a non-kyuushu round_drawn unrepresentable and fails the window closed", () => {
    const stream = canonicalStream([
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
        type: "round_drawn",
        eventId: "game:fixture/0/3/0",
        sourceRecordRef: "record:3",
        reason: "exhaustive",
        tenpaiActors: [0, 1],
      },
      {
        type: "round_ended",
        eventId: "game:fixture/0/4/0",
        sourceRecordRef: "record:4",
        terminalEventRef: "game:fixture/0/3/0",
      },
    ]);
    const decisions = replayCanonicalStream(stream);
    expect(decisions).toHaveLength(1);
    // An exhaustive draw reached without a self action attributes the round
    // end to no actor: the window stays unresolved (fail closed downstream).
    expect(decisions[0]!.actualAction).toBeNull();
  });

  it("enumerates a post-call window after a self chi with a tedashi actual", () => {
    const stream = canonicalStream([
      {
        type: "game_started",
        eventId: "game:fixture/0/0/0",
        sourceRecordRef: "record:0",
      },
      {
        type: "round_started",
        eventId: "game:fixture/0/1/0",
        sourceRecordRef: "record:1",
        roundOrdinal: 0,
        roundWind: "E",
        hand: 1,
        honba: 0,
        riichiSticks: 0,
        dealer: 3,
        scores: [25000, 25000, 25000, 25000],
        doraIndicator: canonicalTile("1s"),
        selfHand: [...canonicalSelfHand],
        remainingDraws: 70,
      },
      {
        type: "tile_drawn",
        eventId: "game:fixture/0/2/0",
        sourceRecordRef: "record:2",
        actor: 3,
        tile: { visibility: "hidden" },
        from: "live_wall",
      },
      {
        type: "tile_discarded",
        eventId: "game:fixture/0/3/0",
        sourceRecordRef: "record:3",
        actor: 3,
        tile: canonicalTile("2m"),
        discardMode: "tedashi",
        riichiDeclarationEventRef: null,
      },
      {
        type: "chi_called",
        eventId: "game:fixture/0/4/0",
        sourceRecordRef: "record:4",
        actor: 0,
        targetActor: 3,
        calledTile: canonicalTile("2m"),
        consumedTiles: [canonicalTile("1m"), canonicalTile("3m")],
        calledDiscardEventRef: "game:fixture/0/3/0",
      },
      {
        type: "tile_discarded",
        eventId: "game:fixture/0/5/0",
        sourceRecordRef: "record:5",
        actor: 0,
        tile: canonicalTile("4p"),
        discardMode: "tedashi",
        riichiDeclarationEventRef: null,
      },
    ]);
    const decisions = replayCanonicalStream(stream);
    expect(decisions).toHaveLength(1);
    const decision = decisions[0]!;
    expect(decision.snapshot.privateState.decisionWindow).toEqual({
      kind: "post_call_discard",
      actor: 0,
      triggerEventRef: "game:fixture/0/4/0",
    });
    // Chi consumed 1m and 3m: eleven concealed tiles remain.
    expect(decision.facts.concealedTiles).toHaveLength(11);
    expect(decision.facts.currentDraw).toBeNull();
    expect(decision.actualAction).toEqual({
      kind: "discard",
      tile: canonicalTile("4p"),
      discardMode: "tedashi",
    });
  });

  it("enumerates the riichi decision window and the post-riichi window on the declaration turn", () => {
    const stream = canonicalStream([
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
        type: "riichi_declared",
        eventId: "game:fixture/0/3/0",
        sourceRecordRef: "record:3",
        actor: 0,
      },
      {
        type: "tile_discarded",
        eventId: "game:fixture/0/4/0",
        sourceRecordRef: "record:4",
        actor: 0,
        tile: canonicalTile("4p"),
        discardMode: "tedashi",
        riichiDeclarationEventRef: "game:fixture/0/3/0",
      },
      {
        type: "riichi_accepted",
        eventId: "game:fixture/0/5/0",
        sourceRecordRef: "record:5",
        actor: 0,
        declarationEventRef: "game:fixture/0/3/0",
      },
      {
        type: "tile_drawn",
        eventId: "game:fixture/0/6/0",
        sourceRecordRef: "record:6",
        actor: 1,
        tile: { visibility: "hidden" },
        from: "live_wall",
      },
      {
        type: "tile_discarded",
        eventId: "game:fixture/0/7/0",
        sourceRecordRef: "record:7",
        actor: 1,
        tile: canonicalTile("1z"),
        discardMode: "tedashi",
        riichiDeclarationEventRef: null,
      },
      {
        type: "tile_drawn",
        eventId: "game:fixture/0/8/0",
        sourceRecordRef: "record:8",
        actor: 2,
        tile: { visibility: "hidden" },
        from: "live_wall",
      },
      {
        type: "tile_discarded",
        eventId: "game:fixture/0/9/0",
        sourceRecordRef: "record:9",
        actor: 2,
        tile: canonicalTile("2z"),
        discardMode: "tedashi",
        riichiDeclarationEventRef: null,
      },
      {
        type: "tile_drawn",
        eventId: "game:fixture/0/10/0",
        sourceRecordRef: "record:10",
        actor: 3,
        tile: { visibility: "hidden" },
        from: "live_wall",
      },
      {
        type: "tile_discarded",
        eventId: "game:fixture/0/11/0",
        sourceRecordRef: "record:11",
        actor: 3,
        tile: canonicalTile("3z"),
        discardMode: "tedashi",
        riichiDeclarationEventRef: null,
      },
      {
        type: "tile_drawn",
        eventId: "game:fixture/0/12/0",
        sourceRecordRef: "record:12",
        actor: 0,
        tile: { visibility: "visible", tile: canonicalTile("6p") },
        from: "live_wall",
      },
      {
        type: "tile_discarded",
        eventId: "game:fixture/0/13/0",
        sourceRecordRef: "record:13",
        actor: 0,
        tile: canonicalTile("6p"),
        discardMode: "tsumogiri",
        riichiDeclarationEventRef: null,
      },
    ]);
    const decisions = replayCanonicalStream(stream);
    expect(decisions).toHaveLength(3);

    // The declaration turn's self-turn window: the actual is the concrete
    // riichi discard carrying the authoritative local tile.
    expect(decisions[0]!.snapshot.privateState.decisionWindow.kind).toBe(
      "self_turn",
    );
    expect(decisions[0]!.actualAction).toEqual({
      kind: "riichi_discard",
      tile: canonicalTile("4p"),
      discardMode: "tedashi",
    });
    expect(decisions[0]!.actualDiscard?.riichiDeclarationEventRef).toBe(
      "game:fixture/0/3/0",
    );

    // The post-riichi window is the same turn's discard decision, frozen at
    // the declaration: the draw is still in hand and riichi is declared, so
    // it carries the at_self_riichi=true identity of Mortal's same-turn
    // dahai entry.
    expect(decisions[1]!.snapshot.privateState.decisionWindow).toEqual({
      kind: "post_riichi_discard",
      actor: 0,
      triggerEventRef: "game:fixture/0/3/0",
    });
    expect(
      decisions[1]!.snapshot.publicState.riichiStates[0]!.status,
    ).toBe("declared");
    expect(decisions[1]!.facts.currentDraw?.tile.id).toBe("5p");
    expect(decisions[1]!.facts.concealedTiles).toHaveLength(13);
    expect(decisions[1]!.actualAction).toEqual({
      kind: "discard",
      tile: canonicalTile("4p"),
      discardMode: "tedashi",
    });

    // The next turn while riichi'd is an ordinary self-turn window whose
    // snapshot carries the accepted riichi state (identity: atSelfRiichi).
    expect(decisions[2]!.snapshot.privateState.decisionWindow.kind).toBe(
      "self_turn",
    );
    expect(
      decisions[2]!.snapshot.publicState.riichiStates[0]!.status,
    ).toBe("accepted");
    expect(decisions[2]!.actualAction).toEqual({
      kind: "discard",
      tile: canonicalTile("6p"),
      discardMode: "tsumogiri",
    });
  });
});
