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

// M6-A4.0: bumped from mortal-source/1 — the projection now retains response
// entries (last_actor != player_id), so every cached pre-A4.0 projected report
// is stale by construction (it is missing the response rows).
export const MORTAL_ADAPTER_VERSION = "mortal-source/2" as const;

const MjaiEventSchema = z.object({
  type: z.string().min(1),
}).passthrough();

const MjaiActionSchema = z.object({
  type: z.string().min(1),
}).passthrough();

// state.fuuros items: the authoritative mjai-reviewer Fuuro serialization
// (src/state.rs, #[serde(tag = "type")] with snake_case variants, pinned
// 2026-08-16 from the upstream source). chi/pon/daiminkan carry the discard
// source seat plus the called tile and the tiles consumed from hand; kakan
// carries the added tile plus the upgraded pon's identity; ankan carries only
// its four tiles. Tiles are mjai strings — red fives serialize as "5mr"-style.
// Anything else fails closed as report_schema_unsupported at the boundary.
const FuuroTile = z.string().min(1);
const FuuroSeat = z.number().int().min(0).max(3);

export const MortalFuuroSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("chi"),
    target: FuuroSeat,
    pai: FuuroTile,
    consumed: z.tuple([FuuroTile, FuuroTile]),
  }).strict(),
  z.object({
    type: z.literal("pon"),
    target: FuuroSeat,
    pai: FuuroTile,
    consumed: z.tuple([FuuroTile, FuuroTile]),
  }).strict(),
  z.object({
    type: z.literal("daiminkan"),
    target: FuuroSeat,
    pai: FuuroTile,
    consumed: z.tuple([FuuroTile, FuuroTile, FuuroTile]),
  }).strict(),
  z.object({
    type: z.literal("kakan"),
    pai: FuuroTile,
    previous_pon_target: FuuroSeat,
    previous_pon_pai: FuuroTile,
    consumed: z.tuple([FuuroTile, FuuroTile]),
  }).strict(),
  z.object({
    type: z.literal("ankan"),
    consumed: z.tuple([FuuroTile, FuuroTile, FuuroTile, FuuroTile]),
  }).strict(),
]);
export type MortalFuuro = z.infer<typeof MortalFuuroSchema>;

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
    fuuros: z.array(MortalFuuroSchema),
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
}).passthrough().superRefine((report, context) => {
  // M6-A4.0 (review round-1 Blocker 2): the reviewed-player perspective is a
  // VERIFIED invariant, not an assumption. The report is single-perspective —
  // every entry is a decision OF report.player_id — so every reviewed-player
  // action the report carries (expected / actual / every model detail) must,
  // when it has an actor, have THAT actor == report.player_id. `none` has no
  // actor and is fine; the same decision's chi/pon/kan/hora candidates carry
  // the ownership evidence. A violation fails the fetch closed as
  // report_schema_unsupported (verified clean against the real H2 report:
  // 150 entries, 1612 actions, 1508 with actor, 0 violations).
  const playerId = report.player_id;
  report.review.kyokus.forEach((kyoku, kyokuIndex) => {
    kyoku.entries.forEach((entry, entryIndex) => {
      const actions: ReadonlyArray<{
        action: { readonly type: string };
        path: readonly (string | number)[];
      }> = [
        { action: entry.expected, path: ["expected"] },
        { action: entry.actual, path: ["actual"] },
        ...entry.details.map((detail, detailIndex) => ({
          action: detail.action,
          path: ["details", detailIndex, "action"],
        })),
      ];
      for (const { action, path } of actions) {
        const actor = (action as { actor?: unknown }).actor;
        if (typeof actor === "number" && actor !== playerId) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "M6-A4.0: reviewed-player action actor must equal report.player_id",
            path: ["review", "kyokus", kyokuIndex, "entries", entryIndex, ...path, "actor"],
          });
        }
      }
    });
  });
});

export type RawMortalReport = z.infer<typeof MortalReportSchema>;
