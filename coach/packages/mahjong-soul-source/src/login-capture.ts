import { MahjongSoulSourceError } from "./errors.js";
import {
  createLiqiCodec,
  type DecodedLiqiMessage,
  type LiqiCodec,
} from "./liqi-codec.js";
import {
  extractCapturedLoginCredential,
  type CapturedMahjongSoulCredential,
} from "./login-result.js";
import type { MahjongSoulProtocolBundle } from "./protocol-bundle.js";

const PROTOCOL_ERROR = "mahjong_soul_login_protocol_unsupported" as const;

export type LoginCaptureResult = Readonly<
  | {
    status: "authenticated";
    credential: CapturedMahjongSoulCredential;
  }
  | {
    status: "rejected";
  }
>;

export interface MahjongSoulLoginCapture {
  observeClientFrame(frame: Uint8Array): DecodedLiqiMessage;
  observeServerFrame(frame: Uint8Array): LoginCaptureResult | null;
  close(): void;
}

interface ExpectedLogin {
  readonly loginMethod: "login" | "oauth2Login";
  readonly accountId: number;
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

function validateExpected(value: unknown): ExpectedLogin | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw unsupported();
  const keys = Object.keys(value);
  const loginMethod = value.loginMethod;
  const accountId = value.accountId;
  if (
    keys.length !== 2
    || !keys.includes("loginMethod")
    || !keys.includes("accountId")
    || (loginMethod !== "login" && loginMethod !== "oauth2Login")
    || typeof accountId !== "number"
    || !Number.isInteger(accountId)
    || accountId < 1
    || accountId > 0xffff_ffff
  ) {
    throw unsupported();
  }
  return Object.freeze({ loginMethod, accountId });
}

function isRejectedResponse(message: DecodedLiqiMessage): boolean {
  if (message.kind !== "response") throw unsupported();
  const error = message.payload.error;
  if (error === undefined || error === null) return false;
  if (!isRecord(error)) throw unsupported();
  const code = error.code;
  if (typeof code !== "number" || !Number.isInteger(code)) {
    throw unsupported();
  }
  return code !== 0;
}

class StatefulLoginCapture implements MahjongSoulLoginCapture {
  readonly #codec: LiqiCodec;
  readonly #expected: ExpectedLogin | undefined;
  #closed = false;

  constructor(codec: LiqiCodec, expected: ExpectedLogin | undefined) {
    this.#codec = codec;
    this.#expected = expected;
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

  observeServerFrame(frame: Uint8Array): LoginCaptureResult | null {
    return this.#run(() => {
      const message = this.#codec.decodeServerFrame(frame);
      if (message.kind === "ignored") return null;
      if (message.kind !== "response" || message.requestContext?.source !== "observed_login") {
        throw unsupported();
      }
      if (isRejectedResponse(message)) {
        this.#terminate();
        return Object.freeze({ status: "rejected" as const });
      }

      const credential = extractCapturedLoginCredential(message);
      const expected = this.#expected;
      if (
        expected !== undefined
        && (
          credential.loginMethod !== expected.loginMethod
          || credential.accountId !== expected.accountId
        )
      ) {
        this.#terminate();
        return Object.freeze({ status: "rejected" as const });
      }
      this.#terminate();
      return Object.freeze({
        status: "authenticated" as const,
        credential,
      });
    });
  }

  close(): void {
    this.#terminate();
  }
}

export function createMahjongSoulLoginCapture(input: {
  readonly bundle: MahjongSoulProtocolBundle;
  readonly expected?: ExpectedLogin;
}): MahjongSoulLoginCapture {
  try {
    if (!isRecord(input)) throw unsupported();
    const keys = Object.keys(input);
    if (
      !keys.includes("bundle")
      || keys.some((key) => key !== "bundle" && key !== "expected")
    ) {
      throw unsupported();
    }
    const expected = validateExpected(input.expected);
    const codec = createLiqiCodec(input.bundle, {
      directCallMethods: [],
      surfacedNotifications: [],
    });
    return new StatefulLoginCapture(codec, expected);
  } catch {
    throw unsupported();
  }
}
