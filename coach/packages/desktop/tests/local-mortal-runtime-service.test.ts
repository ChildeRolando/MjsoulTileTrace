import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLocalMortalRuntimeService } from "../src/local-mortal-runtime-service.js";

describe("local Mortal privileged ownership", () => {
  it.each(["native", "patch", "revision", "wrapper", "missing-model-assets"])("binds the native build without requiring model assets: %s", async variant => {
    const root = await mkdtemp(join(tmpdir(), "mortal-service-"));
    try {
      const packageRoot = join(root, "package");
      const artifactRoot = join(root, "artifacts");
      const nativeDir = join(artifactRoot, "Mortal", "target", "release");
      await mkdir(join(packageRoot, "manifests"), { recursive: true });
      await mkdir(join(packageRoot, "native"), { recursive: true });
      await mkdir(join(packageRoot, "runtime"), { recursive: true });
      await mkdir(nativeDir, { recursive: true });
      const hash = (value: string) => createHash("sha256").update(value).digest("hex");
      const identity = {
        runtimeImplementation: "Equim-chan/Mortal", runtimeRevision: "0".repeat(40), runtimeVersion: "Mortal V4",
        runtimeArtifactSha256: hash("wrapper"), runtimeModelSha256: hash("model"), runtimeEngineSha256: hash("engine"),
        checkpointRepository: "Yuchen1457/mortal-582500", checkpointRevision: "1".repeat(40),
        checkpointModelTag: "mortal-hpc@582500", checkpointFileSha256: hash("checkpoint"),
        protocolVersion: "riichi-local-mortal-jsonl/v1", adapterVersion: "local-mortal-adapter/v1",
      };
      const manifest = {
        manifestVersion: "managed-mortal-runtime-manifest/v1", identity,
        runtimeEntrypoint: "runtime/local_mortal_runtime.py", checkpointFile: "mortal_582500.pth",
        geometry: { observation: [1012, 34], legalActionSpace: 46, outputWidth: 47 },
        inference: { device: "cpu", mode: "eval", greedy: true, temperature: 1, amp: false },
        licenses: { runtime: "AGPL-3.0-or-later", checkpoint: "AGPL-3.0", redistribution: "verify_at_m8" },
      };
      await writeFile(join(packageRoot, "manifests", "fixture.json"), JSON.stringify(manifest));
      await writeFile(join(packageRoot, "native", "coach-rule-config.patch"), "patch");
      await writeFile(join(packageRoot, "runtime", "local_mortal_runtime.py"), "wrapper");
      await writeFile(join(nativeDir, "libriichi.pyd"), "original");
      const nativeReceipt = {
        receiptVersion: "coach-libriichi-native/v1", upstreamRevision: identity.runtimeRevision,
        patchSha256: hash("patch"), sourceArchiveSha256: hash("source"),
        nativeArtifactSha256: hash("original"),
        nativeModulePath: join(nativeDir, "libriichi.pyd"),
        createdAt: "2026-09-28T00:00:00.000Z", buildCommand: "cargo build --offline --locked -p libriichi --release --lib",
      };
      const receiptPath = join(artifactRoot, "native-build-receipt.json");
      await writeFile(receiptPath, JSON.stringify(nativeReceipt));
      const options = { pythonExecutable: "python", packageRoot, artifactRoot, platformManifest: "fixture.json" };
      // There is no preparation receipt, checkpoint, model.py or engine.py.
      // Remote review must be able to compose the deterministic rule service.
      const service = await createLocalMortalRuntimeService(options);
      expect(service.ruleIdentity).toMatchObject({revision:identity.runtimeRevision,nativeArtifactSha256:hash("original"),wrapperSha256:hash("wrapper")});
      await service.close();
      if (variant === "native") await writeFile(join(nativeDir, "libriichi.pyd"), "replaced");
      if (variant === "patch") await writeFile(join(packageRoot, "native", "coach-rule-config.patch"), "different-patch");
      if (variant === "wrapper") await writeFile(join(packageRoot, "runtime", "local_mortal_runtime.py"), "different-wrapper");
      if (variant === "revision") await writeFile(receiptPath, JSON.stringify({...nativeReceipt,upstreamRevision:"f".repeat(40)}));
      if (variant !== "missing-model-assets") {
        await expect(createLocalMortalRuntimeService(options)).rejects.toMatchObject({ code: "mortal_runtime_identity_mismatch" });
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("does not expose runtime/checkpoint/subprocess capability through preload", async () => {
    const [preload, entry, sessionApi] = await Promise.all([
      readFile(new URL("../src/preload.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/preload-entry.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/session-api.ts", import.meta.url), "utf8"),
    ]);
    for (const source of [preload, entry, sessionApi]) {
      expect(source).not.toContain("@riichi-coach/mortal-runtime");
      expect(source).not.toContain("checkpointPath");
      expect(source).not.toContain("child_process");
    }
  });
});
