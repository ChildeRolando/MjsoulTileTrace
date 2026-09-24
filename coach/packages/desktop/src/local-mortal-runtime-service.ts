import { resolve } from "node:path";
import {
  ManagedMortalRuntime,
  loadManagedMortalManifest,
  materializeManagedMortalIdentity,
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
  const identity = await materializeManagedMortalIdentity(manifest, nativeModulePath);
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
