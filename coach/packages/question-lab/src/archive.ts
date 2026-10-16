import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  unlink,
  type FileHandle,
} from "node:fs/promises";
import { dirname, join, relative, resolve, isAbsolute } from "node:path";
import { digest } from "./config.js";
import { setTimeout as delay } from "node:timers/promises";

export class Archive {
  #writes: Promise<unknown> = Promise.resolve();
  #sequence = 0;
  private constructor(
    readonly directory: string,
    private lock: FileHandle | null,
  ) {}
  static readOnly(directory: string) { return new Archive(resolve(directory), null); }
  static async open(directory: string, identity: unknown): Promise<Archive> {
    directory = resolve(directory);
    await mkdir(directory, { recursive: true });
    const lockPath = join(directory, ".writer-lock");
    let lock: FileHandle;
    try {
      lock = await open(lockPath, "wx");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      // Serialize stale-lock reclamation. Without this gate two rescuers can
      // both observe a dead owner, then one unlinks the other's new live lock.
      const recoveryPath = join(directory, ".writer-recovery");
      let recovery: FileHandle;
      try {
        recovery = await open(recoveryPath, "wx");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "EEXIST")
          throw new Error("archive_recovery_locked");
        throw e;
      }
      try {
        await recovery.writeFile(JSON.stringify({ pid: process.pid }));
        // Re-read under the gate; the writer seen before acquiring it may
        // already have been replaced by another recovery attempt.
        let owner: { pid: number } | null;
        try {
          owner = JSON.parse(await readFile(lockPath, "utf8"));
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
          owner = null;
        }
        if (owner) {
          if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0)
            throw new Error("archive_lock_owner_invalid");
          let alive = true;
          try { process.kill(owner.pid, 0); }
          catch (e) { alive = (e as NodeJS.ErrnoException).code !== "ESRCH"; }
          if (alive) throw new Error("archive_locked");
          await unlink(lockPath);
        }
        lock = await open(lockPath, "wx");
        // Publish the owner before releasing the reclamation gate.
        await lock.writeFile(JSON.stringify({ pid: process.pid }));
      } finally {
        await recovery.close();
        await unlink(recoveryPath);
      }
    }
    // A recovered lock already contains its owner. Truncation is deliberately
    // avoided: a concurrent reader must never see a temporarily empty lock.
    if ((await lock.stat()).size === 0)
      await lock.writeFile(JSON.stringify({ pid: process.pid }));
    const archive = new Archive(directory, lock);
    try {
      const existing = await archive.read("manifest.json");
      if (
        existing &&
        digest((existing as { identity: unknown }).identity) !==
          digest(identity)
      )
        throw new Error("archive_identity_mismatch");
      if (!existing)
        await archive.write("manifest.json", {
          schemaVersion: "question-lab-archive/v1",
          identity,
          createdAt: new Date().toISOString(),
        });
      return archive;
    } catch (error) {
      await archive.close();
      throw error;
    }
  }
  path(name: string) {
    const path = resolve(this.directory, name),
      rel = relative(this.directory, path);
    if (rel.startsWith("..") || isAbsolute(rel) || !rel)
      throw new Error("archive_path_invalid");
    return path;
  }
  write(name: string, value: unknown): Promise<void> {
    if (!this.lock) return Promise.reject(new Error("archive_read_only"));
    const operation = this.#writes.then(async () => {
      const path = this.path(name);
      await mkdir(dirname(path), { recursive: true });
      const tmp = `${path}.${process.pid}.${this.#sequence++}.tmp`;
      const file = await open(tmp, "wx");
      try {
        await file.writeFile(JSON.stringify(value, null, 2) + "\n");
        await file.sync();
      } finally {
        await file.close();
      }
      for (let retry = 0; ; retry++) {
        try {
          await rename(tmp, path);
          break;
        } catch (error) {
          if (
            retry >= 5 ||
            !["EPERM", "EACCES", "EBUSY"].includes(
              (error as NodeJS.ErrnoException).code ?? "",
            )
          )
            throw error;
          await delay(20 * 2 ** retry);
        }
      }
    });
    this.#writes = operation.catch(() => undefined);
    return operation;
  }
  async read(name: string): Promise<unknown | null> {
    const source = await this.readSource(name);
    return source === null ? null : JSON.parse(source);
  }
  async readSource(name: string): Promise<string | null> {
    try {
      return await readFile(this.path(name), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
  async list(directory: string): Promise<string[]> {
    try {
      return (await readdir(this.path(directory)))
        .filter((n) => n.endsWith(".json"))
        .sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }
  async close() {
    await this.#writes;
    if (!this.lock) return;
    await this.lock.close();
    await unlink(join(this.directory, ".writer-lock"));
  }
}
