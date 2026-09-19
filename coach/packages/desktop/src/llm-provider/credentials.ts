import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";

const PROVIDER_ID = "openai-compatible";
const SCHEMA = "provider-credential/v1";
const MAX_BYTES = 64 * 1024;
const SECURE_BACKENDS = new Set(["gnome_libsecret", "kwallet", "kwallet5", "kwallet6"]);

/** Deliberately independent of the 32-byte session-key protector. */
export interface ProviderSafeStorage {
  isEncryptionAvailable(): boolean;
  getSelectedStorageBackend(): string;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export interface ProviderCredentialService {
  initialize(): Promise<void>;
  importCredential(): Promise<boolean>;
  clear(): Promise<boolean>;
  isConfigured(): Promise<boolean>;
  withCredential<T>(use: (key: string) => Promise<T>): Promise<T | undefined>;
}

/** The environment is consumed once per explicit import and immediately removed. */
export function environmentCredentialImporter(env: NodeJS.ProcessEnv): () => string | undefined {
  return () => {
    const value = env.RIICHI_COACH_API_KEY;
    delete env.RIICHI_COACH_API_KEY;
    return value;
  };
}

export function createProviderCredentialService(input: {
  root: string;
  safeStorage: ProviderSafeStorage;
  platform: NodeJS.Platform;
  importer: () => string | undefined | Promise<string | undefined>;
  rename?: (from: string, to: string) => Promise<void>;
}): ProviderCredentialService {
  const root = path.resolve(input.root);
  const active = path.join(root, "provider-credential.json");
  let key: string | undefined;
  // Serialize lifecycle operations with requests: clear drains the current use,
  // then drops memory and removes the record before acknowledging completion.
  let tail: Promise<unknown> = Promise.resolve();
  function exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const next = tail.then(operation); tail = next.catch(() => {}); return next;
  }
  function available(): boolean {
    try {
      return input.safeStorage.isEncryptionAvailable() === true
        && (input.platform !== "linux" || SECURE_BACKENDS.has(input.safeStorage.getSelectedStorageBackend()));
    } catch { return false; }
  }
  function valid(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0 && value.length <= 8192
      && !/[\x00-\x1f\x7f]/u.test(value);
  }
  async function ensureRoot(): Promise<void> {
    await mkdir(root, { recursive: true, mode: 0o700 });
    const info = await lstat(root);
    const resolved = await realpath(root);
    const normalize = (value: string) => process.platform === "win32" ? value.toLowerCase() : value;
    if (!info.isDirectory() || info.isSymbolicLink() || normalize(resolved) !== normalize(root)) throw Error();
  }
  async function initialize(): Promise<void> {
    key = undefined;
    try {
      if (!available()) return;
      await ensureRoot();
      const info = await lstat(active);
      if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES) return;
      const handle = await open(active, "r");
      let bytes: Buffer;
      try {
        const buffer = Buffer.alloc(MAX_BYTES + 1);
        let total = 0;
        while (total < buffer.length) {
          const result = await handle.read(buffer, total, buffer.length - total, null);
          if (result.bytesRead === 0) break;
          total += result.bytesRead;
        }
        if (total > MAX_BYTES) return;
        bytes = buffer.subarray(0, total);
      } finally { await handle.close(); }
      const record: unknown = JSON.parse(bytes.toString("utf8"));
      if (!record || typeof record !== "object" || Array.isArray(record)) return;
      const value = record as Record<string, unknown>;
      if (Object.keys(value).length !== 3 || value.schemaVersion !== SCHEMA
        || value.providerId !== PROVIDER_ID || typeof value.ciphertext !== "string") return;
      const cipher = Buffer.from(value.ciphertext, "base64");
      if (!cipher.length || cipher.toString("base64") !== value.ciphertext) return;
      const decrypted = input.safeStorage.decryptString(cipher);
      if (valid(decrypted)) key = decrypted;
    } catch { key = undefined; }
  }
  return Object.freeze({
    initialize: () => exclusive(initialize),
    importCredential: () => exclusive(async () => {
      let staging: string | undefined;
      try {
        // Consume input even when storage is unavailable; never retain env plaintext.
        const candidate = await input.importer();
        if (!available() || !valid(candidate)) throw Error();
        const cipher = input.safeStorage.encryptString(candidate);
        if (!Buffer.isBuffer(cipher) || !cipher.length || cipher.length > 32_768) throw Error();
        await ensureRoot();
        staging = path.join(root, `.provider-credential-${randomUUID()}.tmp`);
        const handle = await open(staging, "wx", 0o600);
        try {
          await handle.writeFile(JSON.stringify({ schemaVersion: SCHEMA, providerId: PROVIDER_ID, ciphertext: cipher.toString("base64") }), "utf8");
          await handle.sync();
        } finally { await handle.close(); }
        await (input.rename ?? rename)(staging, active);
        key = candidate;
        return true;
      } catch {
        // Old encrypted record is preserved; failed replacement disables runtime use.
        key = undefined;
        return false;
      } finally { if (staging) await rm(staging, { force: true }).catch(() => {}); }
    }),
    clear: () => exclusive(async () => {
      key = undefined;
      try { await ensureRoot(); await rm(active, { force: true }); return true; } catch { return false; }
    }),
    isConfigured: () => exclusive(async () => {
      if (!available()) key = undefined;
      return key !== undefined;
    }),
    withCredential: <T>(use: (secret: string) => Promise<T>) => exclusive(async () => {
      if (!available()) key = undefined;
      return key === undefined ? undefined : use(key);
    }),
  });
}
