import {
  parse as parseProtobuf,
  Type,
  type Message,
  type Root,
} from "protobufjs";
import { MahjongSoulSourceError } from "./errors.js";
import type { MahjongSoulProtocolBundle } from "./protocol-bundle.js";

const PROTOCOL_ERROR = "mahjong_soul_login_protocol_unsupported" as const;
const MAX_FRAME_BYTES = 4 * 1024 * 1024;
const MAX_PENDING_REQUESTS = 4096;

export const MAHJONG_SOUL_SAFE_DIRECT_CALL_METHODS = Object.freeze([
  ".lq.Lobby.oauth2Check",
  ".lq.Lobby.oauth2Login",
  ".lq.Lobby.fetchInfo",
  ".lq.Lobby.fetchGameRecordListV2",
  ".lq.Lobby.fetchNextGameRecordList",
  ".lq.Lobby.fetchGameRecordsDetail",
  ".lq.Lobby.fetchGameRecord",
  ".lq.Lobby.loginBeat",
  ".lq.Lobby.logout",
] as const);

export const MAHJONG_SOUL_SURFACED_NOTIFICATION_TYPES = Object.freeze(
  [] as const,
);

export const MAHJONG_SOUL_OBSERVED_LOGIN_METHODS = Object.freeze([
  ".lq.Lobby.login",
  ".lq.Lobby.oauth2Login",
] as const);

type ObservedLoginMethod =
  typeof MAHJONG_SOUL_OBSERVED_LOGIN_METHODS[number] extends `.lq.Lobby.${infer Name}`
    ? Name
    : never;

type DecodedPayload = Readonly<Record<string, unknown>>;

export type DecodedLiqiMessage =
  | Readonly<{
    kind: "request_observed";
    requestId: number;
    method: string;
  }>
  | Readonly<{
    kind: "response";
    requestId: number;
    method: string;
    payload: DecodedPayload;
    requestContext?: Readonly<{
      source: "observed_login";
      loginMethod: ObservedLoginMethod;
      authType: number;
    }>;
  }>
  | Readonly<{
    kind: "notify";
    name: string;
    payload: DecodedPayload;
  }>
  | Readonly<{
    kind: "ignored";
  }>;

export interface LiqiCodec {
  decodeClientFrame(frame: Uint8Array): DecodedLiqiMessage;
  decodeServerFrame(frame: Uint8Array): DecodedLiqiMessage;
  encodeRequest(input: {
    requestId: number;
    method: string;
    payload: Readonly<Record<string, unknown>>;
  }): Uint8Array;
  close(): void;
}

interface PendingRequest {
  method: string;
  responseType: Type;
  surfaced: boolean;
  origin: "observed_login" | "observed_ignored" | "direct_call";
  loginMethod: ObservedLoginMethod | null;
  loginAuthType: number | null;
}

interface WrapperValue {
  readonly name: string;
  readonly data: Uint8Array;
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

function isUint32(value: unknown): value is number {
  return Number.isInteger(value)
    && typeof value === "number"
    && value >= 0
    && value <= 0xffff_ffff;
}

function isRequestId(value: unknown): value is number {
  return Number.isInteger(value)
    && typeof value === "number"
    && value >= 0
    && value <= 0xffff;
}

function assertExactMessageInput(type: Type, value: unknown): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw unsupported();
  for (const key of Object.keys(value)) {
    if (type.fields[key] === undefined) throw unsupported();
  }
  if (type.verify(value) !== null) throw unsupported();

  for (const [key, child] of Object.entries(value)) {
    const field = type.fields[key]!;
    field.resolve();
    const scalarValues = field.repeated
      ? child
      : field.map
        ? isRecord(child) ? Object.values(child) : child
        : [child];
    if (
      (field.type === "uint32" || field.type === "fixed32")
      && (!Array.isArray(scalarValues) || scalarValues.some((item) => !isUint32(item)))
    ) {
      throw unsupported();
    }
    if (!(field.resolvedType instanceof Type)) continue;
    if (field.map) {
      if (!isRecord(child)) throw unsupported();
      for (const mapValue of Object.values(child)) {
        assertExactMessageInput(field.resolvedType, mapValue);
      }
    } else if (field.repeated) {
      if (!Array.isArray(child)) throw unsupported();
      for (const item of child) {
        assertExactMessageInput(field.resolvedType, item);
      }
    } else if (child !== undefined && child !== null) {
      assertExactMessageInput(field.resolvedType, child);
    }
  }
}

