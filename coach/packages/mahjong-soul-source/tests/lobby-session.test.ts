import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, type Root, type Type } from "protobufjs";
import { describe, expect, it } from "vitest";
import type { MahjongSoulProtocolBundle } from "../src/protocol-bundle.js";
import {
  createMahjongSoulLobbySession,
  type LobbyTransport,
} from "../src/lobby-session.js";
import { SecretString } from "../src/secret-string.js";

const fixtureDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);
const protoText = readFileSync(resolve(fixtureDir, "minimal-liqi.proto"), "utf8");
const rpcMap = JSON.parse(
  readFileSync(resolve(fixtureDir, "minimal-rpc-map.json"), "utf8"),
) as Record<string, { req: string; resp: string }>;
const root: Root = parse(protoText, { keepCase: true }).root;
const wrapperType = root.lookupType("lq.Wrapper");

const bundle = { protoText, rpcMap } as MahjongSoulProtocolBundle;

function encode(type: Type, value: Record<string, unknown>): Uint8Array {
  return type.encode(type.fromObject(value)).finish();
}

function responseFrame(
  requestId: number,
  responseTypeName: string,
  payload: Record<string, unknown>,
  name = "",
): Uint8Array {
  const body = encode(root.lookupType(responseTypeName), payload);
  const wrapped = encode(wrapperType, { name, data: body });
  return Uint8Array.from([3, requestId & 0xff, requestId >>> 8, ...wrapped]);
}

function decodeClientFrame(frame: Uint8Array): {
  requestId: number;
  name: string;
} {
  expect(frame[0]).toBe(2);
  const requestId = frame[1]! | (frame[2]! << 8);
  const decoded = wrapperType.decode(frame.subarray(3));
  const projected = wrapperType.toObject(decoded, {
    defaults: true,
    bytes: Uint8Array,
  }) as unknown as { name: string };
  return { requestId, name: projected.name };
}

function decodeRouteRequestPayload(frame: Uint8Array): Record<string, unknown> {
  const projected = wrapperType.toObject(
    wrapperType.decode(frame.subarray(3)),
    { defaults: true, bytes: Uint8Array },
  ) as unknown as { readonly data: Uint8Array };
  const requestType = root.lookupType("lq.ReqRequestConnection");
  return requestType.toObject(requestType.decode(projected.data), {
    defaults: true,
    longs: String,
    enums: Number,
    bytes: Uint8Array,
  }) as Record<string, unknown>;
}

class FakeTransport implements LobbyTransport {
  handler: ((frame: Uint8Array) => void) | null = null;
  closeHandler: (() => void) | null = null;
  sent: Uint8Array[] = [];
  closed = false;
  closeCalls = 0;

  async sendFrame(frame: Uint8Array): Promise<void> {
    this.sent.push(frame);
  }

  onFrame(handler: (frame: Uint8Array) => void): void {
    this.handler = handler;
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler;
  }

  async close(): Promise<void> {
    this.closeCalls += 1;
    this.closed = true;
  }

  deliver(frame: Uint8Array): void {
    if (this.handler === null) throw new Error("no handler");
    this.handler(frame);
  }


  disconnect(): void {
    this.closeHandler?.();
  }
}

const token = SecretString.from("super-secret-token");

