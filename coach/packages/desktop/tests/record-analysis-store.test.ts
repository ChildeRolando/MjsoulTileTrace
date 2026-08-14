import { describe, expect, it } from "vitest";
import {
  loadMahjongSoulProtocolBundle,
  mapMahjongSoulRecord,
  unwrapGameDetailRecords,
  type MahjongSoulCanonicalMapperResult,
} from "@riichi-coach/mahjong-soul-source";
import { replayCanonicalStream } from "@riichi-coach/reasoning";
import { createRecordAnalysisStore } from "../src/record-analysis-store.js";
import {
  bundleRoot,
  encodeSyntheticRecord,
  loadFixtureWire,
} from "./helpers/cdp-capture-harness.js";

// The shared post-ingestion analysis component. Both ingestion routes
// (account/catalog fetch and paipu-URL capture) go through this exact object;
// the tests below pin the convergence and fail-closed invariants the routes
// are not allowed to re-implement.

const recordId = "000000-00000000-0000-0000-0000-000000000001";

function innerFixtureBytes(bundle: Awaited<ReturnType<typeof loadMahjongSoulProtocolBundle>>): Uint8Array {
  const fixture = loadFixtureWire("real-supported-round");
  return Uint8Array.from(unwrapGameDetailRecords(bundle, fixture.wire));
}

async function realStore() {
  const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
  return {
    bundle,
    store: createRecordAnalysisStore({
      mapRecord: (input) => mapMahjongSoulRecord({ ...input, bundle }),
      replay: replayCanonicalStream,
    }),
  };
}

describe("record analysis store", () => {
  it("analyzes a supported record and caches stream + decisions per seat", async () => {
    const { bundle, store } = await realStore();
    const inner = innerFixtureBytes(bundle);

    const outcome = store.analyzeRecord({
      recordId,
      selfActor: 2,
      recordBytes: inner,
    });
    expect(outcome.status).toBe("analysis_ready");
    if (outcome.status !== "analysis_ready") return;
    expect(outcome.stream.gameId).toBe(`majsoul:${recordId}`);
    expect(outcome.stream.selfActor).toBe(2);
    expect(outcome.decisions.length).toBeGreaterThan(0);
    expect(store.getMappedRecord(recordId, 2)).toBe(outcome.stream);
    expect(store.getReplayedDecisions(recordId, 2)).toEqual(outcome.decisions);
    // Analysis state is per seat: another seat is another analysis, and it
    // does not clobber the first.
    const otherSeat = store.analyzeRecord({ recordId, selfActor: 3, recordBytes: inner });
    expect(otherSeat.status).toBe("analysis_ready");
    expect(store.getMappedRecord(recordId, 2)).toBe(outcome.stream);
    expect(store.getMappedRecord(recordId, 3)).toBeDefined();
  });

  it("is deterministic: the same bytes + the same seat analyze identically", async () => {
    const { bundle, store } = await realStore();
    const inner = innerFixtureBytes(bundle);
    const first = store.analyzeRecord({ recordId, selfActor: 1, recordBytes: inner });
    const second = store.analyzeRecord({ recordId, selfActor: 1, recordBytes: inner });
    expect(first.status).toBe("analysis_ready");
    expect(second.status).toBe("analysis_ready");
    if (first.status !== "analysis_ready" || second.status !== "analysis_ready") return;
    expect(second.stream.sourceRecordHash).toBe(first.stream.sourceRecordHash);
    expect(JSON.stringify(second.stream.events)).toBe(JSON.stringify(first.stream.events));
    expect(second.decisions.length).toBe(first.decisions.length);
    expect(JSON.stringify(second.decisions)).toBe(JSON.stringify(first.decisions));
  });

  it("fails closed on unattested kan semantics and caches nothing", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const store = createRecordAnalysisStore({
      mapRecord: (input) => mapMahjongSoulRecord({ ...input, bundle }),
      replay: replayCanonicalStream,
    });
    const synthetic = encodeSyntheticRecord(bundle, [
      {
        name: "RecordNewRound",
        data: {
          chang: 0, ju: 0, ben: 0, doras: ["1z"], scores: [25000, 25000, 25000, 25000],
          liqibang: 0, left_tile_count: 69,
          tiles0: ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p"],
          tiles1: ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p"],
          tiles2: ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p"],
          tiles3: ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p", "5p"],
        },
      },
      { name: "RecordAnGangAddGang", data: { seat: 3, type: 9, tiles: "3s" } },
    ]);
    const outcome = store.analyzeRecord({
      recordId,
      selfActor: 0,
      // The store's input boundary is INNER bytes, like every post-capture
      // consumer; strip the outer Wrapper the helper builds.
      recordBytes: Uint8Array.from(unwrapGameDetailRecords(bundle, synthetic)),
    });
    expect(outcome).toEqual({
      status: "unsupported_semantics",
      code: "mahjong_soul_canonical_unsupported_semantics",
    });
    expect(store.getMappedRecord(recordId, 0)).toBeUndefined();
    expect(store.getReplayedDecisions(recordId, 0)).toBeUndefined();
  });

  it("rejects an invalid seat or malformed input without invoking the mapper", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    let mapperCalls = 0;
    const store = createRecordAnalysisStore({
      mapRecord: (input) => {
        mapperCalls += 1;
        return mapMahjongSoulRecord({ ...input, bundle });
      },
      replay: replayCanonicalStream,
    });
    const inner = new Uint8Array(8);
    for (const bad of [
      { recordId, selfActor: 7, recordBytes: inner },
      { recordId, selfActor: 1.5, recordBytes: inner },
      { recordId: "", selfActor: 0, recordBytes: inner },
      { recordId, selfActor: 0, recordBytes: undefined as unknown as Uint8Array },
    ]) {
      expect(store.analyzeRecord(bad)).toEqual({
        status: "mapping_failed",
        code: "mahjong_soul_canonical_mapping_failed",
      });
    }
    expect(mapperCalls).toBe(0);
    expect(store.getMappedRecord(recordId, 0)).toBeUndefined();
  });

  it("surfaces mapper exceptions and replay exceptions as fixed failures", async () => {
    const throwing = createRecordAnalysisStore({
      mapRecord: (): MahjongSoulCanonicalMapperResult => {
        throw new Error("unexpected");
      },
      replay: replayCanonicalStream,
    });
    expect(throwing.analyzeRecord({
      recordId, selfActor: 0, recordBytes: new Uint8Array(8),
    })).toEqual({
      status: "mapping_failed",
      code: "mahjong_soul_canonical_mapping_failed",
    });

    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const replayBroken = createRecordAnalysisStore({
      mapRecord: (input) => mapMahjongSoulRecord({ ...input, bundle }),
      replay: () => {
        throw new Error("replay exploded");
      },
    });
    const outcome = replayBroken.analyzeRecord({
      recordId, selfActor: 0, recordBytes: innerFixtureBytes(bundle),
    });
    expect(outcome.status).toBe("replay_failed");
    expect(Object.keys(outcome).sort()).toEqual(["status"]);
    expect(replayBroken.getMappedRecord(recordId, 0)).toBeUndefined();
    expect(replayBroken.getReplayedDecisions(recordId, 0)).toBeUndefined();
  });
});
