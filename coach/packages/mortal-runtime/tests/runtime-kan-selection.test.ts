import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("validates native two-stage kan projection without loading weights", () => {
  const result = spawnSync("python", [fileURLToPath(new URL("./runtime_kan_selection_test.py", import.meta.url))],
    { encoding: "utf8", windowsHide: true, timeout: 10_000 });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
});
