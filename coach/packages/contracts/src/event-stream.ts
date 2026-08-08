import { z } from "zod";
import { sortTilesCanonical } from "./actions.js";
import { TileSchema, type Tile } from "./tiles.js";

export const CANONICAL_EVENT_SCHEMA_VERSION =
  "canonical-riichi-events/v2" as const;

const ActorSchema = z.number().int().min(0).max(3);
const EventRefSchema = z.string().min(1);
const NonEmptyRefSchema = z.string().min(1);
const ScoresSchema = z.tuple([
  z.number().int(),
  z.number().int(),
  z.number().int(),
  z.number().int(),
]);
const KnownBooleanSchema = z.union([z.boolean(), z.literal("unknown")]);
const KnownRedCountSchema = z.union([
  z.number().int().min(0).max(1),
  z.literal("unknown"),
]);

export const CanonicalSourceKindSchema = z.enum([
  "mahjong_soul",
  "mjai",
  "user_asserted",
  "fixture",
]);
export type CanonicalSourceKind = z.infer<typeof CanonicalSourceKindSchema>;

export const RuleSetV2Schema = z.object({
  length: z.enum(["east", "south", "unknown"]),
  redFives: z.object({
    man: KnownRedCountSchema,
    pin: KnownRedCountSchema,
    sou: KnownRedCountSchema,
  }).strict(),
  openTanyao: KnownBooleanSchema,
  atamahane: KnownBooleanSchema,
  westExtension: z.enum(["none", "sudden_death", "fixed", "unknown"]),
  ippatsuCancelledByAnkan: KnownBooleanSchema,
}).strict();
export type RuleSetV2 = z.infer<typeof RuleSetV2Schema>;

const BaseEventShape = {
  eventId: EventRefSchema,
  sourceRecordRef: NonEmptyRefSchema,
};

const VisibleDrawSchema = z.object({
  visibility: z.literal("visible"),
  tile: TileSchema,
}).strict();
const HiddenDrawSchema = z.object({
  visibility: z.literal("hidden"),
}).strict();
export const DrawTileVisibilitySchema = z.discriminatedUnion("visibility", [
  VisibleDrawSchema,
  HiddenDrawSchema,
]);
export type DrawTileVisibility = z.infer<typeof DrawTileVisibilitySchema>;

const GameStartedEventSchema = z.object({
  ...BaseEventShape,
  type: z.literal("game_started"),
}).strict();

const RoundStartedEventSchema = z.object({
  ...BaseEventShape,
  type: z.literal("round_started"),
  roundOrdinal: z.number().int().nonnegative(),
  roundWind: z.enum(["E", "S", "W"]),
  hand: z.number().int().min(1).max(4),
  honba: z.number().int().nonnegative(),
  riichiSticks: z.number().int().nonnegative(),
  dealer: ActorSchema,
  scores: ScoresSchema,
  doraIndicator: TileSchema,
  selfHand: z.array(TileSchema).length(13),
  remainingDraws: z.number().int().nonnegative().nullable(),
}).strict();

const TileDrawnEventSchema = z.object({
  ...BaseEventShape,
  type: z.literal("tile_drawn"),
  actor: ActorSchema,
  tile: DrawTileVisibilitySchema,
  from: z.enum(["live_wall", "rinshan"]),
}).strict();

const TileDiscardedEventSchema = z.object({
  ...BaseEventShape,
  type: z.literal("tile_discarded"),
  actor: ActorSchema,
  tile: TileSchema,
  discardMode: z.enum(["tsumogiri", "tedashi"]),
  riichiDeclarationEventRef: EventRefSchema.nullable(),
}).strict();

const RiichiDeclaredEventSchema = z.object({
  ...BaseEventShape,
  type: z.literal("riichi_declared"),
  actor: ActorSchema,
}).strict();

const RiichiAcceptedEventSchema = z.object({
  ...BaseEventShape,
  type: z.literal("riichi_accepted"),
  actor: ActorSchema,
  declarationEventRef: EventRefSchema,
}).strict();

