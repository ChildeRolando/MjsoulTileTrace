import { inspect } from "node:util";
import { describe, expect, test } from "vitest";
import { MahjongSoulSourceError } from "../src/errors.js";
import type { DecodedLiqiMessage } from "../src/liqi-codec.js";
import {
  extractCapturedLoginCredential,
  type CapturedMahjongSoulRestoreCandidate,
} from "../src/login-result.js";
import { SecretString } from "../src/secret-string.js";

const fixedCode = "mahjong_soul_login_protocol_unsupported";
const fakeToken = "fixture-access-token-never-real";

function recoveryContext() {
  return {
    device: {
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
    },
    clientVersion: { resource: "0.11.252.w", package: "" },
    currencyPlatforms: [2, 6],
    version: 123,
    clientVersionString: "web-0.11.252.w",
    tag: "chs_t",
  };
}

function decodedLogin(overrides: {
  readonly method?: unknown;
  readonly requestContext?: unknown;
  readonly payload?: unknown;
} = {}): DecodedLiqiMessage {
  const has = (key: keyof typeof overrides): boolean => Object.prototype
    .hasOwnProperty.call(overrides, key);
  return {
    kind: "response",
    requestId: 17,
    method: has("method") ? overrides.method : ".lq.Lobby.login",
    requestContext: has("requestContext") ? overrides.requestContext : {
      source: "observed_login",
      loginMethod: "login",
      authType: 7,
      recovery: recoveryContext(),
    },
    payload: has("payload") ? overrides.payload : {
      account_id: 123_456_789,
      account: { nickname: "ProtocolFixture" },
      access_token: fakeToken,
    },
  } as DecodedLiqiMessage;
}

