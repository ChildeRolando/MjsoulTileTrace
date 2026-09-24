import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  ManagedMortalRuntimeManifestSchema,
  type ManagedMortalRuntimeManifest,
} from "@riichi-coach/contracts";

export async function sha256File(path: string): Promise<string> {
  const bytes = await readFile(path);
  return createHash("sha256").update(bytes).digest("hex");
}

export async function loadManagedMortalManifest(path: string): Promise<ManagedMortalRuntimeManifest> {
  const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
  return ManagedMortalRuntimeManifestSchema.parse(raw);
}

export async function verifyManagedMortalArtifacts(input: {
  manifest: ManagedMortalRuntimeManifest;
  runtimePath: string;
  checkpointPath: string;
}): Promise<void> {
  const [runtimeHash, checkpointHash] = await Promise.all([
    sha256File(input.runtimePath),
    sha256File(input.checkpointPath),
  ]);
  if (runtimeHash !== input.manifest.identity.runtimeArtifactSha256) {
    throw new ManagedMortalRuntimeError("mortal_runtime_identity_mismatch");
  }
  if (checkpointHash !== input.manifest.identity.checkpointFileSha256) {
    throw new ManagedMortalRuntimeError("mortal_checkpoint_identity_mismatch");
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
