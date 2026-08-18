import { describe, expect, it } from "vitest";
import type {
  CanonicalEventStream,
  CanonicalGameEvent,
  Tile,
} from "@riichi-coach/contracts";
import {
  replayCanonicalResponseWindows,
  replayCanonicalStream,
} from "../src/replay/stream-replayer.js";
import { canonicalStream, canonicalTile } from "./fixtures/canonical-stream.js";

// M6-A4.1: response-surface window opening, at the shared streamContext seam.
// Every stream below is a valid canonical replay (fixture round-start + the
// turn cycle); assertions target the OPENED windows' identity fields (actor /
// sourceActor / triggerEventRef / offeredTile / kanKind) and the
// forward-scanned actual resolution (chi / pon / daiminkan / ron / pass).

// --- event builders -------------------------------------------------------

const defaultHand = [
  canonicalTile("1m"), canonicalTile("2m"), canonicalTile("3m"),
  canonicalTile("4m"), canonicalTile("5m"), canonicalTile("6m"),
  canonicalTile("7m"), canonicalTile("8m"), canonicalTile("9m"),
  canonicalTile("1p"), canonicalTile("2p"), canonicalTile("3p"),
  canonicalTile("4p"),
];

let eventSeq = 1;

function nextId(): { eventId: string; sourceRecordRef: string } {
  eventSeq += 1;
  return {
    eventId: `game:fixture/0/${eventSeq}/0`,
    sourceRecordRef: `record:${eventSeq}`,
  };
}

function selfDraw(tile: Tile): CanonicalGameEvent {
  const { eventId, sourceRecordRef } = nextId();
  return {
    type: "tile_drawn",
    eventId,
    sourceRecordRef,
    actor: 0,
    tile: { visibility: "visible", tile },
    from: "live_wall",
  };
}

function selfTsumogiri(tile: Tile): CanonicalGameEvent {
  const { eventId, sourceRecordRef } = nextId();
  return {
    type: "tile_discarded",
    eventId,
    sourceRecordRef,
    actor: 0,
    tile,
    discardMode: "tsumogiri",
    riichiDeclarationEventRef: null,
  };
}

function opponentTurn(
  seat: number,
  tile: Tile,
): { draw: CanonicalGameEvent; discard: CanonicalGameEvent } {
  const draw = nextId();
  const discard = nextId();
  return {
    draw: {
      type: "tile_drawn",
      eventId: draw.eventId,
      sourceRecordRef: draw.sourceRecordRef,
      actor: seat,
      tile: { visibility: "hidden" },
      from: "live_wall",
    },
    discard: {
      type: "tile_discarded",
      eventId: discard.eventId,
      sourceRecordRef: discard.sourceRecordRef,
      actor: seat,
      tile,
      discardMode: "tedashi",
      riichiDeclarationEventRef: null,
    },
  };
}

function opponentDraw(seat: number): CanonicalGameEvent {
  const { eventId, sourceRecordRef } = nextId();
  return {
    type: "tile_drawn",
    eventId,
    sourceRecordRef,
    actor: seat,
    tile: { visibility: "hidden" },
    from: "live_wall",
  };
}

function streamFromHand(
  hand: readonly Tile[],
  afterRound: readonly CanonicalGameEvent[],
): CanonicalEventStream {
  const roundStart: CanonicalGameEvent = {
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
    selfHand: [...hand],
    remainingDraws: 70,
  };
  return canonicalStream([
    { type: "game_started", eventId: "game:fixture/0/0/0", sourceRecordRef: "record:0" },
    roundStart,
    ...afterRound,
  ]);
}

// --- tests ----------------------------------------------------------------

