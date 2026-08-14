import { MahjongSoulSourceError } from "./errors.js";
import {
  createLiqiCodec,
  type DecodedLiqiMessage,
  type LiqiCodec,
} from "./liqi-codec.js";
import type { MahjongSoulProtocolBundle } from "./protocol-bundle.js";

const PROTOCOL_ERROR = "mahjong_soul_login_protocol_unsupported" as const;

// A passive capture for the official client's own `.lq.Lobby.fetchGameRecord`
// response. It surfaces the inline `data` bytes (the `GameDetailRecords`
// protobuf) and never touches login credentials, tokens or any request payload.
export type RecordCaptureResult = Readonly<{
  readonly status: "record_captured";
  readonly recordBytes: Uint8Array;
}>;

export interface MahjongSoulRecordCapture {
  observeClientFrame(frame: Uint8Array): DecodedLiqiMessage;
  observeServerFrame(frame: Uint8Array): RecordCaptureResult | null;
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

class StatefulRecordCapture implements MahjongSoulRecordCapture {
  readonly #codec: LiqiCodec;
  #closed = false;

  constructor(codec: LiqiCodec) {
    this.#codec = codec;
  }

  #terminate(): void {
    if (this.#closed) return;
    this.#closed = true;
    try {
      this.#codec.close();
    } catch {
      // The codec may already be poisoned by the frame that ended capture.
    }
  }

  #run<T>(operation: () => T): T {
    if (this.#closed) throw unsupported();
    try {
      return operation();
    } catch {
      this.#terminate();
      throw unsupported();
    }
  }

  observeClientFrame(frame: Uint8Array): DecodedLiqiMessage {
    return this.#run(() => this.#codec.decodeClientFrame(frame));
  }

  observeServerFrame(frame: Uint8Array): RecordCaptureResult | null {
    return this.#run(() => {
      const message = this.#codec.decodeServerFrame(frame);
      if (message.kind === "ignored") return null;
      if (message.kind !== "response" || message.method !== ".lq.Lobby.fetchGameRecord") {
        return null;
      }
      const payload = message.payload;
      const error = payload.error;
      if (error !== undefined && error !== null) {
        const code = isRecord(error) ? error.code : undefined;
        if (typeof code === "number" && Number.isInteger(code) && code !== 0) {
          return null;
        }
      }
      const data = payload.data;
      if (!(data instanceof Uint8Array) || data.length === 0) {
        return null;
      }
      this.#terminate();
      return Object.freeze({
        status: "record_captured" as const,
        recordBytes: Uint8Array.from(data),
      });
    });
  }

  close(): void {
    this.#terminate();
  }
}

export function createMahjongSoulRecordCapture(input: {
  readonly bundle: MahjongSoulProtocolBundle;
}): MahjongSoulRecordCapture {
  try {
    if (!isRecord(input)) throw unsupported();
    const keys = Object.keys(input);
    if (!keys.includes("bundle") || keys.some((key) => key !== "bundle")) {
      throw unsupported();
    }
    const codec = createLiqiCodec(input.bundle, {
      directCallMethods: [],
      surfacedNotifications: [],
    });
    return new StatefulRecordCapture(codec);
  } catch {
    throw unsupported();
  }
}
