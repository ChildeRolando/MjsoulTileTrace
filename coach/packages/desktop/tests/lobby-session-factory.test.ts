import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test } from "vitest";

import {
  loadMahjongSoulProtocolBundle,
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
  send(): void {}
  close(): void { this.closeCalls += 1; this.readyState = 3; }
}

describe("restricted fresh Lobby factory", () => {
  test("discovers one allowed CN route without authenticating or logging", async () => {
    const sockets: FakeSocket[] = [];
    const fetchImpl: GatewayDiscoveryFetch = async () => response({
      data: { routes: [{ domain: "route-2.maj-soul.com:443", ssl: true, state: "idle" }] },
    });
    const factory = createLobbySessionFactory({
      bundle,
      fetchImpl,
      WebSocketImpl: class extends FakeSocket {
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
        data: { routes: [{ domain: "route-2.maj-soul.com:443", ssl: true, state: "idle" }] },
      }),
      WebSocketImpl: class extends FakeSocket {
        constructor(url: string) { super(url); throw new Error(hostile); }
      },
    });
    await expect(failedSocket()).rejects.toThrow("mahjong_soul_catalog_sync_failed");
  });
});
