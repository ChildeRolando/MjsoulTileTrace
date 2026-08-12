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
): Uint8Array {
  const body = encode(root.lookupType(responseTypeName), payload);
  const wrapped = encode(wrapperType, { name: "", data: body });
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

class FakeTransport implements LobbyTransport {
  handler: ((frame: Uint8Array) => void) | null = null;
  sent: Uint8Array[] = [];
  closed = false;

  async sendFrame(frame: Uint8Array): Promise<void> {
    this.sent.push(frame);
  }

  onFrame(handler: (frame: Uint8Array) => void): void {
    this.handler = handler;
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  deliver(frame: Uint8Array): void {
    if (this.handler === null) throw new Error("no handler");
    this.handler(frame);
  }
}

const token = SecretString.from("super-secret-token");

describe("restricted Mahjong Soul lobby session", () => {
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
