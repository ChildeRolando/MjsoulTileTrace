import { describe, expect, it } from "vitest";
import type { CanonicalGameEvent, DecisionWindow } from "@riichi-coach/contracts";
import { freezeDecisionSnapshot } from "../src/index.js";
import {
  canonicalSelfDrawDiscardEvents,
  canonicalStartEvents,
  canonicalStream,
  canonicalTile,
} from "./fixtures/canonical-stream.js";

function actorThreeDiscardEvents(): CanonicalGameEvent[] {
  const events: CanonicalGameEvent[] = [...canonicalSelfDrawDiscardEvents()];
  for (const [index, actor] of [1, 2, 3].entries()) {
    const record = 4 + index * 2;
    events.push({
      type: "tile_drawn",
      eventId: `game:fixture/0/${record}/0`,
      sourceRecordRef: `record:${record}`,
      actor,
      tile: { visibility: "hidden" },
      from: "live_wall",
    });
    events.push({
      type: "tile_discarded",
      eventId: `game:fixture/0/${record + 1}/0`,
      sourceRecordRef: `record:${record + 1}`,
      actor,
      tile: canonicalTile(actor === 3 ? "5p" : actor === 1 ? "4s" : "6s"),
      discardMode: "tedashi",
      riichiDeclarationEventRef: null,
    });
  }
  return events;
}

function postPonEvents(): CanonicalGameEvent[] {
  const hand = [
    canonicalTile("1m"), canonicalTile("2m"), canonicalTile("3m"),
    canonicalTile("4m"), canonicalTile("5m"), canonicalTile("6m"),
    canonicalTile("7m"), canonicalTile("8m"), canonicalTile("9m"),
    canonicalTile("5p"), canonicalTile("5p"), canonicalTile("1s"),
    canonicalTile("2s"),
  ];
  const events = actorThreeDiscardEvents();
  events.splice(0, 2, ...canonicalStartEvents(hand, canonicalTile("3s")));
  events.push({
    type: "pon_called",
    eventId: "game:fixture/0/10/0",
    sourceRecordRef: "record:10",
    actor: 0,
    targetActor: 3,
    calledTile: canonicalTile("5p"),
    consumedTiles: [canonicalTile("5p"), canonicalTile("5p")],
    calledDiscardEventRef: "game:fixture/0/9/0",
  });
  return events;
}

describe("canonical decision snapshots", () => {
  it("freezes a self turn after its draw and before its discard", () => {
    const snapshot = freezeDecisionSnapshot(
      canonicalStream(canonicalSelfDrawDiscardEvents()),
      {
        kind: "self_turn",
        actor: 0,
        triggerEventRef: "game:fixture/0/2/0",
      },
    );

    expect(snapshot).toMatchObject({
      decisionEventRef: "game:fixture/0/2/0",
      privateState: {
        currentDraw: { eventRef: "game:fixture/0/2/0" },
      },
    });
    expect(snapshot.publicState.rivers[0]).toHaveLength(0);
  });

  it("freezes a discard response with the offered tile already public", () => {
    const window: DecisionWindow = {
      kind: "discard_response",
      actor: 0,
      triggerEventRef: "game:fixture/0/9/0",
      sourceActor: 3,
      offeredTile: canonicalTile("5p"),
    };
    const snapshot = freezeDecisionSnapshot(
      canonicalStream(actorThreeDiscardEvents()),
      window,
    );

    expect(snapshot.publicState.rivers[3].at(-1)?.eventRef)
      .toBe(window.triggerEventRef);
    expect(snapshot.privateState.currentDraw).toBeNull();
  });

  it("freezes a separate post-call discard window", () => {
    const snapshot = freezeDecisionSnapshot(
      canonicalStream(postPonEvents()),
      {
        kind: "post_call_discard",
        actor: 0,
        triggerEventRef: "game:fixture/0/10/0",
      },
    );

    expect(snapshot.publicState.phase).toBe("awaiting_post_call_discard");
    expect(snapshot.privateState.selfMeldRefs)
      .toEqual(["game:fixture/0/10/0"]);
  });

  it("freezes an ankan response window before the rinshan draw", () => {
    const events: CanonicalGameEvent[] = [
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
    const snapshot = freezeDecisionSnapshot(canonicalStream(events), {
      kind: "kan_response",
      actor: 0,
      triggerEventRef: "game:fixture/0/5/0",
      sourceActor: 1,
      offeredTile: canonicalTile("9s"),
      kanKind: "ankan",
    });

    expect(snapshot.publicState.phase).toBe("awaiting_kan_responses");
    expect(snapshot.publicState.melds.at(-1)).toMatchObject({
      kind: "ankan",
      actor: 1,
    });
  });

  it("rejects actor and offered-tile mismatches with a project code", () => {
    expect(() => freezeDecisionSnapshot(
      canonicalStream(canonicalSelfDrawDiscardEvents()),
      {
        kind: "self_turn",
        actor: 1,
        triggerEventRef: "game:fixture/0/2/0",
      },
    )).toThrow("decision_window_state_mismatch");

    expect(() => freezeDecisionSnapshot(
      canonicalStream(actorThreeDiscardEvents()),
      {
        kind: "discard_response",
        actor: 0,
        triggerEventRef: "game:fixture/0/9/0",
        sourceActor: 3,
        offeredTile: canonicalTile("6p"),
      },
    )).toThrow("decision_window_state_mismatch");
  });

  it("is stable across serialization and deeply frozen", () => {
    const stream = canonicalStream(canonicalSelfDrawDiscardEvents());
    const window: DecisionWindow = {
      kind: "self_turn",
      actor: 0,
      triggerEventRef: "game:fixture/0/2/0",
    };
    const first = freezeDecisionSnapshot(stream, window);
    const second = freezeDecisionSnapshot(
      JSON.parse(JSON.stringify(stream)),
      JSON.parse(JSON.stringify(window)),
    );

    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.publicState.rivers)).toBe(true);
    expect(first.streamHash).toMatch(/^sha256:/);
    expect(first.streamPrefixHash).toMatch(/^sha256:/);
  });
});
