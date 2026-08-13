import {
  AnalyzableRecordSummarySchema,
  formatMahjongSoulCnShareUrl,
  MahjongSoulRecordIdSchema,
  type AnalyzableRecordSummary,
} from "@riichi-coach/contracts";

// `game_mode` is enriched from the metadata-only `fetchGameRecordsDetail` call.
// Independent decoder evidence pinned at Akagi commit
// 8a96bb5faa672ffb04946a31068c18cb0bebd63a, src/history/aggregator.rs,
// defines match mode 2 as four-player East-South. Unknown,
// East-only, and three-player modes never enter the renderer-safe catalog.
// The fixed official-bundle frame was generated independently from the
// runtime codec and carries the current catalog wire values. Keep these
// allowlists narrow until another version/rule has its own captured fixture.
export const SUPPORTED_RECORD_VERSIONS: readonly number[] = Object.freeze([210715]);
export const SUPPORTED_STANDARD_RULES: readonly number[] = Object.freeze([2]);
const SHARE_URL_VIEW = 1;
export const FOUR_PLAYER_SOUTH_MODE_ID = 2;
export const STANDARD_EMPTY_DETAIL_RULE_HASH =
  // SHA-256 of the canonical protobuf GameMode bytes `08 02`: mode=2 and
  // absent ai/extendinfo/detail_rule. It is a wire fingerprint, not a guess.
  "sha256:7a53cc5deb60512f3dacacc7695dd5072077c6f4984dbedbff76e27092393b1c";

export interface RawRecordPlayerResult {
  readonly rank: number;
  readonly account_id: number;
  readonly nickname: string;
  readonly seat: number;
  readonly point: number;
}

export interface RawRecordListEntry {
  readonly version: number;
  readonly uuid: string;
  readonly start_time: number;
  readonly end_time: number;
  readonly tag: number;
  readonly subtag: number;
  readonly players: readonly RawRecordPlayerResult[];
  readonly standard_rule: number;
  readonly game_mode: number;
  readonly game_mode_ai: boolean;
  readonly game_mode_extendinfo: string;
  readonly game_mode_detail_rule_present: boolean;
}

export type FilterResult =
  | { readonly status: "analyzable"; readonly summary: AnalyzableRecordSummary }
  | { readonly status: "not_analyzable" };

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isUint32(value: unknown): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 0
    && value <= 0xffff_ffff;
}

function isInt32(value: unknown): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= -0x8000_0000
    && value <= 0x7fff_ffff;
}

function isTimestamp(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0;
}

function isSeat(value: unknown): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 0
    && value <= 3;
}

function isRank(value: unknown): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 1
    && value <= 4;
}

function isNickname(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= 64;
}

function isRawPlayer(value: unknown): value is RawRecordPlayerResult {
  if (!isRecord(value)) return false;
  return isRank(value.rank)
    && isUint32(value.account_id)
    && isNickname(value.nickname)
    && isSeat(value.seat)
    && isInt32(value.point);
}

function isRawEntry(value: unknown): value is RawRecordListEntry {
  if (!isRecord(value)) return false;
  if (!isUint32(value.version)) return false;
  if (typeof value.uuid !== "string") return false;
  if (!isTimestamp(value.start_time)) return false;
  if (!isTimestamp(value.end_time)) return false;
  if (!isUint32(value.tag)) return false;
  if (!isUint32(value.subtag)) return false;
  if (!Array.isArray(value.players) || value.players.length !== 4) return false;
  if (!value.players.every(isRawPlayer)) return false;
  if (!isUint32(value.standard_rule)) return false;
  if (!isUint32(value.game_mode)) return false;
  if (typeof value.game_mode_ai !== "boolean") return false;
  if (typeof value.game_mode_extendinfo !== "string") return false;
  if (typeof value.game_mode_detail_rule_present !== "boolean") return false;
  return true;
}

export function filterAnalyzableRecord(
  entry: RawRecordListEntry,
  selfAccountId: number,
  now: number,
): FilterResult {
  if (!isRawEntry(entry) || !isUint32(selfAccountId) || selfAccountId === 0 ||
    !isTimestamp(now)) {
    return { status: "not_analyzable" };
  }
  if (!SUPPORTED_RECORD_VERSIONS.includes(entry.version)) {
    return { status: "not_analyzable" };
  }
  if (!SUPPORTED_STANDARD_RULES.includes(entry.standard_rule)) {
    return { status: "not_analyzable" };
  }
  if (
    entry.game_mode !== FOUR_PLAYER_SOUTH_MODE_ID
    || entry.game_mode_ai
    || entry.game_mode_extendinfo !== ""
    || entry.game_mode_detail_rule_present
  ) return { status: "not_analyzable" };
  if (!MahjongSoulRecordIdSchema.safeParse(entry.uuid).success) {
    return { status: "not_analyzable" };
  }

  const players = [...entry.players].sort((left, right) => left.seat - right.seat);
  if (players.some((player, index) => player.seat !== index)) {
    return { status: "not_analyzable" };
  }
  const selfSeats = players
    .filter((player) => player.account_id === selfAccountId)
    .map((player) => player.seat);
  if (selfSeats.length !== 1) return { status: "not_analyzable" };
  const selfSeat = selfSeats[0]!;

  const shareUrl = formatMahjongSoulCnShareUrl(entry.uuid, SHARE_URL_VIEW);
  const parsed = AnalyzableRecordSummarySchema.safeParse({
    recordId: entry.uuid,
    shareUrl,
    startedAt: entry.start_time,
    players: players.map((player) => ({
      seat: player.seat,
      displayName: player.nickname,
      finalScore: player.point,
      rank: player.rank,
    })),
    selfSeat,
    rule: {
      playerCount: 4,
      length: "south",
      modeId: FOUR_PLAYER_SOUTH_MODE_ID,
      detailRuleHash: STANDARD_EMPTY_DETAIL_RULE_HASH,
      displayLabel: "四人南风",
    },
    analysisStatus: "not_analyzed",
    lastSyncedAt: now,
  });
  if (!parsed.success) return { status: "not_analyzable" };
  return { status: "analyzable", summary: Object.freeze(parsed.data) };
}
