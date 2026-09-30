import type { CanonicalGameEvent, Tile } from "@riichi-coach/contracts";
import { canonicalStartEvents, canonicalStream, canonicalTile } from "./canonical-stream.js";

export function acceptedRiichiKanStream(hand: readonly Tile[], draw: Tile, actual: "discard" | "ankan") {
  const events: CanonicalGameEvent[] = [...canonicalStartEvents(hand)];
  const add = (event: Record<string, unknown>) => {
    const index = events.length;
    events.push({ ...event, eventId: `game:fixture/0/${index}/0`, sourceRecordRef: `record:${index}` } as CanonicalGameEvent);
  };
  add({ type: "tile_drawn", actor: 0, tile: { visibility: "visible", tile: canonicalTile("9m") }, from: "live_wall" });
  add({ type: "riichi_declared", actor: 0 });
  add({ type: "tile_discarded", actor: 0, tile: canonicalTile("9m"), discardMode: "tsumogiri", riichiDeclarationEventRef: events[3]!.eventId });
  add({ type: "riichi_accepted", actor: 0, declarationEventRef: events[3]!.eventId });
  for (const [seat, id] of ["2z", "3z", "4z"].entries()) {
    add({ type: "tile_drawn", actor: seat + 1, tile: { visibility: "hidden" }, from: "live_wall" });
    add({ type: "tile_discarded", actor: seat + 1, tile: canonicalTile(id as Tile["id"]), discardMode: "tsumogiri", riichiDeclarationEventRef: null });
  }
  add({ type: "tile_drawn", actor: 0, tile: { visibility: "visible", tile: draw }, from: "live_wall" });
  if (actual === "discard") add({ type: "tile_discarded", actor: 0, tile: draw, discardMode: "tsumogiri", riichiDeclarationEventRef: null });
  else add({ type: "ankan_declared", actor: 0, tiles: [draw, draw, draw, draw] });
  return canonicalStream(events);
}
