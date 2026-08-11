import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename as fsRename,
  rm as fsRm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  MahjongSoulSourceError,
  type SessionVaultStore,
} from "@riichi-coach/mahjong-soul-source";

const STORAGE_ERROR = "mahjong_soul_session_storage_unavailable" as const;
const ACTIVE_NAME = "session.vault.json";
const LOCK_NAME = ".session-vault.update-lock";
const MAXIMUM_BYTES = 64 * 1024;
const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const BACKUP_PATTERN = new RegExp(`^session\\.vault\\.backup-${UUID_PATTERN}$`, "u");
const STAGING_PATTERN = new RegExp(`^session\\.vault\\.staging-${UUID_PATTERN}$`, "u");

export interface SessionFileOperations {
  rename(source: string, target: string): Promise<void>;
  rm(target: string, options?: { readonly recursive?: boolean; readonly force?: boolean }): Promise<void>;
}

interface UpdateLock {
  readonly directory: string;
  readonly token: string;
}

function unavailable(): MahjongSoulSourceError {
  return new MahjongSoulSourceError(STORAGE_ERROR);
}

function normalized(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && new RegExp(`^${UUID_PATTERN}$`, "u").test(value);
}

async function ensureOwnedRoot(root: string): Promise<void> {
  if (!path.isAbsolute(root) || normalized(root) !== normalized(path.resolve(root))) {
    throw unavailable();
  }
  await mkdir(root, { recursive: true, mode: 0o700 });
  const stats = await lstat(root);
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw unavailable();
  const resolved = await realpath(root);
  if (normalized(resolved) !== normalized(root)) throw unavailable();
}

async function exists(target: string): Promise<boolean> {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return false;
    if (code === "EPERM") return true;
    throw error;
  }
}

async function readOwner(lockDirectory: string): Promise<{
  readonly pid: number;
  readonly token: string;
}> {
  const ownerPath = path.join(lockDirectory, "owner.json");
  let value: unknown;
  try {
    const serialized = await readBoundedRegularFile(ownerPath, 1024);
    if (serialized === null) throw unavailable();
    value = JSON.parse(serialized);
  } catch {
    throw unavailable();
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw unavailable();
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== 2
    || !keys.includes("pid")
    || !keys.includes("token")
    || typeof record.pid !== "number"
    || !Number.isSafeInteger(record.pid)
    || record.pid <= 0
    || !isUuid(record.token)
  ) {
    throw unavailable();
  }
  return { pid: record.pid, token: record.token };
}

async function acquireLock(
  root: string,
  operations: SessionFileOperations,
): Promise<UpdateLock> {
  const lockDirectory = path.join(root, LOCK_NAME);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = randomUUID();
    const candidate = path.join(root, `.session-vault.lock-candidate-${token}`);
    await mkdir(candidate, { mode: 0o700 });
    await writeFile(
      path.join(candidate, "owner.json"),
      JSON.stringify({ pid: process.pid, token }),
      { mode: 0o600 },
    );
    try {
      await operations.rename(candidate, lockDirectory);
      return { directory: lockDirectory, token };
    } catch {
      await operations.rm(candidate, { recursive: true, force: true }).catch(() => {});
      if (!(await exists(lockDirectory))) throw unavailable();
      const owner = await readOwner(lockDirectory);
      if (processIsAlive(owner.pid)) throw unavailable();
      const stale = path.join(root, `.session-vault.lock-stale-${randomUUID()}`);
      await operations.rename(lockDirectory, stale);
      await operations.rm(stale, { recursive: true, force: true }).catch(() => {});
    }
  }
  throw unavailable();
}

async function releaseLock(
  root: string,
  lock: UpdateLock,
  operations: SessionFileOperations,
): Promise<void> {
  const owner = await readOwner(lock.directory);
  if (owner.pid !== process.pid || owner.token !== lock.token) throw unavailable();
  const released = path.join(root, `.session-vault.lock-released-${randomUUID()}`);
  await operations.rename(lock.directory, released);
  await operations.rm(released, { recursive: true, force: true }).catch(() => {});
}

