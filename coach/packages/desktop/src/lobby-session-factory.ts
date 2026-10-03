import {
  MahjongSoulSourceError,
  createMahjongSoulLobbySession,
  discoverMahjongSoulCnLobbyRoute,
  type GatewayDiscoveryFetch,
  type MahjongSoulLobbySession,
  type MahjongSoulProtocolBundle,
} from "@riichi-coach/mahjong-soul-source";
import {
  createWebSocketLobbyTransport,
  type LobbyWebSocketConstructor,
} from "./lobby-transport.js";

const CATALOG_SYNC_FAILED = "mahjong_soul_catalog_sync_failed" as const;

export type LobbySessionFactory = () => Promise<MahjongSoulLobbySession>;

function failed(): MahjongSoulSourceError {
  return new MahjongSoulSourceError(CATALOG_SYNC_FAILED);
}

export function createLobbySessionFactory(input: {
  readonly bundle: MahjongSoulProtocolBundle;
  readonly fetchImpl?: GatewayDiscoveryFetch;
  readonly WebSocketImpl?: LobbyWebSocketConstructor;
  readonly connectTimeoutMs?: number;
  readonly requestTimeoutMs?: number;
  readonly now?: () => number;
}): LobbySessionFactory {
  const fetchImpl = input.fetchImpl
    ?? (globalThis as unknown as { fetch?: GatewayDiscoveryFetch }).fetch;
  if (typeof fetchImpl !== "function") throw failed();
  return async () => {
    let transport: ReturnType<typeof createWebSocketLobbyTransport> | null = null;
    try {
      const route = await discoverMahjongSoulCnLobbyRoute({
        bundle: input.bundle,
        fetchImpl,
      });
      transport = createWebSocketLobbyTransport({
        url: route.url,
        ...(input.WebSocketImpl === undefined
          ? {}
          : { WebSocketImpl: input.WebSocketImpl }),
        ...(input.connectTimeoutMs === undefined
          ? {}
          : { connectTimeoutMs: input.connectTimeoutMs }),
      });
      await transport.ready;
      const timestamp = (input.now ?? Date.now)();
      if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw failed();
      const session = createMahjongSoulLobbySession({
        bundle: input.bundle,
        transport,
        routeBootstrap: { routeId: route.routeId, timestamp },
        ...(input.requestTimeoutMs === undefined
          ? {}
          : { requestTimeoutMs: input.requestTimeoutMs }),
      });
      await session.ready;
      return session;
    } catch {
      if (transport !== null) {
        try { await transport.close(); } catch { /* fixed error below */ }
      }
      throw failed();
    }
  };
}
