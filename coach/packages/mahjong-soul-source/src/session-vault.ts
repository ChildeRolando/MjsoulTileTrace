import {
  createCipheriv,
  createDecipheriv,
  randomBytes as nodeRandomBytes,
} from "node:crypto";

import { MahjongSoulSourceError } from "./errors.js";
import {
  snapshotMahjongSoulRecoveryContext,
  type CapturedMahjongSoulRestoreCandidate,
} from "./login-result.js";
import type { MahjongSoulOAuth2RecoveryContext } from "./liqi-codec.js";
import {
  MAHJONG_SOUL_CN_CLIENT_VERSION,
  MAHJONG_SOUL_PROTOCOL_ADAPTER_VERSION,
} from "./protocol-manifest.js";
import { SecretString } from "./secret-string.js";

const VAULT_VERSION = "mahjong-soul-session-vault/v2" as const;
const SESSION_INVALID = "mahjong_soul_session_invalid" as const;
const STORAGE_UNAVAILABLE = "mahjong_soul_session_storage_unavailable" as const;
const ENVELOPE_KEYS = Object.freeze([
  "version",
  "wrappedKey",
  "nonce",
  "ciphertext",
  "authenticationTag",
] as const);
const PAYLOAD_KEYS = Object.freeze([
  "region",
  "loginMethod",
  "authType",
  "accountId",
  "displayName",
  "accessToken",
  "recoveryContext",
  "adapterVersion",
  "clientVersion",
  "createdAt",
  "lastValidatedAt",
] as const);

export interface SessionKeyProtector {
  wrap(keyBase64: string): Promise<string>;
  unwrap(wrappedKey: string): Promise<string>;
}

export interface SessionVaultStore {
  read(): Promise<string | null>;
  replace(value: string): Promise<void>;
  clear(): Promise<void>;
}

export interface StoredMahjongSoulSession extends CapturedMahjongSoulRestoreCandidate {
  readonly adapterVersion: typeof MAHJONG_SOUL_PROTOCOL_ADAPTER_VERSION;
  readonly clientVersion: typeof MAHJONG_SOUL_CN_CLIENT_VERSION;
  readonly createdAt: number;
  readonly lastValidatedAt: number;
}

export interface MahjongSoulSessionVault {
  save(credential: CapturedMahjongSoulRestoreCandidate): Promise<void>;
  restore(): Promise<StoredMahjongSoulSession | null>;
  markValidated(at: number): Promise<void>;
  clear(): Promise<void>;
}

interface StoredSessionEnvelopeV1 {
  readonly version: typeof VAULT_VERSION;
  readonly wrappedKey: string;
  readonly nonce: string;
  readonly ciphertext: string;
  readonly authenticationTag: string;
}

interface PlainSessionPayload {
  readonly region: "cn";
  readonly loginMethod: "login" | "oauth2Login";
  readonly authType: number;
  readonly accountId: number;
  readonly displayName: string;
  readonly accessToken: string;
  readonly recoveryContext: MahjongSoulOAuth2RecoveryContext;
  readonly adapterVersion: typeof MAHJONG_SOUL_PROTOCOL_ADAPTER_VERSION;
  readonly clientVersion: typeof MAHJONG_SOUL_CN_CLIENT_VERSION;
  readonly createdAt: number;
  readonly lastValidatedAt: number;
}

function invalid(): MahjongSoulSourceError {
  return new MahjongSoulSourceError(SESSION_INVALID);
}

function unavailable(): MahjongSoulSourceError {
  return new MahjongSoulSourceError(STORAGE_UNAVAILABLE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isObjectLike(value: unknown): value is object {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function isUint32(value: unknown): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 0
    && value <= 0xffff_ffff;
}

function isPositiveUint32(value: unknown): value is number {
  return isUint32(value) && value > 0;
}

function isTimestamp(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0;
}

function canonicalBase64(value: unknown, expectedLength?: number): Buffer {
  if (typeof value !== "string" || value.length === 0) throw invalid();
  const bytes = Buffer.from(value, "base64");
  if (
    bytes.toString("base64") !== value
    || (expectedLength !== undefined && bytes.length !== expectedLength)
  ) {
    throw invalid();
  }
  return bytes;
}

function parseEnvelope(value: string): StoredSessionEnvelopeV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw invalid();
  }
  if (!isRecord(parsed) || !hasExactKeys(parsed, ENVELOPE_KEYS)) throw invalid();
  const version = parsed.version;
  const wrappedKey = parsed.wrappedKey;
  const nonce = parsed.nonce;
  const ciphertext = parsed.ciphertext;
  const authenticationTag = parsed.authenticationTag;
  if (
    version !== VAULT_VERSION
    || typeof wrappedKey !== "string"
    || wrappedKey.length < 1
    || wrappedKey.length > 16_384
    || typeof nonce !== "string"
    || typeof ciphertext !== "string"
    || typeof authenticationTag !== "string"
  ) {
    throw invalid();
  }
  canonicalBase64(nonce, 12);
  canonicalBase64(ciphertext);
  canonicalBase64(authenticationTag, 16);
  return { version, wrappedKey, nonce, ciphertext, authenticationTag };
}

