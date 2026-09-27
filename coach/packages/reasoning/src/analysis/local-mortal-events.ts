import type { CanonicalEventStream } from "@riichi-coach/contracts";
import { formatMjaiTile } from "@riichi-coach/mortal-source";

export function projectLocalMortalEvent(stream: CanonicalEventStream, event: CanonicalEventStream["events"][number]): Record<string, unknown> | null {
  switch (event.type) {
    case "game_started": return { type: "start_game", names: ["p0", "p1", "p2", "p3"] };
    case "round_started": {
      const tehais = Array.from({ length: 4 }, (_, actor) => actor === stream.selfActor ? event.selfHand.map(formatMjaiTile) : Array(13).fill("?"));
      return { type: "start_kyoku", bakaze: event.roundWind, kyoku: event.hand, honba: event.honba, kyotaku: event.riichiSticks, oya: event.dealer, scores: event.scores, dora_marker: formatMjaiTile(event.doraIndicator), tehais };
    }
    case "tile_drawn": return { type: "tsumo", actor: event.actor, pai: event.tile.visibility === "visible" ? formatMjaiTile(event.tile.tile) : "?" };
    case "tile_discarded": return { type: "dahai", actor: event.actor, pai: formatMjaiTile(event.tile), tsumogiri: event.discardMode === "tsumogiri" };
    case "riichi_declared": return { type: "reach", actor: event.actor };
    case "riichi_accepted": return { type: "reach_accepted", actor: event.actor };
    case "chi_called":
    case "pon_called": return { type: event.type === "chi_called" ? "chi" : "pon", actor: event.actor, target: event.targetActor, pai: formatMjaiTile(event.calledTile), consumed: event.consumedTiles.map(formatMjaiTile) };
    case "daiminkan_called": return { type: "daiminkan", actor: event.actor, target: event.targetActor, pai: formatMjaiTile(event.calledTile), consumed: event.consumedTiles.map(formatMjaiTile) };
    case "ankan_declared": return { type: "ankan", actor: event.actor, consumed: event.tiles.map(formatMjaiTile) };
    case "kakan_declared": {
      const pon = stream.events.find((row) => row.eventId === event.upgradedPonEventRef);
      if (pon?.type !== "pon_called") throw new Error("mortal_protocol_invalid");
      return {
        type: "kakan", actor: event.actor, pai: formatMjaiTile(event.addedTile),
        consumed: [pon.calledTile, ...pon.consumedTiles].map(formatMjaiTile),
      };
    }
    case "dora_revealed": return { type: "dora", dora_marker: formatMjaiTile(event.indicator) };
    case "round_ended": return { type: "end_kyoku" };
    case "game_ended": return { type: "end_game" };
    default: return null;
  }
}
