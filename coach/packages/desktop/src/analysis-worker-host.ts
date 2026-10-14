import { Worker } from "node:worker_threads";
import { z } from "zod";
import type { AnalyzableRecordSummary } from "@riichi-coach/contracts";
import { RecordAnalysisProgressSchema } from "./catalog-api.js";
import type { PaipuReviewPreparationInput, PaipuReviewPreparationResult } from "./paipu-import-service.js";
import type { createLocalMortalRuntimeService } from "./local-mortal-runtime-service.js";

export type AnalysisWorkerData = {
  request: Omit<PaipuReviewPreparationInput, "onProgress">;
  runtimeOptions: Parameters<typeof createLocalMortalRuntimeService>[0];
  resourcesDir: string;
  reviewRoot: string;
  catalog: readonly AnalyzableRecordSummary[];
  goldenTestMode: boolean;
};
const ResultSchema = z.object({ sessionId: z.string().min(1).max(200), packageId: z.string().min(1).max(200) }).strict();
const MessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("progress"), progress: RecordAnalysisProgressSchema }).strict(),
  z.object({ type: z.literal("result"), result: ResultSchema }).strict(),
  z.object({ type: z.literal("failed"), code: z.enum([
    "mahjong_soul_record_analysis_failed", "mahjong_soul_record_save_failed",
  ]) }).strict(),
]);

/** Separate from the presentation/LLM worker: neither window IPC nor coach
 * tools queue behind package validation, graph construction or synchronous SQL.
 * The full package never crosses this boundary. One task owns its sidecars and
 * repository until cleanup completes, including on cancellation and shutdown. */
export function createAnalysisWorkerHost(options: { workerEntry?: URL } = {}) {
  const active = new Map<Worker, Promise<PaipuReviewPreparationResult>>();
  let closing = false;
  return Object.freeze({
    run(data: AnalysisWorkerData, onProgress?: PaipuReviewPreparationInput["onProgress"]): Promise<PaipuReviewPreparationResult> {
      if (closing) return Promise.reject(new Error("analysis_unavailable"));
      const worker = new Worker(options.workerEntry ?? new URL("./analysis-worker.js", import.meta.url), { workerData: data });
      const task = new Promise<PaipuReviewPreparationResult>((resolve, reject) => {
        let result: PaipuReviewPreparationResult | undefined;
        let failed = false;
        let failureCode = "mahjong_soul_record_analysis_failed";
        const timer = setTimeout(() => { failed = true; worker.postMessage({ type: "cancel" }); }, 30 * 60_000);
        worker.on("message", raw => {
          const parsed = MessageSchema.safeParse(raw);
          if (!parsed.success) { failed = true; worker.postMessage({ type: "cancel" }); return; }
          const message = parsed.data;
          if (message.type === "progress") {
            try { onProgress?.(message.progress); } catch { failed = true; worker.postMessage({ type: "cancel" }); }
          } else if (message.type === "result") result = message.result;
          else { failed = true; failureCode = message.code; }
        });
        worker.on("error", () => { failed = true; });
        worker.on("exit", code => {
          clearTimeout(timer);
          if (code === 0 && result !== undefined && !failed) resolve(Object.freeze(result));
          else reject(new Error(failureCode));
        });
      });
      active.set(worker, task);
      void task.finally(() => active.delete(worker)).catch(() => undefined);
      return task;
    },
    async close(): Promise<void> {
      closing = true;
      for (const worker of active.keys()) worker.postMessage({ type: "cancel" });
      // Do not terminate a thread underneath an owned native child/SQL write.
      // Cancellation closes sidecars and suppresses save at the next boundary.
      await Promise.allSettled(active.values());
    },
  });
}
