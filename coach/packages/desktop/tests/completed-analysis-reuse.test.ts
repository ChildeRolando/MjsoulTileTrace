import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { loadMahjongSoulProtocolBundle } from "@riichi-coach/mahjong-soul-source";
import { createGoldenFixture } from "../dist/electron-mvp-golden-fixture.js";
import { localMortalAnalysisCacheKey } from "../src/local-mortal-analysis-service.js";
import { createAnalysisWorkerHost, type AnalysisWorkerData } from "../src/analysis-worker-host.js";

async function fixture() {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const bundle = await loadMahjongSoulProtocolBundle(join(root, "vendor/mahjong-soul-protocol"));
  const golden = createGoldenFixture(bundle);
  const mapped = golden.analysis.analyzeRecord({ recordId: golden.fixture.recordId,
    selfActor: 3, recordBytes: golden.recordBytes, ruleEvidence: golden.fixture.ruleEvidence });
  if (mapped.status !== "analysis_ready") throw new Error("fixture");
  const request = { recordId: golden.fixture.recordId, selfActor: 3, stream: mapped.stream, decisions: mapped.decisions };
  return { root, golden, request };
}

it("binds completed reuse to source, replay, perspective and runtime versions", async () => {
  const { golden, request } = await fixture();
  const runtime = golden.createRuntime(request.decisions);
  const key = localMortalAnalysisCacheKey(request, runtime);
  expect(localMortalAnalysisCacheKey(structuredClone(request), runtime)).toBe(key);
  expect(localMortalAnalysisCacheKey({ ...request, selfActor: 2 }, runtime)).not.toBe(key);
  expect(localMortalAnalysisCacheKey({ ...request, stream: { ...request.stream, mapperVersion: "changed" } }, runtime)).not.toBe(key);
  expect(localMortalAnalysisCacheKey({ ...request, stream: { ...request.stream, events: request.stream.events.slice(1) } }, runtime)).not.toBe(key);
  expect(localMortalAnalysisCacheKey({ ...request, decisions: [] }, runtime)).not.toBe(key);
  expect(localMortalAnalysisCacheKey(request, { ruleIdentity: runtime.ruleIdentity, identity: { ...runtime.identity,
    runtimeModelSha256: "9".repeat(64) } })).not.toBe(key);
});

it("skips native and helper computation in a second production Worker after restart", async () => {
  const { root, request } = await fixture();
  const reviewRoot = mkdtempSync(join(tmpdir(), "coach-completed-analysis-"));
  const data: AnalysisWorkerData = { request, runtimeOptions: {} as AnalysisWorkerData["runtimeOptions"],
    resourcesDir: join(root, "resources"), reviewRoot, catalog: [], goldenTestMode: true };
  const options = { workerEntry: new URL("../dist/analysis-worker.js", import.meta.url) };
  let host = createAnalysisWorkerHost(options);
  try {
    const firstStages: string[] = [];
    const saved = await host.run(data, value => firstStages.push(value.stage));
    expect(firstStages).toContain("rules"); expect(firstStages).toContain("facts"); expect(firstStages).toContain("saving");
    await host.close(); host = createAnalysisWorkerHost(options);
    const secondStages: string[] = [];
    expect(await host.run(data, value => secondStages.push(value.stage))).toEqual(saved);
    expect(secondStages).toEqual([]);
  } finally { await host.close(); rmSync(reviewRoot, { recursive: true, force: true }); }
}, 30_000);
