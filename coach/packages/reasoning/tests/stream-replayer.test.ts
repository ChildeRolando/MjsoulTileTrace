import { describe, expect, it } from "vitest";
import { replayCanonicalStream } from "../src/replay/stream-replayer.js";
import {
  canonicalSelfDrawDiscardEvents,
  canonicalStartEvents,
  canonicalStream,
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
});
