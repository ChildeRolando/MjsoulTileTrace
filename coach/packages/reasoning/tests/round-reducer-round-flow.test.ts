import { describe, expect, it } from "vitest";
import type {
  CanonicalEventStream,
  CanonicalGameEvent,
  Tile,
} from "@riichi-coach/contracts";
import { reduceCanonicalEventStream } from "../src/index.js";
import {
  canonicalSelfHand,
  canonicalStartEvents,
  canonicalStream,
  canonicalTile,
} from "./fixtures/canonical-stream.js";

function riichiEvents(selfHand: readonly Tile[] = canonicalSelfHand): CanonicalGameEvent[] {
  return [
    ...canonicalStartEvents(selfHand, canonicalTile("3s")),
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
      tile: canonicalTile("5p"),
      discardMode: "tsumogiri",
      riichiDeclarationEventRef: "game:fixture/0/3/0",
    },
    {
      type: "riichi_accepted",
      eventId: "game:fixture/0/5/0",
      sourceRecordRef: "record:5",
      actor: 0,
      declarationEventRef: "game:fixture/0/3/0",
    },
  ];
}

function stateAt(stream: CanonicalEventStream, eventRef: string) {
  const state = reduceCanonicalEventStream(stream)
    .find((entry) => entry.eventRef === eventRef);
  if (state === undefined) throw new Error(`missing state ${eventRef}`);
  return state;
}

function nextThreeTurns(): CanonicalGameEvent[] {
  return [1, 2, 3].flatMap((actor, index): CanonicalGameEvent[] => {
    const record = 6 + index * 2;
    return [
      {
        type: "tile_drawn",
        eventId: `game:fixture/0/${record}/0`,
        sourceRecordRef: `record:${record}`,
        actor,
        tile: { visibility: "hidden" },
        from: "live_wall",
      },
      {
        type: "tile_discarded",
        eventId: `game:fixture/0/${record + 1}/0`,
        sourceRecordRef: `record:${record + 1}`,
        actor,
        tile: canonicalTile(actor === 1 ? "4s" : actor === 2 ? "6s" : "8s"),
        discardMode: "tedashi",
        riichiDeclarationEventRef: null,
      },
    ];
  });
}

