import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "protobufjs";
import { describe, expect, test } from "vitest";

import type { MahjongSoulLobbySession } from "../src/lobby-session.js";
import type { CapturedMahjongSoulRestoreCandidate } from "../src/login-result.js";
import type { MahjongSoulProtocolBundle } from "../src/protocol-bundle.js";
import { diagnoseMahjongSoulInlineRecord } from "../src/inline-record-diagnostic.js";
import { SecretString } from "../src/secret-string.js";

const recordId = "260811-00000000-0000-0000-0000-000000000001";
const tokenText = "fixture-inline-token-never-real";
const protoPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../vendor/mahjong-soul-protocol/akagi-v3/27e994ad8bacd87833856b3b36b146ebb7cccbbc/liqi.proto",
);
const protoText = readFileSync(protoPath, "utf8");
const root = parse(protoText, { keepCase: true }).root;
const detailType = root.lookupType("lq.GameDetailRecords");
const inlineRecord = detailType.encode(detailType.fromObject({
  version: 210715,
  actions: [{ passed: 0, type: 1, result: Uint8Array.of(1) }],
})).finish();
const bundle = { protoText } as MahjongSoulProtocolBundle;

function candidate(): CapturedMahjongSoulRestoreCandidate {
  return Object.freeze({
    region: "cn", loginMethod: "login", authType: 7, accountId: 123,
    displayName: "Fixture", accessToken: SecretString.from(tokenText),
    recoveryContext: Object.freeze({
      device: Object.freeze({
        platform: "pc", hardware: "pc", os: "windows", osVersion: "10",
        isBrowser: true, software: "Chrome", salePlatform: "web",
        hardwareVendor: "fixture", modelNumber: "fixture", screenWidth: 1,
        screenHeight: 1, userAgent: "fixture", screenType: 0,
      }),
      clientVersion: Object.freeze({ resource: "0.11.252.w", package: "" }),
      currencyPlatforms: Object.freeze([2]), version: 1,
      clientVersionString: "web-0.11.252.w", tag: "chs_t",
    }),
  });
}

function responses(record: Readonly<Record<string, unknown>> = {
  error: null, data: inlineRecord, data_url: "",
}): { session: MahjongSoulLobbySession; calls: Array<{ method: string; payload: Readonly<Record<string, unknown>> }>; closed: () => boolean } {
  const calls: Array<{ method: string; payload: Readonly<Record<string, unknown>> }> = [];
  let didClose = false;
  const queue: Readonly<Record<string, unknown>>[] = [
    { error: null, has_account: true },
    { error: null, account_id: 123 },
    { error: null, iterator: "i", iterator_expire: 60, actual_begin_time: 1, actual_end_time: 100 },
    { error: null, iterator_expire: 60, next: false, entries: [{
      version: 210715, uuid: recordId, start_time: 90, end_time: 99,
      tag: 0, subtag: 0, standard_rule: 2,
      players: [0, 1, 2, 3].map((seat) => ({
        rank: seat + 1, account_id: seat === 2 ? 123 : seat + 10,
        nickname: `P${seat}`, seat, point: 30_000 - seat * 1_000,
      })),
    }] },
    { error: null, record_list: [{
      uuid: recordId, standard_rule: 2,
      config: { mode: { mode: 2, ai: false, extendinfo: "", detail_rule: null } },
    }] },
    record,
  ];
  return {
    session: {
      async authenticate() {},
      async call(method, payload) { calls.push({ method, payload }); return queue.shift()!; },
      async close() { didClose = true; },
    },
    calls,
    closed: () => didClose,
  };
}

describe("one-time inline Mahjong Soul record smoke", () => {
  test("verifies one analyzable inline record and closes without exposing it", async () => {
    const fake = responses();
    const result = await diagnoseMahjongSoulInlineRecord({
      credential: candidate(), bundle, createSession: async () => fake.session,
      now: () => 100_000,
    });
    expect(result).toEqual({ status: "inline_record_verified" });
    expect(fake.calls.at(-1)).toEqual({
      method: ".lq.Lobby.fetchGameRecord",
      payload: { game_uuid: recordId, client_version_string: "web-0.11.252.w" },
    });
    expect(fake.closed()).toBe(true);
    expect(JSON.stringify(result)).not.toContain(recordId);
    expect(JSON.stringify(result)).not.toContain(tokenText);
  });

  test.each([
    [{ error: null, data: new Uint8Array(), data_url: "https://record-old.maj-soul.com/x" }, "record_data_url_not_supported"],
    [{ error: { code: 9 }, data: new Uint8Array(), data_url: "" }, "record_detail_rejected"],
    [{ error: null, data: detailType.encode(detailType.fromObject({ version: 210715 })).finish(), data_url: "" }, "record_actions_empty"],
    [{ error: null, data: Uint8Array.of(0x0a, 0x00), data_url: "" }, "record_actions_empty"],
    [{ error: null, data: Uint8Array.of(0x1a, 0x00), data_url: "" }, "record_actions_empty"],
    [{ error: null, data: Uint8Array.of(255), data_url: "" }, "record_container_unsupported"],
  ] as const)("returns fixed %s boundary without record prose", async (record, status) => {
    const fake = responses(record);
    const result = await diagnoseMahjongSoulInlineRecord({
      credential: candidate(), bundle, createSession: async () => fake.session,
      now: () => 100_000,
    });
    expect(result).toEqual({ status });
    expect(fake.closed()).toBe(true);
  });
});
