import { describe, expect, it } from "vitest";
import type { CanonicalGameEvent, Tile } from "@riichi-coach/contracts";
import { reduceCanonicalEventStream } from "../src/index.js";
import {
  canonicalStartEvents,
  canonicalStream,
  canonicalTile,
} from "./fixtures/canonical-stream.js";

const callHand = (fivePinCount: 2): Tile[] => [
  canonicalTile("1m"), canonicalTile("2m"), canonicalTile("3m"),
  canonicalTile("4m"), canonicalTile("5m"), canonicalTile("6m"),
  canonicalTile("7m"), canonicalTile("8m"), canonicalTile("9m"),
  canonicalTile("5p"), canonicalTile("5p"), canonicalTile("1s"),
  canonicalTile("2s"),
];

function discardRotation(selfHand: readonly Tile[], lastTile = canonicalTile("5p")):
  CanonicalGameEvent[] {
  return [
    ...canonicalStartEvents(selfHand, canonicalTile("3s")),
    {
      type: "tile_drawn",
      eventId: "game:fixture/0/2/0",
      sourceRecordRef: "record:2",
      actor: 0,
      tile: { visibility: "visible", tile: canonicalTile("3p") },
      from: "live_wall",
    },
    {
      type: "tile_discarded",
      eventId: "game:fixture/0/3/0",
      sourceRecordRef: "record:3",
      actor: 0,
      tile: canonicalTile("3p"),
      discardMode: "tsumogiri",
      riichiDeclarationEventRef: null,
    },
    ...[1, 2, 3].flatMap((actor, index): CanonicalGameEvent[] => {
      const record = 4 + index * 2;
      const discard = actor === 3 ? lastTile : canonicalTile(actor === 1 ? "4s" : "6s");
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
          tile: discard,
          discardMode: "tedashi",
          riichiDeclarationEventRef: null,
        },
      ];
    }),
  ];
}

function stateAt(events: readonly CanonicalGameEvent[], eventRef: string) {
  const state = reduceCanonicalEventStream(canonicalStream(events))
    .find((entry) => entry.eventRef === eventRef);
  if (state === undefined) throw new Error(`missing state ${eventRef}`);
  return state;
}

