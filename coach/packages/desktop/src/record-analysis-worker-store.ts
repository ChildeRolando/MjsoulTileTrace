import { createHash } from "node:crypto";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { loadMahjongSoulProtocolBundle, mapMahjongSoulRecord } from "@riichi-coach/mahjong-soul-source";
import { replayCanonicalStream } from "@riichi-coach/reasoning";
import { createRecordAnalysisStore, type RecordAnalysisOutcome, type RecordAnalysisStore } from "./record-analysis-store.js";

type Request = Parameters<RecordAnalysisStore["analyzeRecord"]>[0];
export type RecordAnalysisStorePort = Omit<RecordAnalysisStore, "analyzeRecord"> & {
  analyzeRecord(input: Request): RecordAnalysisOutcome | Promise<RecordAnalysisOutcome>;
};

/** The existing mapper/replay owner runs off main as well. Only canonical
 * input context crosses back, never a structured analysis package. Account
 * fetch validation and subsequent handoff share the same byte-bound result. */
export function createRecordAnalysisWorkerStore(options: { workerEntry?: URL } = {}): RecordAnalysisStorePort & { close(): Promise<void> } {
  const prepared = new Map<string, { identity: string; outcome: RecordAnalysisOutcome }>();
  const active = new Map<string, Promise<RecordAnalysisOutcome>>();
  let closing = false;
  return Object.freeze({
    async analyzeRecord(request: Request): Promise<RecordAnalysisOutcome> {
      if (closing) throw new Error("analysis_unavailable");
      const key = `${request.recordId}#${request.selfActor}`;
      const identity = createHash("sha256").update(request.recordBytes).update(JSON.stringify([request.recordId, request.selfActor, request.ruleEvidence ?? null])).digest("hex");
      const cached = prepared.get(key);
      if (cached?.identity === identity) return cached.outcome;
      const pending = active.get(identity);
      if (pending !== undefined) return await pending;
      const worker = new Worker(options.workerEntry ?? new URL("./record-analysis-worker-store.js", import.meta.url), { workerData: request });
      const task = new Promise<RecordAnalysisOutcome>((resolve, reject) => {
        let outcome: RecordAnalysisOutcome | undefined;
        let failed = false;
        worker.on("message", value => { outcome = value; });
        worker.on("error", () => { failed = true; });
        worker.on("exit", code => {
          if (failed || code !== 0 || outcome === undefined) { reject(new Error("analysis_failed")); return; }
          if (outcome.status === "analysis_ready" && (outcome.stream.gameId !== `majsoul:${request.recordId}` || outcome.stream.selfActor !== request.selfActor)) {
            reject(new Error("analysis_failed")); return;
          }
          prepared.set(key, { identity, outcome });
          resolve(outcome);
        });
      }).finally(() => active.delete(identity));
      active.set(identity, task);
      return await task;
    },
    getMappedRecord(recordId: string, selfActor: number) {
      const outcome = prepared.get(`${recordId}#${selfActor}`)?.outcome;
      return outcome?.status === "analysis_ready" ? outcome.stream : undefined;
    },
    getReplayedDecisions(recordId: string, selfActor: number) {
      const outcome = prepared.get(`${recordId}#${selfActor}`)?.outcome;
      return outcome?.status === "analysis_ready" ? outcome.decisions : undefined;
    },
    async close() { closing = true; await Promise.allSettled(active.values()); prepared.clear(); },
  });
}

if (!isMainThread) {
  void (async () => {
    const bundle = await loadMahjongSoulProtocolBundle(fileURLToPath(new URL("../../../vendor/mahjong-soul-protocol/", import.meta.url)));
    const store = createRecordAnalysisStore({ mapRecord: input => mapMahjongSoulRecord({ ...input, bundle }), replay: replayCanonicalStream });
    parentPort!.postMessage(store.analyzeRecord(workerData as Request));
  })().finally(() => parentPort!.close());
}
