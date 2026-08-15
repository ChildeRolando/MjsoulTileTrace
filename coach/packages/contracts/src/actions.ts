import { z } from "zod";
import { TileSchema, type Tile } from "./tiles.js";

const ActorSchema = z.number().int().min(0).max(3);
const EventRefSchema = z.string().min(1);
const MeldRefSchema = z.string().min(1);
const DiscardModeSchema = z.enum(["tsumogiri", "tedashi"]);

const DiscardActionSchema = z.object({
  kind: z.literal("discard"),
  tile: TileSchema,
  discardMode: DiscardModeSchema,
}).strict();

const RiichiDiscardActionSchema = z.object({
  kind: z.literal("riichi_discard"),
  tile: TileSchema,
  discardMode: DiscardModeSchema,
}).strict();

const ChiActionSchema = z.object({
  kind: z.literal("chi"),
  calledTile: TileSchema,
  consumedTiles: z.tuple([TileSchema, TileSchema]),
  targetActor: ActorSchema,
  responseEventRef: EventRefSchema,
}).strict();

const PonActionSchema = z.object({
  kind: z.literal("pon"),
  calledTile: TileSchema,
  consumedTiles: z.tuple([TileSchema, TileSchema]),
  targetActor: ActorSchema,
  responseEventRef: EventRefSchema,
}).strict();

const DaiminkanActionSchema = z.object({
  kind: z.literal("daiminkan"),
  calledTile: TileSchema,
  consumedTiles: z.tuple([TileSchema, TileSchema, TileSchema]),
  targetActor: ActorSchema,
  responseEventRef: EventRefSchema,
}).strict();

const AnkanActionSchema = z.object({
  kind: z.literal("ankan"),
  tiles: z.tuple([TileSchema, TileSchema, TileSchema, TileSchema]),
}).strict();

const KakanActionSchema = z.object({
  kind: z.literal("kakan"),
  addedTile: TileSchema,
  existingMeldRef: MeldRefSchema,
}).strict();

const TsumoActionSchema = z.object({
  kind: z.literal("tsumo"),
  winningTile: TileSchema,
  drawEventRef: EventRefSchema,
}).strict();

const RonActionSchema = z.object({
  kind: z.literal("ron"),
  winningTile: TileSchema,
  targetActor: ActorSchema,
  responseEventRef: EventRefSchema,
  winContext: z.enum(["discard", "kakan", "ankan"]),
}).strict();

const KyuushuKyuuhaiActionSchema = z.object({
  kind: z.literal("kyuushu_kyuuhai"),
  drawEventRef: EventRefSchema,
}).strict();

const PassActionSchema = z.object({
  kind: z.literal("pass"),
  responseEventRef: EventRefSchema,
  responseKind: z.enum(["discard", "kakan", "ankan"]),
}).strict();

// M6-A3 (ADR-0001): the MODEL-side riichi alternative is tile-less — Mortal's
// action space has a single riichi index and the mjai reach event carries no
// tile, so the discard realization is structurally unrecoverable. This kind is
// candidate-only; the actual side always uses the concrete riichi_discard with
// the tile taken from local canonical events.
const DeclareRiichiActionSchema = z.object({
  kind: z.literal("declare_riichi"),
}).strict();

const RiichiActionObjectSchema = z.discriminatedUnion("kind", [
  DiscardActionSchema,
  RiichiDiscardActionSchema,
  DeclareRiichiActionSchema,
  ChiActionSchema,
  PonActionSchema,
  DaiminkanActionSchema,
  AnkanActionSchema,
  KakanActionSchema,
  TsumoActionSchema,
  RonActionSchema,
  KyuushuKyuuhaiActionSchema,
  PassActionSchema,
]);

function tileOrder(tile: Tile): number {
  const suit = tile.id[1] as "m" | "p" | "s" | "z";
  const suitOffset = { m: 0, p: 9, s: 18, z: 27 }[suit];
  return suitOffset * 2 + (Number(tile.id[0]) - 1) * 2 + Number(tile.red);
}

export function sortTilesCanonical<T extends readonly Tile[]>(tiles: T): T {
  return [...tiles].sort((left, right) =>
    tileOrder(left) - tileOrder(right)
  ) as unknown as T;
}

