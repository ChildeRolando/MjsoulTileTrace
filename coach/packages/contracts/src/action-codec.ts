import { ActionRefSchema, type ActionRef } from "./comparison.js";
import {
  RiichiActionSchema,
  type RiichiAction,
} from "./actions.js";
import type { Tile } from "./tiles.js";

type CanonicalTileTuple = readonly [Tile["id"], boolean];
type CanonicalActionTuple = readonly unknown[];

function tileTuple(tile: Tile): CanonicalTileTuple {
  return [tile.id, tile.red];
}

export function canonicalActionTuple(
  rawAction: RiichiAction,
): CanonicalActionTuple {
  const action = RiichiActionSchema.parse(rawAction);
  switch (action.kind) {
    case "discard":
    case "riichi_discard":
      return [action.kind, tileTuple(action.tile), action.discardMode];
    case "chi":
    case "pon":
    case "daiminkan":
      return [
        action.kind,
        tileTuple(action.calledTile),
        action.consumedTiles.map(tileTuple),
        action.targetActor,
        action.responseEventRef,
      ];
    case "ankan":
      return [action.kind, action.tiles.map(tileTuple)];
    case "kakan":
      return [
        action.kind,
        tileTuple(action.addedTile),
        action.existingMeldRef,
      ];
    case "tsumo":
      return [action.kind, tileTuple(action.winningTile), action.drawEventRef];
    case "ron":
      return [
        action.kind,
        tileTuple(action.winningTile),
        action.targetActor,
        action.responseEventRef,
        action.winContext,
      ];
    case "kyuushu_kyuuhai":
      return [action.kind, action.drawEventRef];
    case "pass":
      return [action.kind, action.responseEventRef, action.responseKind];
  }
}

export function canonicalActionRef(rawAction: RiichiAction): ActionRef {
  const encoded = encodeURIComponent(
    JSON.stringify(canonicalActionTuple(rawAction)),
  );
  return ActionRefSchema.parse(`action:v1:${encoded}`);
}