describe("restricted Mahjong Soul lobby session", () => {

  it.each([null, { code: 0 }])("waits for a successful route bootstrap before sending a Lobby call: %j", async (error) => {
    const transport = new FakeTransport();
    const timestamp = 1_791_000_040_373;
    const session = createMahjongSoulLobbySession({
      bundle,
      transport,
      routeBootstrap: { routeId: "selected-route", timestamp },
    });
    const lobbyCall = session.call(".lq.Lobby.fetchInfo", {});

    expect(transport.sent).toHaveLength(1);
    expect(decodeClientFrame(transport.sent[0]!)).toEqual({
      requestId: 1,
      name: ".lq.Route.requestConnection",
    });
    expect(decodeRouteRequestPayload(transport.sent[0]!)).toMatchObject({
      type: 1,
      route_id: "selected-route",
      timestamp: String(timestamp),
      platform: "Web",
    });

    transport.deliver(responseFrame(1, ".lq.ResRequestConnection", {
      error,
      result: 1,
    }));
    await expect(session.ready).resolves.toBeUndefined();
    expect(transport.sent).toHaveLength(2);
    expect(decodeClientFrame(transport.sent[1]!)).toEqual({
      requestId: 2,
      name: ".lq.Lobby.fetchInfo",
    });
    transport.deliver(responseFrame(2, ".lq.ResEmpty", {}));
    await expect(lobbyCall).resolves.toEqual({});
    await session.close();
  });

  it.each([
    { error: { code: 9 }, result: 1 },
    { error: { code: 0 }, result: 0 },
    { error: { code: 0 }, result: 2 },
  ])("closes with a fixed error for a rejected route handshake %#", async (payload) => {
    const transport = new FakeTransport();
    const session = createMahjongSoulLobbySession({
      bundle,
      transport,
      routeBootstrap: { routeId: "selected-route", timestamp: 1_791_000_040_373 },
    });
    transport.deliver(responseFrame(1, ".lq.ResRequestConnection", payload));

    await expect(session.ready).rejects.toThrow("mahjong_soul_catalog_sync_failed");
    expect(transport.closed).toBe(true);
    expect(transport.sent).toHaveLength(1);
  });

  it("fails closed on an unknown route response and does not expose close errors", async () => {
    const transport = new FakeTransport();
    transport.close = async () => {
      transport.closeCalls += 1;
      throw new Error("hostile close failure");
    };
    const session = createMahjongSoulLobbySession({
      bundle,
      transport,
      routeBootstrap: { routeId: "selected-route", timestamp: 1_791_000_040_373 },
    });
    transport.deliver(responseFrame(1, ".lq.ResRequestConnection", {
      error: { code: 0 },
      result: 1,
    }, "unexpected-response-name"));

    await expect(session.ready).rejects.toThrow("mahjong_soul_catalog_sync_failed");
    expect(transport.closeCalls).toBe(1);
  });

  it("times out and cancels route bootstrap without sending Lobby calls", async () => {
    const timers: Array<() => void> = [];
    const transport = new FakeTransport();
    const session = createMahjongSoulLobbySession({
      bundle,
      transport,
      routeBootstrap: { routeId: "selected-route", timestamp: 1_791_000_040_373 },
      requestTimeoutMs: 50,
      setTimer: (callback) => { timers.push(callback); return callback; },
      clearTimer: () => {},
    });
    const lobbyCall = session.call(".lq.Lobby.fetchInfo", {});
    expect(transport.sent).toHaveLength(1);
    timers.shift()?.();
    await expect(session.ready).rejects.toThrow("mahjong_soul_catalog_sync_failed");
    await expect(lobbyCall).rejects.toThrow("mahjong_soul_catalog_sync_failed");
    expect(transport.closed).toBe(true);
    expect(transport.sent).toHaveLength(1);

    const cancelledTransport = new FakeTransport();
    const cancelled = createMahjongSoulLobbySession({
      bundle,
      transport: cancelledTransport,
      routeBootstrap: { routeId: "selected-route", timestamp: 1_791_000_040_373 },
    });
    await cancelled.close();
    await expect(cancelled.ready).rejects.toThrow("mahjong_soul_catalog_sync_failed");
    expect(cancelledTransport.closed).toBe(true);
    expect(cancelledTransport.sent).toHaveLength(1);
  });

  it("fails closed and closes the session after an unanswered call times out", async () => {
    const timers: Array<() => void> = [];
    const transport = new FakeTransport();
    const session = createMahjongSoulLobbySession({
      bundle,
      transport,
      requestTimeoutMs: 50,
      setTimer: (callback) => { timers.push(callback); return callback; },
      clearTimer: () => {},
    });
    const pending = session.call(".lq.Lobby.fetchInfo", {});
    timers.shift()?.();
    await expect(pending).rejects.toThrow("mahjong_soul_catalog_sync_failed");
    expect(transport.closed).toBe(true);
    await expect(session.call(".lq.Lobby.fetchInfo", {}))
      .rejects.toThrow("mahjong_soul_catalog_sync_failed");
  });

  it("rejects at the deadline even when the transport never finishes closing", async () => {
    const timers: Array<() => void> = [];
    const transport = new FakeTransport();
    transport.close = async () => await new Promise<void>(() => {});
    const session = createMahjongSoulLobbySession({
      bundle,
      transport,
      requestTimeoutMs: 50,
      setTimer: (callback) => { timers.push(callback); return callback; },
      clearTimer: () => {},
    });

    const pending = session.call(".lq.Lobby.fetchInfo", {});
    timers.shift()?.();

    await expect(pending).rejects.toThrow("mahjong_soul_catalog_sync_failed");
    await expect(session.call(".lq.Lobby.fetchInfo", {}))
      .rejects.toThrow("mahjong_soul_catalog_sync_failed");
  });

  it("immediately rejects pending and future calls when the open transport disconnects", async () => {
    const transport = new FakeTransport();
    const session = createMahjongSoulLobbySession({ bundle, transport });
    const pending = session.call(".lq.Lobby.fetchInfo", {});
    const second = session.call(".lq.Lobby.fetchGameRecordListV2", {});

    transport.disconnect();

    await expect(pending).rejects.toThrow("mahjong_soul_catalog_sync_failed");
    await expect(second).rejects.toThrow("mahjong_soul_catalog_sync_failed");
    await expect(session.call(".lq.Lobby.fetchInfo", {}))
      .rejects.toThrow("mahjong_soul_catalog_sync_failed");
  });
  it("encodes a safe call and correlates the response by request id", async () => {
    const transport = new FakeTransport();
    const session = createMahjongSoulLobbySession({ bundle, transport });

    const pending = session.call(".lq.Lobby.fetchGameRecordListV2", {});
    expect(transport.sent).toHaveLength(1);
    expect(decodeClientFrame(transport.sent[0]!)).toEqual({
      requestId: 1,
      name: ".lq.Lobby.fetchGameRecordListV2",
    });

    transport.deliver(responseFrame(1, ".lq.ResEmpty", {}));
    await expect(pending).resolves.toEqual({});
    await session.close();
  });

  it("rejects a non-allowlisted method with a fixed code", async () => {
    const transport = new FakeTransport();
    const session = createMahjongSoulLobbySession({ bundle, transport });

    await expect(
      session.call(".lq.Lobby.deleteAccount" as never, {}),
    ).rejects.toThrow("mahjong_soul_catalog_sync_failed");
    expect(transport.sent).toHaveLength(0);
    await session.close();
  });

  it("does not expose the Route bootstrap as a public Lobby call", async () => {
    const transport = new FakeTransport();
    const session = createMahjongSoulLobbySession({ bundle, transport });

    await expect(
      session.call(".lq.Route.requestConnection" as never, {}),
    ).rejects.toThrow("mahjong_soul_catalog_sync_failed");
    expect(transport.sent).toHaveLength(0);
    await session.close();
  });

  it("authenticates an oauth2Login session with the revealed token", async () => {
    const transport = new FakeTransport();
    const session = createMahjongSoulLobbySession({ bundle, transport });

    const pending = session.authenticate({
      loginMethod: "oauth2Login",
      token,
      authType: 7,
    });
    expect(transport.sent).toHaveLength(1);
    expect(decodeClientFrame(transport.sent[0]!)).toEqual({
      requestId: 1,
      name: ".lq.Lobby.oauth2Login",
    });
    transport.deliver(responseFrame(1, ".lq.ResLogin", { account_id: 1 }));
    await pending;
    await session.close();
  });

  it("fails closed for a password-login session that cannot be replayed", async () => {
    const transport = new FakeTransport();
    const session = createMahjongSoulLobbySession({ bundle, transport });

    await expect(session.authenticate({
      loginMethod: "login",
      token,
      authType: 0,
    })).rejects.toThrow("mahjong_soul_session_invalid");
    expect(transport.sent).toHaveLength(0);
    await session.close();
  });

  it("never leaks the token into a thrown error", async () => {
    const transport = new FakeTransport();
    const session = createMahjongSoulLobbySession({ bundle, transport });

    await expect(
      session.call(".lq.Lobby.deleteAccount" as never, {}),
    ).rejects.toThrow("mahjong_soul_catalog_sync_failed");
    await session.close();
    try {
      await session.call(".lq.Lobby.fetchInfo", {});
      throw new Error("expected closed session to fail");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain("super-secret-token");
    }
  });

  it("rejects calls after close", async () => {
    const transport = new FakeTransport();
    const session = createMahjongSoulLobbySession({ bundle, transport });
    await session.close();
    expect(transport.closed).toBe(true);
    await expect(session.call(".lq.Lobby.fetchInfo", {}))
      .rejects.toThrow("mahjong_soul_catalog_sync_failed");
  });
});
