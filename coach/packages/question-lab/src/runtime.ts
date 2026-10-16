import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createManagedMortalRuntimeFromAssets,
  ManagedResearchRuntime,
} from "@riichi-coach/mortal-runtime";
import {
  JsonlFactEngineClient,
  ManagedFactEngineTransport,
} from "@riichi-coach/reasoning";
import { digest } from "./config.js";

export const coachRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
export const labRoot = resolve(coachRoot, "packages/question-lab");
export const mortalRoot = resolve(coachRoot, "packages/mortal-runtime");
export const assetRoot =
  process.env.RIICHI_LOCAL_MORTAL_ROOT ??
  join(process.env.LOCALAPPDATA ?? "", "RiichiCoach/local-mortal-spike");
export async function nativeReceipt() {
  if (process.env.RIICHI_LIBRIICHI_NATIVE_RECEIPT)
    return resolve(process.env.RIICHI_LIBRIICHI_NATIVE_RECEIPT);
  const directories = await readdir(join(assetRoot, "rule-native-builds"));
  const { createHash } = await import("node:crypto");
  const expected = createHash("sha256")
    .update(await readFile(join(mortalRoot, "native/coach-rule-config.patch")))
    .digest("hex");
  for (const name of directories.sort().reverse())
    try {
      const path = join(assetRoot, "rule-native-builds", name, "receipt.json"),
        r = JSON.parse(await readFile(path, "utf8"));
      if (r.patchSha256 === expected) return path;
    } catch {
      /* incomplete builds are not candidates */
    }
  throw new Error("lab_native_unavailable_run_build_libriichi_rule_native");
}
export async function createLabWorker() {
  const receiptPath = await nativeReceipt(),
    receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  const python =
    process.env.RIICHI_LOCAL_MORTAL_PYTHON ??
    join(assetRoot, "python/Scripts/python.exe");
  const mortal = await createManagedMortalRuntimeFromAssets({
    pythonExecutable: python,
    packageRoot: mortalRoot,
    artifactRoot: assetRoot,
    platformManifest: "mortal-582500.windows-x64.json",
    nativeReceiptPath: receiptPath,
    inferenceTimeoutMs: 60000,
  });
  const constructor = await ManagedResearchRuntime.create({
    python,
    packageRoot: mortalRoot,
    nativeModule: receipt.nativeModulePath,
    native: mortal.ruleIdentity,
  });
  const engine = new JsonlFactEngineClient(
    new ManagedFactEngineTransport(resolve(coachRoot, "resources")),
  );
  return {
    constructor,
    mortal,
    engine,
    close: async () => {
      constructor.close();
      await Promise.allSettled([mortal.close(), engine.close()]);
    },
  };
}
export type LabWorker = Awaited<ReturnType<typeof createLabWorker>>;
async function hashFiles(dir: string): Promise<unknown[]> {
  const out: unknown[] = [];
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    if (entry.name === "__pycache__") continue;
    if (entry.isDirectory())
      out.push([entry.name, await hashFiles(join(dir, entry.name))]);
    else if (
      entry.name.endsWith(".js") || entry.name.endsWith(".py") ||
      entry.name === "requirements.txt"
    ) out.push([entry.name, await readFile(join(dir, entry.name), "utf8")]);
  }
  return out;
}
export async function learningCodeHash() {
  return digest(await hashFiles(join(labRoot, "python")));
}
export async function producerIdentity(worker: LabWorker) {
  return {
    construction: worker.constructor.identity,
    model: worker.mortal.identity,
    facts: await worker.engine.identity(),
    researchMetricVersion: "visible-metrics/v1-heuristic-12-significant-digits",
    labCodeHash: digest(await hashFiles(join(labRoot, "dist"))),
    learningCodeHash: await learningCodeHash(),
  };
}
