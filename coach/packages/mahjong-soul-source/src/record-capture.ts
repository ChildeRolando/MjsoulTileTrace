import { MahjongSoulSourceError } from "./errors.js";
import {
  createLiqiCodec,
  type DecodedLiqiMessage,
  type LiqiCodec,
} from "./liqi-codec.js";
import type { MahjongSoulProtocolBundle } from "./protocol-bundle.js";
import { unwrapGameDetailRecords } from "./record-wire.js";

const PROTOCOL_ERROR = "mahjong_soul_login_protocol_unsupported" as const;

// A passive capture for the official client's own `.lq.Lobby.fetchGameRecord`
// response. It surfaces the inner `GameDetailRecords` bytes (the unified
// `recordBytes`, after the strict outer-Wrapper unwrap) plus the minimal
// record identity from the SAME response (`ResGameRecord.head`:
// `.lq.RecordGame` with `uuid` and `accounts[]{account_id, seat}`) — never
// login credentials, tokens, nicknames or any request payload.
export interface MahjongSoulRecordIdentityAccount {
  readonly accountId: number;
  readonly seat: number;
}

export type MahjongSoulCapturedRecordIdentity = Readonly<{
  readonly recordId: string;
  readonly accounts: readonly MahjongSoulRecordIdentityAccount[];
}>;

export type RecordCaptureResult = Readonly<{
  readonly status: "record_captured";
  readonly recordBytes: Uint8Array;
  readonly recordIdentity: MahjongSoulCapturedRecordIdentity;
}>;

export interface MahjongSoulRecordCapture {
  observeClientFrame(frame: Uint8Array): DecodedLiqiMessage;
  observeServerFrame(frame: Uint8Array): RecordCaptureResult | null;
  close(): void;
}

function unsupported(): MahjongSoulSourceError {
  return new MahjongSoulSourceError(PROTOCOL_ERROR);
}

// Strict extraction of the minimal record identity from a decoded
// `ResGameRecord.head` (lq.RecordGame): uuid + accounts[]{account_id, seat}.
// The codec parses with keepCase:true, so payload keys keep their wire names
// (`account_id`, `seat` — verified empirically against the real decode path).
// Anything structurally off (missing head, empty/non-string uuid, malformed
// account list, non-integer ids) fails closed — a successful data capture
// without usable identity metadata is not a usable capture for the URL
// import route, and half-results must not leak downstream.
function extractRecordIdentity(head: unknown): MahjongSoulCapturedRecordIdentity {
  if (!isRecord(head)) throw unsupported();
  const recordId = head.uuid;
  if (typeof recordId !== "string" || recordId.length === 0) throw unsupported();
  const rawAccounts = head.accounts;
  if (!Array.isArray(rawAccounts) || rawAccounts.length === 0) throw unsupported();
  const accounts: MahjongSoulRecordIdentityAccount[] = [];
  for (const raw of rawAccounts) {
    if (!isRecord(raw)) throw unsupported();
    const accountId = raw.account_id;
    const seat = raw.seat;
    if (
      typeof accountId !== "number"
      || !Number.isInteger(accountId)
      || accountId < 1
      || accountId > 4_294_967_295
      || typeof seat !== "number"
      || !Number.isInteger(seat)
      || seat < 0
      || seat > 0xffff_ffff
    ) {
      throw unsupported();
    }
    accounts.push(Object.freeze({ accountId, seat }));
  }
  return Object.freeze({ recordId, accounts: Object.freeze(accounts) });
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
  readonly #bundle: MahjongSoulProtocolBundle;
  #closed = false;

  constructor(codec: LiqiCodec, bundle: MahjongSoulProtocolBundle) {
    this.#codec = codec;
    this.#bundle = bundle;
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
      const recordBytes = unwrapGameDetailRecords(this.#bundle, data);
      // The identity comes from the SAME response: ResGameRecord.head is the
      // lq.RecordGame metadata (uuid + accounts[]{account_id, seat}). Only
      // the identity fields are surfaced — nicknames and everything else
      // stay unparsed. A data-bearing response without structurally valid
      // identity metadata is a protocol violation and fails closed.
      const recordIdentity = extractRecordIdentity(payload.head);
      this.#terminate();
      return Object.freeze({
        status: "record_captured" as const,
        recordBytes: Uint8Array.from(recordBytes),
        recordIdentity,
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
    return new StatefulRecordCapture(codec, input.bundle);
  } catch {
    throw unsupported();
  }
}
