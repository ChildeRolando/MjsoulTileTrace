import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import {
  ManagedMortalRuntime,
  ManagedMortalRuntimeError,
  loadManagedMortalManifest,
  sha256File,
} from "@riichi-coach/mortal-runtime";

/** Electron-main-only composition input. This type is deliberately not
 * exported through preload/session-api; renderer code never receives paths,
 * child handles, stdout/stderr, tensors, or checkpoint bytes. */
export type LocalMortalRuntimeServiceOptions = Readonly<{
  pythonExecutable: string;
  packageRoot: string;
  artifactRoot: string;
  platformManifest: string;
  startTimeoutMs?: number;
  inferenceTimeoutMs?: number;
}>;

export async function createLocalMortalRuntimeService(
  options: LocalMortalRuntimeServiceOptions,
): Promise<ManagedMortalRuntime> {
  const manifest = await loadManagedMortalManifest(
    resolve(options.packageRoot, "manifests", options.platformManifest),
  );
  const nativeModulePath = resolve(options.artifactRoot, "Mortal", "target", "release", "libriichi.pyd");
  let nativeArtifactSha256: string;
  try {
    const receipt = JSON.parse(await readFile(resolve(options.artifactRoot, "preparation-receipt.json"), "utf8")) as Record<string, unknown>;
    nativeArtifactSha256 = receipt.nativeArtifactSha256 as string;
    if (receipt.receiptVersion !== "local-mortal-preparation-receipt/v1"
      || receipt.runtimeRevision !== manifest.identity.runtimeRevision
      || receipt.runtimeArtifactSha256 !== manifest.identity.runtimeArtifactSha256
      || receipt.runtimeModelSha256 !== manifest.identity.runtimeModelSha256
      || receipt.runtimeEngineSha256 !== manifest.identity.runtimeEngineSha256
      || receipt.checkpointRevision !== manifest.identity.checkpointRevision
      || receipt.checkpointFileSha256 !== manifest.identity.checkpointFileSha256
      || receipt.protocolVersion !== manifest.identity.protocolVersion
      || receipt.adapterVersion !== manifest.identity.adapterVersion
      || typeof nativeArtifactSha256 !== "string"
      || !/^[0-9a-f]{64}$/.test(nativeArtifactSha256)
      || await sha256File(nativeModulePath) !== nativeArtifactSha256) {
      throw new Error("preparation receipt mismatch");
    }
  } catch {
    throw new ManagedMortalRuntimeError("mortal_runtime_identity_mismatch");
  }
  const identity = { ...manifest.identity, nativeArtifactSha256 };
  return new ManagedMortalRuntime({
    executable: options.pythonExecutable,
    runtimePath: resolve(options.packageRoot, manifest.runtimeEntrypoint),
    checkpointPath: resolve(options.artifactRoot, manifest.checkpointFile),
    mortalSourcePath: resolve(options.artifactRoot, "Mortal", "mortal"),
    nativeModulePath,
    manifest,
    identity,
    ...(options.startTimeoutMs === undefined ? {} : { startTimeoutMs: options.startTimeoutMs }),
    ...(options.inferenceTimeoutMs === undefined ? {} : { inferenceTimeoutMs: options.inferenceTimeoutMs }),
  });
}
