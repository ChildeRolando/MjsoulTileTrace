import { inspect } from "node:util";
import { describe, expect, test } from "vitest";

import {
  SecretString,
  type CapturedMahjongSoulRestoreCandidate,
  type MahjongSoulLobbySession,
} from "@riichi-coach/mahjong-soul-source";
import {
  restoreDiagnosticExitCode,
  runMahjongSoulRestoreDiagnostic,
} from "../src/restore-diagnostic-runner.js";

const token = "fixture-diagnostic-token-never-real";

function candidate(): CapturedMahjongSoulRestoreCandidate {
  return Object.freeze({
    region: "cn",
    loginMethod: "login",
    authType: 7,
    accountId: 123_456_789,
    displayName: "Fixture",
    accessToken: SecretString.from(token),
    recoveryContext: Object.freeze({
      device: Object.freeze({
        platform: "pc", hardware: "pc", os: "windows", osVersion: "10",
        isBrowser: true, software: "Chrome", salePlatform: "web",
        hardwareVendor: "fixture", modelNumber: "fixture", screenWidth: 1,
        screenHeight: 1, userAgent: "fixture", screenType: 0,
      }),
      clientVersion: Object.freeze({ resource: "0.11.252.w", package: "" }),
      currencyPlatforms: Object.freeze([2]),
      version: 1,
      clientVersionString: "web-0.11.252.w",
      tag: "chs_t",
    }),
  });
}

function lobby(): MahjongSoulLobbySession {
  let index = 0;
  return {
    async authenticate() {},
    async call() {
      index += 1;
      return [
        { error: null, has_account: true },
        { error: null, account_id: 123_456_789 },
        { error: null },
        {
          error: null, iterator: "fixture", iterator_expire: 60,
          actual_begin_time: 9, actual_end_time: 10,
        },
      ][index - 1]!;
    },
    async close() {},
  };
}

describe("diagnostic-only Electron orchestration", () => {
  test("maps every fixed diagnostic status to a stable process exit code", () => {
    expect(restoreDiagnosticExitCode("independent_restore_verified")).toBe(0);
    expect(restoreDiagnosticExitCode("login_cancelled")).toBe(10);
    expect(restoreDiagnosticExitCode("login_rejected")).toBe(11);
    expect(restoreDiagnosticExitCode("login_capture_unverified")).toBe(12);
    expect(restoreDiagnosticExitCode("login_capture_failed")).toBe(13);
    expect(restoreDiagnosticExitCode("session_create_failed")).toBe(20);
    expect(restoreDiagnosticExitCode("oauth2_check_call_failed")).toBe(21);
    expect(restoreDiagnosticExitCode("oauth2_check_rejected")).toBe(22);
    expect(restoreDiagnosticExitCode("oauth2_login_call_failed")).toBe(23);
    expect(restoreDiagnosticExitCode("oauth2_login_rejected")).toBe(24);
    expect(restoreDiagnosticExitCode("identity_mismatch")).toBe(25);
    expect(restoreDiagnosticExitCode("fetch_info_call_failed")).toBe(26);
    expect(restoreDiagnosticExitCode("catalog_probe_call_failed")).toBe(27);
    expect(restoreDiagnosticExitCode("catalog_probe_rejected")).toBe(28);
    expect(restoreDiagnosticExitCode("inconclusive")).toBe(29);
  });
  test("uses one interactive capture then one fresh lobby without persistence", async () => {
    const calls: unknown[] = [];
    const result = await runMahjongSoulRestoreDiagnostic({
      loginProvider: {
        async run(input) { calls.push(input); return { status: "authenticated", credential: candidate() }; },
        cancelActive() {},
      },
      createSession: async () => lobby(),
      now: () => 10_000,
    });
    expect(result).toEqual({ status: "independent_restore_verified" });
    expect(calls).toEqual([{ mode: "diagnostic" }]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(token);
    expect(inspect(result)).not.toContain(token);
  });

  test("always requires a fresh visible capture and exposes no vault port", async () => {
    const inputs: unknown[] = [];
    await runMahjongSoulRestoreDiagnostic({
      loginProvider: {
        async run(input) { inputs.push(input); return { status: "cancelled" }; },
        cancelActive() {},
      },
      createSession: async () => lobby(),
      now: () => 10_000,
    });
    expect(inputs).toEqual([{ mode: "diagnostic" }]);
  });

  test.each([
    ["rejected", "login_rejected"],
    ["cancelled", "login_cancelled"],
    ["unverified", "login_capture_unverified"],
  ] as const)("maps %s capture to fixed %s without opening lobby", async (captureStatus, status) => {
    let created = false;
    const result = await runMahjongSoulRestoreDiagnostic({
      loginProvider: {
        async run() { return { status: captureStatus }; },
        cancelActive() {},
      },
      createSession: async () => { created = true; return lobby(); },
      now: () => 10_000,
    });
    expect(result).toEqual({ status });
    expect(created).toBe(false);
  });

  test("maps hostile provider failures to a fixed capture failure", async () => {
    const hostile = "hostile-provider-prose";
    const result = await runMahjongSoulRestoreDiagnostic({
      loginProvider: {
        async run() { throw new Error(hostile); },
        cancelActive() {},
      },
      createSession: async () => lobby(),
      now: () => 10_000,
    });
    expect(result).toEqual({ status: "login_capture_failed" });
    expect(JSON.stringify(result)).not.toContain(hostile);
  });
});
