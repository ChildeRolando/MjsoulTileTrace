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
});
