import { it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { QuestionLabConfigSchema } from "@riichi-coach/contracts";
import { Archive } from "../src/archive.js";
import { digest } from "../src/config.js";
import { learningCodeHash } from "../src/runtime.js";
import { fitBoundaries } from "../src/learning.js";

it("rejects a changed learning producer and never freezes an empty holdout", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lab-learning-"));
  const config = QuestionLabConfigSchema.parse({ schemaVersion: "question-lab-config/v1", seed: 1 });
  const identity = { config, configHash: digest(config), producers: { learningCodeHash: "changed" } };
  const archive = await Archive.open(dir, identity);
  try {
    await expect(fitBoundaries(archive, config)).rejects.toThrow("archive_learning_identity_mismatch");
    await archive.write("manifest.json", { identity: { ...identity, producers: { learningCodeHash: await learningCodeHash() } } });
    await expect(fitBoundaries(archive, config)).rejects.toThrow("learning_requires_generated_samples");
    expect(await archive.read("split.json")).toBeNull();
    expect(await archive.read("boundaries-final.json")).toBeNull();
  } finally {
    await archive.close();
    await rm(dir, { recursive: true, force: true });
  }
});
