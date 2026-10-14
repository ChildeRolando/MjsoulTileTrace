import { describe, expect, it } from "vitest";
import { createAnalysisWorkerHost, type AnalysisWorkerData } from "../src/analysis-worker-host.js";
const fixture = new URL("./fixtures/analysis-worker-test.mjs", import.meta.url);
const data = (testMode: string) => ({ testMode }) as unknown as AnalysisWorkerData;
describe("dedicated analysis worker host", () => {
  it("keeps the parent event loop alive and returns only the persisted result identifiers", async () => {
    const host = createAnalysisWorkerHost({ workerEntry: fixture });
    let ticks = 0; const timer = setInterval(() => ticks++, 10); const progress: string[] = [];
    try {
      expect(await host.run(data("success"), value => progress.push(value.stage))).toEqual({ sessionId: "saved-session", packageId: "saved-package" });
      expect(ticks).toBeGreaterThan(3); expect(progress).toEqual(["saving"]);
    } finally { clearInterval(timer); await host.close(); }
  });
  it.each(["crash", "invalid"])("rejects %s without leaking a path or full package to the caller", async mode => {
    const host = createAnalysisWorkerHost({ workerEntry: fixture });
    try { await expect(host.run(data(mode))).rejects.toThrow("analysis_failed"); }
    finally { await host.close(); }
  });
  it("drains cancellation and refuses new jobs after shutdown", async () => {
    const host = createAnalysisWorkerHost({ workerEntry: fixture });
    const task = host.run(data("cancel"));
    const rejected = expect(task).rejects.toThrow("analysis_failed");
    await host.close(); await rejected;
    await expect(host.run(data("success"))).rejects.toThrow("analysis_unavailable");
  });
});
