import {
  MahjongSoulSourceError,
  type LobbyTransport,
} from "@riichi-coach/mahjong-soul-source";

const CATALOG_SYNC_FAILED = "mahjong_soul_catalog_sync_failed" as const;
const DEFAULT_CONNECT_TIMEOUT_MS = 15_000;
const ALLOWED_ORIGINS = Object.freeze(new Set([
  "wss://route-2.maj-soul.com",
  "wss://route-3.maj-soul.com:8443",
  "wss://route-4.maj-soul.com",
  "wss://route-5.maj-soul.com",
  "wss://route-6.maj-soul.com",
]));

export interface LobbyWebSocketLike {
  binaryType: string;
  readonly readyState: number;
  onopen: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  send(data: Uint8Array): void;
  close(): void;
}

export type LobbyWebSocketConstructor = new (url: string) => LobbyWebSocketLike;

function failed(): MahjongSoulSourceError {
  return new MahjongSoulSourceError(CATALOG_SYNC_FAILED);
}

function validateUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 512) throw failed();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw failed();
  }
  if (
    url.protocol !== "wss:"
    || url.username !== ""
    || url.password !== ""
    || url.hash !== ""
    || url.search !== ""
    || url.pathname !== "/gateway"
    || !ALLOWED_ORIGINS.has(url.origin)
    || url.href !== value
  ) {
    throw failed();
  }
  return value;
}

export function createWebSocketLobbyTransport(input: {
  readonly url: string;
  readonly WebSocketImpl?: LobbyWebSocketConstructor;
  readonly connectTimeoutMs?: number;
}): LobbyTransport {
  try {
    const url = validateUrl(input.url);
    const WebSocketImpl = input.WebSocketImpl
      ?? (globalThis as unknown as { WebSocket?: LobbyWebSocketConstructor }).WebSocket;
    const connectTimeoutMs = input.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    if (
      typeof WebSocketImpl !== "function"
      || !Number.isInteger(connectTimeoutMs)
      || connectTimeoutMs < 1
      || connectTimeoutMs > 120_000
    ) {
      throw failed();
    }
    const socket = new WebSocketImpl(url);
    socket.binaryType = "arraybuffer";
    let handler: ((frame: Uint8Array) => void) | null = null;
    let closed = false;
    let settled = false;
    let rejectOpen: ((error: Error) => void) | null = null;
    const opened = new Promise<void>((resolve, reject) => {
      rejectOpen = reject;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        closed = true;
        try { socket.close(); } catch { /* fixed failure below */ }
        reject(failed());
      }, connectTimeoutMs);
      socket.onopen = () => {
        if (settled || closed) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const rejectBeforeOpen = () => {
        if (settled) return;
        settled = true;
        closed = true;
        clearTimeout(timer);
        reject(failed());
      };
      socket.onerror = rejectBeforeOpen;
      socket.onclose = rejectBeforeOpen;
    });
    void opened.catch(() => undefined);
    socket.onmessage = (event) => {
      if (closed || handler === null) return;
      const data = event.data;
      if (data instanceof ArrayBuffer) {
        handler(new Uint8Array(data.slice(0)));
      } else if (data instanceof Uint8Array) {
        handler(new Uint8Array(data));
      }
    };
    return Object.freeze({
      async sendFrame(frame: Uint8Array) {
        if (closed || !(frame instanceof Uint8Array)) throw failed();
        try {
          await opened;
          if (closed || socket.readyState !== 1) throw failed();
          socket.send(new Uint8Array(frame));
        } catch {
          throw failed();
        }
      },
      onFrame(next: (frame: Uint8Array) => void) {
        if (closed || typeof next !== "function" || handler !== null) throw failed();
        handler = next;
      },
      async close() {
        if (closed) return;
        closed = true;
        if (!settled) {
          settled = true;
          rejectOpen?.(failed());
        }
        handler = null;
        socket.onopen = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.onmessage = null;
        try { socket.close(); } catch { /* close remains best-effort */ }
      },
    });
  } catch {
    throw failed();
  }
}
