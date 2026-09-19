import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, realpath, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

const PROVIDER_ID = "openai-compatible";
const SECURE_BACKENDS = new Set(["gnome_libsecret", "kwallet", "kwallet5", "kwallet6"]);
const unavailable = () => new Error("provider_unavailable");

/** Deliberately independent of the canonical 32-byte session-key protector. */
export interface ProviderSafeStorage {
  isEncryptionAvailable(): boolean;
  getSelectedStorageBackend(): string;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export function createEnvironmentKeyImporter(environment: NodeJS.ProcessEnv): () => string | undefined {
  return () => {
    const value = environment.RIICHI_COACH_API_KEY;
    delete environment.RIICHI_COACH_API_KEY;
    return value;
  };
}

function validKey(value: unknown): value is string {
  // HTTP header field-value: no controls, no silent trimming or base64 assumptions.
  return typeof value === "string" && /^[\x21-\x7e]{1,8192}$/.test(value);
}

export function createProviderCredentials(input: {
  userData: string;
  safeStorage: ProviderSafeStorage;
  platform: NodeJS.Platform;
  importer: () => string | undefined | Promise<string | undefined>;
  /** Fault-injection seam for atomic replacement; never exposed over IPC. */
  rename?: typeof rename;
}) {
  const root = resolve(input.userData);
  const target = join(root, "coach-provider-credential.json");
  let blocked = false;
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation); queue = result.catch(() => undefined); return result;
  }
  function available(): void {
    if (!input.safeStorage.isEncryptionAvailable()
      || (input.platform === "linux" && !SECURE_BACKENDS.has(input.safeStorage.getSelectedStorageBackend()))) throw unavailable();
  }
  async function ownedRoot(): Promise<void> {
    await mkdir(root, { recursive: true, mode: 0o700 });
    const info = await lstat(root);
    const normalized = (path: string) => input.platform === "win32" ? path.toLowerCase() : path;
    if (!info.isDirectory() || info.isSymbolicLink() || normalized(await realpath(root)) !== normalized(root)) throw unavailable();
  }
  return Object.freeze({
    importCredential: () => serial(async () => {
      let key: string | undefined;
      let staging: string | undefined;
      try {
        // Consume even when encryption is unavailable; no lingering env plaintext.
        key = await input.importer();
        available();
        if (!validKey(key)) throw unavailable();
        const bytes = input.safeStorage.encryptString(key);
        if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > 32768) throw unavailable();
        const record = JSON.stringify({ schemaVersion: "provider-credential/v1", providerId: PROVIDER_ID, ciphertext: bytes.toString("base64") });
        await ownedRoot();
        staging = join(root, `.coach-provider-${randomUUID()}.tmp`);
        const file = await open(staging, "wx", 0o600);
        try { await file.writeFile(record, "utf8"); await file.sync(); } finally { await file.close(); }
        await (input.rename ?? rename)(staging, target);
        blocked = false;
      } catch {
        // Keep the previous encrypted record intact, but disable this instance
        // until explicit successful import or a fresh, validated restart.
        blocked = true;
        throw unavailable();
      } finally {
        key = undefined;
        if (staging !== undefined) await rm(staging, { force: true }).catch(() => undefined);
      }
    }),
    readKey: () => serial(async (): Promise<string | null> => {
      if (blocked) return null;
      try {
        available(); await ownedRoot();
        const info = await lstat(target);
        if (!info.isFile() || info.isSymbolicLink() || info.size > 65536) throw unavailable();
        const record: unknown = JSON.parse(await readFile(target, "utf8"));
        if (record === null || typeof record !== "object" || Array.isArray(record)) throw unavailable();
        const r = record as Record<string, unknown>;
        if (Object.keys(r).sort().join() !== "ciphertext,providerId,schemaVersion"
          || r.schemaVersion !== "provider-credential/v1" || r.providerId !== PROVIDER_ID || typeof r.ciphertext !== "string") throw unavailable();
        const bytes = Buffer.from(r.ciphertext, "base64");
        if (bytes.length === 0 || bytes.length > 32768 || bytes.toString("base64") !== r.ciphertext) throw unavailable();
        const key = input.safeStorage.decryptString(bytes);
        if (!validKey(key)) throw unavailable();
        return key;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") blocked = true;
        return null;
      }
    }),
    clear: () => serial(async () => {
      blocked = true;
      try { await ownedRoot(); await rm(target, { force: true }); }
      catch { throw unavailable(); }
    }),
  });
}
export type ProviderCredentials = ReturnType<typeof createProviderCredentials>;
