import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createManagedMortalRuntimeFromAssets } from "@riichi-coach/mortal-runtime";
import { JsonlFactEngineClient, ManagedFactEngineTransport, runMortalAcceptanceEvidence } from "@riichi-coach/reasoning";

/** Both operator-assisted report runners use the same weightless rules service.
 * Asset failures are recorded per sample; no implicit preparation or download.
 */
export async function runManagedMortalAcceptanceEvidence(input) {
  const artifactRoot = process.env.RIICHI_LOCAL_MORTAL_ROOT
    ?? join(process.env.LOCALAPPDATA ?? "", "RiichiCoach", "local-mortal-spike");
  let runtime;
  try {
    runtime = await createManagedMortalRuntimeFromAssets({
      artifactRoot,
      packageRoot: fileURLToPath(new URL("../packages/mortal-runtime/", import.meta.url)),
      pythonExecutable: join(artifactRoot, "python", "Scripts", "python.exe"),
      platformManifest: "mortal-582500.windows-x64.json",
      nativeReceiptPath: process.env.RIICHI_LIBRIICHI_NATIVE_RECEIPT,
      nativeModulePath: process.env.RIICHI_LIBRIICHI_NATIVE_MODULE,
    });
  } catch {
    return { status: "review_failed", code: "rules_runtime_failed" };
  }
  const engine = new JsonlFactEngineClient(new ManagedFactEngineTransport(
    fileURLToPath(new URL("../resources/", import.meta.url)),
  ));
  try {
    return await runMortalAcceptanceEvidence({ ...input, engine,
      rules: { identity: runtime.ruleIdentity, port: runtime } });
  } finally {
    try { await runtime.close(); } finally { await engine.close(); }
  }
}