const ChiCalledEventSchema = z.object({
  ...BaseEventShape,
  type: z.literal("chi_called"),
  actor: ActorSchema,
  targetActor: ActorSchema,
  calledTile: TileSchema,
  consumedTiles: z.tuple([TileSchema, TileSchema]),
  calledDiscardEventRef: EventRefSchema,
}).strict();

const PonCalledEventSchema = z.object({
  ...BaseEventShape,
  type: z.literal("pon_called"),
  actor: ActorSchema,
  targetActor: ActorSchema,
  calledTile: TileSchema,
  consumedTiles: z.tuple([TileSchema, TileSchema]),
  calledDiscardEventRef: EventRefSchema,
}).strict();

const DaiminkanCalledEventSchema = z.object({
  ...BaseEventShape,
  type: z.literal("daiminkan_called"),
  actor: ActorSchema,
  targetActor: ActorSchema,
  calledTile: TileSchema,
  consumedTiles: z.tuple([TileSchema, TileSchema, TileSchema]),
  calledDiscardEventRef: EventRefSchema,
}).strict();

const AnkanDeclaredEventSchema = z.object({
  ...BaseEventShape,
  type: z.literal("ankan_declared"),
  actor: ActorSchema,
  tiles: z.tuple([TileSchema, TileSchema, TileSchema, TileSchema]),
}).strict();

const KakanDeclaredEventSchema = z.object({
  ...BaseEventShape,
  type: z.literal("kakan_declared"),
  actor: ActorSchema,
  addedTile: TileSchema,
  upgradedPonEventRef: EventRefSchema,
}).strict();

const DoraRevealedEventSchema = z.object({
  ...BaseEventShape,
  type: z.literal("dora_revealed"),
  indicator: TileSchema,
  kanEventRef: EventRefSchema.nullable(),
}).strict();

const WinDeclaredEventSchema = z.object({
  ...BaseEventShape,
  type: z.literal("win_declared"),
  winnerActor: ActorSchema,
  targetActor: ActorSchema.nullable(),
  method: z.enum(["ron", "tsumo"]),
  winningTile: TileSchema,
  winSourceEventRef: EventRefSchema,
  scoreDeltas: ScoresSchema.nullable(),
}).strict();

const RoundDrawnEventSchema = z.object({
  ...BaseEventShape,
  type: z.literal("round_drawn"),
  reason: z.enum([
    "exhaustive",
    "kyuushu_kyuuhai",
    "suufon_renda",
    "suucha_riichi",
    "suukaikan",
    "sancha_hou",
    "nagashi_mangan",
  ]),
  tenpaiActors: z.array(ActorSchema).max(4),
}).strict();

const ScoresUpdatedEventSchema = z.object({
  ...BaseEventShape,
  type: z.literal("scores_updated"),
  scores: ScoresSchema,
  settlementEventRef: EventRefSchema,
}).strict();

const RoundEndedEventSchema = z.object({
  ...BaseEventShape,
  type: z.literal("round_ended"),
  terminalEventRef: EventRefSchema,
}).strict();

const GameEndedEventSchema = z.object({
  ...BaseEventShape,
  type: z.literal("game_ended"),
  scores: ScoresSchema,
}).strict();

const CanonicalGameEventObjectSchema = z.discriminatedUnion("type", [
  GameStartedEventSchema,
  RoundStartedEventSchema,
  TileDrawnEventSchema,
  TileDiscardedEventSchema,
  RiichiDeclaredEventSchema,
  RiichiAcceptedEventSchema,
  ChiCalledEventSchema,
  PonCalledEventSchema,
  DaiminkanCalledEventSchema,
  AnkanDeclaredEventSchema,
  KakanDeclaredEventSchema,
  DoraRevealedEventSchema,
  WinDeclaredEventSchema,
  RoundDrawnEventSchema,
  ScoresUpdatedEventSchema,
  RoundEndedEventSchema,
  GameEndedEventSchema,
]);

function sameTileId(tiles: readonly Tile[]): boolean {
  return tiles.every((tile) => tile.id === tiles[0]?.id);
}