async function sessionArtifacts(root: string): Promise<{
  readonly backups: string[];
  readonly stagings: string[];
}> {
  const names = await readdir(root);
  return {
    backups: names.filter((name) => BACKUP_PATTERN.test(name)).sort(),
    stagings: names.filter((name) => STAGING_PATTERN.test(name)).sort(),
  };
}

async function recover(
  root: string,
  operations: SessionFileOperations,
): Promise<void> {
  const active = path.join(root, ACTIVE_NAME);
  const { backups, stagings } = await sessionArtifacts(root);
  if (backups.length > 1) throw unavailable();
  const activeExists = await exists(active);
  if (!activeExists && backups.length === 1) {
    await operations.rename(path.join(root, backups[0]!), active);
  } else if (activeExists && backups.length === 1) {
    await operations.rm(path.join(root, backups[0]!), { force: true });
  }
  for (const staging of stagings) {
    await operations.rm(path.join(root, staging), { force: true });
  }
}

async function readBoundedRegularFile(
  target: string,
  maximumBytes = MAXIMUM_BYTES,
): Promise<string | null> {
  let handle;
  try {
    handle = await open(target, "r");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > maximumBytes) throw unavailable();
    const buffer = Buffer.alloc(maximumBytes + 1);
    let total = 0;
    for (;;) {
      const { bytesRead } = await handle.read(
        buffer,
        total,
        buffer.length - total,
        null,
      );
      total += bytesRead;
      if (bytesRead === 0 || total === buffer.length) break;
    }
    const after = await handle.stat();
    if (
      total > maximumBytes
      || before.dev !== after.dev
      || before.ino !== after.ino
      || after.size !== total
    ) {
      throw unavailable();
    }
    return buffer.subarray(0, total).toString("utf8");
  } finally {
    await handle.close();
  }
}

export function createRecoverableSessionFile(input: {
  readonly root: string;
  readonly operations?: SessionFileOperations;
}): SessionVaultStore {
  const root = input.root;
  const operations = input.operations ?? { rename: fsRename, rm: fsRm };
  if (
    typeof root !== "string"
    || root.includes("\0")
    || operations === null
    || typeof operations !== "object"
    || typeof operations.rename !== "function"
    || typeof operations.rm !== "function"
  ) {
    throw unavailable();
  }

  async function runLocked<T>(
    operation: () => Promise<T>,
    recoverBeforeOperation = true,
  ): Promise<T> {
    try {
      await ensureOwnedRoot(root);
      const lock = await acquireLock(root, operations);
      try {
        if (recoverBeforeOperation) await recover(root, operations);
        return await operation();
      } finally {
        await releaseLock(root, lock, operations);
      }
    } catch {
      throw unavailable();
    }
  }

  return Object.freeze({
    read(): Promise<string | null> {
      return runLocked(() => readBoundedRegularFile(path.join(root, ACTIVE_NAME)));
    },
    replace(value: string): Promise<void> {
      return runLocked(async () => {
        if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > MAXIMUM_BYTES) {
          throw unavailable();
        }
        const token = randomUUID();
        const staging = path.join(root, `session.vault.staging-${token}`);
        const backup = path.join(root, `session.vault.backup-${token}`);
        const active = path.join(root, ACTIVE_NAME);
        const handle = await open(staging, "wx", 0o600);
        try {
          await handle.writeFile(value, "utf8");
          await handle.sync();
        } finally {
          await handle.close();
        }
        if (await exists(active)) await operations.rename(active, backup);
        await operations.rename(staging, active);
        await operations.rm(backup, { force: true }).catch(() => {});
      });
    },
    clear(): Promise<void> {
      return runLocked(async () => {
        await operations.rm(path.join(root, ACTIVE_NAME), { force: true });
        const { backups, stagings } = await sessionArtifacts(root);
        for (const name of [...backups, ...stagings]) {
          await operations.rm(path.join(root, name), { force: true });
        }
      }, false);
    },
  });
}
