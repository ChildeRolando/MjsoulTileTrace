import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Archive } from "../src/archive.js";
describe("research archive", () => {
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
