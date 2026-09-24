import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ManagedMortalRuntimeManifestSchema,
  type ManagedMortalRuntimeIdentity,
  type ManagedMortalRuntimeManifest,
} from "@riichi-coach/contracts";

export async function sha256File(path: string): Promise<string> {
  const bytes = await readFile(path);
  return createHash("sha256").update(bytes).digest("hex");
}

export async function loadManagedMortalManifest(path: string): Promise<ManagedMortalRuntimeManifest> {
  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
    return ManagedMortalRuntimeManifestSchema.parse(raw);
  } catch {
    throw new ManagedMortalRuntimeError("mortal_runtime_identity_mismatch");
  }
}

export async function materializeManagedMortalIdentity(
  manifest: ManagedMortalRuntimeManifest,
  nativeModulePath: string,
): Promise<ManagedMortalRuntimeIdentity> {
  try {
    return {
      ...manifest.identity,
      nativeArtifactSha256: await sha256File(nativeModulePath),
    };
  } catch {
    throw new ManagedMortalRuntimeError("mortal_runtime_identity_mismatch");
  }
}

export async function verifyManagedMortalArtifacts(input: {
  manifest: ManagedMortalRuntimeManifest;
  identity: ManagedMortalRuntimeIdentity;
  runtimePath: string;
  checkpointPath: string;
  mortalSourcePath: string;
  nativeModulePath: string;
}): Promise<void> {
  let runtimeHash: string;
  let modelHash: string;
  let engineHash: string;
  let nativeHash: string;
  try {
    [runtimeHash, modelHash, engineHash, nativeHash] = await Promise.all([
      sha256File(input.runtimePath),
      sha256File(join(input.mortalSourcePath, "model.py")),
      sha256File(join(input.mortalSourcePath, "engine.py")),
      sha256File(input.nativeModulePath),
    ]);
  } catch {
    throw new ManagedMortalRuntimeError("mortal_runtime_identity_mismatch");
  }
  if (runtimeHash !== input.manifest.identity.runtimeArtifactSha256) {
    throw new ManagedMortalRuntimeError("mortal_runtime_identity_mismatch");
  }
  if (
    modelHash !== input.manifest.identity.runtimeModelSha256
    || engineHash !== input.manifest.identity.runtimeEngineSha256
    || nativeHash !== input.identity.nativeArtifactSha256
  ) {
    throw new ManagedMortalRuntimeError("mortal_runtime_identity_mismatch");
  }
  let checkpointHash: string;
  try {
    checkpointHash = await sha256File(input.checkpointPath);
  } catch {
    throw new ManagedMortalRuntimeError("mortal_checkpoint_identity_mismatch");
  }
  if (checkpointHash !== input.manifest.identity.checkpointFileSha256) {
    throw new ManagedMortalRuntimeError("mortal_checkpoint_identity_mismatch");
  }
  const { nativeArtifactSha256: _nativeArtifactSha256, ...staticIdentity } = input.identity;
  if (JSON.stringify(staticIdentity) !== JSON.stringify(input.manifest.identity)) {
    throw new ManagedMortalRuntimeError("mortal_runtime_identity_mismatch");
  }
}

export class ManagedMortalRuntimeError extends Error {
  readonly code;
  constructor(code: import("@riichi-coach/contracts").LocalMortalSafeErrorCode) {
    super(code);
    this.name = "ManagedMortalRuntimeError";
    this.code = code;
  }
}
