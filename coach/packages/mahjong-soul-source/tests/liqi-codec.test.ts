import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, type Root, type Type } from "protobufjs";
import { describe, expect, test } from "vitest";
import type { MahjongSoulProtocolBundle } from "../src/protocol-bundle.js";
import {
  MAHJONG_SOUL_OBSERVED_LOGIN_METHODS,
  MAHJONG_SOUL_OBSERVED_RECORD_METHODS,
  MAHJONG_SOUL_SAFE_DIRECT_CALL_METHODS,
  MAHJONG_SOUL_SURFACED_NOTIFICATION_TYPES,
  createLiqiCodec,
} from "../src/liqi-codec.js";

const fixedCode = "mahjong_soul_login_protocol_unsupported";
const fixtureDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);
const protoText = readFileSync(resolve(fixtureDir, "minimal-liqi.proto"), "utf8");
const rpcMap = JSON.parse(
  readFileSync(resolve(fixtureDir, "minimal-rpc-map.json"), "utf8"),
) as Record<string, { req: string; resp: string }>;
const root = parse(protoText, { keepCase: true }).root;
const wrapperType = root.lookupType("lq.Wrapper");

const bundle = {
  protoText,
  rpcMap,
} as MahjongSoulProtocolBundle;

function codec(
  directCallMethods: readonly string[] = [
    ".lq.Lobby.oauth2Login",
    ".lq.Lobby.fetchGameRecord",
  ],
) {
  return createLiqiCodec(bundle, {
    directCallMethods,
    surfacedNotifications: [],
  });
}

function encode(type: Type, value: Record<string, unknown>): Uint8Array {
  const message = type.fromObject(value);
  const error = type.verify(message);
  if (error !== null) throw new Error(error);
  return type.encode(message).finish();
}

function wrapper(name: string, data: Uint8Array): Uint8Array {
  return encode(wrapperType, { name, data });
}

function requestFrame(
  requestId: number,
  method: string,
  payload: Record<string, unknown>,
): Uint8Array {
  const route = rpcMap[method]!;
  const body = encode(root.lookupType(route.req), payload);
  const output = new Uint8Array(3 + wrapper(method, body).length);
  output[0] = 2;
  output[1] = requestId & 0xff;
  output[2] = requestId >>> 8;
  output.set(wrapper(method, body), 3);
  return output;
}

function requestFrameWithRawBody(
  requestId: number,
  method: string,
  body: Uint8Array,
): Uint8Array {
  const encodedWrapper = wrapper(method, body);
  return Uint8Array.from([
    2,
    requestId & 0xff,
    requestId >>> 8,
    ...encodedWrapper,
  ]);
}

function responseFrame(
  requestId: number,
  responseTypeName: string,
  payload: Record<string, unknown>,
  name = "",
): Uint8Array {
  const body = encode(root.lookupType(responseTypeName), payload);
  const output = new Uint8Array(3 + wrapper(name, body).length);
  output[0] = 3;
  output[1] = requestId & 0xff;
  output[2] = requestId >>> 8;
  output.set(wrapper(name, body), 3);
  return output;
}

function notifyFrame(name: string, payload: Record<string, unknown>): Uint8Array {
  const body = encode(root.lookupType(name), payload);
  const encodedWrapper = wrapper(name, body);
  const output = new Uint8Array(1 + encodedWrapper.length);
  output[0] = 1;
  output.set(encodedWrapper, 1);
  return output;
}

