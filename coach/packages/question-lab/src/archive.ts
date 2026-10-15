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
    private lock: FileHandle,
  ) {}
  static async open(directory: string, identity: unknown): Promise<Archive> {
    directory = resolve(directory);
    await mkdir(directory, { recursive: true });
    const lockPath = join(directory, ".writer-lock");
    let lock: FileHandle;
    try {
      lock = await open(lockPath, "wx");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const owner = JSON.parse(await readFile(lockPath, "utf8")) as {
        pid: number;
      };
      let alive = true;
      try {
        process.kill(owner.pid, 0);
      } catch (e) {
        alive = (e as NodeJS.ErrnoException).code !== "ESRCH";
      }
      if (alive) throw new Error("archive_locked");
      await unlink(lockPath);
      lock = await open(lockPath, "wx");
    }
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
    await this.lock.close();
    await unlink(join(this.directory, ".writer-lock"));
  }
}
