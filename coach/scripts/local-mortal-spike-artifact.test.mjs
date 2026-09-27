import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "vitest";
import { writeCanonicalJson } from "@riichi-coach/reasoning";
import { writeSpikeArtifact } from "./local-mortal-spike-artifact.mjs";

test("artifact chunks preserve all fields, UTF-8, canonical order and the existing identity hash", () => {
  const value = { z: [{ b: true, a: null }, -0, 1.25], a: "白🀄\\\"\n".repeat(30_000) };
  const expected = JSON.stringify({ a: value.a, z: [{ a: null, b: true }, 0, 1.25] });
  const parts = [];
  writeCanonicalJson(value, part => parts.push(part));
  expect(parts.join("")).toBe(expected);
  const root = mkdtempSync(join(tmpdir(), "spike-artifact-"));
  try {
    const path = join(root, "artifact.json");
    const receipt = writeSpikeArtifact(path, value);
    const bytes = readFileSync(path);
    expect(JSON.parse(bytes.toString("utf8"))).toEqual(JSON.parse(JSON.stringify(value)));
    expect(bytes.toString("utf8")).toBe(expected);
    expect(receipt).toEqual({ byteLength: bytes.length, sha256: createHash("sha256").update(expected).digest("hex") });
    expect(receipt.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(() => writeSpikeArtifact(path, {})).toThrow();
    expect(readFileSync(path)).toEqual(bytes);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a failed export does not return a success receipt or overwrite existing evidence", () => {
  const root = mkdtempSync(join(tmpdir(), "spike-artifact-failure-"));
  try {
    const existing = join(root, "existing.json");
    writeFileSync(existing, "history");
    expect(() => writeSpikeArtifact(existing, {})).toThrow();
    expect(readFileSync(existing, "utf8")).toBe("history");
    expect(() => writeSpikeArtifact(join(root, "invalid.json"), { value: undefined })).toThrow("canonical_json_value_invalid");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
