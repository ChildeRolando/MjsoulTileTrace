import { describe, expect, it } from "vitest";
import {
  AnalyzableRecordSummarySchema,
  MahjongSoulSessionStatusSchema,
  MahjongSoulSourceErrorCodeSchema,
  formatMahjongSoulCnShareUrl,
  parseMahjongSoulCnShareUrl,
} from "../src/mahjong-soul.js";

const recordId = "260811-00000000-0000-0000-0000-000000000001";
const shareUrl = `https://game.maj-soul.com/1/?paipu=${recordId}_a123456789`;

const summary = {
  recordId,
  shareUrl,
  startedAt: 1_754_877_600,
  players: [
    { seat: 0, displayName: "A", finalScore: 32_000, rank: 1 },
    { seat: 1, displayName: "B", finalScore: 27_000, rank: 2 },
    { seat: 2, displayName: "C", finalScore: 23_000, rank: 3 },
    { seat: 3, displayName: "D", finalScore: 18_000, rank: 4 },
  ],
  selfSeat: 2,
  rule: {
    playerCount: 4,
    length: "south",
    displayLabel: "四人南风",
  },
  analysisStatus: "not_analyzed",
  lastSyncedAt: 1_754_877_700,
} as const;

const sourceErrorCodes = [
  "mahjong_soul_login_protocol_unsupported",
  "mahjong_soul_session_invalid",
  "mahjong_soul_session_storage_unavailable",
  "mahjong_soul_catalog_sync_failed",
  "mahjong_soul_record_not_analyzable",
  "mahjong_soul_record_fetch_failed",
  "unsupported_mahjong_soul_record_version",
  "mahjong_soul_record_identity_mismatch",
  "mahjong_soul_canonical_mapping_failed",
  "mahjong_soul_canonical_validation_failed",
] as const;

