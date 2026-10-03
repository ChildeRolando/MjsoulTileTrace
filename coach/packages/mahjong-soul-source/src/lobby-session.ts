import { MahjongSoulSourceError } from "./errors.js";
import {
  createLiqiCodec,
  type DecodedLiqiMessage,
  type LiqiCodec,
} from "./liqi-codec.js";
import type { MahjongSoulProtocolBundle } from "./protocol-bundle.js";
import { SecretString } from "./secret-string.js";

const CATALOG_SYNC_FAILED = "mahjong_soul_catalog_sync_failed" as const;
const SESSION_INVALID = "mahjong_soul_session_invalid" as const;
const MAX_REQUEST_ID = 0xffff;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const ROUTE_BOOTSTRAP_METHOD = ".lq.Route.requestConnection" as const;

export interface LobbyTransport {
  sendFrame(frame: Uint8Array): Promise<void>;
  onFrame(handler: (frame: Uint8Array) => void): void;
  onClose(handler: () => void): void;
  close(): Promise<void>;
}

export type LobbyDirectCallMethod =
  | ".lq.Lobby.oauth2Check"
  | ".lq.Lobby.oauth2Login"
  | ".lq.Lobby.fetchInfo"
  | ".lq.Lobby.fetchGameRecordListV2"
  | ".lq.Lobby.fetchNextGameRecordList"
  | ".lq.Lobby.fetchGameRecordsDetail"
  | ".lq.Lobby.fetchGameRecord"
  | ".lq.Lobby.loginBeat";

const LOBBY_DIRECT_CALL_METHODS: readonly LobbyDirectCallMethod[] = Object.freeze([
  ".lq.Lobby.oauth2Check",
  ".lq.Lobby.oauth2Login",
  ".lq.Lobby.fetchInfo",
  ".lq.Lobby.fetchGameRecordListV2",
  ".lq.Lobby.fetchNextGameRecordList",
  ".lq.Lobby.fetchGameRecordsDetail",
  ".lq.Lobby.fetchGameRecord",
  ".lq.Lobby.loginBeat",
]);