function expectFixedFailure(
  input: unknown,
  forbidden: readonly string[] = [],
): void {
  let caught: unknown;
  try {
    extractCapturedLoginCredential(input as DecodedLiqiMessage);
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(MahjongSoulSourceError);
  expect((caught as Error).message).toBe(fixedCode);
  const renderings = [String(caught), inspect(caught), JSON.stringify(caught)];
  for (const rendered of renderings) {
    for (const value of forbidden) expect(rendered).not.toContain(value);
  }
}

function assertSafeCredential(
  credential: CapturedMahjongSoulRestoreCandidate,
  expected: {
    readonly loginMethod: "login" | "oauth2Login";
    readonly authType: number;
  },
): void {
  expect(Object.keys(credential)).toEqual([
    "region",
    "loginMethod",
    "authType",
    "accountId",
    "displayName",
    "accessToken",
    "recoveryContext",
  ]);
  expect(credential).toMatchObject({
    region: "cn",
    loginMethod: expected.loginMethod,
    authType: expected.authType,
    accountId: 123_456_789,
    displayName: "ProtocolFixture",
  });
  expect(credential.accessToken).toBeInstanceOf(SecretString);
  expect(credential.accessToken.reveal()).toBe(fakeToken);
  expect(credential.recoveryContext).toMatchObject({
    clientVersionString: "web-0.11.252.w",
    version: 123,
    tag: "chs_t",
  });
  expect(Object.isFrozen(credential.recoveryContext)).toBe(true);
  expect(Object.isFrozen(credential)).toBe(true);

  expect(String(credential)).not.toContain(fakeToken);
  expect(JSON.stringify(credential)).not.toContain(fakeToken);
  expect(inspect(credential)).not.toContain(fakeToken);
}

describe("captured Mahjong Soul login projection", () => {
  test("projects exact frozen credentials for both observed login methods", () => {
    const direct = extractCapturedLoginCredential(decodedLogin());
    assertSafeCredential(direct, { loginMethod: "login", authType: 7 });

    const oauth = extractCapturedLoginCredential(decodedLogin({
      method: ".lq.Lobby.oauth2Login",
      requestContext: {
        source: "observed_login",
        loginMethod: "oauth2Login",
        authType: 0,
        recovery: recoveryContext(),
      },
      payload: {
        error: null,
        account_id: 123_456_789,
        account: { nickname: "ProtocolFixture" },
        access_token: fakeToken,
      },
    }));
    assertSafeCredential(oauth, {
      loginMethod: "oauth2Login",
      authType: 0,
    });
  });

  test("accepts only the protobuf absent sentinel or a strict integer zero error", () => {
    const absent = extractCapturedLoginCredential(decodedLogin());
    const protobufAbsent = extractCapturedLoginCredential(decodedLogin({
      payload: {
        error: null,
        account_id: 123_456_789,
        account: { nickname: "ProtocolFixture" },
        access_token: fakeToken,
      },
    }));
    const explicitZero = extractCapturedLoginCredential(decodedLogin({
      payload: {
        error: { code: 0 },
        account_id: 123_456_789,
        account: { nickname: "ProtocolFixture" },
        access_token: fakeToken,
      },
    }));

    expect(absent.accountId).toBe(123_456_789);
    expect(protobufAbsent.accountId).toBe(123_456_789);
    expect(explicitZero.accountId).toBe(123_456_789);
  });

  test("reads only allowlisted response paths and does not pass through unknown fields", () => {
    const unknownSecret = "unknown-server-field-secret";
    const accessed: string[] = [];
    const guarded = (
      value: Record<string, unknown>,
      allowed: readonly string[],
      label: string,
    ): Record<string, unknown> => new Proxy(value, {
      get(target, property, receiver) {
        if (typeof property === "string") {
          if (!allowed.includes(property)) {
            throw new Error(`${label}.${property}:${unknownSecret}`);
          }
          accessed.push(`${label}.${property}`);
        }
        return Reflect.get(target, property, receiver);
      },
      set() {
        throw new Error(`mutation:${unknownSecret}`);
      },
    });

    const account = guarded(
      { nickname: "ProtocolFixture", email: unknownSecret },
      ["nickname"],
      "account",
    );
    const payload = guarded({
      error: null,
      account_id: 123_456_789,
      account,
      access_token: fakeToken,
      server_private: unknownSecret,
    }, ["error", "account_id", "account", "access_token"], "payload");
    const requestContext = guarded({
      source: "observed_login",
      loginMethod: "login",
      authType: 7,
      recovery: recoveryContext(),
      request_private: unknownSecret,
    }, ["source", "loginMethod", "authType", "recovery"], "requestContext");
    const message = guarded({
      kind: "response",
      requestId: 17,
      method: ".lq.Lobby.login",
      payload,
      requestContext,
      transport_private: unknownSecret,
    }, ["kind", "method", "payload", "requestContext"], "message");

    const credential = extractCapturedLoginCredential(
      message as unknown as DecodedLiqiMessage,
    );

    expect(accessed).toEqual(expect.arrayContaining([
      "message.kind",
      "message.method",
      "message.payload",
      "message.requestContext",
      "requestContext.source",
      "requestContext.loginMethod",
      "requestContext.authType",
      "payload.error",
      "payload.account_id",
      "payload.account",
      "payload.access_token",
      "account.nickname",
    ]));
    expect(JSON.stringify(credential)).not.toContain(unknownSecret);
    expect(inspect(credential)).not.toContain(unknownSecret);
  });

  test("does not mutate the decoded message or nested payload", () => {
    const input = Object.freeze({
      kind: "response" as const,
      requestId: 17,
      method: ".lq.Lobby.login",
      requestContext: Object.freeze({
        source: "observed_login" as const,
        loginMethod: "login" as const,
        authType: 7,
        recovery: Object.freeze(recoveryContext()),
      }),
      payload: Object.freeze({
        error: Object.freeze({ code: 0 }),
        account_id: 123_456_789,
        account: Object.freeze({ nickname: "ProtocolFixture" }),
        access_token: fakeToken,
      }),
    });
    const before = JSON.stringify(input);

    extractCapturedLoginCredential(input);

    expect(JSON.stringify(input)).toBe(before);
  });

  test("cannot swap auth type or nickname after validation", () => {
    const hostile = "stateful-getter-secret";
    const hostileValue = Object.freeze({
      toJSON: () => hostile,
      toString: () => hostile,
    });
    let authTypeReads = 0;
    let nicknameReads = 0;
    const requestContext = {
      source: "observed_login",
      loginMethod: "login",
      get authType(): unknown {
        authTypeReads += 1;
        return authTypeReads === 1 ? 7 : hostileValue;
      },
      recovery: recoveryContext(),
    };
    const account = {
      get nickname(): unknown {
        nicknameReads += 1;
        return nicknameReads <= 3 ? "ProtocolFixture" : hostileValue;
      },
    };

    const credential = extractCapturedLoginCredential(decodedLogin({
      requestContext,
      payload: {
        account_id: 123_456_789,
        account,
        access_token: fakeToken,
      },
    }));

    expect(credential.authType).toBe(7);
    expect(credential.displayName).toBe("ProtocolFixture");
    expect(authTypeReads).toBe(1);
    expect(nicknameReads).toBe(1);
    expect(JSON.stringify(credential)).not.toContain(hostile);
    expect(inspect(credential)).not.toContain(hostile);
  });

  test.each([
    ["request kind", { kind: "request_observed", requestId: 1, method: ".lq.Lobby.login" }],
    ["notification kind", { kind: "notify", name: ".lq.ResLogin", payload: {} }],
    ["ignored kind", { kind: "ignored" }],
    ["null input", null],
    ["array input", []],
    ["non-login method", decodedLogin({ method: ".lq.Lobby.fetchInfo" })],
    ["near-match method", decodedLogin({ method: "lq.Lobby.login" })],
    ["missing request context", decodedLogin({ requestContext: null })],
    ["wrong request source", decodedLogin({ requestContext: { source: "direct_call", loginMethod: "login", authType: 7 } })],
    ["wrong context login method", decodedLogin({ requestContext: { source: "observed_login", loginMethod: "oauth2Login", authType: 7 } })],
    ["unknown context login method", decodedLogin({ requestContext: { source: "observed_login", loginMethod: "Login", authType: 7 } })],
    ["null payload", decodedLogin({ payload: null })],
    ["array payload", decodedLogin({ payload: [] })],
  ])("rejects malformed message routing: %s", (_label, input) => {
    expectFixedFailure(input);
  });

  test.each([
    -1,
    1.5,
    4_294_967_296,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    "7",
    null,
  ])("rejects non-uint32 authentication type %#", (authType) => {
    expectFixedFailure(decodedLogin({
      requestContext: {
        source: "observed_login",
        loginMethod: "login",
        authType,
      },
    }));
  });

  test.each([
    { code: 1 },
    { code: -1 },
    { code: 0.5 },
    { code: Number.NaN },
    { code: Number.POSITIVE_INFINITY },
    { code: "0" },
    {},
    [],
    "success",
  ])("rejects nonzero or malformed server errors %#", (error) => {
    expectFixedFailure(decodedLogin({
      payload: {
        error,
        account_id: 123_456_789,
        account: { nickname: "ProtocolFixture" },
        access_token: fakeToken,
      },
    }));
  });

  test.each([
    0,
    -1,
    1.5,
    4_294_967_296,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    "123456789",
    null,
    undefined,
  ])("rejects non-positive-uint32 account id %#", (accountId) => {
    expectFixedFailure(decodedLogin({
      payload: {
        account_id: accountId,
        account: { nickname: "ProtocolFixture" },
        access_token: fakeToken,
      },
    }));
  });

  test.each([
    undefined,
    null,
    [],
    {},
    { nickname: "" },
    { nickname: "n".repeat(65) },
    { nickname: 42 },
  ])("rejects a missing or invalid bounded nickname %#", (account) => {
    expectFixedFailure(decodedLogin({
      payload: {
        account_id: 123_456_789,
        account,
        access_token: fakeToken,
      },
    }));
  });

  test.each([
    undefined,
    null,
    42,
    "1234567",
    "x".repeat(4097),
  ])("rejects a missing or invalid bounded access token %#", (accessToken) => {
    expectFixedFailure(decodedLogin({
      payload: {
        account_id: 123_456_789,
        account: { nickname: "ProtocolFixture" },
        access_token: accessToken,
      },
    }), typeof accessToken === "string" ? [accessToken] : []);
  });

  test("never reflects hostile upstream fields or thrown getters", () => {
    const hostile = "hostile-upstream-secret";
    expectFixedFailure(decodedLogin({
      payload: {
        error: {
          code: 9,
          message: hostile,
          json_param: `json-${hostile}`,
          args: [`args-${hostile}`],
        },
        account_id: 123_456_789,
        account: { nickname: hostile },
        access_token: fakeToken,
        unknown: hostile,
      },
    }), [hostile, fakeToken]);

    const throwingPayload = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(throwingPayload, "error", {
      enumerable: true,
      get: () => {
        throw new Error(hostile);
      },
    });
    expectFixedFailure(decodedLogin({ payload: throwingPayload }), [hostile]);
  });
});
