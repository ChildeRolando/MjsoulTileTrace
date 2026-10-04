import { z } from "zod";

const SeatSchema = z.number().int().min(0).max(3);

/** Local display metadata for a saved review. It is never analysis evidence. */
export const RecordLabelPlayerSchema = z.object({
  seat: SeatSchema,
  displayName: z.string().min(1).max(64).nullable(),
  finalScore: z.number().int().min(-2_147_483_648).max(2_147_483_647).nullable(),
  rank: z.number().int().min(1).max(4).nullable(),
}).strict();
export type RecordLabelPlayer = z.infer<typeof RecordLabelPlayerSchema>;

/** Small renderer-safe label; raw records, share URLs, and account data stay out. */
export const RecordLabelSchema = z.object({
  title: z.string().min(1).max(180),
  recordId: z.string().min(1).max(128).nullable(),
  selfSeat: SeatSchema.nullable(),
  startedAt: z.number().int().nonnegative().nullable(),
  players: z.array(RecordLabelPlayerSchema).length(4),
}).strict().superRefine((value, context) => {
  if (value.players.some((player, index) => player.seat !== index)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "record label players must be ordered by seat",
      path: ["players"],
    });
  }
  const knownRanks = value.players.flatMap(player => player.rank === null ? [] : [player.rank]);
  if (new Set(knownRanks).size !== knownRanks.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "record label ranks must be unique when known",
      path: ["players"],
    });
  }
});
export type RecordLabel = z.infer<typeof RecordLabelSchema>;
