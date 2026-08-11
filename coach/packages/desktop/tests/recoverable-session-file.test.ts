import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  createRecoverableSessionFile,
} from "../src/recoverable-session-file.js";

async function temporaryRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "riichi-session-file-test-"));
}

describe("recoverable encrypted session file", () => {
  it("replaces, reads and clears one bounded private file", async () => {
    const parent = await temporaryRoot();
    const root = path.join(parent, "session");
    const outside = path.join(parent, "completed-report.keep");
    await writeFile(outside, "preserve");
    const store = createRecoverableSessionFile({ root });

    expect(await store.read()).toBeNull();
    await store.replace('{"ciphertext":"first"}');
    expect(await store.read()).toBe('{"ciphertext":"first"}');
    await store.replace('{"ciphertext":"second"}');
    expect(await store.read()).toBe('{"ciphertext":"second"}');

    const stats = await lstat(path.join(root, "session.vault.json"));
    expect(stats.isFile()).toBe(true);
    if (process.platform !== "win32") {
      expect(stats.mode & 0o077).toBe(0);
    }

    await store.clear();
    expect(await store.read()).toBeNull();
    await expect(readFile(outside, "utf8")).resolves.toBe("preserve");
    await rm(parent, { recursive: true, force: true });
  });

  it("recovers the old complete value when the switch fails", async () => {
    const parent = await temporaryRoot();
    const root = path.join(parent, "session");
    const original = createRecoverableSessionFile({ root });
    await original.replace("old-ciphertext");
    let renamedActive = false;
    const failing = createRecoverableSessionFile({
      root,
      operations: {
        rename: async (source, target) => {
          if (source.endsWith("session.vault.json")) renamedActive = true;
          if (renamedActive && source.includes(".staging-")) {
            throw new Error("hostile switch prose");
          }
          await rename(source, target);
        },
        rm,
      },
    });

    await expect(failing.replace("new-ciphertext")).rejects.toThrow(
      "mahjong_soul_session_storage_unavailable",
    );
    const recovered = createRecoverableSessionFile({ root });
    await expect(recovered.read()).resolves.toBe("old-ciphertext");
    await rm(parent, { recursive: true, force: true });
  });

  it("restores one interrupted backup and rejects ambiguous backups", async () => {
    const parent = await temporaryRoot();
    const root = path.join(parent, "session");
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, "session.vault.backup-11111111-1111-4111-8111-111111111111"), "old");
    const store = createRecoverableSessionFile({ root });
    await expect(store.read()).resolves.toBe("old");

    await rename(
      path.join(root, "session.vault.json"),
      path.join(root, "session.vault.backup-22222222-2222-4222-8222-222222222222"),
    );
    await writeFile(path.join(root, "session.vault.backup-33333333-3333-4333-8333-333333333333"), "other");
    await expect(store.read()).rejects.toThrow(
      "mahjong_soul_session_storage_unavailable",
    );
    await expect(store.clear()).resolves.toBeUndefined();
    expect((await readdir(root)).filter((name) => name.startsWith("session.vault"))).toEqual([]);
    await rm(parent, { recursive: true, force: true });
  });

  it("fails closed while a live owner holds the fixed lock", async () => {
    const parent = await temporaryRoot();
    const root = path.join(parent, "session");
    const lock = path.join(root, ".session-vault.update-lock");
    await mkdir(lock, { recursive: true });
    await writeFile(
      path.join(lock, "owner.json"),
      JSON.stringify({ pid: process.pid, token: "11111111-1111-4111-8111-111111111111" }),
    );

    await expect(createRecoverableSessionFile({ root }).read()).rejects.toThrow(
      "mahjong_soul_session_storage_unavailable",
    );
    expect(await lstat(lock)).toBeDefined();
    await rm(parent, { recursive: true, force: true });
  });

  it("reclaims a well-formed lock owned by a dead process", async () => {
    const parent = await temporaryRoot();
    const root = path.join(parent, "session");
    const lock = path.join(root, ".session-vault.update-lock");
    await mkdir(lock, { recursive: true });
    await writeFile(
      path.join(lock, "owner.json"),
      JSON.stringify({ pid: 2_147_483_647, token: "11111111-1111-4111-8111-111111111111" }),
    );

    await expect(createRecoverableSessionFile({ root }).read()).resolves.toBeNull();
    expect((await readdir(root)).some((name) => name === ".session-vault.update-lock")).toBe(false);
    await rm(parent, { recursive: true, force: true });
  });

  it("unlocks before best-effort released-lock cleanup", async () => {
    const parent = await temporaryRoot();
    const root = path.join(parent, "session");
    const store = createRecoverableSessionFile({
      root,
      operations: {
        rename,
        rm: async (target, options) => {
          if (target.includes(".lock-released-")) {
            throw new Error("hostile cleanup prose");
          }
          await rm(target, options);
        },
      },
    });

    await expect(store.replace("ciphertext")).resolves.toBeUndefined();
    await expect(createRecoverableSessionFile({ root }).read()).resolves.toBe("ciphertext");
    await rm(parent, { recursive: true, force: true });
  });

  it("reports a fixed failure when atomic unlock rename fails", async () => {
    const parent = await temporaryRoot();
    const root = path.join(parent, "session");
    const store = createRecoverableSessionFile({
      root,
      operations: {
        rename: async (source, target) => {
          if (
            source.endsWith(".session-vault.update-lock")
            && target.includes(".lock-released-")
          ) {
            throw new Error("hostile unlock prose");
          }
          await rename(source, target);
        },
        rm,
      },
    });

    await expect(store.replace("ciphertext")).rejects.toMatchObject({
      name: "MahjongSoulSourceError",
      message: "mahjong_soul_session_storage_unavailable",
    });
    await rm(parent, { recursive: true, force: true });
  });

  it("rejects oversized and non-regular active files before allocation", async () => {
    const parent = await temporaryRoot();
    const root = path.join(parent, "session");
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, "session.vault.json"), Buffer.alloc(65_537));
    await expect(createRecoverableSessionFile({ root }).read()).rejects.toThrow(
      "mahjong_soul_session_storage_unavailable",
    );

    await rm(path.join(root, "session.vault.json"), { force: true });
    await mkdir(path.join(root, "session.vault.json"));
    await expect(createRecoverableSessionFile({ root }).read()).rejects.toThrow(
      "mahjong_soul_session_storage_unavailable",
    );
    await rm(parent, { recursive: true, force: true });
  });

  it("rejects a symlink or junction as the owned vault root", async () => {
    const parent = await temporaryRoot();
    const target = path.join(parent, "target");
    const linked = path.join(parent, "linked-session");
    await mkdir(target);
    await symlink(target, linked, process.platform === "win32" ? "junction" : "dir");

    await expect(createRecoverableSessionFile({ root: linked }).read()).rejects.toThrow(
      "mahjong_soul_session_storage_unavailable",
    );
    await rm(parent, { recursive: true, force: true });
  });
});
