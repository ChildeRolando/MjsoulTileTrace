import { z } from "zod";

export const MahjongSoulRegionSchema = z.literal("cn");
export type MahjongSoulRegion = z.infer<typeof MahjongSoulRegionSchema>;

export const MahjongSoulRecordIdSchema = z.string().regex(
  /^\d{6}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
);
export type MahjongSoulRecordId = z.infer<
  typeof MahjongSoulRecordIdSchema
>;

export const MahjongSoulSha256Schema = z.string().regex(
  /^sha256:[0-9a-f]{64}$/u,
);
export type MahjongSoulSha256 = z.infer<typeof MahjongSoulSha256Schema>;

// The `_a<number>` suffix of a CN share URL is the OBFUSCATED
// representation of the sharing player's account id — a perspective TOKEN,
// NOT a seat number and NOT directly comparable to
// fetchGameRecord.head.accounts[].account_id. The reversible transform
// (ecosystem-pinned by tensoul/Avenshy's converter and cross-verified live
// 2026-08-15 on three real samples incl. one game shared from two
// perspectives: 3/3 exact single-account joins + exact round-trips) lives in
// mahjong-soul-source (decodeMahjongSoulPerspectiveToken). The parser keeps
// the token opaque and never infers a seat.
export function parseMahjongSoulCnShareUrl(value: string): {
  readonly recordId: MahjongSoulRecordId;
  readonly perspectiveToken: number;
} {
  if (typeof value !== "string") {
    throw new Error("mahjong_soul_record_identity_mismatch");
  }
  const match = /^https:\/\/game\.maj-soul\.com\/1\/\?paipu=(\d{6}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_a([1-9]\d{0,9})$/u
    .exec(value);
  if (match === null || Number(match[2]) > 4_294_967_295) {
    throw new Error("mahjong_soul_record_identity_mismatch");
  }
  return Object.freeze({
    recordId: match[1]! as MahjongSoulRecordId,
    // Positive uint32-shaped OBFUSCATION of the sharing account id; decode
    // before comparing against any wire account id.
    perspectiveToken: Number(match[2]),
  });
}

export function formatMahjongSoulCnShareUrl(
  recordId: string,
  perspectiveToken: number,
): string {
  if (
    typeof recordId !== "string"
    || !MahjongSoulRecordIdSchema.safeParse(recordId).success
    || typeof perspectiveToken !== "number"
    || !Number.isInteger(perspectiveToken)
    || perspectiveToken < 1
    || perspectiveToken > 4_294_967_295
  ) {
    throw new Error("mahjong_soul_record_identity_mismatch");
  }
  return `https://game.maj-soul.com/1/?paipu=${recordId}_a${perspectiveToken}`;
}

export const MahjongSoulSourceErrorCodeSchema = z.enum([
  "mahjong_soul_login_protocol_unsupported",
  "mahjong_soul_session_invalid",
  "mahjong_soul_session_storage_unavailable",
  "mahjong_soul_catalog_sync_failed",
  "mahjong_soul_record_not_analyzable",
  "mahjong_soul_record_fetch_failed",
  "unsupported_mahjong_soul_record_version",
  "mahjong_soul_record_identity_mismatch",
  "mahjong_soul_record_container_invalid",
  "mahjong_soul_canonical_mapping_failed",
  "mahjong_soul_canonical_validation_failed",
  "mahjong_soul_canonical_unsupported_semantics",
]);
export type MahjongSoulSourceErrorCode = z.infer<
  typeof MahjongSoulSourceErrorCodeSchema
>;

const PlayerSchema = z.object({
  seat: z.number().int().min(0).max(3),
  displayName: z.string().min(1).max(64),
  finalScore: z.number().int().min(-2_147_483_648).max(2_147_483_647),
  rank: z.number().int().min(1).max(4),
}).strict();

export const AnalyzableRecordSummarySchema = z.object({
  recordId: MahjongSoulRecordIdSchema,
  shareUrl: z.string().url(),
  startedAt: z.number().int().nonnegative(),
  players: z.array(PlayerSchema).length(4),
  selfSeat: z.number().int().min(0).max(3),
  rule: z.object({
    playerCount: z.literal(4),
    length: z.literal("south"),
    modeId: z.literal(2),
    detailRuleHash: MahjongSoulSha256Schema,
    displayLabel: z.literal("四人南风"),
  }).strict(),
  analysisStatus: z.enum([
    "not_analyzed",
    "queued",
    "analyzing",
    "ready",
  ]),
  lastSyncedAt: z.number().int().nonnegative(),
}).strict().superRefine((value, context) => {
  const seats = value.players.map((player) => player.seat);
  const ranks = value.players.map((player) => player.rank);
  if (!seats.every((seat, index) => seat === index)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "players must be ordered by seat",
    });
  }
  if (new Set(ranks).size !== 4) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "ranks must be unique",
    });
  }
  try {
    if (parseMahjongSoulCnShareUrl(value.shareUrl).recordId !== value.recordId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "share URL record mismatch",
      });
    }
  } catch {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "invalid share URL",
    });
  }
});
export type AnalyzableRecordSummary = z.infer<
  typeof AnalyzableRecordSummarySchema
>;

const SessionBase = { region: MahjongSoulRegionSchema };

export const MahjongSoulSessionStatusSchema = z.discriminatedUnion("status", [
  z.object({ ...SessionBase, status: z.literal("logged_out") }).strict(),
  z.object({ ...SessionBase, status: z.literal("authenticating") }).strict(),
  z.object({
    ...SessionBase,
    status: z.literal("session_validating"),
  }).strict(),
  z.object({
    ...SessionBase,
    status: z.literal("valid"),
    displayName: z.string().min(1).max(64),
    lastValidatedAt: z.number().int().nonnegative(),
  }).strict(),
  z.object({
    ...SessionBase,
    status: z.literal("offline_unverified"),
    displayName: z.string().min(1).max(64),
    lastValidatedAt: z.number().int().nonnegative(),
  }).strict(),
]);
export type MahjongSoulSessionStatus = z.infer<
  typeof MahjongSoulSessionStatusSchema
>;