function toPayload(type: Type, message: Message): DecodedPayload {
  const payload = type.toObject(message, {
    defaults: true,
    arrays: true,
    objects: true,
    longs: String,
    enums: Number,
    bytes: Uint8Array,
  });
  if (!isRecord(payload)) throw unsupported();
  return payload;
}

function lookupType(root: Root, name: string): Type {
  const resolved = root.lookupType(name);
  if (!(resolved instanceof Type)) throw unsupported();
  return resolved;
}

function copyFrame(frame: Uint8Array): Uint8Array {
  if (!(frame instanceof Uint8Array)) throw unsupported();
  if (frame.length === 0 || frame.length > MAX_FRAME_BYTES) {
    throw unsupported();
  }
  return new Uint8Array(frame);
}

function readRequestId(frame: Uint8Array): number {
  if (frame.length < 3) throw unsupported();
  return frame[1]! | (frame[2]! << 8);
}

function readVarint(
  bytes: Uint8Array,
  offset: number,
): { readonly value: bigint; readonly next: number } {
  let value = 0n;
  for (let index = 0; index < 10; index += 1) {
    if (offset + index >= bytes.length) throw unsupported();
    const byte = bytes[offset + index]!;
    value |= BigInt(byte & 0x7f) << BigInt(index * 7);
    if ((byte & 0x80) === 0) {
      if (index === 9 && byte > 1) throw unsupported();
      return { value, next: offset + index + 1 };
    }
  }
  throw unsupported();
}

function readStrictUint32Field(
  bytes: Uint8Array,
  fieldId: number,
): number | undefined {
  let offset = 0;
  let found: number | undefined;
  while (offset < bytes.length) {
    const tag = readVarint(bytes, offset);
    offset = tag.next;
    const wireType = Number(tag.value & 7n);
    const currentFieldId = tag.value >> 3n;
    if (currentFieldId === 0n || currentFieldId > 0x1fff_ffffn) {
      throw unsupported();
    }

    if (wireType === 0) {
      const value = readVarint(bytes, offset);
      offset = value.next;
      if (currentFieldId === BigInt(fieldId)) {
        if (value.value > 0xffff_ffffn) throw unsupported();
        found = Number(value.value);
      }
      continue;
    }
    if (currentFieldId === BigInt(fieldId)) throw unsupported();
    if (wireType === 1) {
      offset += 8;
    } else if (wireType === 2) {
      const length = readVarint(bytes, offset);
      offset = length.next;
      if (length.value > BigInt(bytes.length - offset)) throw unsupported();
      offset += Number(length.value);
    } else if (wireType === 5) {
      offset += 4;
    } else {
      throw unsupported();
    }
    if (offset > bytes.length) throw unsupported();
  }
  return found;
}

function observedLoginMethod(method: string): ObservedLoginMethod | null {
  if (method === ".lq.Lobby.login") return "login";
  if (method === ".lq.Lobby.oauth2Login") return "oauth2Login";
  return null;
}

class StatefulLiqiCodec implements LiqiCodec {
  readonly #root: Root;
  readonly #wrapperType: Type;
  readonly #rpcMap: MahjongSoulProtocolBundle["rpcMap"];
  readonly #directCallMethods: ReadonlySet<string>;
  readonly #surfacedNotifications: ReadonlySet<string>;
  readonly #pending = new Map<number, PendingRequest>();
  #poisoned = false;

