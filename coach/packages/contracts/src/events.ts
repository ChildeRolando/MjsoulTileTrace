import { z } from "zod";
import { TileSchema } from "./tiles.js";

const BaseEventSchema = z.object({ eventId: z.string().min(1) });

export const NormalizedEventSchema = z.union([
  BaseEventSchema.extend({
    type: z.literal("start_game"),
    playerCount: z.literal(4),
  }),
  BaseEventSchema.extend({
    type: z.literal("start_kyoku"),
    bakaze: z.enum(["E", "S"]),
    kyoku: z.number().int().min(1).max(4),
    honba: z.number().int().nonnegative(),
    kyotaku: z.number().int().nonnegative(),
    oya: z.number().int().min(0).max(3),
    scores: z.array(z.number().int()).length(4),
    doraMarker: TileSchema,
    selfHand: z.array(TileSchema).length(13),
  }),
  BaseEventSchema.extend({
    type: z.literal("tsumo"),
    actor: z.number().int().min(0).max(3),
    tile: TileSchema,
  }),
  BaseEventSchema.extend({
    type: z.literal("dahai"),
    actor: z.number().int().min(0).max(3),
    tile: TileSchema,
    tsumogiri: z.boolean(),
  }),
  BaseEventSchema.extend({
    type: z.literal("reach"),
    actor: z.number().int().min(0).max(3),
  }),
  BaseEventSchema.extend({
    type: z.literal("reach_accepted"),
    actor: z.number().int().min(0).max(3),
  }),
  ...(["chi", "pon", "daiminkan", "ankan", "kakan"] as const).map((type) =>
    BaseEventSchema.extend({
      type: z.literal(type),
      actor: z.number().int().min(0).max(3),
      target: z.number().int().min(0).max(3).nullable(),
      tile: TileSchema,
      consumed: z.array(TileSchema),
    })
  ),
  BaseEventSchema.extend({ type: z.literal("end_kyoku") }),
  BaseEventSchema.extend({ type: z.literal("end_game") }),
]);
export type NormalizedEvent = z.infer<typeof NormalizedEventSchema>;
