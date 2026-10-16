// Same corpus, implementation and process; warm filesystem in both modes.
// Cache disabled only means full revalidation, never a weaker validation mode.
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import {
  Archive,
  readSamples,
  sampleValidationStats,
  digest,
} from "@riichi-coach/question-lab";

const directory = resolve(process.argv[2] ?? "");
if (!process.argv[2])
  throw new Error("expected existing question-lab archive directory");
const manifest = JSON.parse(
  await readFile(join(directory, "manifest.json"), "utf8"),
);
const archive = await Archive.open(directory, manifest.identity),
  previous = process.env.RIICHI_LAB_DISABLE_READ_CACHE;
const measure = async () => {
  const start = performance.now(),
    samples = await readSamples(archive);
  return {
    durationMs: performance.now() - start,
    count: samples.length,
    semanticHash: digest(samples),
  };
};
try {
  process.env.RIICHI_LAB_DISABLE_READ_CACHE = "1";
  await measure(); // warm OS file cache before either measured mode
  const uncached = [await measure(), await measure()];
  delete process.env.RIICHI_LAB_DISABLE_READ_CACHE;
  await measure();
  const cached = [await measure(), await measure()];
  const hashes = new Set([...uncached, ...cached].map((r) => r.semanticHash));
  if (hashes.size !== 1) throw new Error("cache_changed_validated_samples");
  const mean = (rows) =>
    rows.reduce((sum, row) => sum + row.durationMs, 0) / rows.length;
  const result = {
    schemaVersion: "question-lab-readback-benchmark/v1",
    sampleCount: cached[0].count,
    uncached,
    cached,
    speedup: mean(uncached) / mean(cached),
    cache: sampleValidationStats(archive),
  };
  await archive.write("readback-benchmark.json", result);
  console.log(JSON.stringify(result));
} finally {
  if (previous === undefined) delete process.env.RIICHI_LAB_DISABLE_READ_CACHE;
  else process.env.RIICHI_LAB_DISABLE_READ_CACHE = previous;
  await archive.close();
}
