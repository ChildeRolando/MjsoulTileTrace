import {
  createMahjongSoulRecordCapture,
  MahjongSoulSourceError,
  type MahjongSoulProtocolBundle,
  type MahjongSoulRecordCapture,
  type RecordCaptureResult,
} from "@riichi-coach/mahjong-soul-source";

const PROTOCOL_ERROR = "mahjong_soul_login_protocol_unsupported" as const;
const MAX_SOCKETS = 32;
const MAX_FRAME_BYTES = 4 * 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil(MAX_FRAME_BYTES / 3) * 4;

export interface CdpDebuggerPort {
  attach(version?: string): void | Promise<void>;
  detach(): void;
  isAttached(): boolean;
  sendCommand(
    method: string,
    parameters?: Record<string, unknown>,
  ): Promise<unknown>;
}

export interface CdpRecordObserver {
  start(): Promise<void>;
  accept(method: string, parameters: unknown): RecordCaptureResult | null;
  close(): void;
}

function unsupported(): MahjongSoulSourceError {
  return new MahjongSoulSourceError(PROTOCOL_ERROR);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function snapshotDebuggerPort(value: unknown): CdpDebuggerPort {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    throw unsupported();
  }
  const candidate = value as Record<keyof CdpDebuggerPort, unknown>;
  const attach = candidate.attach;
  const detach = candidate.detach;
  const isAttached = candidate.isAttached;
  const sendCommand = candidate.sendCommand;
  if (
    typeof attach !== "function"
    || typeof detach !== "function"
    || typeof isAttached !== "function"
    || typeof sendCommand !== "function"
  ) {
    throw unsupported();
  }
  return Object.freeze({
    attach: attach.bind(value) as CdpDebuggerPort["attach"],
    detach: detach.bind(value) as CdpDebuggerPort["detach"],
    isAttached: isAttached.bind(value) as CdpDebuggerPort["isAttached"],
    sendCommand: sendCommand.bind(value) as CdpDebuggerPort["sendCommand"],
  });
}

function decodeCanonicalBase64(value: unknown): Uint8Array {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > MAX_BASE64_LENGTH
    || value.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)
  ) {
    throw unsupported();
  }
  const bytes = Buffer.from(value, "base64");
  if (
    bytes.length === 0
    || bytes.length > MAX_FRAME_BYTES
    || bytes.toString("base64") !== value
  ) {
    throw unsupported();
  }
  return new Uint8Array(bytes);
}

class StatefulCdpRecordObserver implements CdpRecordObserver {
  readonly #bundle: MahjongSoulProtocolBundle;
  readonly #debugger: CdpDebuggerPort;
  readonly #allowedOrigins: ReadonlySet<string>;
  readonly #captures = new Map<string, MahjongSoulRecordCapture>();
  #started = false;
  #closed = false;

  constructor(bundle: MahjongSoulProtocolBundle, debuggerPort: CdpDebuggerPort) {
    this.#bundle = bundle;
    this.#debugger = debuggerPort;
    this.#allowedOrigins = new Set(bundle.endpoints.lobbyWebSocketOrigins);
  }

  #terminate(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const capture of this.#captures.values()) capture.close();
    this.#captures.clear();
    if (this.#debugger.isAttached()) {
      try {
        this.#debugger.detach();
      } catch {
        // Detachment has been attempted; callers only receive the fixed error.
      }
    }
  }

  #fail(): never {
    this.#terminate();
    throw unsupported();
  }

  async start(): Promise<void> {
    if (this.#started || this.#closed) throw unsupported();
    this.#started = true;
    try {
      await this.#debugger.attach("1.3");
      await this.#debugger.sendCommand("Network.enable");
    } catch {
      this.#fail();
    }
  }

  accept(method: string, parameters: unknown): RecordCaptureResult | null {
    if (!this.#started || this.#closed || typeof method !== "string") {
      throw unsupported();
    }
    if (
      method !== "Network.webSocketCreated"
      && method !== "Network.webSocketFrameSent"
      && method !== "Network.webSocketFrameReceived"
    ) {
      return null;
    }
    try {
      if (!isRecord(parameters)) throw unsupported();
      const requestId = parameters.requestId;
      if (typeof requestId !== "string" || requestId.length < 1 || requestId.length > 256) {
        throw unsupported();
      }

      if (method === "Network.webSocketCreated") {
        const rawUrl = parameters.url;
        if (
          typeof rawUrl !== "string"
          || this.#captures.has(requestId)
          || this.#captures.size >= MAX_SOCKETS
        ) {
          throw unsupported();
        }
        const url = new URL(rawUrl);
        if (
          url.protocol !== "wss:"
          || url.username !== ""
          || url.password !== ""
          || url.hash !== ""
          || !this.#allowedOrigins.has(url.origin)
        ) {
          throw unsupported();
        }
        this.#captures.set(requestId, createMahjongSoulRecordCapture({
          bundle: this.#bundle,
        }));
        return null;
      }

      const capture = this.#captures.get(requestId);
      const response = parameters.response;
      if (!capture || !isRecord(response)) throw unsupported();
      const opcode = response.opcode;
      const payloadData = response.payloadData;
      if (opcode !== 2) throw unsupported();
      const bytes = decodeCanonicalBase64(payloadData);
      if (method === "Network.webSocketFrameSent") {
        capture.observeClientFrame(bytes);
        return null;
      }
      const result = capture.observeServerFrame(bytes);
      if (result !== null) this.#terminate();
      return result;
    } catch {
      this.#fail();
    }
  }

  close(): void {
    this.#terminate();
  }
}

export function createCdpRecordObserver(input: {
  readonly bundle: MahjongSoulProtocolBundle;
  readonly debuggerPort: CdpDebuggerPort;
}): CdpRecordObserver {
  try {
    if (!isRecord(input)) throw unsupported();
    const keys = Object.keys(input);
    if (
      !keys.includes("bundle")
      || !keys.includes("debuggerPort")
      || keys.some((key) => key !== "bundle" && key !== "debuggerPort")
    ) {
      throw unsupported();
    }
    const debuggerPort = snapshotDebuggerPort(input.debuggerPort);
    return new StatefulCdpRecordObserver(input.bundle, debuggerPort);
  } catch {
    throw unsupported();
  }
}
