import { inspect } from "node:util";
import { describe, expect, test } from "vitest";

import type { MahjongSoulLobbySession } from "../src/lobby-session.js";
import type { CapturedMahjongSoulRestoreCandidate } from "../src/login-result.js";
import {
  diagnoseMahjongSoulIndependentRestore,
  type MahjongSoulRestoreDiagnosticResult,
} from "../src/restore-diagnostic.js";
import { SecretString } from "../src/secret-string.js";

const tokenText = "fixture-restore-token-never-real";

function candidate(): CapturedMahjongSoulRestoreCandidate {
  return Object.freeze({
    region: "cn",
    loginMethod: "login",
    authType: 7,
    accountId: 123_456_789,
    displayName: "ProtocolFixture",
    accessToken: SecretString.from(tokenText),
    recoveryContext: Object.freeze({
      device: Object.freeze({
        platform: "pc",
        hardware: "pc",
        os: "windows",
        osVersion: "10",
        isBrowser: true,
        software: "Chrome",
        salePlatform: "web",
        hardwareVendor: "fixture",
        modelNumber: "fixture",
        screenWidth: 1920,
        screenHeight: 1080,
        userAgent: "fixture-agent",
        screenType: 0,
      }),
      clientVersion: Object.freeze({ resource: "0.11.252.w", package: "" }),
      currencyPlatforms: Object.freeze([2, 6]),
      version: 123,
      clientVersionString: "web-0.11.252.w",
      tag: "chs_t",
    }),
  });
}

type Call = Readonly<{ method: string; payload: Readonly<Record<string, unknown>> }>;

function session(input: {
  readonly responses?: readonly Readonly<Record<string, unknown>>[];
  readonly throwAt?: number;
} = {}) {
  const calls: Call[] = [];
  let closeCount = 0;
  const responses = input.responses ?? [
    { error: null, has_account: true },
    { error: null, account_id: 123_456_789 },
    { error: null },
    {
      error: null,
      iterator: "fixture-iterator",
      iterator_expire: 600,
      actual_begin_time: 9_999,
      actual_end_time: 10_000,
    },
  ];
  const value = {
    async authenticate() {
      throw new Error("diagnostic must use explicit sequence");
    },
    async call(method: string, payload: Readonly<Record<string, unknown>>) {
      calls.push({ method, payload });
      if (input.throwAt === calls.length) throw new Error("hostile upstream prose");
      return responses[calls.length - 1] ?? {};
    },
    async close() {
      closeCount += 1;
    },
  } as MahjongSoulLobbySession;
  return { value, calls, closeCount: () => closeCount };
}

function expectSafe(result: MahjongSoulRestoreDiagnosticResult): void {
  expect(Object.isFrozen(result)).toBe(true);
  const rendered = [String(result), JSON.stringify(result), inspect(result)].join("\n");
  expect(rendered).not.toContain(tokenText);
  expect(rendered).not.toContain("hostile upstream prose");
  expect(Object.keys(result)).toEqual(["status"]);
}

describe("Mahjong Soul independent restore diagnostic", () => {
  test("runs the exact official OAuth2 sequence with bounded catalog probe", async () => {
    const fake = session();
    const result = await diagnoseMahjongSoulIndependentRestore({
      credential: candidate(),
      createSession: async () => fake.value,
      now: () => 10_000_000,
    });

    expect(result).toEqual({ status: "independent_restore_verified" });
    expect(fake.calls.map(({ method }) => method)).toEqual([
      ".lq.Lobby.oauth2Check",
      ".lq.Lobby.oauth2Login",
      ".lq.Lobby.fetchInfo",
      ".lq.Lobby.fetchGameRecordListV2",
    ]);
    expect(fake.calls[0]!.payload).toEqual({ type: 7, access_token: tokenText });
    expect(fake.calls[1]!.payload).toEqual({
      type: 7,
      access_token: tokenText,
      reconnect: false,
      device: {
        platform: "pc",
        hardware: "pc",
        os: "windows",
        os_version: "10",
        is_browser: true,
        software: "Chrome",
        sale_platform: "web",
        hardware_vendor: "fixture",
        model_number: "fixture",
        screen_width: 1920,
        screen_height: 1080,
        user_agent: "fixture-agent",
        screen_type: 0,
      },
      client_version: { resource: "0.11.252.w", package: "" },
      gen_access_token: false,
      currency_platforms: [2, 6],
      version: 123,
      client_version_string: "web-0.11.252.w",
      tag: "chs_t",
    });
    expect(fake.calls[2]!.payload).toEqual({});
    expect(fake.calls[3]!.payload).toEqual({
      tag: 0,
      begin_time: 9_999,
      end_time: 10_000,
    });
    expect(fake.closeCount()).toBe(1);
    expectSafe(result);
  });

  test.each([
    ["oauth2_check_rejected", [{ error: { code: 9, message: "hostile upstream prose" }, has_account: true }]],
    ["oauth2_check_rejected", [{ error: null, has_account: false }]],
    ["oauth2_login_rejected", [{ error: null, has_account: true }, { error: { code: 9, message: "hostile upstream prose" } }]],
    ["identity_mismatch", [{ error: null, has_account: true }, { error: null, account_id: 42 }]],
    ["inconclusive", [{ error: null, has_account: true }, { error: null, account_id: 123_456_789 }, { error: { code: 9 } }]],
    ["catalog_probe_rejected", [{ error: null, has_account: true }, { error: null, account_id: 123_456_789 }, { error: null }, { error: { code: 9, message: "hostile upstream prose" } }]],
  ] as const)("returns fixed %s and always closes", async (status, responses) => {
    const fake = session({ responses });
    const result = await diagnoseMahjongSoulIndependentRestore({
      credential: candidate(),
      createSession: async () => fake.value,
      now: () => 10_000_000,
    });
    expect(result).toEqual({ status });
    expect(fake.closeCount()).toBe(1);
    expectSafe(result);
  });

  test("maps thrown transport values to inconclusive and closes", async () => {
    const fake = session({ throwAt: 2 });
    const result = await diagnoseMahjongSoulIndependentRestore({
      credential: candidate(),
      createSession: async () => fake.value,
      now: () => 10_000_000,
    });
    expect(result).toEqual({ status: "inconclusive" });
    expect(fake.closeCount()).toBe(1);
    expectSafe(result);
  });

  test("does not open a session for malformed candidate input", async () => {
    let created = false;
    const result = await diagnoseMahjongSoulIndependentRestore({
      credential: { ...candidate(), accountId: 0 },
      createSession: async () => {
        created = true;
        return session().value;
      },
      now: () => 10_000_000,
    });
    expect(result).toEqual({ status: "inconclusive" });
    expect(created).toBe(false);
    expectSafe(result);
  });
});