function parsePayload(value: Buffer): PlainSessionPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value.toString("utf8"));
  } catch {
    throw invalid();
  }
  if (!isRecord(parsed) || !hasExactKeys(parsed, PAYLOAD_KEYS)) throw invalid();
  const region = parsed.region;
  const loginMethod = parsed.loginMethod;
  const authType = parsed.authType;
  const accountId = parsed.accountId;
  const displayName = parsed.displayName;
  const accessToken = parsed.accessToken;
  const recoveryContext = snapshotMahjongSoulRecoveryContext(parsed.recoveryContext);
  const adapterVersion = parsed.adapterVersion;
  const clientVersion = parsed.clientVersion;
  const createdAt = parsed.createdAt;
  const lastValidatedAt = parsed.lastValidatedAt;
  if (
    region !== "cn"
    || (loginMethod !== "login" && loginMethod !== "oauth2Login")
    || !isUint32(authType)
    || !isPositiveUint32(accountId)
    || typeof displayName !== "string"
    || displayName.length < 1
    || displayName.length > 64
    || typeof accessToken !== "string"
    || accessToken.length < 8
    || accessToken.length > 4096
    || adapterVersion !== MAHJONG_SOUL_PROTOCOL_ADAPTER_VERSION
    || clientVersion !== MAHJONG_SOUL_CN_CLIENT_VERSION
    || !isTimestamp(createdAt)
    || !isTimestamp(lastValidatedAt)
    || lastValidatedAt < createdAt
  ) {
    throw invalid();
  }
  return {
    region,
    loginMethod,
    authType,
    accountId,
    displayName,
    accessToken,
    recoveryContext,
    adapterVersion,
    clientVersion,
    createdAt,
    lastValidatedAt,
  };
}

function snapshotCredential(
  value: CapturedMahjongSoulRestoreCandidate,
): Omit<PlainSessionPayload, "adapterVersion" | "clientVersion" | "createdAt" | "lastValidatedAt"> {
  if (!isRecord(value)) throw invalid();
  const region = value.region;
  const loginMethod = value.loginMethod;
  const authType = value.authType;
  const accountId = value.accountId;
  const displayName = value.displayName;
  const accessToken = value.accessToken;
  const recoveryContext = snapshotMahjongSoulRecoveryContext(value.recoveryContext);
  if (
    region !== "cn"
    || (loginMethod !== "login" && loginMethod !== "oauth2Login")
    || !isUint32(authType)
    || !isPositiveUint32(accountId)
    || typeof displayName !== "string"
    || displayName.length < 1
    || displayName.length > 64
    || !(accessToken instanceof SecretString)
  ) {
    throw invalid();
  }
  return {
    region,
    loginMethod,
    authType,
    accountId,
    displayName,
    accessToken: accessToken.reveal(),
    recoveryContext,
  };
}

function toStoredSession(payload: PlainSessionPayload): StoredMahjongSoulSession {
  return Object.freeze({
    region: payload.region,
    loginMethod: payload.loginMethod,
    authType: payload.authType,
    accountId: payload.accountId,
    displayName: payload.displayName,
    accessToken: SecretString.from(payload.accessToken),
    recoveryContext: snapshotMahjongSoulRecoveryContext(payload.recoveryContext),
    adapterVersion: payload.adapterVersion,
    clientVersion: payload.clientVersion,
    createdAt: payload.createdAt,
    lastValidatedAt: payload.lastValidatedAt,
  });
}

function preserveProjectError(error: unknown): never {
  if (error instanceof MahjongSoulSourceError) throw error;
  throw unavailable();
}

