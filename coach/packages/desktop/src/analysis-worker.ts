import { parentPort, workerData } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { loadMahjongSoulProtocolBundle } from "@riichi-coach/mahjong-soul-source";
import { createLocalMortalRuntimeService } from "./local-mortal-runtime-service.js";
import { createLocalMortalAnalysisService } from "./local-mortal-analysis-service.js";
import { createReviewSessionRepository, persistValidatedReviewSession } from "./review-session-repository.js";
import { createReviewSessionLabelStore } from "./review-session-labels.js";
import type { AnalysisWorkerData } from "./analysis-worker-host.js";

async function run(): Promise<void> {
  if (parentPort === null) throw new Error("analysis_unavailable");
  const port = parentPort;
  const data = workerData as AnalysisWorkerData;
  let cancelled = false;
  let runtime: Awaited<ReturnType<typeof createLocalMortalRuntimeService>> | undefined;
  let repository: ReturnType<typeof createReviewSessionRepository> | undefined;
  let labels: ReturnType<typeof createReviewSessionLabelStore> | undefined;
  const cancel = () => { cancelled = true; void runtime?.close().catch(() => undefined); };
  port.on("message", cancel);
  let result: { sessionId: string; packageId: string } | undefined;
  try {
    if (data.goldenTestMode) {
      const bundle = await loadMahjongSoulProtocolBundle(fileURLToPath(new URL("../../../vendor/mahjong-soul-protocol/", import.meta.url)));
      const golden = (await import("./electron-mvp-golden-fixture.js")).createGoldenFixture(bundle);
      runtime = golden.createRuntime(data.request.decisions);
    } else runtime = await createLocalMortalRuntimeService(data.runtimeOptions);
    if (cancelled) throw new Error("analysis_cancelled");
    const analysis = createLocalMortalAnalysisService({ runtime, factEngineResourcesDir: data.resourcesDir,
      onProgress: progress => port.postMessage({ type: "progress", progress }) });
    const analyzed = await analysis.analyze(data.request);
    await runtime.close();
    if (cancelled) throw new Error("analysis_cancelled");
    port.postMessage({ type: "progress", progress: { stage: "saving", completed: 0, total: null } });
    repository = createReviewSessionRepository({ root: data.reviewRoot });
    labels = createReviewSessionLabelStore({ root: data.reviewRoot });
    labels.rememberCatalog(data.catalog);
    result = persistValidatedReviewSession(repository, analyzed.package);
    labels.observePackage(analyzed.package);
  } finally {
    await runtime?.close().catch(() => undefined);
    try { labels?.close(); } finally { repository?.close(); }
    port.off("message", cancel);
  }
  port.postMessage({ type: "result", result });
}

void run().catch(() => parentPort?.postMessage({ type: "failed" }))
  .finally(() => parentPort?.close());