describe("canonical call and kan reduction", () => {
  it("marks the called discard and enters a post-pon discard window", () => {
    const events: CanonicalGameEvent[] = [
      ...discardRotation(callHand(2)),
      {
        type: "pon_called",
        eventId: "game:fixture/0/10/0",
        sourceRecordRef: "record:10",
        actor: 0,
        targetActor: 3,
        calledTile: canonicalTile("5p"),
        consumedTiles: [canonicalTile("5p"), canonicalTile("5p")],
        calledDiscardEventRef: "game:fixture/0/9/0",
      },
    ];
    const afterPon = stateAt(events, "game:fixture/0/10/0");

    expect(afterPon.publicState?.rivers[3].at(-1)?.calledByEventRef)
      .toBe("game:fixture/0/10/0");
    expect(afterPon.publicState?.melds[0]).toMatchObject({
      kind: "pon",
      actor: 0,
      targetActor: 3,
      calledDiscardEventRef: "game:fixture/0/9/0",
    });
    expect(afterPon.publicState?.phase).toBe("awaiting_post_call_discard");
    expect(afterPon.privateState?.selfMeldRefs)
      .toEqual(["game:fixture/0/10/0"]);
    expect(afterPon.privateState?.concealedTiles.filter((tile) => tile.id === "5p"))
      .toHaveLength(0);
  });

  it("enters a rinshan draw after daiminkan", () => {
    const hand = [...callHand(2)];
    hand[0] = canonicalTile("5p");
    const events: CanonicalGameEvent[] = [
      ...discardRotation(hand),
      {
        type: "daiminkan_called",
        eventId: "game:fixture/0/10/0",
        sourceRecordRef: "record:10",
        actor: 0,
        targetActor: 3,
        calledTile: canonicalTile("5p"),
        consumedTiles: [
          canonicalTile("5p"), canonicalTile("5p"), canonicalTile("5p"),
        ],
        calledDiscardEventRef: "game:fixture/0/9/0",
      },
    ];
    const afterKan = stateAt(events, "game:fixture/0/10/0");

    expect(afterKan.publicState?.phase).toBe("awaiting_rinshan_draw");
    expect(afterKan.publicState?.melds[0]?.kind).toBe("daiminkan");
  });

  it("moves four self-owned tiles into an ankan", () => {
    const hand = [...callHand(2)];
    hand[0] = canonicalTile("5p");
    const events: CanonicalGameEvent[] = [
      ...canonicalStartEvents(hand, canonicalTile("3s")),
      {
        type: "tile_drawn",
        eventId: "game:fixture/0/2/0",
        sourceRecordRef: "record:2",
        actor: 0,
        tile: { visibility: "visible", tile: canonicalTile("5p") },
        from: "live_wall",
      },
      {
        type: "ankan_declared",
        eventId: "game:fixture/0/3/0",
        sourceRecordRef: "record:3",
        actor: 0,
        tiles: [
          canonicalTile("5p"), canonicalTile("5p"),
          canonicalTile("5p"), canonicalTile("5p"),
        ],
      },
    ];
    const afterKan = stateAt(events, "game:fixture/0/3/0");

    expect(afterKan.publicState?.melds[0]).toMatchObject({
      kind: "ankan",
      actor: 0,
    });
    expect(afterKan.publicState?.phase).toBe("awaiting_rinshan_draw");
    expect(afterKan.privateState?.concealedTiles.filter((tile) => tile.id === "5p"))
      .toHaveLength(0);
  });

  it("upgrades one existing pon in place to kakan", () => {
    const ponEvents: CanonicalGameEvent[] = [
      ...discardRotation(callHand(2)),
      {
        type: "pon_called",
        eventId: "game:fixture/0/10/0",
        sourceRecordRef: "record:10",
        actor: 0,
        targetActor: 3,
        calledTile: canonicalTile("5p"),
        consumedTiles: [canonicalTile("5p"), canonicalTile("5p")],
        calledDiscardEventRef: "game:fixture/0/9/0",
      },
      {
        type: "tile_discarded",
        eventId: "game:fixture/0/11/0",
        sourceRecordRef: "record:11",
        actor: 0,
        tile: canonicalTile("1s"),
        discardMode: "tedashi",
        riichiDeclarationEventRef: null,
      },
    ];
    const nextRotation: CanonicalGameEvent[] = [1, 2, 3].flatMap(
      (actor, index): CanonicalGameEvent[] => {
        const record = 12 + index * 2;
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
            tile: canonicalTile(actor === 1 ? "7s" : actor === 2 ? "8s" : "9s"),
            discardMode: "tedashi",
            riichiDeclarationEventRef: null,
          },
        ];
      },
    );
    const events: CanonicalGameEvent[] = [
      ...ponEvents,
      ...nextRotation,
      {
        type: "tile_drawn",
        eventId: "game:fixture/0/18/0",
        sourceRecordRef: "record:18",
        actor: 0,
        tile: { visibility: "visible", tile: canonicalTile("5p") },
        from: "live_wall",
      },
      {
        type: "kakan_declared",
        eventId: "game:fixture/0/19/0",
        sourceRecordRef: "record:19",
        actor: 0,
        addedTile: canonicalTile("5p"),
        upgradedPonEventRef: "game:fixture/0/10/0",
      },
    ];
    const afterKakan = stateAt(events, "game:fixture/0/19/0");

    expect(afterKakan.publicState?.melds).toHaveLength(1);
    expect(afterKakan.publicState?.melds[0]).toMatchObject({
      kind: "kakan",
      upgradedPonEventRef: "game:fixture/0/10/0",
      latestEventRef: "game:fixture/0/19/0",
    });
    expect(afterKakan.publicState?.phase).toBe("awaiting_kan_responses");
  });
});
