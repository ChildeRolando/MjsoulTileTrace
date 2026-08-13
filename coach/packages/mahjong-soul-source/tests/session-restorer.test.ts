import { describe, expect, test } from "vitest";

import {
  createMahjongSoulOAuth2SessionRestorer,
  authenticateStoredMahjongSoulSession,
  SecretString,
  type MahjongSoulLobbySession,
  type StoredMahjongSoulSession,
} from "../src/index.js";

const recoveryContext = Object.freeze({
  device: Object.freeze({ platform: "pc", hardware: "pc", os: "windows", osVersion: "10", isBrowser: true, software: "Chrome", salePlatform: "web", hardwareVendor: "fixture", modelNumber: "fixture", screenWidth: 1, screenHeight: 1, userAgent: "fixture", screenType: 0 }),
  clientVersion: Object.freeze({ resource: "0.11.252.w", package: "" }),
  currencyPlatforms: Object.freeze([2]), version: 1,
  clientVersionString: "web-0.11.252.w", tag: "chs_t",
});

const stored: StoredMahjongSoulSession = Object.freeze({
  region: "cn", loginMethod: "login", authType: 7, accountId: 123,
  displayName: "Fixture", accessToken: SecretString.from("fixture-token"),
  recoveryContext, adapterVersion: "0.1.0", clientVersion: "0.11.252.w",
  createdAt: 1, lastValidatedAt: 1,
});

function session(responses: Readonly<Record<string, unknown>>[]) {
  const calls: unknown[] = [];
  let closed = false;
  const value: MahjongSoulLobbySession = {
    async authenticate() {},
    async call(method, payload) { calls.push({ method, payload }); return responses.shift()!; },
    async close() { closed = true; },
  };
  return { value, calls, closed: () => closed };
}

describe("headless Mahjong Soul OAuth2 restore", () => {
  test("restores the stored identity without opening a login provider", async () => {
    const lobby = session([
      { error: null, has_account: true },
      { error: null, account_id: 123 },
    ]);
    const restorer = createMahjongSoulOAuth2SessionRestorer({
      createSession: async () => lobby.value,
    });

    await expect(restorer.restore(stored)).resolves.toEqual({
      status: "authenticated",
      credential: expect.objectContaining({ accountId: 123, recoveryContext }),
    });
    expect(lobby.calls.map((entry: any) => entry.method)).toEqual([
      ".lq.Lobby.oauth2Check", ".lq.Lobby.oauth2Login",
    ]);
    expect(lobby.closed()).toBe(true);
  });

  test("keeps transient failures unverified and maps explicit rejection", async () => {
    const rejected = session([{ error: { code: 9 } }]);
    const first = createMahjongSoulOAuth2SessionRestorer({ createSession: async () => rejected.value });
    await expect(first.restore(stored)).resolves.toEqual({ status: "rejected" });

    const transient = createMahjongSoulOAuth2SessionRestorer({
      createSession: async () => { throw new Error("hostile network prose"); },
    });
    await expect(transient.restore(stored)).resolves.toEqual({ status: "unverified" });

    const mismatch = session([
      { error: null, has_account: true },
      { error: null, account_id: 456 },
    ]);
    const third = createMahjongSoulOAuth2SessionRestorer({ createSession: async () => mismatch.value });
    await expect(third.restore(stored)).resolves.toEqual({ status: "rejected" });
  });

  test("can authenticate a caller-owned lobby without closing it", async () => {
    const lobby = session([
      { error: null, has_account: true },
      { error: null, account_id: 123 },
    ]);
    await expect(authenticateStoredMahjongSoulSession(lobby.value, stored))
      .resolves.toBe("authenticated");
    expect(lobby.closed()).toBe(false);
  });
});
