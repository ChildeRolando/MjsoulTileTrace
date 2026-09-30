import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { ManagedMortalRuntime } from "./managed-runtime.js";
import { ManagedMortalRuntimeError, loadManagedMortalManifest, sha256File, verifyManagedLibriichiArtifacts } from "./manifest.js";

/** Privileged composition only. Rules need the wrapper and verified native
 * build; model files are verified lazily by ManagedMortalRuntime when scored.
 */
export type ManagedMortalAssetOptions = Readonly<{
  pythonExecutable: string;
  packageRoot: string;
  artifactRoot: string;
  platformManifest: string;
  nativeReceiptPath?: string;
  nativeModulePath?: string;
  startTimeoutMs?: number;
  inferenceTimeoutMs?: number;
}>;

export async function createManagedMortalRuntimeFromAssets(options: ManagedMortalAssetOptions): Promise<ManagedMortalRuntime> {
  const manifest = await loadManagedMortalManifest(resolve(options.packageRoot, "manifests", options.platformManifest));
  const runtimePath = resolve(options.packageRoot, manifest.runtimeEntrypoint);
  let nativeModulePath: string;
  let nativeArtifactSha256: string;
  try {
    const receipt = JSON.parse(await readFile(options.nativeReceiptPath ?? resolve(options.artifactRoot, "native-build-receipt.json"), "utf8"));
    nativeModulePath = options.nativeModulePath ?? receipt.nativeModulePath;
    nativeArtifactSha256 = receipt.nativeArtifactSha256;
    if (receipt.receiptVersion !== "coach-libriichi-native/v1" ||
        receipt.upstreamRevision !== manifest.identity.runtimeRevision ||
        typeof nativeModulePath !== "string" || !isAbsolute(nativeModulePath) ||
        typeof nativeArtifactSha256 !== "string" || !/^[0-9a-f]{64}$/.test(nativeArtifactSha256) ||
        typeof receipt.sourceArchiveSha256 !== "string" || !/^[0-9a-f]{64}$/.test(receipt.sourceArchiveSha256) ||
        receipt.patchSha256 !== await sha256File(resolve(options.packageRoot, "native", "coach-rule-config.patch"))) {
      throw new Error("native build mismatch");
    }
    await verifyManagedLibriichiArtifacts({ manifest, runtimePath, nativeModulePath,
      identity: { ...manifest.identity, nativeArtifactSha256 } });
  } catch {
    throw new ManagedMortalRuntimeError("mortal_runtime_identity_mismatch");
  }
  return new ManagedMortalRuntime({
    executable: options.pythonExecutable, runtimePath,
    checkpointPath: resolve(options.artifactRoot, manifest.checkpointFile),
    mortalSourcePath: resolve(options.artifactRoot, "Mortal", "mortal"),
    nativeModulePath, manifest, identity: { ...manifest.identity, nativeArtifactSha256 },
    ...(options.startTimeoutMs === undefined ? {} : { startTimeoutMs: options.startTimeoutMs }),
    ...(options.inferenceTimeoutMs === undefined ? {} : { inferenceTimeoutMs: options.inferenceTimeoutMs }),
  });
}
