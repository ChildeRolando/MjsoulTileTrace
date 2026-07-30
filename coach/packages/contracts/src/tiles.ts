import { z } from "zod";

export const TileIdSchema = z.enum([
  "1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m",
  "1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p",
  "1s", "2s", "3s", "4s", "5s", "6s", "7s", "8s", "9s",
  "1z", "2z", "3z", "4z", "5z", "6z", "7z",
]);
export type TileId = z.infer<typeof TileIdSchema>;

export const TileSchema = z.object({
  id: TileIdSchema,
  red: z.boolean(),
}).strict().superRefine((tile, context) => {
  if (tile.red && !["5m", "5p", "5s"].includes(tile.id)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Only suited fives may be red",
      path: ["red"],
    });
  }
});
export type Tile = z.infer<typeof TileSchema>;

export const ActionIdSchema = z.string().regex(
  /^discard:(?:[1-9][mps]|5[mps]r|[1-7]z):(tsumogiri|tedashi)$/,
);
export type ActionId = z.infer<typeof ActionIdSchema>;