export interface MahjongSoulLobbySession {
  authenticate(input: {
    readonly loginMethod: "login" | "oauth2Login";
    readonly token: SecretString;
    readonly authType: number;
  }): Promise<void>;
  call(
    method: LobbyDirectCallMethod,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<Readonly<Record<string, unknown>>>;
  close(): Promise<void>;
}

type InternalDirectCallMethod = LobbyDirectCallMethod
  | typeof ROUTE_BOOTSTRAP_METHOD;

interface PendingCall {
  resolve(payload: Readonly<Record<string, unknown>>): void;
  reject(error: Error): void;
  timer?: unknown;
}

function isObjectLike(value: unknown): value is object {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUint32(value: unknown): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 0
    && value <= 0xffff_ffff;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function catalogFailed(): MahjongSoulSourceError {
  return new MahjongSoulSourceError(CATALOG_SYNC_FAILED);
}

function sessionInvalid(): MahjongSoulSourceError {
  return new MahjongSoulSourceError(SESSION_INVALID);
}

export function createMahjongSoulLobbySession(input: {
  readonly bundle: MahjongSoulProtocolBundle;
  readonly transport: LobbyTransport;
  readonly routeBootstrap?: Readonly<{
    readonly routeId: string;
    readonly timestamp: number;
  }>;
  readonly requestTimeoutMs?: number;
  readonly setTimer?: (callback: () => void, milliseconds: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
}): MahjongSoulLobbySession & { readonly ready: Promise<void> } {
  const bundle = input.bundle;
  const transport = input.transport;
  const requestTimeoutMs = input.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const setTimer = input.setTimer ?? ((callback, milliseconds) => setTimeout(callback, milliseconds));
  const clearTimer = input.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const routeBootstrap = input.routeBootstrap;
  if (
    !isObjectLike(transport)
    || typeof transport.sendFrame !== "function"
    || typeof transport.onFrame !== "function"
    || typeof transport.onClose !== "function"
    || typeof transport.close !== "function"
    || !Number.isInteger(requestTimeoutMs)
    || requestTimeoutMs < 1
    || requestTimeoutMs > 120_000
    || typeof setTimer !== "function"
    || typeof clearTimer !== "function"
    || (routeBootstrap !== undefined && (
      !isRecord(routeBootstrap)
      || Object.keys(routeBootstrap).length !== 2
      || !Object.hasOwn(routeBootstrap, "routeId")
      || !Object.hasOwn(routeBootstrap, "timestamp")
      || typeof routeBootstrap.routeId !== "string"
      || routeBootstrap.routeId.length < 1
      || routeBootstrap.routeId.length > 256
      || routeBootstrap.routeId.trim().length === 0
      || /[\u0000-\u001f\u007f]/u.test(routeBootstrap.routeId)
      || typeof routeBootstrap.timestamp !== "number"
      || !Number.isSafeInteger(routeBootstrap.timestamp)
      || routeBootstrap.timestamp < 0
    ))
  ) {
    throw catalogFailed();
  }

  let codec: LiqiCodec;
  try {
    codec = createLiqiCodec(bundle, {
      directCallMethods: routeBootstrap === undefined
        ? [...LOBBY_DIRECT_CALL_METHODS]
        : [...LOBBY_DIRECT_CALL_METHODS, ROUTE_BOOTSTRAP_METHOD],
      surfacedNotifications: [],
    });
  } catch {
    throw catalogFailed();
  }

  const pending = new Map<number, PendingCall>();
  let nextRequestId = 1;
  let closed = false;
  let routeReady = Promise.resolve();

  function allocateRequestId(): number {
    for (let attempts = 0; attempts <= MAX_REQUEST_ID; attempts += 1) {
      const candidate = nextRequestId;
      nextRequestId = candidate >= MAX_REQUEST_ID ? 1 : candidate + 1;
      if (!pending.has(candidate)) return candidate;
    }
    throw catalogFailed();
  }

  function settle(requestId: number, decoded: DecodedLiqiMessage): void {
    const entry = pending.get(requestId);
    if (entry === undefined) return;
    pending.delete(requestId);
    if (entry.timer !== undefined) clearTimer(entry.timer);
    if (decoded.kind !== "response") {
      entry.reject(catalogFailed());
      return;
    }
    if (!isRecord(decoded.payload)) {
      entry.reject(catalogFailed());
      return;
    }
    entry.resolve(decoded.payload);
  }

  transport.onFrame((frame) => {
    if (closed) return;
    try {
      const decoded = codec.decodeServerFrame(frame);
      if (decoded.kind === "ignored") return;
      if (decoded.kind !== "response") return;
      settle(decoded.requestId, decoded);
    } catch {
      close();
    }
  });
  transport.onClose(() => {
    void close();
  });

  async function callInternal(
    method: InternalDirectCallMethod,
    payload: Readonly<Record<string, unknown>>,
    duringBootstrap = false,
  ): Promise<Readonly<Record<string, unknown>>> {
    if (closed) throw catalogFailed();
    if (
      routeBootstrap !== undefined
      && method !== ROUTE_BOOTSTRAP_METHOD
      && !duringBootstrap
    ) {
      await routeReady;
    }
    if (
      (method === ROUTE_BOOTSTRAP_METHOD && routeBootstrap === undefined)
      || (method !== ROUTE_BOOTSTRAP_METHOD && !LOBBY_DIRECT_CALL_METHODS.includes(method))
      || (method === ROUTE_BOOTSTRAP_METHOD && !duringBootstrap)
    ) {
      throw catalogFailed();
    }
    const requestId = allocateRequestId();
    let frame: Uint8Array;
    try {
      frame = codec.encodeRequest({ requestId, method, payload });
    } catch {
      pending.delete(requestId);
      throw catalogFailed();
    }
    return await new Promise<Readonly<Record<string, unknown>>>(
      (resolve, reject) => {
        const entry: PendingCall = { resolve, reject };
        pending.set(requestId, entry);
        const timer = setTimer(() => {
          const entry = pending.get(requestId);
          if (entry === undefined) return;
          pending.delete(requestId);
          entry.reject(catalogFailed());
          void close();
        }, requestTimeoutMs);
        if (pending.has(requestId)) entry.timer = timer;
        else clearTimer(timer);
        transport.sendFrame(frame).catch(() => {
          if (pending.has(requestId)) {
            const entry = pending.get(requestId)!;
            pending.delete(requestId);
            if (entry.timer !== undefined) clearTimer(entry.timer);
            reject(catalogFailed());
          }
        });
      },
    );
  }

  async function close(): Promise<void> {
    if (closed) return;
    closed = true;
    const error = catalogFailed();
    for (const entry of pending.values()) {
      if (entry.timer !== undefined) clearTimer(entry.timer);
      entry.reject(error);
    }
    pending.clear();
    try {
      codec.close();
    } catch {
      // codec close is idempotent; ignore a second close.
    }
    try {
      await transport.close();
    } catch {
      // transport close failure is not surfaced to the caller.
    }
  }

  async function bootstrapSelectedRoute(): Promise<void> {
    if (routeBootstrap === undefined) return;
    try {
      const response = await callInternal(ROUTE_BOOTSTRAP_METHOD, {
        type: 1,
        route_id: routeBootstrap.routeId,
        timestamp: routeBootstrap.timestamp,
        platform: "Web",
      }, true);
      if (
        !isRecord(response.error)
        || response.error.code !== 0
        || response.result !== 1
      ) {
        throw catalogFailed();
      }
    } catch {
      await close();
      throw catalogFailed();
    }
  }

  routeReady = bootstrapSelectedRoute();

  return Object.freeze({
    ready: routeReady,
    async authenticate(inputValue: {
      readonly loginMethod: "login" | "oauth2Login";
      readonly token: SecretString;
      readonly authType: number;
    }) {
      if (closed) throw catalogFailed();
      if (
        inputValue === null
        || typeof inputValue !== "object"
        || !(inputValue.token instanceof SecretString)
        || !isUint32(inputValue.authType)
      ) {
        throw catalogFailed();
      }
      if (inputValue.loginMethod === "login") {
        // `.lq.Lobby.login` is deliberately absent from the safe direct-call
        // allowlist; a password-login token cannot be replayed without the
        // account/password the product never stores. Fail closed.
        throw sessionInvalid();
      }
      if (inputValue.loginMethod !== "oauth2Login") {
        throw catalogFailed();
      }
      await callInternal(".lq.Lobby.oauth2Login", {
        type: inputValue.authType,
        access_token: inputValue.token.reveal(),
      });
    },
    call(
      method: LobbyDirectCallMethod,
      payload: Readonly<Record<string, unknown>>,
    ) {
      return callInternal(method, payload);
    },
    close,
  });
}
