import { MahjongSoulSourceError } from "./errors.js";
import type { MahjongSoulProtocolBundle } from "./protocol-bundle.js";

const CATALOG_SYNC_FAILED = "mahjong_soul_catalog_sync_failed" as const;
const MAX_DISCOVERY_BYTES = 64 * 1024;
const DISCOVERY_PATH = "/api/clientgate/routes?platform=Web&version=4.0.46&lang=chs_t";
const DEFAULT_TIMEOUT_MS = 15_000;

export interface GatewayDiscoveryResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly redirected: boolean;
  readonly url: string;
  readonly body: ReadableStream<Uint8Array> | null;
}

export type GatewayDiscoveryFetch = (
  url: string,
  init?: Readonly<Record<string, unknown>>,
) => Promise<GatewayDiscoveryResponse>;

function failed(): MahjongSoulSourceError {
  return new MahjongSoulSourceError(CATALOG_SYNC_FAILED);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

async function readBoundedJson(
  body: ReadableStream<Uint8Array> | null,
  signal: AbortSignal,
): Promise<unknown> {
  if (body === null || typeof body.getReader !== "function") throw failed();
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let length = 0;
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    if (signal.aborted) {
      await reader.cancel();
      throw failed();
    }
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (!(next.value instanceof Uint8Array)) throw failed();
      length += next.value.length;
      if (length > MAX_DISCOVERY_BYTES) throw failed();
      parts.push(new Uint8Array(next.value));
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    try { reader.releaseLock(); } catch { /* reader may already be cancelled */ }
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw failed();
  }
}

function exactWebSocketUrl(
  value: unknown,
  allowedOrigins: ReadonlySet<string>,
): string | null {
  if (!isRecord(value) || value.state !== "idle" || value.ssl !== true) return null;
  const domain = value.domain;
  if (
    typeof domain !== "string"
    || domain.length < 1
    || domain.length > 256
    || /[\s/\\?#@]/u.test(domain)
    || domain.includes("://")
  ) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(`wss://${domain}/gateway`);
  } catch {
    return null;
  }
  if (
    url.protocol !== "wss:"
    || url.username !== ""
    || url.password !== ""
    || url.hash !== ""
    || url.search !== ""
    || url.pathname !== "/gateway"
    || !allowedOrigins.has(url.origin)
  ) {
    return null;
  }
  return url.href;
}

export async function discoverMahjongSoulCnLobbyUrl(input: {
  readonly bundle: MahjongSoulProtocolBundle;
  readonly fetchImpl: GatewayDiscoveryFetch;
  readonly timeoutMs?: number;
}): Promise<string> {
  let body: ReadableStream<Uint8Array> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  try {
    if (!isRecord(input) || typeof input.fetchImpl !== "function") throw failed();
    const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (
      !Number.isInteger(timeoutMs)
      || timeoutMs < 1
      || timeoutMs > 120_000
    ) {
      throw failed();
    }
    const origin = input.bundle.endpoints.gatewayDiscoveryOrigins[0];
    if (origin !== "https://route-2.maj-soul.com") throw failed();
    const requestUrl = `${origin}${DISCOVERY_PATH}`;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(failed());
      }, timeoutMs);
    });
    const response = await Promise.race([
      input.fetchImpl(requestUrl, Object.freeze({
        method: "GET",
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal,
      })),
      timeout,
    ]);
    if (
      !isRecord(response)
      || response.ok !== true
      || response.status !== 200
      || response.redirected !== false
      || response.url !== requestUrl
    ) {
      throw failed();
    }
    body = response.body;
    const decoded = await Promise.race([readBoundedJson(body, controller.signal), timeout]);
    if (!isRecord(decoded) || !isRecord(decoded.data)) throw failed();
    const routes = decoded.data.routes;
    if (!Array.isArray(routes) || routes.length < 1 || routes.length > 64) {
      throw failed();
    }
    const allowed = new Set(input.bundle.endpoints.lobbyWebSocketOrigins);
    for (const route of routes) {
      const url = exactWebSocketUrl(route, allowed);
      if (url !== null) return url;
    }
    throw failed();
  } catch {
    throw failed();
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
