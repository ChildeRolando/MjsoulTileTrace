import { z } from "zod";
import { TileSchema } from "./tiles.js";

export const RiverDiscardSchema = z.object({
  tile: TileSchema,
  actor: z.number().int().min(0).max(3),
  tsumogiri: z.boolean(),
  eventId: z.string(),
  afterRiichiEventIds: z.array(z.string()),
});

export const ThreatStateSchema = z.object({
  actor: z.number().int().min(0).max(3),
  riichi: z.boolean(),
  declarationEventId: z.string().nullable(),
  ippatsuAlive: z.boolean().nullable(),
});

export const MissingSceneDataSchema = z.enum([
  "meld_state",
  "furiten_state",
  "legal_actions",
  "remaining_tiles",
  "called_discard_markers",
  "kan_dora_state",
]);

export const SceneSnapshotSchema = z.object({
  decisionEventId: z.string(),
  selfActor: z.number().int().min(0).max(3),
  bakaze: z.enum(["E", "S"]),
  kyoku: z.number().int().min(1).max(4),
  honba: z.number().int().nonnegative(),
  kyotaku: z.number().int().nonnegative(),
  oya: z.number().int().min(0).max(3),
  scores: z.array(z.number().int()).length(4),
  doraMarkers: z.array(TileSchema),
  selfHand: z.array(TileSchema),
  currentDraw: TileSchema.nullable(),
  rivers: z.array(z.array(RiverDiscardSchema)).length(4),
  threats: z.array(ThreatStateSchema).length(4),
  eventIds: z.array(z.string()),
  complete: z.boolean(),
  missingData: z.array(MissingSceneDataSchema),
}).strict();
export type SceneSnapshot = z.infer<typeof SceneSnapshotSchema>;