function canonicalOrder(tiles: readonly Tile[]): boolean {
  const sorted = sortTilesCanonical(tiles);
  return tiles.every((tile, index) =>
    tile.id === sorted[index]?.id && tile.red === sorted[index]?.red
  );
}

function chiSequence(tiles: readonly Tile[]): boolean {
  if (tiles.length !== 3 || tiles.some((tile) => tile.id.endsWith("z"))) {
    return false;
  }
  const suits = new Set(tiles.map((tile) => tile.id[1]));
  const ranks = [...new Set(tiles.map((tile) => Number(tile.id[0])))]
    .sort((left, right) => left - right);
  return suits.size === 1 && ranks.length === 3 &&
    ranks[1] === ranks[0]! + 1 && ranks[2] === ranks[1]! + 1;
}

export const CanonicalGameEventSchema = CanonicalGameEventObjectSchema
  .superRefine((event, context) => {
    if (
      event.type === "round_drawn" &&
      new Set(event.tenpaiActors).size !== event.tenpaiActors.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Tenpai actors must be unique",
        path: ["tenpaiActors"],
      });
    }
    if (event.type === "chi_called") {
      if (!chiSequence([event.calledTile, ...event.consumedTiles])) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Chi event tiles must form one suited sequence",
          path: ["consumedTiles"],
        });
      }
      if (!canonicalOrder(event.consumedTiles)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Consumed tiles must use canonical order",
          path: ["consumedTiles"],
        });
      }
    }
    if (event.type === "pon_called" || event.type === "daiminkan_called") {
      if (!sameTileId([event.calledTile, ...event.consumedTiles])) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${event.type} tiles must have the same tile ID`,
          path: ["consumedTiles"],
        });
      }
      if (!canonicalOrder(event.consumedTiles)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Consumed tiles must use canonical order",
          path: ["consumedTiles"],
        });
      }
    }
    if (event.type === "ankan_declared") {
      if (!sameTileId(event.tiles)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Ankan event tiles must have the same tile ID",
          path: ["tiles"],
        });
      }
      if (!canonicalOrder(event.tiles)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Ankan tiles must use canonical order",
          path: ["tiles"],
        });
      }
    }
    if (event.type === "win_declared") {
      if (
        (event.method === "tsumo") !== (event.targetActor === null)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Tsumo must have no target and ron must have a target",
          path: ["targetActor"],
        });
      }
      if (event.targetActor === event.winnerActor) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Winner cannot target self",
          path: ["targetActor"],
        });
      }
    }
  });
export type CanonicalGameEvent = z.infer<typeof CanonicalGameEventSchema>;

export const CanonicalEventStreamSchema = z.object({
  schemaVersion: z.literal(CANONICAL_EVENT_SCHEMA_VERSION),
  mapperVersion: z.string().min(1),
  gameId: z.string().min(1),
  sourceKind: CanonicalSourceKindSchema,
  sourceRecordHash: z.string().min(1),
  playerCount: z.literal(4),
  selfActor: ActorSchema,
  ruleSet: RuleSetV2Schema,
  events: z.array(CanonicalGameEventSchema).min(1),
}).strict().superRefine((stream, context) => {
  if (stream.events[0]?.type !== "game_started") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Canonical stream must begin with game_started",
      path: ["events", 0],
    });
  }
  const eventIds = stream.events.map((event) => event.eventId);
  if (new Set(eventIds).size !== eventIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Canonical event IDs must be unique",
      path: ["events"],
    });
  }
  stream.events.forEach((event, index) => {
    if (event.type !== "tile_drawn") return;
    if (event.actor !== stream.selfActor && event.tile.visibility === "visible") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only the self actor may expose a private draw",
        path: ["events", index, "tile"],
      });
    }
    if (event.actor === stream.selfActor && event.tile.visibility === "hidden") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Self draws must expose the tile",
        path: ["events", index, "tile"],
      });
    }
  });
});
export type CanonicalEventStream = z.infer<typeof CanonicalEventStreamSchema>;
