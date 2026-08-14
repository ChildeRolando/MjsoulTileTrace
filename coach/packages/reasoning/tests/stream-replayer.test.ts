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
});