describe("Mahjong Soul renderer-safe contracts", () => {
  it("accepts one canonical four-player South summary", () => {
    expect(AnalyzableRecordSummarySchema.parse(summary)).toEqual(summary);
    expect(parseMahjongSoulCnShareUrl(summary.shareUrl)).toEqual({
      recordId: summary.recordId,
    });
  });

  it.each([
    { ...summary, token: "secret" },
    { ...summary, cookie: "secret" },
    { ...summary, accountId: 123 },
    { ...summary, rawRecord: "bytes" },
    { ...summary, downloadUrl: "https://example.invalid/record" },
    { ...summary, endpoint: "wss://example.invalid" },
    { ...summary, players: [...summary.players].reverse() },
    { ...summary, players: summary.players.map((player) => ({ ...player, rank: 1 })) },
    { ...summary, selfSeat: 4 },
    {
      ...summary,
      shareUrl: `http://game.maj-soul.com/1/?paipu=${recordId}_a123456789`,
    },
    {
      ...summary,
      shareUrl: `https://game.maj-soul.com:443/1/?paipu=${recordId}_a123456789`,
    },
    {
      ...summary,
      shareUrl: "https://game.maj-soul.com/1/?paipu=260811-00000000-0000-0000-0000-000000000002_a123456789",
    },
    { ...summary, shareUrl: `${shareUrl}&token=secret` },
    { ...summary, shareUrl: `${shareUrl}#fragment` },
    { ...summary, shareUrl: `${shareUrl}_2` },
  ])("rejects unsafe or non-canonical summary %#", (value) => {
    expect(() => AnalyzableRecordSummarySchema.parse(value)).toThrow();
  });

  it("rejects incomplete, duplicated, or unordered player seats", () => {
    expect(() => AnalyzableRecordSummarySchema.parse({
      ...summary,
      players: summary.players.slice(0, 3),
    })).toThrow();
    expect(() => AnalyzableRecordSummarySchema.parse({
      ...summary,
      players: summary.players.map((player) => ({ ...player, seat: 0 })),
    })).toThrow();
    expect(() => AnalyzableRecordSummarySchema.parse({
      ...summary,
      players: [summary.players[1], summary.players[0], ...summary.players.slice(2)],
    })).toThrow();
  });

  it.each([
    { status: "logged_out", region: "cn" },
    { status: "authenticating", region: "cn" },
    { status: "session_validating", region: "cn" },
    {
      status: "valid",
      region: "cn",
      displayName: "Player",
      lastValidatedAt: 1_754_877_700,
    },
    {
      status: "offline_unverified",
      region: "cn",
      displayName: "Player",
      lastValidatedAt: 1_754_877_700,
    },
  ])("accepts the exact credential-free session branch %#", (value) => {
    expect(MahjongSoulSessionStatusSchema.parse(value)).toEqual(value);
  });

  it.each(["accessToken", "accountId", "cookie", "endpoint", "rawError"])(
    "rejects %s from renderer session status",
    (field) => {
      expect(() => MahjongSoulSessionStatusSchema.parse({
        status: "valid",
        region: "cn",
        displayName: "Player",
        lastValidatedAt: 1_754_877_700,
        [field]: "secret",
      })).toThrow();
    },
  );

  it.each(sourceErrorCodes)("accepts project-owned source error code %s", (code) => {
    expect(MahjongSoulSourceErrorCodeSchema.parse(code)).toBe(code);
  });

  it("rejects raw upstream error text", () => {
    expect(() => MahjongSoulSourceErrorCodeSchema.parse("server said token=x"))
      .toThrow();
  });

  it.each([
    `https://game.maj-soul.com/1/?paipu=${recordId}_a0`,
    `https://game.maj-soul.com/1/?paipu=${recordId}_a4294967296`,
    `https://game.maj-soul.com/1/?paipu=${recordId}_a123_2`,
  ])("rejects invalid or extended CN share identity %s", (value) => {
    expect(() => parseMahjongSoulCnShareUrl(value)).toThrow(
      "mahjong_soul_record_identity_mismatch",
    );
  });

  it("rejects non-string input without coercing it", () => {
    let coerced = false;
    const value = {
      toString() {
        coerced = true;
        return shareUrl;
      },
    };

    expect(() => parseMahjongSoulCnShareUrl(value as unknown as string)).toThrow(
      "mahjong_soul_record_identity_mismatch",
    );
    expect(() => parseMahjongSoulCnShareUrl(42 as unknown as string)).toThrow(
      "mahjong_soul_record_identity_mismatch",
    );
    expect(coerced).toBe(false);
  });

  it("round-trips a formatted share URL through the strict parser", () => {
    const formatted = formatMahjongSoulCnShareUrl(recordId, 123456789);
    expect(formatted).toBe(
      `https://game.maj-soul.com/1/?paipu=${recordId}_a123456789`,
    );
    expect(parseMahjongSoulCnShareUrl(formatted)).toEqual({ recordId });
  });

  it.each([
    ["not-a-record-id", 1],
    ["260811-00000000-0000-0000-0000-00000000000G", 1],
    [recordId, 0],
    [recordId, -1],
    [recordId, 1.5],
    [recordId, 4_294_967_296],
    [`${recordId}_a1`, 1],
    [`${recordId}#fragment`, 1],
  ])("rejects non-canonical share URL input %#", (recordIdValue, view) => {
    expect(() =>
      formatMahjongSoulCnShareUrl(recordIdValue as string, view as number)
    ).toThrow("mahjong_soul_record_identity_mismatch");
  });

  it("rejects a coercible recordId object without invoking toString", () => {
    let coerced = false;
    const value = {
      toString() {
        coerced = true;
        return recordId;
      },
    };
    expect(() =>
      formatMahjongSoulCnShareUrl(value as unknown as string, 1)
    ).toThrow("mahjong_soul_record_identity_mismatch");
    expect(coerced).toBe(false);
  });
});
