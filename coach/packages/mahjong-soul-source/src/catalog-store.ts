import {
  createCipheriv,
  createDecipheriv,
  randomBytes as nodeRandomBytes,
} from "node:crypto";

import {
  AnalyzableRecordSummarySchema,
  type AnalyzableRecordSummary,
} from "@riichi-coach/contracts";
import { MahjongSoulSourceError } from "./errors.js";

const VAULT_VERSION = "mahjong-soul-catalog-vault/v2" as const;
const SESSION_INVALID = "mahjong_soul_session_invalid" as const;
const STORAGE_UNAVAILABLE = "mahjong_soul_session_storage_unavailable" as const;
// The product only exposes "recent 30" (spec §8.1). Capping the persisted catalog
// both honors that scope and bounds the serialized envelope against the read cap.
export const MAX_CATALOG_ENTRIES = 30;
const ENVELOPE_KEYS = Object.freeze([
  "version",
  "wrappedKey",
  "nonce",
  "ciphertext",
  "authenticationTag",
] as const);

export interface CatalogKeyProtector {
  wrap(keyBase64: string): Promise<string>;
  unwrap(wrappedKey: string): Promise<string>;
}

export interface CatalogVaultStore {
  read(): Promise<string | null>;
  replace(value: string): Promise<void>;
  clear(): Promise<void>;
}

export interface MahjongSoulCatalogStore {
  replaceSummaries(accountId: number, summaries: readonly AnalyzableRecordSummary[]): Promise<void>;
  list(accountId: number): Promise<AnalyzableRecordSummary[]>;
  clear(): Promise<void>;
}

interface StoredCatalogEnvelopeV1 {
  readonly version: typeof VAULT_VERSION;
  readonly wrappedKey: string;
  readonly nonce: string;
  readonly ciphertext: string;
  readonly authenticationTag: string;
}

interface StoredCatalogV2 {
  readonly accountId: number;
  readonly summaries: readonly AnalyzableRecordSummary[];
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

function parseEnvelope(value: string): StoredCatalogEnvelopeV1 {
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

function isAccountId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 0xffff_ffff;
}

function parseCatalog(value: Buffer): StoredCatalogV2 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value.toString("utf8"));
  } catch {
    throw invalid();
  }
  if (!isRecord(parsed) || !hasExactKeys(parsed, ["accountId", "summaries"])) throw invalid();
  if (!isAccountId(parsed.accountId) || !Array.isArray(parsed.summaries)) throw invalid();
  const summaries = parsed.summaries.map((entry) => {
    const result = AnalyzableRecordSummarySchema.safeParse(entry);
    if (!result.success) throw invalid();
    return Object.freeze(result.data);
  });
  return Object.freeze({ accountId: parsed.accountId, summaries: Object.freeze(summaries) });
}

function isSummary(value: unknown): value is AnalyzableRecordSummary {
  return AnalyzableRecordSummarySchema.safeParse(value).success;
}

function preserveProjectError(error: unknown): never {
  if (error instanceof MahjongSoulSourceError) throw error;
  throw unavailable();
}

export function createMahjongSoulCatalogStore(input: {
  readonly protector: CatalogKeyProtector;
  readonly store: CatalogVaultStore;
  readonly randomBytes?: (size: number) => Uint8Array;
}): MahjongSoulCatalogStore {
  if (!isRecord(input)) throw unavailable();
  const protector = input.protector;
  const store = input.store;
  const randomBytes = input.randomBytes ?? nodeRandomBytes;
  if (
    !isObjectLike(protector)
    || typeof protector.wrap !== "function"
    || typeof protector.unwrap !== "function"
    || !isObjectLike(store)
    || typeof store.read !== "function"
    || typeof store.replace !== "function"
    || typeof store.clear !== "function"
    || typeof randomBytes !== "function"
  ) {
    throw unavailable();
  }

  async function replace(catalog: StoredCatalogV2): Promise<void> {
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
    if (
      typeof wrappedKey !== "string"
      || wrappedKey.length < 1
      || wrappedKey.length > 16_384
    ) {
      throw unavailable();
    }

    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(Buffer.from(VAULT_VERSION, "utf8"));
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(JSON.stringify(catalog), "utf8")),
      cipher.final(),
    ]);
    const envelope: StoredCatalogEnvelopeV1 = {
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

  async function readCatalog(): Promise<StoredCatalogV2 | null> {
    let serialized: string | null;
    try {
      serialized = await store.read();
    } catch (error) {
      preserveProjectError(error);
    }
    if (serialized === null) return null;
    if (typeof serialized !== "string" || serialized.length > 1_048_576) {
      throw invalid();
    }
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
    return parseCatalog(plaintext);
  }

  return Object.freeze({
    async replaceSummaries(
      accountId: number,
      summaries: readonly AnalyzableRecordSummary[],
    ) {
      if (!isAccountId(accountId) || !Array.isArray(summaries) || summaries.some((entry) => !isSummary(entry))) {
        throw invalid();
      }
      const recordIds = new Set<string>();
      if (summaries.some((entry) => recordIds.has(entry.recordId) || !recordIds.add(entry.recordId))) {
        throw invalid();
      }
      const canonical = [...summaries]
        .sort((left, right) => right.startedAt - left.startedAt || left.recordId.localeCompare(right.recordId))
        .slice(0, MAX_CATALOG_ENTRIES);
      await replace(Object.freeze({ accountId, summaries: Object.freeze(canonical) }));
    },
    async list(accountId: number) {
      if (!isAccountId(accountId)) throw invalid();
      const catalog = await readCatalog();
      return catalog === null || catalog.accountId !== accountId ? [] : [...catalog.summaries];
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