describe("M6-A4.1 response window opening (shared streamContext seam)", () => {
  it("opens a discard_response window for a chi-eligible opponent discard, actual = pass", () => {
    // self hand: 1m..9m + 1p2p3p4p. The next seat (seat 3) discards 5p, which
    // completes the 3p/4p run — a legal chi candidate the reviewed player
    // declines.
    eventSeq = 1;
    const selfTurn = [selfDraw(canonicalTile("5p")), selfTsumogiri(canonicalTile("5p"))];
    const seat1 = opponentTurn(1, canonicalTile("9m"));
    const seat2 = opponentTurn(2, canonicalTile("1z"));
    const seat3 = opponentTurn(3, canonicalTile("5p"));
    const events = [
      ...selfTurn,
      seat1.draw, seat1.discard,
      seat2.draw, seat2.discard,
      seat3.draw, seat3.discard,
      selfDraw(canonicalTile("5p")), // no call → next self draw closes the window
    ];
    const decisions = replayCanonicalResponseWindows(streamFromHand(defaultHand, events));

    expect(decisions).toHaveLength(1);
    const decision = decisions[0]!;
    const window = decision.snapshot.privateState.decisionWindow;
    expect(window.kind).toBe("discard_response");
    if (window.kind !== "discard_response") return;
    expect(window.actor).toBe(0);
    expect(window.sourceActor).toBe(3);
    expect(window.offeredTile).toEqual(canonicalTile("5p"));
    expect(decision.decisionEventRef).toBe(seat3.discard.eventId);
    expect(decision.actualDiscard).toBeNull();
    expect(decision.actualAction).toEqual({
      kind: "pass",
      responseEventRef: seat3.discard.eventId,
      responseKind: "discard",
    });
    // facts project for a response window without a draw.
    expect(decision.facts.currentDraw).toBeNull();
    expect(decision.facts.concealedTiles).toHaveLength(13);
  });

  it("opens no window when the reviewed player holds no legal candidate", () => {
    eventSeq = 1;
    const selfTurn = [selfDraw(canonicalTile("5p")), selfTsumogiri(canonicalTile("5p"))];
    const seat1 = opponentTurn(1, canonicalTile("9m"));
    const seat2 = opponentTurn(2, canonicalTile("1z"));
    const seat3 = opponentTurn(3, canonicalTile("9s")); // no 9s meld / no tenpai
    const events = [
      ...selfTurn,
      seat1.draw, seat1.discard,
      seat2.draw, seat2.discard,
      seat3.draw, seat3.discard,
      selfDraw(canonicalTile("5p")),
    ];
    const decisions = replayCanonicalResponseWindows(streamFromHand(defaultHand, events));
    expect(decisions).toHaveLength(0);
  });

  it("resolves the actual as chi when the reviewed player calls the offered tile", () => {
    eventSeq = 1;
    const selfTurn = [selfDraw(canonicalTile("5p")), selfTsumogiri(canonicalTile("5p"))];
    const seat1 = opponentTurn(1, canonicalTile("9m"));
    const seat2 = opponentTurn(2, canonicalTile("1z"));
    const seat3 = opponentTurn(3, canonicalTile("5p"));
    const chi = nextId();
    const events = [
      ...selfTurn,
      seat1.draw, seat1.discard,
      seat2.draw, seat2.discard,
      seat3.draw, seat3.discard,
      {
        type: "chi_called",
        eventId: chi.eventId,
        sourceRecordRef: chi.sourceRecordRef,
        actor: 0,
        targetActor: 3,
        calledTile: canonicalTile("5p"),
        consumedTiles: [canonicalTile("3p"), canonicalTile("4p")],
        calledDiscardEventRef: seat3.discard.eventId,
      } satisfies CanonicalGameEvent,
    ];
    const decisions = replayCanonicalResponseWindows(streamFromHand(defaultHand, events));

    expect(decisions).toHaveLength(1);
    const decision = decisions[0]!;
    expect(decision.actualAction).toEqual({
      kind: "chi",
      calledTile: canonicalTile("5p"),
      consumedTiles: [canonicalTile("3p"), canonicalTile("4p")],
      targetActor: 3,
      responseEventRef: seat3.discard.eventId,
    });
  });

  it("opens a pon-eligible discard_response window (distance two) with actual = pass", () => {
    // self hand carries a 1m pair; the seat at distance 2 (seat 2) discards 1m.
    const hand = [
      canonicalTile("1m"), canonicalTile("1m"),
      canonicalTile("2m"), canonicalTile("3m"), canonicalTile("4m"),
      canonicalTile("5m"), canonicalTile("6m"), canonicalTile("7m"),
      canonicalTile("8m"), canonicalTile("9m"),
      canonicalTile("1p"), canonicalTile("2p"), canonicalTile("3p"),
    ];
    eventSeq = 1;
    const selfTurn = [selfDraw(canonicalTile("5p")), selfTsumogiri(canonicalTile("5p"))];
    const seat1 = opponentTurn(1, canonicalTile("9s"));
    const seat2 = opponentTurn(2, canonicalTile("1m"));
    const events = [
      ...selfTurn,
      seat1.draw, seat1.discard,
      seat2.draw, seat2.discard,
      opponentDraw(3), // after seat 2's discard the next draw is seat 3 → pass
    ];
    const decisions = replayCanonicalResponseWindows(streamFromHand(hand, events));

    expect(decisions).toHaveLength(1);
    const decision = decisions[0]!;
    const window = decision.snapshot.privateState.decisionWindow;
    expect(window.kind).toBe("discard_response");
    if (window.kind !== "discard_response") return;
    expect(window.sourceActor).toBe(2);
    expect(window.offeredTile).toEqual(canonicalTile("1m"));
    expect(decision.actualAction).toEqual({
      kind: "pass",
      responseEventRef: seat2.discard.eventId,
      responseKind: "discard",
    });
  });

  it("opens a pon-eligible window at seat distance three (pon is any opponent's right)", () => {
    // M6-A4.1 pinned by H2: the reviewed player can pon a discard from the
    // player three seats ahead (only chi is restricted to the next seat).
    const hand = [
      canonicalTile("1m"), canonicalTile("1m"),
      canonicalTile("2m"), canonicalTile("3m"), canonicalTile("4m"),
      canonicalTile("5m"), canonicalTile("6m"), canonicalTile("7m"),
      canonicalTile("8m"), canonicalTile("9m"),
      canonicalTile("1p"), canonicalTile("2p"), canonicalTile("3p"),
    ];
    eventSeq = 1;
    const selfTurn = [selfDraw(canonicalTile("5p")), selfTsumogiri(canonicalTile("5p"))];
    const seat1 = opponentTurn(1, canonicalTile("9s"));
    const seat2 = opponentTurn(2, canonicalTile("2z"));
    const seat3 = opponentTurn(3, canonicalTile("1m"));
    const events = [
      ...selfTurn,
      seat1.draw, seat1.discard,
      seat2.draw, seat2.discard,
      seat3.draw, seat3.discard,
      selfDraw(canonicalTile("5p")), // distance 3 → self is next after seat 3
    ];
    const decisions = replayCanonicalResponseWindows(streamFromHand(hand, events));

    expect(decisions).toHaveLength(1);
    const window = decisions[0]!.snapshot.privateState.decisionWindow;
    expect(window.kind).toBe("discard_response");
    if (window.kind !== "discard_response") return;
    expect(window.sourceActor).toBe(3);
    expect(decisions[0]!.actualAction).toEqual({
      kind: "pass",
      responseEventRef: seat3.discard.eventId,
      responseKind: "discard",
    });
  });

  it("opens a ron-only window and resolves the actual as ron when the reviewed player wins", () => {
    // self hand is tenpai on 2p (1m..9m + 111p + 2p); seat 1 discards 2p.
    const hand = [
      canonicalTile("1m"), canonicalTile("2m"), canonicalTile("3m"),
      canonicalTile("4m"), canonicalTile("5m"), canonicalTile("6m"),
      canonicalTile("7m"), canonicalTile("8m"), canonicalTile("9m"),
      canonicalTile("1p"), canonicalTile("1p"), canonicalTile("1p"),
      canonicalTile("2p"),
    ];
    eventSeq = 1;
    const selfTurn = [selfDraw(canonicalTile("5p")), selfTsumogiri(canonicalTile("5p"))];
    const seat1 = opponentTurn(1, canonicalTile("2p"));
    const win = nextId();
    const events = [
      ...selfTurn,
      seat1.draw, seat1.discard,
      {
        type: "win_declared",
        eventId: win.eventId,
        sourceRecordRef: win.sourceRecordRef,
        winnerActor: 0,
        targetActor: 1,
        method: "ron",
        winningTile: canonicalTile("2p"),
        winSourceEventRef: seat1.discard.eventId,
        scoreDeltas: null,
      } satisfies CanonicalGameEvent,
    ];
    const decisions = replayCanonicalResponseWindows(streamFromHand(hand, events));

    expect(decisions).toHaveLength(1);
    const decision = decisions[0]!;
    const window = decision.snapshot.privateState.decisionWindow;
    expect(window.kind).toBe("discard_response");
    if (window.kind !== "discard_response") return;
    expect(window.sourceActor).toBe(1);
    expect(window.offeredTile).toEqual(canonicalTile("2p"));
    expect(decision.actualAction).toEqual({
      kind: "ron",
      winningTile: canonicalTile("2p"),
      targetActor: 1,
      responseEventRef: seat1.discard.eventId,
      winContext: "discard",
    });
  });

  it("suppresses pon for a riichi'd reviewed player but keeps the ron window on their wait", () => {
    // riichi'd tenpai on 2p, holding a 1p triplet. Seat 1 discarding 1p is a
    // pon opportunity the riichi suppresses (no ron) → no window; discarding
    // 2p (the wait) keeps a ron window.
    const hand = [
      canonicalTile("1m"), canonicalTile("2m"), canonicalTile("3m"),
      canonicalTile("4m"), canonicalTile("5m"), canonicalTile("6m"),
      canonicalTile("7m"), canonicalTile("8m"), canonicalTile("9m"),
      canonicalTile("1p"), canonicalTile("1p"), canonicalTile("1p"),
      canonicalTile("2p"),
    ];
    const riichiPreamble = (): CanonicalGameEvent[] => {
      const draw = selfDraw(canonicalTile("5p"));
      const riichi = nextId();
      const discard = nextId();
      const accepted = nextId();
      return [
        draw,
        { type: "riichi_declared", eventId: riichi.eventId, sourceRecordRef: riichi.sourceRecordRef, actor: 0 } satisfies CanonicalGameEvent,
        {
          type: "tile_discarded",
          eventId: discard.eventId,
          sourceRecordRef: discard.sourceRecordRef,
          actor: 0,
          tile: canonicalTile("5p"),
          discardMode: "tsumogiri",
          riichiDeclarationEventRef: riichi.eventId,
        } satisfies CanonicalGameEvent,
        { type: "riichi_accepted", eventId: accepted.eventId, sourceRecordRef: accepted.sourceRecordRef, actor: 0, declarationEventRef: riichi.eventId } satisfies CanonicalGameEvent,
      ];
    };

    // 1p discard: riichi blocks the pon, and 1p is not self's wait → no window.
    eventSeq = 1;
    const ponPreamble = riichiPreamble();
    const seat1Pon = opponentTurn(1, canonicalTile("1p"));
    const noWindow = replayCanonicalResponseWindows(streamFromHand(hand, [
      ...ponPreamble,
      seat1Pon.draw, seat1Pon.discard,
      opponentDraw(2),
    ]));
    expect(noWindow).toHaveLength(0);

    // 2p discard: self's wait → ron window, actual = pass (no call).
    eventSeq = 1;
    const ronPreamble = riichiPreamble();
    const seat1Ron = opponentTurn(1, canonicalTile("2p"));
    const ronWindow = replayCanonicalResponseWindows(streamFromHand(hand, [
      ...ronPreamble,
      seat1Ron.draw, seat1Ron.discard,
      opponentDraw(2),
    ]));
    expect(ronWindow).toHaveLength(1);
    const decision = ronWindow[0]!;
    const window = decision.snapshot.privateState.decisionWindow;
    expect(window.kind).toBe("discard_response");
    if (window.kind !== "discard_response") return;
    expect(window.sourceActor).toBe(1);
    expect(decision.actualAction).toEqual({
      kind: "pass",
      responseEventRef: seat1Ron.discard.eventId,
      responseKind: "discard",
    });
  });

  it("opens a kan_response window on an opponent kakan (chankan) when the reviewed player is tenpai on the added tile", () => {
    // self hand waits on 1m/4m (4m5m6m 7m8m9m9m9m 3s4s5s 2m3m). Seat 1 pons
    // seat 2's 1m then kakan's it; self can chankan the added 1m.
    const hand = [
      canonicalTile("4m"), canonicalTile("5m"), canonicalTile("6m"),
      canonicalTile("7m"), canonicalTile("8m"), canonicalTile("9m"),
      canonicalTile("9m"), canonicalTile("9m"),
      canonicalTile("3s"), canonicalTile("4s"), canonicalTile("5s"),
      canonicalTile("2m"), canonicalTile("3m"),
    ];
    eventSeq = 1;
    const selfTurn1 = [selfDraw(canonicalTile("5p")), selfTsumogiri(canonicalTile("5p"))];
    const seat1Pre = opponentTurn(1, canonicalTile("9s"));
    const seat2Discard = opponentTurn(2, canonicalTile("1m"));
    const pon = nextId();
    const postPonDiscard = nextId();
    const seat2After = opponentTurn(2, canonicalTile("2z"));
    const seat3After = opponentTurn(3, canonicalTile("3z"));
    const selfTurn2 = [selfDraw(canonicalTile("5p")), selfTsumogiri(canonicalTile("5p"))];
    const seat1Draw = opponentDraw(1);
    const kakan = nextId();
    const dora = nextId();
    const events = [
      ...selfTurn1,
      seat1Pre.draw, seat1Pre.discard,
      seat2Discard.draw, seat2Discard.discard,
      {
        type: "pon_called",
        eventId: pon.eventId,
        sourceRecordRef: pon.sourceRecordRef,
        actor: 1,
        targetActor: 2,
        calledTile: canonicalTile("1m"),
        consumedTiles: [canonicalTile("1m"), canonicalTile("1m")],
        calledDiscardEventRef: seat2Discard.discard.eventId,
      } satisfies CanonicalGameEvent,
      {
        type: "tile_discarded",
        eventId: postPonDiscard.eventId,
        sourceRecordRef: postPonDiscard.sourceRecordRef,
        actor: 1,
        tile: canonicalTile("9m"),
        discardMode: "tedashi",
        riichiDeclarationEventRef: null,
      } satisfies CanonicalGameEvent,
      seat2After.draw, seat2After.discard,
      seat3After.draw, seat3After.discard,
      ...selfTurn2,
      seat1Draw,
      {
        type: "kakan_declared",
        eventId: kakan.eventId,
        sourceRecordRef: kakan.sourceRecordRef,
        actor: 1,
        addedTile: canonicalTile("1m"),
        upgradedPonEventRef: pon.eventId,
      } satisfies CanonicalGameEvent,
      {
        type: "dora_revealed",
        eventId: dora.eventId,
        sourceRecordRef: dora.sourceRecordRef,
        indicator: canonicalTile("1s"),
        kanEventRef: kakan.eventId,
      } satisfies CanonicalGameEvent,
    ];
    const decisions = replayCanonicalResponseWindows(streamFromHand(hand, events));

    // Three response windows: the discard_response on seat 2's 1m (self tenpai
    // on it — a genuine ron opportunity the pon preempted), the discard_response
    // on seat 1's post-pon 9m (self holds a concealed triplet — a pon/daiminkan
    // opportunity at seat distance 3), and the kan_response on seat 1's kakan
    // added 1m (chankan).
    expect(decisions).toHaveLength(3);

    const discardWindows = decisions.filter((decision) =>
      decision.snapshot.privateState.decisionWindow.kind === "discard_response"
    );
    expect(discardWindows).toHaveLength(2);

    const seat2Window = discardWindows.find((decision) => {
      const w = decision.snapshot.privateState.decisionWindow;
      return w.kind === "discard_response" && w.sourceActor === 2;
    });
    expect(seat2Window).toBeDefined();
    const dw = seat2Window!.snapshot.privateState.decisionWindow;
    expect(dw.kind).toBe("discard_response");
    if (dw.kind !== "discard_response") return;
    expect(dw.offeredTile).toEqual(canonicalTile("1m"));
    expect(seat2Window!.actualAction).toEqual({
      kind: "pass",
      responseEventRef: seat2Discard.discard.eventId,
      responseKind: "discard",
    });

    const seat1Window = discardWindows.find((decision) => {
      const w = decision.snapshot.privateState.decisionWindow;
      return w.kind === "discard_response" && w.sourceActor === 1;
    });
    expect(seat1Window).toBeDefined();
    const dw2 = seat1Window!.snapshot.privateState.decisionWindow;
    expect(dw2.kind).toBe("discard_response");
    if (dw2.kind !== "discard_response") return;
    expect(dw2.offeredTile).toEqual(canonicalTile("9m"));
    expect(seat1Window!.actualAction).toEqual({
      kind: "pass",
      responseEventRef: postPonDiscard.eventId,
      responseKind: "discard",
    });

    const kanWindow = decisions.find((decision) =>
      decision.snapshot.privateState.decisionWindow.kind === "kan_response"
    );
    expect(kanWindow).toBeDefined();
    const kw = kanWindow!.snapshot.privateState.decisionWindow;
    expect(kw.kind).toBe("kan_response");
    if (kw.kind !== "kan_response") return;
    expect(kw.sourceActor).toBe(1);
    expect(kw.offeredTile).toEqual(canonicalTile("1m"));
    expect(kw.kanKind).toBe("kakan");
    expect(kanWindow!.actualAction).toEqual({
      kind: "pass",
      responseEventRef: kakan.eventId,
      responseKind: "kakan",
    });
  });

  it("keeps the response surface separate from the self-surface replay", () => {
    eventSeq = 1;
    const selfTurn = [selfDraw(canonicalTile("5p")), selfTsumogiri(canonicalTile("5p"))];
    const seat1 = opponentTurn(1, canonicalTile("9m"));
    const seat2 = opponentTurn(2, canonicalTile("1z"));
    const seat3 = opponentTurn(3, canonicalTile("5p"));
    const events = [
      ...selfTurn,
      seat1.draw, seat1.discard,
      seat2.draw, seat2.discard,
      seat3.draw, seat3.discard,
      selfDraw(canonicalTile("5p")),
    ];
    const stream = streamFromHand(defaultHand, events);
    const response = replayCanonicalResponseWindows(stream);
    const self = replayCanonicalStream(stream);

    // The self-surface replay is unchanged: two visible self draws → two
    // self_turn decisions, none of them response windows.
    expect(self).toHaveLength(2);
    expect(self.every((decision) =>
      decision.snapshot.privateState.decisionWindow.kind === "self_turn"
    )).toBe(true);
    // The response partition is separate: only response kinds, ordered by
    // their trigger event refs.
    expect(response).toHaveLength(1);
    expect(response[0]!.snapshot.privateState.decisionWindow.kind).toBe("discard_response");
  });
});
