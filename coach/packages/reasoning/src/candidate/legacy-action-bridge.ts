import {
  ActionIdSchema,
  RiichiActionSchema,
  type ActionId,
  type RiichiAction,
  type Tile,
} from "@riichi-coach/contracts";

const LEGACY_DISCARD =
  /^discard:(5[mps]r|[1-9][mps]|[1-7]z):(tsumogiri|tedashi)$/;

export function legacyDiscardActionIdToAction(
  rawActionId: ActionId,
): RiichiAction {
  const actionId = ActionIdSchema.parse(rawActionId);
  const match = LEGACY_DISCARD.exec(actionId);
  if (match === null) {
    throw new Error(`Invalid legacy discard action: ${actionId}`);
  }
  const encodedTile = match[1]!;
  const red = encodedTile.endsWith("r");
  const id = red ? encodedTile.slice(0, -1) : encodedTile;
  return RiichiActionSchema.parse({
    kind: "discard",
    tile: { id: id as Tile["id"], red },
    discardMode: match[2],
  });
}

export type LegacyDiscardBridgeResult =
  | { status: "ready"; actionId: ActionId }
  | { status: "unsupported"; actionKind: RiichiAction["kind"] };

export function actionToLegacyDiscardActionId(
  rawAction: RiichiAction,
): LegacyDiscardBridgeResult {
  const action = RiichiActionSchema.parse(rawAction);
  if (action.kind !== "discard") {
    return { status: "unsupported", actionKind: action.kind };
  }
  const tile = `${action.tile.id}${action.tile.red ? "r" : ""}`;
  return {
    status: "ready",
    actionId: ActionIdSchema.parse(
      `discard:${tile}:${action.discardMode}`,
    ),
  };
}
