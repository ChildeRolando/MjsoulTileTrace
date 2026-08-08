import { describe, expect, it } from "vitest";
import type { CanonicalGameEvent } from "@riichi-coach/contracts";
import { reduceCanonicalEventStream } from "../src/index.js";
import {
  canonicalSelfDrawDiscardEvents,
  canonicalStream,
  canonicalTile,
} from "./fixtures/canonical-stream.js";

describe("canonical round reducer core", () => {
  it("reduces round start, self draw, and self discard into separate states", () => {
    const states = reduceCanonicalEventStream(
      canonicalStream(canonicalSelfDrawDiscardEvents()),
    );
    const afterStart = states[1]!;
    const afterDraw = states[2]!;
    const afterDiscard = states[3]!;

    expect(afterStart.privateState?.concealedTiles).toHaveLength(13);
    expect(afterStart.publicState?.phase).toBe("awaiting_draw");
    expect(afterDraw.privateState?.currentDraw?.tile.id).toBe("5p");
    expect(afterDraw.publicState?.phase).toBe("awaiting_self_action");
    expect(afterDraw.publicState?.remainingDraws).toBe(69);
    expect(afterDiscard.privateState?.currentDraw).toBeNull();
    expect(afterDiscard.publicState?.rivers[0].at(-1)).toMatchObject({
      actor: 0,
      discardMode: "tsumogiri",
    });
    expect(afterDiscard.publicState?.phase).toBe("awaiting_discard_responses");
    expect(JSON.stringify(afterDiscard.publicState)).not.toContain("concealedTiles");
  });

  it("does not expose an opponent hidden draw", () => {
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
    ];
    const result = reduceCanonicalEventStream(canonicalStream(events)).at(-1)!;

    expect(result.publicState?.phase).toBe("awaiting_self_action");
    expect(result.publicState?.expectedActor).toBe(1);
    expect(result.privateState?.currentDraw).toBeNull();
    expect(JSON.stringify(result)).not.toContain("hiddenTile");
    expect(JSON.stringify(result)).not.toContain("opponentConcealed");
  });

  it("moves a tedashi draw into the concealed hand without mutating prior states", () => {
    const events = canonicalSelfDrawDiscardEvents();
    events[3] = {
      ...events[3] as Extract<CanonicalGameEvent, { type: "tile_discarded" }>,
      tile: canonicalTile("1m"),
      discardMode: "tedashi",
    };
    const states = reduceCanonicalEventStream(canonicalStream(events));
    const afterDraw = states[2]!;
    const afterDiscard = states[3]!;

    expect(afterDraw.privateState?.concealedTiles.map((tile) => tile.id))
      .toContain("1m");
    expect(afterDraw.privateState?.currentDraw?.tile.id).toBe("5p");
    expect(afterDiscard.privateState?.concealedTiles.map((tile) => tile.id))
      .toContain("5p");
    expect(afterDiscard.privateState?.concealedTiles.map((tile) => tile.id))
      .not.toContain("1m");
    expect(Object.isFrozen(afterDraw.publicState)).toBe(true);
    expect(Object.isFrozen(afterDraw.privateState?.concealedTiles)).toBe(true);
  });

  it("produces deterministic stream and prefix hashes", () => {
    const stream = canonicalStream(canonicalSelfDrawDiscardEvents());
    const first = reduceCanonicalEventStream(stream);
    const second = reduceCanonicalEventStream(JSON.parse(JSON.stringify(stream)));

    expect(first).toEqual(second);
    expect(new Set(first.map((state) => state.streamHash))).toHaveLength(1);
    expect(new Set(first.map((state) => state.streamPrefixHash)).size)
      .toBe(first.length);
    expect(first.every((state) => state.streamHash.startsWith("sha256:")))
      .toBe(true);
  });
});