describe("canonical riichi and round flow", () => {
  it("separates riichi declaration from acceptance and point payment", () => {
    const stream = canonicalStream(riichiEvents());
    const declared = stateAt(stream, "game:fixture/0/3/0");
    const accepted = stateAt(stream, "game:fixture/0/5/0");

    expect(declared.publicState?.riichiStates[0]).toMatchObject({
      status: "declared",
      declarationEventRef: "game:fixture/0/3/0",
      acceptanceEventRef: null,
      ippatsuAlive: false,
    });
    expect(declared.publicState?.scores[0]).toBe(25000);
    expect(declared.publicState?.riichiSticks).toBe(0);
    expect(accepted.publicState?.riichiStates[0]).toMatchObject({
      status: "accepted",
      acceptanceEventRef: "game:fixture/0/5/0",
      ippatsuAlive: true,
    });
    expect(accepted.publicState?.scores[0]).toBe(24000);
    expect(accepted.publicState?.riichiSticks).toBe(1);
  });

  it("cancels every live ippatsu window after an open call", () => {
    const events: CanonicalGameEvent[] = [
      ...riichiEvents(),
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
        tile: canonicalTile("4s"),
        discardMode: "tedashi",
        riichiDeclarationEventRef: null,
      },
      {
        type: "pon_called",
        eventId: "game:fixture/0/8/0",
        sourceRecordRef: "record:8",
        actor: 2,
        targetActor: 1,
        calledTile: canonicalTile("4s"),
        consumedTiles: [canonicalTile("4s"), canonicalTile("4s")],
        calledDiscardEventRef: "game:fixture/0/7/0",
      },
    ];
    const afterCall = stateAt(
      canonicalStream(events),
      "game:fixture/0/8/0",
    );

    expect(afterCall.publicState?.riichiStates[0]?.ippatsuAlive).toBe(false);
  });

  it("expires ippatsu after the riichi player's next ordinary discard", () => {
    const events: CanonicalGameEvent[] = [
      ...riichiEvents(),
      ...nextThreeTurns(),
      {
        type: "tile_drawn",
        eventId: "game:fixture/0/12/0",
        sourceRecordRef: "record:12",
        actor: 0,
        tile: { visibility: "visible", tile: canonicalTile("2p") },
        from: "live_wall",
      },
      {
        type: "tile_discarded",
        eventId: "game:fixture/0/13/0",
        sourceRecordRef: "record:13",
        actor: 0,
        tile: canonicalTile("2p"),
        discardMode: "tsumogiri",
        riichiDeclarationEventRef: null,
      },
    ];
    const afterDiscard = stateAt(
      canonicalStream(events),
      "game:fixture/0/13/0",
    );

    expect(afterDiscard.publicState?.riichiStates[0]?.ippatsuAlive).toBe(false);
  });

  it("applies the explicit ankan ippatsu rule without guessing unknown rules", () => {
    const fourOnes = [
      canonicalTile("1m"), canonicalTile("1m"), canonicalTile("1m"),
      canonicalTile("1m"), canonicalTile("2m"), canonicalTile("3m"),
      canonicalTile("4m"), canonicalTile("5m"), canonicalTile("6m"),
      canonicalTile("7m"), canonicalTile("8m"), canonicalTile("9m"),
      canonicalTile("1p"),
    ];
    const events: CanonicalGameEvent[] = [
      ...riichiEvents(fourOnes),
      ...nextThreeTurns(),
      {
        type: "tile_drawn",
        eventId: "game:fixture/0/12/0",
        sourceRecordRef: "record:12",
        actor: 0,
        tile: { visibility: "visible", tile: canonicalTile("2p") },
        from: "live_wall",
      },
      {
        type: "ankan_declared",
        eventId: "game:fixture/0/13/0",
        sourceRecordRef: "record:13",
        actor: 0,
        tiles: [
          canonicalTile("1m"), canonicalTile("1m"),
          canonicalTile("1m"), canonicalTile("1m"),
        ],
      },
    ];
    const cancels = canonicalStream(events);
    const preserves = canonicalStream(events);
    preserves.ruleSet.ippatsuCancelledByAnkan = false;
    const unknown = canonicalStream(events);
    unknown.ruleSet.ippatsuCancelledByAnkan = "unknown";
    unknown.completeness.ruleSet = "partial";

    expect(stateAt(cancels, "game:fixture/0/13/0")
      .publicState?.riichiStates[0]?.ippatsuAlive).toBe(false);
    expect(stateAt(preserves, "game:fixture/0/13/0")
      .publicState?.riichiStates[0]?.ippatsuAlive).toBe(true);
    expect(stateAt(unknown, "game:fixture/0/13/0")
      .publicState?.riichiStates[0]?.ippatsuAlive).toBeNull();
  });

  it("reveals kan dora without changing the kan phase", () => {
    const hand = [
      canonicalTile("1m"), canonicalTile("1m"), canonicalTile("1m"),
      canonicalTile("2m"), canonicalTile("3m"), canonicalTile("4m"),
      canonicalTile("5m"), canonicalTile("6m"), canonicalTile("7m"),
      canonicalTile("8m"), canonicalTile("9m"), canonicalTile("1p"),
      canonicalTile("2p"),
    ];
    const events: CanonicalGameEvent[] = [
      ...canonicalStartEvents(hand, canonicalTile("3s")),
      {
        type: "tile_drawn",
        eventId: "game:fixture/0/2/0",
        sourceRecordRef: "record:2",
        actor: 0,
        tile: { visibility: "visible", tile: canonicalTile("1m") },
        from: "live_wall",
      },
      {
        type: "ankan_declared",
        eventId: "game:fixture/0/3/0",
        sourceRecordRef: "record:3",
        actor: 0,
        tiles: [
          canonicalTile("1m"), canonicalTile("1m"),
          canonicalTile("1m"), canonicalTile("1m"),
        ],
      },
      {
        type: "dora_revealed",
        eventId: "game:fixture/0/4/0",
        sourceRecordRef: "record:4",
        indicator: canonicalTile("2s"),
        kanEventRef: "game:fixture/0/3/0",
      },
    ];
    const afterDora = stateAt(
      canonicalStream(events),
      "game:fixture/0/4/0",
    );

    expect(afterDora.publicState?.doraIndicators).toEqual([
      canonicalTile("3s"), canonicalTile("2s"),
    ]);
    expect(afterDora.publicState?.phase).toBe("awaiting_rinshan_draw");
  });

  it("records win settlement and explicit score updates", () => {
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
        type: "scores_updated",
        eventId: "game:fixture/0/4/0",
        sourceRecordRef: "record:4",
        scores: [27000, 23000, 25000, 25000],
        settlementEventRef: "game:fixture/0/3/0",
      },
      {
        type: "round_ended",
        eventId: "game:fixture/0/5/0",
        sourceRecordRef: "record:5",
        terminalEventRef: "game:fixture/0/3/0",
      },
    ];
    const stream = canonicalStream(events);
    const afterWin = stateAt(stream, "game:fixture/0/3/0");
    const afterScores = stateAt(stream, "game:fixture/0/4/0");

    expect(afterWin.publicState?.phase).toBe("round_ended");
    expect(afterWin.publicState?.terminal).toEqual({
      kind: "win",
      eventRefs: ["game:fixture/0/3/0"],
    });
    expect(afterScores.publicState?.scores)
      .toEqual([27000, 23000, 25000, 25000]);
  });

  it("records an exhaustive draw as a draw terminal", () => {
    const events: CanonicalGameEvent[] = [
      ...canonicalStartEvents(),
      {
        type: "round_drawn",
        eventId: "game:fixture/0/2/0",
        sourceRecordRef: "record:2",
        reason: "exhaustive",
        tenpaiActors: [0, 2],
      },
    ];
    const afterDraw = stateAt(
      canonicalStream(events),
      "game:fixture/0/2/0",
    );

    expect(afterDraw.publicState?.terminal).toEqual({
      kind: "draw",
      eventRef: "game:fixture/0/2/0",
      reason: "exhaustive",
    });
    expect(afterDraw.publicState?.phase).toBe("round_ended");
  });
});
