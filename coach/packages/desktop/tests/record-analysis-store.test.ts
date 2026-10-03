import { describe, expect, it } from "vitest";
import {
  loadMahjongSoulProtocolBundle,
  mapMahjongSoulRecord,
  unwrapGameDetailRecords,
  type MahjongSoulCanonicalMapperResult,
} from "@riichi-coach/mahjong-soul-source";
import { replayCanonicalStream, validateCanonicalEventStream } from "@riichi-coach/reasoning";
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
  it.each(["absolute", "old_only", "delta_only"])("accounts for the accepted riichi deposit in single and double ron: %s", async evidence => {
    const { bundle, store } = await realStore();
    for (const doubleRon of [false, true]) {
      const hand = ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p"];
      const other = ["7z", "6z", "5z", "4z", "3z", "2z", "1z", "1s", "2s", "3s", "4s", "5s", "6s"];
      const final = doubleRon ? [26000, 23000, 26000, 25000] : [27000, 23000, 25000, 25000];
      const wireDelta = doubleRon ? [2000, -2000, 1000, 0] : [3000, -2000, 0, 0];
      const bytes = encodeSyntheticRecord(bundle, [
        { name: "RecordNewRound", data: { chang: 0, ju: 0, ben: 0, liqibang: 0,
          doras: ["5z"], scores: [25000, 25000, 25000, 25000], left_tile_count: 69,
          tiles0: [...hand, "1z"], tiles1: other, tiles2: hand, tiles3: other } },
        { name: "RecordDiscardTile", data: { seat: 0, tile: "1z", moqie: true, is_liqi: true } },
        { name: "RecordDealTile", data: { seat: 1, tile: "4p", left_tile_count: 68 } },
        { name: "RecordDiscardTile", data: { seat: 1, tile: "4p", moqie: true } },
        { name: "RecordHule", data: { hules: [ { seat: 0, zimo: false, hu_tile: "4p" },
          ...(doubleRon ? [{ seat: 2, zimo: false, hu_tile: "4p" }] : []) ], delta_scores: wireDelta,
          ...(evidence === "delta_only" ? {} : { old_scores: [24000, 25000, 25000, 25000] }),
          ...(evidence === "absolute" ? { scores: final } : {}) } },
      ]);
      const outcome = store.analyzeRecord({ recordId, selfActor: 0, recordBytes: Uint8Array.from(unwrapGameDetailRecords(bundle, bytes)) });
      expect(outcome.status).toBe("analysis_ready");
      if (outcome.status !== "analysis_ready") throw new Error("riichi settlement failed");
      expect(validateCanonicalEventStream(outcome.stream)).toEqual({ status: "valid" });
      expect(outcome.stream.events.at(-1)).toMatchObject({ type: "game_ended", scores: final });
      const wins = outcome.stream.events.filter(event => event.type === "win_declared");
      expect(wins.map(event => event.scoreDeltas)).toEqual(doubleRon ? [null, null] : [[2000, -2000, 0, 0]]);
      if (doubleRon) expect(outcome.stream.events.find(event => event.type === "scores_updated")).toMatchObject({ scores: final });
    }
  });

  it.each([0, 1, 2, 3])("replays a complete double ron without duplicating its aggregate settlement: seat %s", async selfActor => {
    const { bundle, store } = await realStore();
    const hand = ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p"];
    const bytes = encodeSyntheticRecord(bundle, [
      { name: "RecordNewRound", data: { chang: 0, ju: 0, ben: 0, liqibang: 0,
        doras: ["1z"], scores: [25000, 25000, 25000, 25000], left_tile_count: 69,
        tiles0: [...hand, "5p"], tiles1: hand, tiles2: hand, tiles3: hand } },
      { name: "RecordDiscardTile", data: { seat: 0, tile: "5p", moqie: true } },
      { name: "RecordHule", data: { hules: [
        { seat: 1, zimo: false, hu_tile: "5p" }, { seat: 2, zimo: false, hu_tile: "5p" },
      ], delta_scores: [-3000, 1000, 2000, 0] } },
    ]);
    const outcome = store.analyzeRecord({ recordId, selfActor,
      recordBytes: Uint8Array.from(unwrapGameDetailRecords(bundle, bytes)) });
    expect(outcome.status).toBe("analysis_ready");
    if (outcome.status !== "analysis_ready") throw new Error("double ron did not reach analysis");
    expect(validateCanonicalEventStream(outcome.stream)).toEqual({ status: "valid" });
    const wins = outcome.stream.events.filter(event => event.type === "win_declared");
    expect(wins.map(event => [event.winnerActor, event.targetActor, event.scoreDeltas])).toEqual([
      [1, 0, null], [2, 0, null],
    ]);
    expect(wins[0]!.winSourceEventRef).toBe(wins[1]!.winSourceEventRef);
    expect(outcome.stream.events.find(event => event.type === "scores_updated")).toMatchObject({
      settlementEventRef: wins[0]!.eventId, scores: [22000, 26000, 27000, 25000],
    });
    expect(outcome.stream.events.find(event => event.type === "round_ended")).toMatchObject({ terminalEventRef: wins[0]!.eventId });
    expect(outcome.stream.events.at(-1)).toMatchObject({ type: "game_ended", scores: [22000, 26000, 27000, 25000] });
    expect(store.getMappedRecord(recordId, selfActor)).toBe(outcome.stream);
    expect(store.getReplayedDecisions(recordId, selfActor)).toEqual(outcome.decisions);
  });

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
