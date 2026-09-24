import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("local Mortal privileged ownership", () => {
  it("does not expose runtime/checkpoint/subprocess capability through preload", async () => {
    const [preload, entry, sessionApi] = await Promise.all([
      readFile(new URL("../src/preload.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/preload-entry.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/session-api.ts", import.meta.url), "utf8"),
    ]);
    for (const source of [preload, entry, sessionApi]) {
      expect(source).not.toContain("@riichi-coach/mortal-runtime");
      expect(source).not.toContain("checkpointPath");
      expect(source).not.toContain("child_process");
    }
  });
});