function expectFixed(operation: () => unknown, forbidden: readonly string[] = []): void {
  let caught: unknown;
  try {
    operation();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  const rendered = String(caught);
  expect((caught as Error).message).toBe(fixedCode);
  expect(rendered).toBe(`MahjongSoulSourceError: ${fixedCode}`);
  for (const value of forbidden) expect(rendered).not.toContain(value);
}

describe("Liqi wire codec", () => {
  test("encodes request frames with a little-endian uint16 id and exact route", () => {
    const subject = codec([".lq.Lobby.fetchGameRecord"]);
    const payload = { game_uuid: "fixture-game" };
    const frame = subject.encodeRequest({
      requestId: 0x1234,
      method: ".lq.Lobby.fetchGameRecord",
      payload,
    });

    expect(Array.from(frame.slice(0, 3))).toEqual([2, 0x34, 0x12]);
    const decodedWrapper = wrapperType.toObject(
      wrapperType.decode(frame.slice(3)),
      { bytes: Uint8Array },
    ) as { name: string; data: Uint8Array };
    expect(decodedWrapper.name).toBe(".lq.Lobby.fetchGameRecord");
    expect(root.lookupType("lq.ReqGameRecord").toObject(
      root.lookupType("lq.ReqGameRecord").decode(decodedWrapper.data),
    )).toMatchObject({ game_uuid: "fixture-game" });
    expect(payload).toEqual({ game_uuid: "fixture-game" });
  });

  test.each([-1, 1.5, 65_536, Number.NaN])(
    "rejects invalid request id %s before registration",
    (requestId) => {
      const subject = codec([".lq.Lobby.fetchGameRecord"]);
      expectFixed(() => subject.encodeRequest({
        requestId,
        method: ".lq.Lobby.fetchGameRecord",
        payload: { game_uuid: "safe" },
      }));
      expectFixed(() => subject.decodeServerFrame(
        responseFrame(0, ".lq.ResGameRecord", { record_id: "1", data: [] }),
      ));
    },
  );

  test("correlates responses and preserves uint64 strings and byte arrays", () => {
    const subject = codec([".lq.Lobby.fetchGameRecord"]);
    subject.encodeRequest({
      requestId: 7,
      method: ".lq.Lobby.fetchGameRecord",
      payload: { game_uuid: "fixture" },
    });
    const input = responseFrame(7, ".lq.ResGameRecord", {
      record_id: "18446744073709551615",
      data: Uint8Array.of(4, 5, 6),
    });
    const before = input.slice();

    expect(subject.decodeServerFrame(input)).toEqual({
      kind: "response",
      requestId: 7,
      method: ".lq.Lobby.fetchGameRecord",
      payload: {
        record_id: "18446744073709551615",
        data: Uint8Array.of(4, 5, 6),
      },
    });
    expect(input).toEqual(before);
  });

  test("observes login metadata but discards all request secrets", () => {
    const subject = codec([]);
    const secret = "password-never-surface";
    const randomKey = "captcha-random-key-never-surface";
    const observed = subject.decodeClientFrame(requestFrame(
      9,
      ".lq.Lobby.login",
      {
        account: "private@example.test",
        password: secret,
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
        random_key: randomKey,
        client_version: { resource: "0.11.252.w", package: "" },
        gen_access_token: true,
        currency_platforms: [2, 6],
        type: 7,
        version: 123,
        client_version_string: "web-0.11.252.w",
        tag: "chs_t",
      },
    ));
    expect(observed).toEqual({
      kind: "request_observed",
      requestId: 9,
      method: ".lq.Lobby.login",
    });
    expect(JSON.stringify(observed)).not.toContain(secret);
    expect(JSON.stringify(observed)).not.toContain("private@example.test");

    const response = subject.decodeServerFrame(responseFrame(
      9,
      ".lq.ResLogin",
      { account_id: "42", access_token: "response-token", proof: [1] },
    ));
    expect(response.kind).toBe("response");
    if (response.kind !== "response") throw new Error("fixture response missing");
    expect(response).toEqual({
      kind: "response",
      requestId: 9,
      method: ".lq.Lobby.login",
      payload: {
        account_id: "42",
        access_token: "response-token",
        proof: Uint8Array.of(1),
      },
      requestContext: {
        source: "observed_login",
        loginMethod: "login",
        authType: 7,
        recovery: {
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
        },
      },
    });
    expect(JSON.stringify(response)).not.toContain(secret);
    expect(JSON.stringify(response)).not.toContain("private@example.test");
    expect(JSON.stringify(response)).not.toContain(randomKey);
    expect(Object.isFrozen(response.requestContext?.recovery)).toBe(true);
    expect(Object.isFrozen(response.requestContext?.recovery?.device)).toBe(true);
    expect(Object.isFrozen(response.requestContext?.recovery?.currencyPlatforms)).toBe(true);
  });

  test("normalizes omitted oauth login auth type to zero", () => {
    const subject = codec([]);
    expect(subject.decodeClientFrame(requestFrame(
      11,
      ".lq.Lobby.oauth2Login",
      {
        access_token: "request-token-never-surface",
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
        currency_platforms: [2, 6],
        version: 123,
        client_version_string: "web-0.11.252.w",
        tag: "chs_t",
      },
    ))).toEqual({
      kind: "request_observed",
      requestId: 11,
      method: ".lq.Lobby.oauth2Login",
    });
    expect(subject.decodeServerFrame(responseFrame(
      11,
      ".lq.ResLogin",
      { account_id: "43", access_token: "new-token", proof: [] },
    ))).toMatchObject({
      requestContext: {
        source: "observed_login",
        loginMethod: "oauth2Login",
        authType: 0,
      },
    });
  });

  test("rejects an observed login auth varint larger than uint32", () => {
    const subject = codec([]);
    const typeFieldWithTwoToThe32 = Uint8Array.of(
      0x48,
      0x80,
      0x80,
      0x80,
      0x80,
      0x10,
    );
    expectFixed(() => subject.decodeClientFrame(requestFrameWithRawBody(
      13,
      ".lq.Lobby.login",
      typeFieldWithTwoToThe32,
    )));
  });

  test("tracks non-login observed requests and consumes their responses silently", () => {
    const subject = codec([]);
    expect(subject.decodeClientFrame(requestFrame(
      12,
      ".lq.Lobby.fetchInfo",
      {},
    ))).toEqual({ kind: "ignored" });
    expect(subject.decodeServerFrame(responseFrame(
      12,
      ".lq.ResEmpty",
      {},
    ))).toEqual({ kind: "ignored" });
  });

  test("ignores a known notification because the M5-A notification cap is empty", () => {
    const subject = codec([]);
    expect(subject.decodeServerFrame(notifyFrame(
      ".lq.NotifyRoom",
      { room: "fixture", marker: Uint8Array.of(8) },
    ))).toEqual({ kind: "ignored" });
  });

  test("freezes exact package-owned capability sets", () => {
    expect(MAHJONG_SOUL_SAFE_DIRECT_CALL_METHODS).toEqual([
      ".lq.Lobby.oauth2Check",
      ".lq.Lobby.oauth2Login",
      ".lq.Lobby.fetchInfo",
      ".lq.Lobby.fetchGameRecordListV2",
      ".lq.Lobby.fetchNextGameRecordList",
      ".lq.Lobby.fetchGameRecordsDetail",
      ".lq.Lobby.fetchGameRecord",
      ".lq.Lobby.loginBeat",
      ".lq.Lobby.logout",
    ]);
    expect(MAHJONG_SOUL_OBSERVED_LOGIN_METHODS).toEqual([
      ".lq.Lobby.login",
      ".lq.Lobby.oauth2Login",
    ]);
    expect(MAHJONG_SOUL_OBSERVED_RECORD_METHODS).toEqual([
      ".lq.Lobby.fetchGameRecord",
      ".lq.Lobby.fetchGameRecordListV2",
      ".lq.Lobby.fetchNextGameRecordList",
      ".lq.Lobby.fetchGameRecordsDetail",
    ]);
    expect(MAHJONG_SOUL_SURFACED_NOTIFICATION_TYPES).toEqual([]);
    expect(Object.isFrozen(MAHJONG_SOUL_SAFE_DIRECT_CALL_METHODS)).toBe(true);
    expect(Object.isFrozen(MAHJONG_SOUL_OBSERVED_LOGIN_METHODS)).toBe(true);
    expect(Object.isFrozen(MAHJONG_SOUL_OBSERVED_RECORD_METHODS)).toBe(true);
    expect(Object.isFrozen(MAHJONG_SOUL_SURFACED_NOTIFICATION_TYPES)).toBe(true);
  });

  test("caller policy may narrow but cannot widen either capability set", () => {
    expect(() => codec([".lq.Lobby.fetchInfo"])).not.toThrow();
    expectFixed(() => createLiqiCodec(bundle, {
      directCallMethods: [".lq.Lobby.deleteAccount"],
      surfacedNotifications: [],
    }));
    expectFixed(() => createLiqiCodec(bundle, {
      directCallMethods: [],
      surfacedNotifications: [".lq.NotifyRoom"],
    }));
  });

  test("refuses destructive and unrequested direct calls even when routes exist", () => {
    const narrowed = codec([".lq.Lobby.fetchInfo"]);
    expectFixed(() => narrowed.encodeRequest({
      requestId: 1,
      method: ".lq.Lobby.fetchGameRecord",
      payload: { game_uuid: "fixture" },
    }));

    const destructive = codec([]);
    expectFixed(() => destructive.encodeRequest({
      requestId: 2,
      method: ".lq.Lobby.deleteAccount",
      payload: { confirmation: "delete" },
    }), ["delete"]);
  });

  test.each([
    { game_uuid: 12 },
    { game_uuid: "fixture", extra: "not-known" },
  ])("rejects payload type errors and unknown keys", (payload) => {
    const subject = codec([".lq.Lobby.fetchGameRecord"]);
    expectFixed(() => subject.encodeRequest({
      requestId: 1,
      method: ".lq.Lobby.fetchGameRecord",
      payload,
    }), ["not-known"]);
  });

  test.each([
    { access_token: "safe", type: -1 },
    { access_token: "safe", type: 1.5 },
    { access_token: "safe", type: 4_294_967_296 },
  ])("rejects invalid uint32 authentication types", (payload) => {
    const subject = codec([".lq.Lobby.oauth2Login"]);
    expectFixed(() => subject.encodeRequest({
      requestId: 1,
      method: ".lq.Lobby.oauth2Login",
      payload,
    }));
  });

  test("rejects duplicate pending IDs without replacing correlation", () => {
    const subject = codec([".lq.Lobby.fetchGameRecord"]);
    subject.encodeRequest({
      requestId: 5,
      method: ".lq.Lobby.fetchGameRecord",
      payload: { game_uuid: "first" },
    });
    expectFixed(() => subject.encodeRequest({
      requestId: 5,
      method: ".lq.Lobby.fetchGameRecord",
      payload: { game_uuid: "second" },
    }));
    expectFixed(() => subject.decodeServerFrame(
      responseFrame(5, ".lq.ResGameRecord", { record_id: "5", data: [] }),
    ));
  });

  test("enforces the explicit pending request maximum", () => {
    const subject = codec([".lq.Lobby.fetchInfo"]);
    for (let requestId = 0; requestId < 4096; requestId += 1) {
      subject.encodeRequest({
        requestId,
        method: ".lq.Lobby.fetchInfo",
        payload: {},
      });
    }
    expectFixed(() => subject.encodeRequest({
      requestId: 4096,
      method: ".lq.Lobby.fetchInfo",
      payload: {},
    }));
  });

  test.each([
    new Uint8Array(),
    Uint8Array.of(2, 1),
    Uint8Array.of(0),
    Uint8Array.of(4),
    new Uint8Array(4 * 1024 * 1024 + 1),
  ])("rejects empty, truncated, invalid-type, and oversized frames", (frame) => {
    const subject = codec([]);
    expectFixed(() => subject.decodeClientFrame(frame));
  });

  test("rejects malformed wrappers, unknown routes, and unknown request types", () => {
    const malformed = codec([]);
    expectFixed(() => malformed.decodeClientFrame(Uint8Array.of(2, 0, 0, 0xff)));

    const unknownRoute = codec([]);
    const routeWrapper = wrapper(".lq.Lobby.notPresent", new Uint8Array());
    expectFixed(() => unknownRoute.decodeClientFrame(Uint8Array.from([
      2, 0, 0, ...routeWrapper,
    ])));

    const unknownType = codec([]);
    const typeWrapper = wrapper(".lq.Lobby.missingType", new Uint8Array());
    expectFixed(() => unknownType.decodeClientFrame(Uint8Array.from([
      2, 0, 0, ...typeWrapper,
    ])));
  });

  test("rejects server responses with names, no pending entry, duplicates, and malformed bodies", () => {
    const named = codec([".lq.Lobby.fetchGameRecord"]);
    named.encodeRequest({ requestId: 1, method: ".lq.Lobby.fetchGameRecord", payload: { game_uuid: "x" } });
    expectFixed(() => named.decodeServerFrame(responseFrame(
      1, ".lq.ResGameRecord", { record_id: "1", data: [] }, ".lq.ResGameRecord",
    )));

    const absent = codec([]);
    expectFixed(() => absent.decodeServerFrame(responseFrame(
      2, ".lq.ResEmpty", {},
    )));

    const duplicate = codec([".lq.Lobby.fetchGameRecord"]);
    duplicate.encodeRequest({ requestId: 3, method: ".lq.Lobby.fetchGameRecord", payload: { game_uuid: "x" } });
    const response = responseFrame(3, ".lq.ResGameRecord", { record_id: "3", data: [] });
    duplicate.decodeServerFrame(response);
    expectFixed(() => duplicate.decodeServerFrame(response));

    const malformed = codec([".lq.Lobby.fetchGameRecord"]);
    malformed.encodeRequest({ requestId: 4, method: ".lq.Lobby.fetchGameRecord", payload: { game_uuid: "x" } });
    const badBody = wrapper("", Uint8Array.of(0xff));
    expectFixed(() => malformed.decodeServerFrame(Uint8Array.from([
      3, 4, 0, ...badBody,
    ])));
  });

  test("rejects unknown notification types and wrong-direction frame types", () => {
    const unknown = codec([]);
    const unknownWrapper = wrapper(".lq.UnknownNotify", new Uint8Array());
    expectFixed(() => unknown.decodeServerFrame(Uint8Array.from([
      1, ...unknownWrapper,
    ])));

    const clientDirection = codec([]);
    expectFixed(() => clientDirection.decodeClientFrame(Uint8Array.of(1, 0)));
    const serverDirection = codec([]);
    expectFixed(() => serverDirection.decodeServerFrame(Uint8Array.of(2, 0, 0, 0)));
  });

  test("copies payload bytes and never mutates caller-owned inputs", () => {
    const subject = codec([".lq.Lobby.fetchGameRecord"]);
    const gameUuid = "copy-fixture";
    const payload = Object.freeze({ game_uuid: gameUuid });
    const frame = subject.encodeRequest({
      requestId: 22,
      method: ".lq.Lobby.fetchGameRecord",
      payload,
    });
    const pristine = frame.slice();
    frame.fill(0);
    expect(pristine[0]).toBe(2);
    expect(payload).toEqual({ game_uuid: gameUuid });
  });

  test("close and every protocol failure permanently poison all operations", () => {
    const closed = codec([".lq.Lobby.fetchInfo"]);
    closed.encodeRequest({ requestId: 1, method: ".lq.Lobby.fetchInfo", payload: {} });
    closed.close();
    expectFixed(() => closed.encodeRequest({ requestId: 2, method: ".lq.Lobby.fetchInfo", payload: {} }));
    expectFixed(() => closed.decodeServerFrame(responseFrame(1, ".lq.ResEmpty", {})));
    expectFixed(() => closed.decodeClientFrame(requestFrame(3, ".lq.Lobby.login", {})));
    expectFixed(() => closed.close());

    const failed = codec([".lq.Lobby.fetchInfo"]);
    expectFixed(() => failed.decodeServerFrame(Uint8Array.of(4)));
    expectFixed(() => failed.encodeRequest({ requestId: 1, method: ".lq.Lobby.fetchInfo", payload: {} }));
  });

  test("fixed errors never disclose protobuf prose, request payloads, or frame bytes", () => {
    const secret = "super-secret-token";
    const badPayload = codec([".lq.Lobby.oauth2Login"]);
    expectFixed(() => badPayload.encodeRequest({
      requestId: 1,
      method: ".lq.Lobby.oauth2Login",
      payload: { access_token: secret, type: "wrong" },
    }), [secret, "integer expected", "access_token"]);

    const badFrame = codec([]);
    expectFixed(() => badFrame.decodeClientFrame(Uint8Array.from([
      2, 0, 0, ...new TextEncoder().encode(secret),
    ])), [secret]);
  });
});
