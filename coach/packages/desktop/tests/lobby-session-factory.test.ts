import { fileURLToPath } from "node:url";
import { parse } from "protobufjs";
import { beforeAll, describe, expect, test } from "vitest";

import {
  loadMahjongSoulProtocolBundle,
  SecretString,
  type GatewayDiscoveryFetch,
  type MahjongSoulProtocolBundle,
} from "@riichi-coach/mahjong-soul-source";
import {
  createLobbySessionFactory,
} from "../src/lobby-session-factory.js";
import type { LobbyWebSocketLike } from "../src/lobby-transport.js";

function response(body: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  return {
    ok: true,
    status: 200,
    redirected: false,
    url: "https://route-2.maj-soul.com/api/clientgate/routes?platform=Web&version=4.0.46&lang=chs_t",
    body: new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(bytes); controller.close(); },
    }),
  };
}

const bundleRoot = fileURLToPath(new URL(
  "../../../vendor/mahjong-soul-protocol/",
  import.meta.url,
));
let bundle: MahjongSoulProtocolBundle;

beforeAll(async () => {
  bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
});

class FakeSocket implements LobbyWebSocketLike {
  binaryType = "";
  readyState = 0;
  onopen: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  closeCalls = 0;
  constructor(readonly url: string) {}
  send(_data: Uint8Array): void {}
  close(): void { this.closeCalls += 1; this.readyState = 3; }
}

class ProtocolSocket extends FakeSocket {
  static opened = 0;
  static readonly requests: Array<{
    readonly method: string;
    readonly payload: Record<string, unknown>;
  }> = [];

  constructor(url: string) {
    super(url);
    queueMicrotask(() => {
      this.readyState = 1;
      ProtocolSocket.opened += 1;
      this.onopen?.({});
    });
  }

  send(frame: Uint8Array): void {
    const root = parse(bundle.protoText, { keepCase: true }).root;
    const wrapperType = root.lookupType(".lq.Wrapper");
    const wrapper = wrapperType.toObject(wrapperType.decode(frame.subarray(3)), {
      defaults: true,
      bytes: Uint8Array,
    }) as { readonly name: string; readonly data: Uint8Array };
    const route = bundle.rpcMap[wrapper.name];
    if (route === undefined) throw new Error("unexpected RPC");
    const requestType = root.lookupType(route.req);
    const payload = requestType.toObject(requestType.decode(wrapper.data), {
      defaults: true,
      longs: String,
      enums: Number,
      bytes: Uint8Array,
    }) as Record<string, unknown>;
    ProtocolSocket.requests.push({ method: wrapper.name, payload });

    const responseType = root.lookupType(route.resp);
    const responsePayload = wrapper.name === ".lq.Route.requestConnection"
      ? { result: 1 }
      : { error: { code: 0 }, account_id: "1" };
    const responseData = responseType.encode(
      responseType.fromObject(responsePayload),
    ).finish();
    const responseWrapper = wrapperType.encode(wrapperType.fromObject({
      name: "",
      data: responseData,
    })).finish();
    const responseFrame = new Uint8Array(3 + responseWrapper.length);
    responseFrame[0] = 3;
    responseFrame[1] = frame[1]!;
    responseFrame[2] = frame[2]!;
    responseFrame.set(responseWrapper, 3);
    this.onmessage?.({ data: responseFrame.buffer as ArrayBuffer });
  }
}

describe("restricted fresh Lobby factory", () => {
  test("discovers one allowed CN route without authenticating or logging", async () => {
    const sockets: FakeSocket[] = [];
    const fetchImpl: GatewayDiscoveryFetch = async () => response({
      data: { routes: [{ id: "route-2-id", domain: "route-2.maj-soul.com:443", ssl: true, state: "idle" }] },
    });
    const factory = createLobbySessionFactory({
      bundle,
      fetchImpl,
      WebSocketImpl: class extends ProtocolSocket {
        constructor(url: string) { super(url); sockets.push(this); }
      },
    });
    const session = await factory();
    expect(sockets.map(({ url }) => url)).toEqual([
      "wss://route-2.maj-soul.com/gateway",
    ]);
    expect(sockets[0]!.closeCalls).toBe(0);
    await session.close();
    expect(sockets[0]!.closeCalls).toBe(1);
  });

  test("maps discovery and socket construction failures to a fixed code", async () => {
    const hostile = "hostile-upstream-prose";
    const failedDiscovery = createLobbySessionFactory({
      bundle,
      fetchImpl: async () => { throw new Error(hostile); },
    });
    await expect(failedDiscovery()).rejects.toThrow("mahjong_soul_catalog_sync_failed");

    const failedSocket = createLobbySessionFactory({
      bundle,
      fetchImpl: async () => response({
        data: { routes: [{ id: "route-2-id", domain: "route-2.maj-soul.com:443", ssl: true, state: "idle" }] },
      }),
      WebSocketImpl: class extends FakeSocket {
        constructor(url: string) { super(url); throw new Error(hostile); }
      },
    });
    await expect(failedSocket()).rejects.toThrow("mahjong_soul_catalog_sync_failed");
  });

  test("bootstraps the selected route before the first Lobby RPC", async () => {
    ProtocolSocket.opened = 0;
    ProtocolSocket.requests.length = 0;
    const timestamp = 1_791_000_040_373;
    const factory = createLobbySessionFactory({
      bundle,
      now: () => {
        expect(ProtocolSocket.opened).toBe(1);
        return timestamp;
      },
      fetchImpl: async () => response({
        data: { routes: [
          { id: "route-two-id", domain: "route-2.maj-soul.com:443", ssl: true, state: "idle" },
          { id: "route-three-id", domain: "route-3.maj-soul.com:8443", ssl: true, state: "idle" },
        ] },
      }),
      WebSocketImpl: ProtocolSocket,
    });

    const session = await factory();
    expect(ProtocolSocket.requests).toHaveLength(1);
    expect(ProtocolSocket.requests[0]).toMatchObject({
      method: ".lq.Route.requestConnection",
      payload: {
        type: 1,
        route_id: "route-two-id",
        timestamp: String(timestamp),
        platform: "Web",
      },
    });

    await session.authenticate({
      loginMethod: "oauth2Login",
      token: SecretString.from("hidden-fixture-token"),
      authType: 0,
    });
    expect(ProtocolSocket.requests.map(({ method }) => method)).toEqual([
      ".lq.Route.requestConnection",
      ".lq.Lobby.oauth2Login",
    ]);
    await session.close();
  });

  test.each([Number.NaN, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects an unsafe Route timestamp and closes the opened socket (%s)",
    async (timestamp) => {
      ProtocolSocket.requests.length = 0;
      const sockets: FakeSocket[] = [];
      const factory = createLobbySessionFactory({
        bundle,
        now: () => timestamp,
        fetchImpl: async () => response({
          data: { routes: [{
            id: "route-two-id",
            domain: "route-2.maj-soul.com:443",
            ssl: true,
            state: "idle",
          }] },
        }),
        WebSocketImpl: class extends ProtocolSocket {
          constructor(url: string) { super(url); sockets.push(this); }
        },
      });

      await expect(factory()).rejects.toThrow("mahjong_soul_catalog_sync_failed");
      expect(sockets).toHaveLength(1);
      expect(sockets[0]!.closeCalls).toBe(1);
      expect(ProtocolSocket.requests).toHaveLength(0);
    },
  );
});