export function createMahjongSoulSessionVault(input: {
  readonly protector: SessionKeyProtector;
  readonly store: SessionVaultStore;
  readonly now: () => number;
  readonly randomBytes?: (size: number) => Uint8Array;
}): MahjongSoulSessionVault {
  if (!isRecord(input)) throw unavailable();
  const protector = input.protector;
  const store = input.store;
  const now = input.now;
  const randomBytes = input.randomBytes ?? nodeRandomBytes;
  if (
    !isObjectLike(protector)
    || typeof protector.wrap !== "function"
    || typeof protector.unwrap !== "function"
    || !isObjectLike(store)
    || typeof store.read !== "function"
    || typeof store.replace !== "function"
    || typeof store.clear !== "function"
    || typeof now !== "function"
    || typeof randomBytes !== "function"
  ) {
    throw unavailable();
  }

  async function replace(payload: PlainSessionPayload): Promise<void> {
    let key: Buffer;
    let nonce: Buffer;
    try {
      key = Buffer.from(randomBytes(32));
      nonce = Buffer.from(randomBytes(12));
    } catch {
      throw unavailable();
    }
    if (key.length !== 32 || nonce.length !== 12) throw unavailable();

    let wrappedKey: string;
    try {
      wrappedKey = await protector.wrap(key.toString("base64"));
    } catch (error) {
      preserveProjectError(error);
    }
    if (typeof wrappedKey !== "string" || wrappedKey.length < 1 || wrappedKey.length > 16_384) {
      throw unavailable();
    }

    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(Buffer.from(VAULT_VERSION, "utf8"));
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(JSON.stringify(payload), "utf8")),
      cipher.final(),
    ]);
    const envelope: StoredSessionEnvelopeV1 = {
      version: VAULT_VERSION,
      wrappedKey,
      nonce: nonce.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      authenticationTag: cipher.getAuthTag().toString("base64"),
    };
    try {
      await store.replace(JSON.stringify(envelope));
    } catch (error) {
      preserveProjectError(error);
    }
  }

  async function restore(): Promise<StoredMahjongSoulSession | null> {
    let serialized: string | null;
    try {
      serialized = await store.read();
    } catch (error) {
      preserveProjectError(error);
    }
    if (serialized === null) return null;
    if (typeof serialized !== "string" || serialized.length > 65_536) throw invalid();
    const envelope = parseEnvelope(serialized);

    let keyBase64: string;
    try {
      keyBase64 = await protector.unwrap(envelope.wrappedKey);
    } catch (error) {
      preserveProjectError(error);
    }
    const key = canonicalBase64(keyBase64, 32);
    const nonce = canonicalBase64(envelope.nonce, 12);
    const ciphertext = canonicalBase64(envelope.ciphertext);
    const authenticationTag = canonicalBase64(envelope.authenticationTag, 16);
    let plaintext: Buffer;
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, nonce);
      decipher.setAAD(Buffer.from(VAULT_VERSION, "utf8"));
      decipher.setAuthTag(authenticationTag);
      plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);
    } catch {
      throw invalid();
    }
    return toStoredSession(parsePayload(plaintext));
  }

  return Object.freeze({
    async save(credential: CapturedMahjongSoulRestoreCandidate) {
      const captured = snapshotCredential(credential);
      let timestamp: number;
      try {
        timestamp = now();
      } catch {
        throw unavailable();
      }
      if (!isTimestamp(timestamp)) throw unavailable();
      await replace({
        ...captured,
        adapterVersion: MAHJONG_SOUL_PROTOCOL_ADAPTER_VERSION,
        clientVersion: MAHJONG_SOUL_CN_CLIENT_VERSION,
        createdAt: timestamp,
        lastValidatedAt: timestamp,
      });
    },
    restore,
    async markValidated(at: number) {
      if (!isTimestamp(at)) throw invalid();
      const existing = await restore();
      if (existing === null || at < existing.createdAt) throw invalid();
      await replace({
        region: existing.region,
        loginMethod: existing.loginMethod,
        authType: existing.authType,
        accountId: existing.accountId,
        displayName: existing.displayName,
        accessToken: existing.accessToken.reveal(),
        recoveryContext: existing.recoveryContext,
        adapterVersion: existing.adapterVersion,
        clientVersion: existing.clientVersion,
        createdAt: existing.createdAt,
        lastValidatedAt: at,
      });
    },
    async clear() {
      try {
        await store.clear();
      } catch (error) {
        preserveProjectError(error);
      }
    },
  });
}
