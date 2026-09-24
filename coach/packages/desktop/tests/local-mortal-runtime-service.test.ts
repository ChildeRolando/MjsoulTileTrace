import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLocalMortalRuntimeService } from "../src/local-mortal-runtime-service.js";

describe("local Mortal privileged ownership", () => {
  it("rejects a replaced native module when a new service is composed from a preparation receipt", async () => {
    const root = await mkdtemp(join(tmpdir(), "mortal-service-"));
    try {
      const packageRoot = join(root, "package");
      const artifactRoot = join(root, "artifacts");
      const nativeDir = join(artifactRoot, "Mortal", "target", "release");
      await mkdir(join(packageRoot, "manifests"), { recursive: true });
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
      await writeFile(join(nativeDir, "libriichi.pyd"), "original");
      await writeFile(join(artifactRoot, "preparation-receipt.json"), JSON.stringify({
        receiptVersion: "local-mortal-preparation-receipt/v1", ...identity,
        nativeArtifactSha256: hash("original"),
      }));
      const options = { pythonExecutable: "python", packageRoot, artifactRoot, platformManifest: "fixture.json" };
      const service = await createLocalMortalRuntimeService(options);
      await service.close();
      await writeFile(join(nativeDir, "libriichi.pyd"), "replaced");
      await expect(createLocalMortalRuntimeService(options)).rejects.toMatchObject({ code: "mortal_runtime_identity_mismatch" });
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