function isCanonicalTileOrder(tiles: readonly Tile[]): boolean {
  const sorted = sortTilesCanonical(tiles);
  return tiles.every((tile, index) =>
    tile.id === sorted[index]!.id && tile.red === sorted[index]!.red
  );
}

function sameTileId(tiles: readonly Tile[]): boolean {
  return tiles.every((tile) => tile.id === tiles[0]!.id);
}

function sameTile(left: Tile, right: Tile): boolean {
  return left.id === right.id && left.red === right.red;
}

function isChiSequence(action: z.infer<typeof ChiActionSchema>): boolean {
  const tiles = [action.calledTile, ...action.consumedTiles];
  if (tiles.some((tile) => tile.id.endsWith("z"))) {
    return false;
  }
  const suits = new Set(tiles.map((tile) => tile.id[1]));
  const ranks = [...new Set(tiles.map((tile) => Number(tile.id[0])))].sort(
    (left, right) => left - right,
  );
  return suits.size === 1 &&
    ranks.length === 3 &&
    ranks[1] === ranks[0]! + 1 &&
    ranks[2] === ranks[1]! + 1;
}

export const RiichiActionSchema = RiichiActionObjectSchema.superRefine(
  (action, context) => {
    if (action.kind === "chi" && !isChiSequence(action)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Chi tiles must form one suited consecutive sequence",
        path: ["consumedTiles"],
      });
    }
    if (
      (action.kind === "pon" || action.kind === "daiminkan") &&
      !sameTileId([action.calledTile, ...action.consumedTiles])
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${action.kind} tiles must have the same tile ID`,
        path: ["consumedTiles"],
      });
    }
    if (action.kind === "ankan" && !sameTileId(action.tiles)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Ankan tiles must have the same tile ID",
        path: ["tiles"],
      });
    }
    if (
      (action.kind === "chi" ||
        action.kind === "pon" ||
        action.kind === "daiminkan") &&
      !isCanonicalTileOrder(action.consumedTiles)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Consumed tiles must use canonical tile order",
        path: ["consumedTiles"],
      });
    }
    if (action.kind === "ankan" && !isCanonicalTileOrder(action.tiles)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Ankan tiles must use canonical tile order",
        path: ["tiles"],
      });
    }
  },
);
export type RiichiAction = z.infer<typeof RiichiActionSchema>;
export type RiichiActionKind = RiichiAction["kind"];

const SelfTurnWindowSchema = z.object({
  kind: z.literal("self_turn"),
  actor: ActorSchema.nullable(),
  triggerEventRef: EventRefSchema,
}).strict();

const DiscardResponseWindowSchema = z.object({
  kind: z.literal("discard_response"),
  actor: ActorSchema.nullable(),
  triggerEventRef: EventRefSchema,
  sourceActor: ActorSchema.nullable(),
  offeredTile: TileSchema,
}).strict();

const KanResponseWindowSchema = z.object({
  kind: z.literal("kan_response"),
  actor: ActorSchema.nullable(),
  triggerEventRef: EventRefSchema,
  sourceActor: ActorSchema.nullable(),
  offeredTile: TileSchema,
  kanKind: z.enum(["kakan", "ankan"]),
}).strict();

const PostCallDiscardWindowSchema = z.object({
  kind: z.literal("post_call_discard"),
  actor: ActorSchema.nullable(),
  triggerEventRef: EventRefSchema,
}).strict();

// M6-A3: the declaration turn's discard decision, frozen at the riichi
// declaration event — before the same-turn discard. The snapshot still holds
// the turn's draw and a declared (not yet accepted) riichi state, which is
// the identity of Mortal's same-turn post-riichi dahai entry.
const PostRiichiDiscardWindowSchema = z.object({
  kind: z.literal("post_riichi_discard"),
  actor: ActorSchema.nullable(),
  triggerEventRef: EventRefSchema,
}).strict();

export const DecisionWindowSchema = z.discriminatedUnion("kind", [
  SelfTurnWindowSchema,
  DiscardResponseWindowSchema,
  KanResponseWindowSchema,
  PostCallDiscardWindowSchema,
  PostRiichiDiscardWindowSchema,
]).superRefine((window, context) => {
  if (
    (window.kind === "discard_response" ||
      window.kind === "kan_response") &&
    window.actor !== null &&
    window.sourceActor !== null &&
    window.actor === window.sourceActor
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Response window actor cannot equal source actor",
      path: ["sourceActor"],
    });
  }
});
export type DecisionWindow = z.infer<typeof DecisionWindowSchema>;

const allowedKinds: Record<DecisionWindow["kind"], readonly RiichiActionKind[]> = {
  self_turn: [
    "discard",
    "riichi_discard",
    "declare_riichi",
    "ankan",
    "kakan",
    "tsumo",
    "kyuushu_kyuuhai",
  ],
  discard_response: ["chi", "pon", "daiminkan", "ron", "pass"],
  kan_response: ["ron", "pass"],
  // Riichi requires a concealed hand, and a chi/pon call opens it for the
  // rest of the round — so no riichi action can appear in a post-call
  // window. Only the plain discard remains, and it is always tedashi (no
  // draw exists in this window).
  post_call_discard: ["discard"],
  // Riichi is declared (not yet accepted) at this window: the same-turn
  // discard is locked to the drawn/kept tile, so only the plain discard
  // remains — the declaration itself already happened.
  post_riichi_discard: ["discard"],
};

export type ActionWindowConflictCode =
  | "action_not_allowed_in_window"
  | "post_call_discard_requires_tedashi"
  | "response_event_mismatch"
  | "response_kind_mismatch"
  | "response_target_self"
  | "response_source_actor_mismatch"
  | "response_tile_mismatch"
  | "draw_event_mismatch";

export function actionWindowConflictCodes(
  action: RiichiAction,
  window: DecisionWindow,
): ActionWindowConflictCode[] {
  const conflicts: ActionWindowConflictCode[] = [];
  if (!allowedKinds[window.kind].includes(action.kind)) {
    conflicts.push("action_not_allowed_in_window");
    return conflicts;
  }
  if (
    window.kind === "post_call_discard" &&
    action.kind === "discard" &&
    action.discardMode !== "tedashi"
  ) {
    conflicts.push("post_call_discard_requires_tedashi");
  }
  if (
    (action.kind === "chi" ||
      action.kind === "pon" ||
      action.kind === "daiminkan" ||
      action.kind === "ron" ||
      action.kind === "pass") &&
    action.responseEventRef !== window.triggerEventRef
  ) {
    conflicts.push("response_event_mismatch");
  }
  if (
    (action.kind === "tsumo" || action.kind === "kyuushu_kyuuhai") &&
    action.drawEventRef !== window.triggerEventRef
  ) {
    conflicts.push("draw_event_mismatch");
  }
  if (
    (window.kind === "discard_response" ||
      window.kind === "kan_response") &&
    (action.kind === "chi" ||
      action.kind === "pon" ||
      action.kind === "daiminkan" ||
      action.kind === "ron")
  ) {
    if (window.actor !== null && action.targetActor === window.actor) {
      conflicts.push("response_target_self");
    }
    if (
      window.sourceActor !== null &&
      action.targetActor !== window.sourceActor
    ) {
      conflicts.push("response_source_actor_mismatch");
    }
    const responseTile =
      action.kind === "ron" ? action.winningTile : action.calledTile;
    if (!sameTile(responseTile, window.offeredTile)) {
      conflicts.push("response_tile_mismatch");
    }
  }
  if (action.kind === "ron") {
    const expected =
      window.kind === "discard_response"
        ? "discard"
        : window.kind === "kan_response"
          ? window.kanKind
          : null;
    if (action.winContext !== expected) {
      conflicts.push("response_kind_mismatch");
    }
  }
  if (action.kind === "pass") {
    const expected =
      window.kind === "discard_response"
        ? "discard"
        : window.kind === "kan_response"
          ? window.kanKind
          : null;
    if (action.responseKind !== expected) {
      conflicts.push("response_kind_mismatch");
    }
  }
  return conflicts;
}
