import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadMahjongSoulProtocolBundle, mapMahjongSoulRecord, unwrapGameDetailRecords } from "@riichi-coach/mahjong-soul-source";
import { replayCanonicalStream } from "@riichi-coach/reasoning";
import { createRecordAnalysisStore } from "../src/record-analysis-store.js";
import { createRecordAnalysisWorkerStore } from "../src/record-analysis-worker-store.js";

describe("production record preflight worker", () => {
  it("matches the original mapper/replay owner, deduplicates byte-identical handoffs and drains shutdown", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(fileURLToPath(new URL("../../../vendor/mahjong-soul-protocol/", import.meta.url)));
    const fixture = JSON.parse(await readFile(new URL("../../mahjong-soul-source/tests/fixtures/real-record-complete.json", import.meta.url), "utf8"));
    const request = { recordId: fixture.recordId, selfActor: 3, recordBytes: unwrapGameDetailRecords(bundle, Buffer.from(fixture.wire, "hex")), ruleEvidence: fixture.ruleEvidence };
    const direct = createRecordAnalysisStore({ mapRecord: input => mapMahjongSoulRecord({ ...input, bundle }), replay: replayCanonicalStream });
    const worker = createRecordAnalysisWorkerStore({ workerEntry: new URL("../dist/record-analysis-worker-store.js", import.meta.url) });
    try {
      const [first, second] = await Promise.all([worker.analyzeRecord(request), worker.analyzeRecord(request)]);
      expect(first).toEqual(direct.analyzeRecord(request)); expect(second).toBe(first);
      expect(await worker.analyzeRecord(request)).toBe(first);
      expect(first.status).toBe("analysis_ready");
      if (first.status === "analysis_ready") {
        expect(worker.getMappedRecord(request.recordId, 3)).toBe(first.stream);
        expect(worker.getReplayedDecisions(request.recordId, 3)).toBe(first.decisions);
      }
      expect(worker.getMappedRecord(request.recordId, 0)).toBeUndefined();
      const changed = await worker.analyzeRecord({ ...request, recordBytes: new Uint8Array([0]) });
      expect(changed.status).not.toBe("analysis_ready");
    } finally { await worker.close(); }
    await expect(worker.analyzeRecord(request)).rejects.toThrow("analysis_unavailable");
  }, 30_000);
});
