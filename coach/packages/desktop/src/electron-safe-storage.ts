import {
  MahjongSoulSourceError,
  type SessionKeyProtector,
} from "@riichi-coach/mahjong-soul-source";

const STORAGE_ERROR = "mahjong_soul_session_storage_unavailable" as const;
const SECURE_LINUX_BACKENDS = new Set([
  "gnome_libsecret",
  "kwallet",
  "kwallet5",
  "kwallet6",
]);

export interface SafeStoragePort {
  isAsyncEncryptionAvailable(): Promise<boolean>;
  getSelectedStorageBackend(): string;
  encryptStringAsync(value: string): Promise<Buffer>;
  decryptStringAsync(value: Buffer): Promise<{
    readonly result: string;
    readonly shouldReEncrypt: boolean;
  }>;
}

function unavailable(): MahjongSoulSourceError {
  return new MahjongSoulSourceError(STORAGE_ERROR);
}

function canonicalBase64(value: unknown, expectedLength?: number): Buffer {
  if (typeof value !== "string" || value.length === 0) throw unavailable();
  const bytes = Buffer.from(value, "base64");
  if (
    bytes.toString("base64") !== value
    || (expectedLength !== undefined && bytes.length !== expectedLength)
  ) {
    throw unavailable();
  }
  return bytes;
}

function isExactDecryptResult(value: unknown): value is {
  readonly result: string;
  readonly shouldReEncrypt: boolean;
} {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Object.keys(value);
  if (
    keys.length !== 2
    || !keys.includes("result")
    || !keys.includes("shouldReEncrypt")
  ) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.result === "string"
    && typeof record.shouldReEncrypt === "boolean";
}

export function createElectronSessionKeyProtector(input: {
  readonly safeStorage: SafeStoragePort;
  readonly platform: NodeJS.Platform;
}): SessionKeyProtector {
  const safeStorage = input.safeStorage;
  const platform = input.platform;

  async function assertAvailable(): Promise<void> {
    const available = await safeStorage.isAsyncEncryptionAvailable();
    if (available !== true) throw unavailable();
    if (
      platform === "linux"
      && !SECURE_LINUX_BACKENDS.has(safeStorage.getSelectedStorageBackend())
    ) {
      throw unavailable();
    }
  }

  return Object.freeze({
    async wrap(keyBase64: string): Promise<string> {
      try {
        canonicalBase64(keyBase64, 32);
        await assertAvailable();
        const encrypted = await safeStorage.encryptStringAsync(keyBase64);
        if (!Buffer.isBuffer(encrypted) || encrypted.length < 1 || encrypted.length > 16_384) {
          throw unavailable();
        }
        return encrypted.toString("base64");
      } catch {
        throw unavailable();
      }
    },
    async unwrap(wrappedKey: string): Promise<string> {
      try {
        const encrypted = canonicalBase64(wrappedKey);
        if (encrypted.length > 16_384) throw unavailable();
        await assertAvailable();
        const decrypted = await safeStorage.decryptStringAsync(encrypted);
        if (!isExactDecryptResult(decrypted)) throw unavailable();
        canonicalBase64(decrypted.result, 32);
        return decrypted.result;
      } catch {
        throw unavailable();
      }
    },
  });
}
