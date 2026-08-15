import { z } from "zod";

// The CURRENT Mortal (mjai-reviewer) report contract, pinned 2026-08-15 from
// a fresh real result fetched live from the approved endpoint:
//
//   GET https://mjai.ekyu.moe/report/<16-hex>.json -> application/json
//
// Observed top-level shape (engine "Mortal", version string, reviewed seat
// `player_id` 0..3, `review.kyokus[].entries[]` decision rows with model
// candidates in `details[]`, and the full god-view `mjai_log`). `split_logs`
// (per-player Tenhou logs with names/ratings) is present on real reports
// but is deliberately NOT validated or projected — its content is private
// and unused.
//
// Only the fields M6 consumes are validated; every violation fails closed
// with report_schema_unsupported at the fetch boundary.

export const MORTAL_ADAPTER_VERSION = "mortal-source/1" as const;

const MjaiEventSchema = z.object({
  type: z.string().min(1),
}).passthrough();

const MjaiActionSchema = z.object({
  type: z.string().min(1),
}).passthrough();

const MortalDetailSchema = z.object({
  action: MjaiActionSchema,
  q_value: z.number().finite(),
  prob: z.number().min(0).max(1),
}).strict();

const MortalEntrySchema = z.object({
  junme: z.number().int().nonnegative(),
  tiles_left: z.number().int().nonnegative(),
  last_actor: z.number().int().min(0).max(3),
  tile: z.string().min(1),
  state: z.object({
    tehai: z.array(z.string().min(1)),
    fuuros: z.array(z.object({
      type: z.string().min(1),
    }).passthrough()),
  }).strict(),
  at_self_chi_pon: z.boolean(),
  at_self_riichi: z.boolean(),
  at_opponent_kakan: z.boolean(),
  expected: MjaiActionSchema,
  actual: MjaiActionSchema,
  is_equal: z.boolean(),
  details: z.array(MortalDetailSchema).min(1),
  shanten: z.number().int().nonnegative(),
  at_furiten: z.boolean(),
  actual_index: z.number().int().nonnegative(),
}).strict();

const MortalKyokuSchema = z.object({
  kyoku: z.number().int().nonnegative(),
  honba: z.number().int().nonnegative(),
  end_status: z.array(z.unknown()),
  relative_scores: z.array(z.unknown()),
  entries: z.array(MortalEntrySchema),
}).strict();

export const MortalReportSchema = z.object({
  engine: z.literal("Mortal"),
  version: z.string().min(1),
  player_id: z.number().int().min(0).max(3),
  review: z.object({
    model_tag: z.string().min(1),
    kyokus: z.array(MortalKyokuSchema).min(1),
  }).passthrough(),
  mjai_log: z.array(MjaiEventSchema).min(1),
}).passthrough();

export type RawMortalReport = z.infer<typeof MortalReportSchema>;
