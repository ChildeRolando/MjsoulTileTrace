import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Archive } from "../src/archive.js";
describe("research archive", () => {
  it("reads source archives without creating a writer lock or allowing writes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lab-source-"));
    try {
      const a = await Archive.open(dir, { producer: "v1" });
      await a.write("record.json", { a: 1 }); await a.close();
      const source = Archive.readOnly(dir);
      expect(await source.read("record.json")).toEqual({ a: 1 });
      await expect(source.write("record.json", { a: 2 })).rejects.toThrow("archive_read_only");
      await source.close();
      await expect(readFile(join(dir, ".writer-lock"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it("allows only one stale-lock rescuer and never removes the surviving writer's lock", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lab-stale-lock-"));
    const exited = spawnSync(process.execPath, ["-e", ""], { windowsHide: true });
    expect(exited.status).toBe(0);
    await writeFile(join(dir, ".writer-lock"), JSON.stringify({ pid: exited.pid }));
    const outcomes = await Promise.allSettled(Array.from({ length: 12 }, () => Archive.open(dir, { producer: "v1" })));
    const winners = outcomes.flatMap(r => r.status === "fulfilled" ? [r.value] : []);
    try {
      expect(winners).toHaveLength(1);
      expect(JSON.parse(await readFile(join(dir, ".writer-lock"), "utf8")).pid).toBe(process.pid);
      await expect(Archive.open(dir, { producer: "v1" })).rejects.toThrow("archive_locked");
      await winners[0]!.write("state.json", { rescued: true });
    } finally {
      await Promise.all(winners.map(a => a.close()));
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("commits records atomically, rejects changed identity and enforces a single writer", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lab-archive-"));
    try {
      const a = await Archive.open(dir, { producer: "v1" });
      await a.write("test.json", { a: 1 });
      expect(
        JSON.parse(await readFile(join(dir, "test.json"), "utf8")),
      ).toEqual({ a: 1 });
      await Promise.all(
        Array.from({ length: 30 }, (_, version) =>
          a.write("state.json", { version }),
        ),
      );
      expect(
        JSON.parse(await readFile(join(dir, "state.json"), "utf8")),
      ).toEqual({ version: 29 });
      await expect(Archive.open(dir, { producer: "v1" })).rejects.toThrow(
        "archive_locked",
      );
      await a.close();
      await expect(Archive.open(dir, { producer: "v2" })).rejects.toThrow(
        "archive_identity_mismatch",
      );
      const b = await Archive.open(dir, { producer: "v1" });
      await b.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
