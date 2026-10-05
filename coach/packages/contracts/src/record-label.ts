import { z } from "zod";

const SeatSchema = z.number().int().min(0).max(3);

/** Local display metadata for a saved review. It is never analysis evidence. */
export const RecordLabelPlayerSchema = z.object({
  seat: SeatSchema,
  displayName: z.string().min(1).max(64).nullable(),
  finalScore: z.number().int().min(-2_147_483_648).max(2_147_483_647).nullable(),
  rank: z.number().int().min(1).max(4).nullable(),
  gradingScore: z.number().int().min(-2_147_483_648).max(2_147_483_647).nullable().default(null),
  gradingScoreUnit: z.enum(["dan_pt", "soul_pearl", "unknown"]).nullable().default(null),
}).strict();
export type RecordLabelPlayer = z.infer<typeof RecordLabelPlayerSchema>;

export const RecordLabelMortalAgreementSchema = z.object({
  agreementCount: z.number().int().nonnegative().max(10_000_000),
  scoredDecisionCount: z.number().int().nonnegative().max(10_000_000),
}).strict().superRefine((value, context) => {
  if (value.agreementCount > value.scoredDecisionCount) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Mortal agreement count cannot exceed its denominator",
      path: ["agreementCount"],
    });
  }
});
export type RecordLabelMortalAgreement = z.infer<typeof RecordLabelMortalAgreementSchema>;

/** Small renderer-safe label; raw records, share URLs, and account data stay out. */
export const RecordLabelSchema = z.object({
  title: z.string().min(1).max(180),
  recordId: z.string().min(1).max(128).nullable(),
  selfSeat: SeatSchema.nullable(),
  startedAt: z.number().int().nonnegative().nullable(),
  players: z.array(RecordLabelPlayerSchema).length(4),
  rankedMode: z.object({
    id: z.number().int().min(0).max(0xffff_ffff),
    label: z.string().min(1).max(64).nullable(),
  }).strict().nullable().default(null),
  mortalAgreementStatus: z.enum(["pending", "ready", "unavailable", "not_applicable"]).default("pending"),
  mortalAgreement: RecordLabelMortalAgreementSchema.nullable().default(null),
}).strict().superRefine((value, context) => {
  if ((value.mortalAgreementStatus === "ready") !== (value.mortalAgreement !== null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Mortal agreement status must match its statistics",
      path: ["mortalAgreement"],
    });
  }
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