  constructor(
    bundle: MahjongSoulProtocolBundle,
    directCallMethods: ReadonlySet<string>,
    surfacedNotifications: ReadonlySet<string>,
  ) {
    this.#root = parseProtobuf(bundle.protoText, { keepCase: true }).root;
    this.#wrapperType = lookupType(this.#root, ".lq.Wrapper");
    this.#rpcMap = bundle.rpcMap;
    this.#directCallMethods = directCallMethods;
    this.#surfacedNotifications = surfacedNotifications;
  }

  #run<T>(operation: () => T): T {
    if (this.#poisoned) throw unsupported();
    try {
      return operation();
    } catch {
      this.#poisoned = true;
      this.#pending.clear();
      throw unsupported();
    }
  }

  #decodeWrapper(bytes: Uint8Array): WrapperValue {
    const decoded = this.#wrapperType.decode(bytes);
    const projected = this.#wrapperType.toObject(decoded, {
      defaults: true,
      bytes: Uint8Array,
    }) as unknown;
    if (
      !isRecord(projected)
      || typeof projected.name !== "string"
      || !(projected.data instanceof Uint8Array)
    ) {
      throw unsupported();
    }
    return { name: projected.name, data: projected.data };
  }

  #route(method: string): {
    readonly requestType: Type;
    readonly responseType: Type;
  } {
    const route = this.#rpcMap[method];
    if (
      route === undefined
      || typeof route.req !== "string"
      || typeof route.resp !== "string"
    ) {
      throw unsupported();
    }
    return {
      requestType: lookupType(this.#root, route.req),
      responseType: lookupType(this.#root, route.resp),
    };
  }

  #assertCanRegister(requestId: number): void {
    if (!isRequestId(requestId)) throw unsupported();
    if (
      this.#pending.has(requestId)
      || this.#pending.size >= MAX_PENDING_REQUESTS
    ) {
      throw unsupported();
    }
  }

  #register(requestId: number, pending: PendingRequest): void {
    this.#pending.set(requestId, pending);
  }

  decodeClientFrame(frame: Uint8Array): DecodedLiqiMessage {
    return this.#run(() => {
      const owned = copyFrame(frame);
      if (owned[0] !== 2) throw unsupported();
      const requestId = readRequestId(owned);
      this.#assertCanRegister(requestId);
      const wrapper = this.#decodeWrapper(owned.subarray(3));
      if (wrapper.name.length === 0) throw unsupported();
      const route = this.#route(wrapper.name);
      const request = route.requestType.decode(wrapper.data);
      const loginMethod = observedLoginMethod(wrapper.name);
      let loginAuthType: number | null = null;
      if (loginMethod !== null) {
        const authTypeField = route.requestType.fields.type;
        if (authTypeField === undefined) throw unsupported();
        const wireAuthType = readStrictUint32Field(
          wrapper.data,
          authTypeField.id,
        ) ?? 0;
        const payload = toPayload(route.requestType, request);
        const rawAuthType = payload.type ?? 0;
        if (!isUint32(rawAuthType) || rawAuthType !== wireAuthType) {
          throw unsupported();
        }
        loginAuthType = rawAuthType;
      }

      this.#register(requestId, {
        method: wrapper.name,
        responseType: route.responseType,
        surfaced: loginMethod !== null,
        origin: loginMethod === null ? "observed_ignored" : "observed_login",
        loginMethod,
        loginAuthType,
      });
      return loginMethod === null
        ? { kind: "ignored" }
        : {
            kind: "request_observed",
            requestId,
            method: wrapper.name,
          };
    });
  }

  decodeServerFrame(frame: Uint8Array): DecodedLiqiMessage {
    return this.#run(() => {
      const owned = copyFrame(frame);
      if (owned[0] === 1) {
        const wrapper = this.#decodeWrapper(owned.subarray(1));
        if (wrapper.name.length === 0) throw unsupported();
        const notifyType = lookupType(this.#root, wrapper.name);
        const decoded = notifyType.decode(wrapper.data);
        if (!this.#surfacedNotifications.has(wrapper.name)) {
          return { kind: "ignored" };
        }
        return {
          kind: "notify",
          name: wrapper.name,
          payload: toPayload(notifyType, decoded),
        };
      }
      if (owned[0] !== 3) throw unsupported();
      const requestId = readRequestId(owned);
      const pending = this.#pending.get(requestId);
      if (pending === undefined) throw unsupported();
      const wrapper = this.#decodeWrapper(owned.subarray(3));
      if (wrapper.name !== "") throw unsupported();
      const decoded = pending.responseType.decode(wrapper.data);
      const payload = toPayload(pending.responseType, decoded);
      this.#pending.delete(requestId);
      if (!pending.surfaced) return { kind: "ignored" };

      const base = {
        kind: "response" as const,
        requestId,
        method: pending.method,
        payload,
      };
      if (pending.origin !== "observed_login") return base;
      if (
        pending.loginMethod === null
        || pending.loginAuthType === null
      ) {
        throw unsupported();
      }
      return {
        ...base,
        requestContext: {
          source: "observed_login" as const,
          loginMethod: pending.loginMethod,
          authType: pending.loginAuthType,
        },
      };
    });
  }

  encodeRequest(input: {
    requestId: number;
    method: string;
    payload: Readonly<Record<string, unknown>>;
  }): Uint8Array {
    return this.#run(() => {
      if (!isRecord(input)) throw unsupported();
      const keys = Object.keys(input);
      if (
        keys.length !== 3
        || !keys.includes("requestId")
        || !keys.includes("method")
        || !keys.includes("payload")
        || typeof input.method !== "string"
      ) {
        throw unsupported();
      }
      this.#assertCanRegister(input.requestId);
      if (!this.#directCallMethods.has(input.method)) throw unsupported();
      const route = this.#route(input.method);
      assertExactMessageInput(route.requestType, input.payload);
      const requestData = route.requestType
        .encode(route.requestType.create(input.payload))
        .finish();
      const wrapperData = this.#wrapperType.encode(this.#wrapperType.create({
        name: input.method,
        data: requestData,
      })).finish();
      if (wrapperData.length + 3 > MAX_FRAME_BYTES) throw unsupported();

      const frame = new Uint8Array(wrapperData.length + 3);
      frame[0] = 2;
      frame[1] = input.requestId & 0xff;
      frame[2] = input.requestId >>> 8;
      frame.set(wrapperData, 3);
      this.#register(input.requestId, {
        method: input.method,
        responseType: route.responseType,
        surfaced: true,
        origin: "direct_call",
        loginMethod: null,
        loginAuthType: null,
      });
      return frame;
    });
  }

  close(): void {
    if (this.#poisoned) throw unsupported();
    this.#pending.clear();
    this.#poisoned = true;
  }
}

export function createLiqiCodec(
  bundle: MahjongSoulProtocolBundle,
  policy: {
    readonly directCallMethods: readonly string[];
    readonly surfacedNotifications: readonly string[];
  },
): LiqiCodec {
  try {
    if (
      bundle === null
      || typeof bundle !== "object"
      || policy === null
      || typeof policy !== "object"
      || !Array.isArray(policy.directCallMethods)
      || !Array.isArray(policy.surfacedNotifications)
    ) {
      throw unsupported();
    }
    const safeDirect = new Set<string>(MAHJONG_SOUL_SAFE_DIRECT_CALL_METHODS);
    const safeNotifications = new Set<string>(
      MAHJONG_SOUL_SURFACED_NOTIFICATION_TYPES,
    );
    for (const method of policy.directCallMethods) {
      if (typeof method !== "string" || !safeDirect.has(method)) {
        throw unsupported();
      }
    }
    for (const name of policy.surfacedNotifications) {
      if (typeof name !== "string" || !safeNotifications.has(name)) {
        throw unsupported();
      }
    }
    return new StatefulLiqiCodec(
      bundle,
      new Set(policy.directCallMethods),
      new Set(policy.surfacedNotifications),
    );
  } catch {
    throw unsupported();
  }
}
