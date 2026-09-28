import { parse } from "protobufjs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { fetchMahjongSoulRecord, loadMahjongSoulProtocolBundle, mapMahjongSoulRecord, encodeMahjongSoulRecordCache, decodeMahjongSoulRecordCache } from "@riichi-coach/mahjong-soul-source";
import { replayCanonicalStream } from "@riichi-coach/reasoning";
import { createRecordAnalysisStore } from "../src/record-analysis-store.js";
import { captureRecordViaOfficialClient } from "../src/official-client-record-capture.js";
import { createMahjongSoulPaipuImportService } from "../src/paipu-import-service.js";
import { createPrivilegedRawCache } from "../src/privileged-raw-cache.js";
import { createReviewSessionRepository } from "../src/review-session-repository.js";
import { bundleRoot, fixturePaipuUrl, loadFixtureWire, scriptedCapture, syntheticRecordHead } from "./helpers/cdp-capture-harness.js";

describe("record rule evidence across ingestion routes", () => {
  it("preserves the same rules through fetch, capture, shared replay and URL import", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const fixture = loadFixtureWire("real-supported-round");
    const head = { ...syntheticRecordHead(), standard_rule: 2,
      config: { category: 2, mode: { mode: 2 }, meta: { mode_id: 12 } } };
    const type = parse(bundle.protoText, { keepCase: true }).root.lookupType("lq.RecordGame");
    const decodedHead = type.toObject(type.fromObject(head), { defaults: true, arrays: true, objects: true });
    const fetched = await fetchMahjongSoulRecord({ bundle, recordId: fixture.recordId,
      clientVersionString: "web-0.11.252.w", fetchImpl: async () => { throw new Error("unused"); },
      session: { async authenticate() {}, async close() {}, async call() { return { head: decodedHead, data: fixture.wire }; } },
    });
    const scripted = scriptedCapture(bundle, { data: fixture.wire }, { head });
    const captured = await captureRecordViaOfficialClient({ bundle, url: fixturePaipuUrl(), createWindow: scripted.createWindow, timeoutMs: 1000 });
    expect(captured.status).toBe("captured");
    expect(captured).toMatchObject({ ruleEvidence: fetched.ruleEvidence });
    const store = createRecordAnalysisStore({ mapRecord: request => mapMahjongSoulRecord({ ...request, bundle }), replay: replayCanonicalStream });
    const fetchedResult = store.analyzeRecord({ recordId: fixture.recordId, selfActor: 3, recordBytes: fetched.recordBytes,
      ...(fetched.ruleEvidence === undefined ? {} : { ruleEvidence: fetched.ruleEvidence }) });
    expect(fetchedResult.status).toBe("analysis_ready");
    if (fetchedResult.status !== "analysis_ready") throw new Error("fixture");
    expect(fetchedResult.stream.ruleSet.openTanyao).toBe(true);
    const secondCapture = scriptedCapture(bundle, { data: fixture.wire }, { head });
    const service = createMahjongSoulPaipuImportService({ bundle, analysis: store, createWindow: secondCapture.createWindow, timeoutMs: 1000 });
    const imported = await service.importPaipu({ shareUrl: fixturePaipuUrl() });
    expect(imported.status).toBe("analysis_ready");
    expect(store.getMappedRecord(fixture.recordId, 3)).toEqual(fetchedResult.stream);
    expect(store.getReplayedDecisions(fixture.recordId, 3)).toEqual(fetchedResult.decisions);
    const root = mkdtempSync(join(tmpdir(), "riichi-record-rules-"));
    createReviewSessionRepository({ root }).close();
    const identity = { sourceKind: "mahjong_soul_record", stableRecordIdentityHash: "record-test",
      perspective: "all-seats", sourceVersion: "test", modelVersion: "not_applicable", schemaVersion: "game-detail-records/v2",
      parserVersion: "test", validationVersion: "test", requestParameters: {} };
    let cache = createPrivilegedRawCache({ root });
    try {
      cache.put(identity, encodeMahjongSoulRecordCache({ bundle, ...fetched }));
      cache.close();
      cache = createPrivilegedRawCache({ root });
      const reopened = decodeMahjongSoulRecordCache({ bundle, recordId: fixture.recordId, cacheBytes: cache.get(identity)! });
      const coldStore = createRecordAnalysisStore({ mapRecord: request => mapMahjongSoulRecord({ ...request, bundle }), replay: replayCanonicalStream });
      const cold = coldStore.analyzeRecord({ ...reopened, selfActor: 3 });
      expect(cold.status).toBe("analysis_ready");
      if (cold.status !== "analysis_ready") throw new Error("fixture");
      expect(cold.stream).toEqual(fetchedResult.stream);
      expect(cold.decisions).toEqual(fetchedResult.decisions);
    } finally {
      cache.close();
      const child = relative(resolve(tmpdir()), resolve(root));
      if (!child.startsWith("riichi-record-rules-") || child.includes("..")) throw new Error("unsafe test cleanup");
      rmSync(root, { recursive: true, force: true });
    }
  });
});
