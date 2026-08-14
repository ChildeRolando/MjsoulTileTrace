import { describe, expect, it } from "vitest";
import {
  loadMahjongSoulProtocolBundle,
  mapMahjongSoulRecord,
  unwrapGameDetailRecords,
} from "@riichi-coach/mahjong-soul-source";
import { replayCanonicalStream } from "@riichi-coach/reasoning";
import { createRecordAnalysisStore } from "../src/record-analysis-store.js";
import { createMahjongSoulPaipuImportService } from "../src/paipu-import-service.js";
import {
  bundleRoot,
  encodeSyntheticRecord,
  FakeWindow,
  loadFixtureWire,
  scriptedCapture,
} from "./helpers/cdp-capture-harness.js";

// The paipu-URL ingestion route. Pins the three properties the product
// depends on:
//   1. a strict URL parse gates EVERYTHING — an invalid URL never opens a
//      window; the original validated URL is navigated verbatim;
//   2. selfActor is explicit (no default, never inferred from `_a`);
//   3. URL-captured bytes converge on the same analysis as account-fetched
//      bytes (shared analysis store), and unsupported semantics stay
//      fail-closed with nothing cached.

const fixtureRecordId = "000000-00000000-0000-0000-0000-000000000001";
const fixtureUrl = `https://game.maj-soul.com/1/?paipu=${fixtureRecordId}_a62115198`;

async function makeService(overrides?: {
  readonly createWindow?: () => FakeWindow;
  readonly timeoutMs?: number;
}) {
  const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
  const analysis = createRecordAnalysisStore({
    mapRecord: (input) => mapMahjongSoulRecord({ ...input, bundle }),
    replay: replayCanonicalStream,
  });
  let windowsCreated = 0;
  const createWindow = overrides?.createWindow ?? (() => {
    windowsCreated += 1;
    return new FakeWindow();
  });
  const service = createMahjongSoulPaipuImportService({
    bundle,
    analysis,
    createWindow,
    timeoutMs: overrides?.timeoutMs ?? 5_000,
  });
  return { bundle, analysis, service, windows: () => windowsCreated };
}

describe("paipu import service", () => {
  it("accepts the exact CN share URL shape and rejects every deviation without opening a window", async () => {
    const { service, windows } = await makeService({ timeoutMs: 25 });
    const id = "260811-00000000-0000-0000-0000-000000000001";
    const valid = `https://game.maj-soul.com/1/?paipu=${id}_a123456`;
    const invalid = [
      "share me this game",                       // not a URL
      "",                                          // empty
      `http://game.maj-soul.com/1/?paipu=${id}_a1`, // http, not https
      `https://evil.com/1/?paipu=${id}_a1`,        // wrong origin
      `https://game.maj-soul.com/2/?paipu=${id}_a1`, // wrong room path
      `https://game.maj-soul.com/1/extra?paipu=${id}_a1`, // extra path
      `https://game.maj-soul.com/1/?paipu=${id}_a1&x=2`, // extra query
      `https://game.maj-soul.com/1/?paipu=${id}_a1#top`, // extra hash
      `https://game.maj-soul.com/1/?paipu=${id}`,   // missing _a view suffix
      `https://game.maj-soul.com/1/?paipu=${id}_a0`, // view suffix must be >= 1
      `https://game.maj-soul.com/1/?paipu=not-a-paipu-value_a1`, // malformed paipu
      `https://game.maj-soul.com/1/?paipu=${id.slice(0, -1)}_a1`, // id one char short
    ];
    for (const url of invalid) {
      await expect(service.importPaipu({ shareUrl: url, selfActor: 0 }))
        .resolves.toEqual({ status: "invalid_url" });
    }
    expect(windows()).toBe(0);

    // The valid shape parses and the derived recordId is the deterministic
    // parser output (invalid here only because nothing is captured — the
    // window DID open for it).
    await expect(service.importPaipu({ shareUrl: valid, selfActor: 0 }))
      .resolves.toEqual({ status: "no_capture" });
    expect(windows()).toBe(1);
  });

  it("navigates the original share URL verbatim and passes selfActor through unchanged", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const fixture = loadFixtureWire("real-supported-round");
    const { window, createWindow } = scriptedCapture(bundle, { data: fixture.wire });
    const analysis = createRecordAnalysisStore({
      mapRecord: (input) => mapMahjongSoulRecord({ ...input, bundle }),
      replay: replayCanonicalStream,
    });
    const service = createMahjongSoulPaipuImportService({
      bundle,
      analysis,
      createWindow,
      timeoutMs: 5_000,
    });

    const result = await service.importPaipu({ shareUrl: fixtureUrl, selfActor: 2 });
    expect(result).toMatchObject({
      status: "analysis_ready",
      recordId: fixtureRecordId,
      selfActor: 2,
    });
    // The exact validated URL (including the _a view suffix) reached the
    // window — not a reconstructed one.
    expect(window.loadedUrl).toBe(fixtureUrl);
    // selfActor reached the mapper unchanged.
    expect(analysis.getMappedRecord(fixtureRecordId, 2)?.selfActor).toBe(2);
  });

  it("has no default seat: a missing or out-of-range selfActor is rejected before any window", async () => {
    const { service, windows } = await makeService();
    for (const badSeat of [undefined, -1, 4, 1.5, Number.NaN, "2"] as unknown as number[]) {
      await expect(service.importPaipu({ shareUrl: fixtureUrl, selfActor: badSeat }))
        .resolves.toEqual({ status: "invalid_self_actor" });
    }
    expect(windows()).toBe(0);
  });

  it("converges: URL-captured bytes analyze identically to account-fetched bytes", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const fixture = loadFixtureWire("real-supported-round");
    const { createWindow } = scriptedCapture(bundle, { data: fixture.wire });
    const analysis = createRecordAnalysisStore({
      mapRecord: (input) => mapMahjongSoulRecord({ ...input, bundle }),
      replay: replayCanonicalStream,
    });
    const service = createMahjongSoulPaipuImportService({
      bundle,
      analysis,
      createWindow,
      timeoutMs: 5_000,
    });

    // Account-style route: INNER bytes handed straight to the shared store.
    const accountOutcome = analysis.analyzeRecord({
      recordId: fixtureRecordId,
      selfActor: 1,
      recordBytes: Uint8Array.from(unwrapGameDetailRecords(bundle, fixture.wire)),
    });
    expect(accountOutcome.status).toBe("analysis_ready");

    // URL-style route: the outer-wrapped wire captured over CDP.
    const urlResult = await service.importPaipu({ shareUrl: fixtureUrl, selfActor: 1 });
    expect(urlResult.status).toBe("analysis_ready");
    if (urlResult.status !== "analysis_ready" || accountOutcome.status !== "analysis_ready") return;

    expect(urlResult.canonicalEventCount).toBe(accountOutcome.stream.events.length);
    expect(urlResult.replayDecisionCount).toBe(accountOutcome.decisions.length);
    const cached = analysis.getMappedRecord(fixtureRecordId, 1);
    expect(cached?.sourceRecordHash).toBe(accountOutcome.stream.sourceRecordHash);
    expect(JSON.stringify(cached?.events)).toBe(JSON.stringify(accountOutcome.stream.events));
    expect(JSON.stringify(analysis.getReplayedDecisions(fixtureRecordId, 1)))
      .toBe(JSON.stringify(accountOutcome.decisions));
  });

  it("shares one active promise (and one window) for concurrent duplicate imports", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const fixture = loadFixtureWire("real-supported-round");
    let windowsCreated = 0;
    const analysis = createRecordAnalysisStore({
      mapRecord: (input) => mapMahjongSoulRecord({ ...input, bundle }),
      replay: replayCanonicalStream,
    });
    const service = createMahjongSoulPaipuImportService({
      bundle,
      analysis,
      // A fresh scripted window per creation, exactly like real Electron.
      createWindow: () => {
        windowsCreated += 1;
        return scriptedCapture(bundle, { data: fixture.wire }).window;
      },
      timeoutMs: 5_000,
    });

    const first = service.importPaipu({ shareUrl: fixtureUrl, selfActor: 0 });
    const second = service.importPaipu({ shareUrl: fixtureUrl, selfActor: 0 });
    // A different seat is a different import and opens its own window.
    const third = service.importPaipu({ shareUrl: fixtureUrl, selfActor: 3 });
    const [a, b, c] = await Promise.all([first, second, third]);
    expect(a).toEqual(b);
    expect(a).toMatchObject({ status: "analysis_ready", selfActor: 0 });
    expect(c).toMatchObject({ status: "analysis_ready", selfActor: 3 });
    expect(windowsCreated).toBe(2);
  });

  it("requires no catalog: a record absent from any catalog imports fine (structural check)", async () => {
    // The service is constructed without any catalog store or vault at all —
    // URL import is a sibling ingestion source, not a catalog lookup.
    const { service } = await makeService({ timeoutMs: 25 });
    const result = await service.importPaipu({ shareUrl: fixtureUrl, selfActor: 0 });
    expect(result).toMatchObject({ status: "no_capture" });
  });

  it("fails closed on unattested kan semantics: no analysis_ready, nothing cached", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
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
    const { createWindow } = scriptedCapture(bundle, { data: synthetic });
    const analysis = createRecordAnalysisStore({
      mapRecord: (input) => mapMahjongSoulRecord({ ...input, bundle }),
      replay: replayCanonicalStream,
    });
    const service = createMahjongSoulPaipuImportService({
      bundle,
      analysis,
      createWindow,
      timeoutMs: 5_000,
    });
    const result = await service.importPaipu({ shareUrl: fixtureUrl, selfActor: 0 });
    expect(result).toEqual({ status: "unsupported_semantics" });
    expect(analysis.getMappedRecord(fixtureRecordId, 0)).toBeUndefined();
    expect(analysis.getReplayedDecisions(fixtureRecordId, 0)).toBeUndefined();
  });

  it("fails closed on RecordLiuJu: no partial replay, nothing cached", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
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
      { name: "RecordLiuJu", data: { type: 0 } },
    ]);
    const { createWindow } = scriptedCapture(bundle, { data: synthetic });
    const analysis = createRecordAnalysisStore({
      mapRecord: (input) => mapMahjongSoulRecord({ ...input, bundle }),
      replay: replayCanonicalStream,
    });
    const service = createMahjongSoulPaipuImportService({
      bundle,
      analysis,
      createWindow,
      timeoutMs: 5_000,
    });
    const result = await service.importPaipu({ shareUrl: fixtureUrl, selfActor: 0 });
    expect(result).toEqual({ status: "unsupported_semantics" });
    expect(analysis.getMappedRecord(fixtureRecordId, 0)).toBeUndefined();
  });

  it("reports no capture for a timeout, a malformed record, or a failed navigation", async () => {
    const timeout = await makeService({ timeoutMs: 20 });
    await expect(timeout.service.importPaipu({ shareUrl: fixtureUrl, selfActor: 0 }))
      .resolves.toEqual({ status: "no_capture" });

    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    // Malformed record: the response data is not a GameDetailRecords Wrapper.
    const broken = scriptedCapture(bundle, { data: Uint8Array.of(1, 2, 3) });
    const brokenAnalysis = createRecordAnalysisStore({
      mapRecord: (input) => mapMahjongSoulRecord({ ...input, bundle }),
      replay: replayCanonicalStream,
    });
    const brokenService = createMahjongSoulPaipuImportService({
      bundle,
      analysis: brokenAnalysis,
      createWindow: broken.createWindow,
      timeoutMs: 5_000,
    });
    await expect(brokenService.importPaipu({ shareUrl: fixtureUrl, selfActor: 0 }))
      .resolves.toEqual({ status: "no_capture" });
    expect(brokenAnalysis.getMappedRecord(fixtureRecordId, 0)).toBeUndefined();

    // Failed navigation: loadURL itself rejects.
    const refused = new FakeWindow();
    refused.loadURL = () => Promise.reject(new Error("navigation refused"));
    const refusedAnalysis = createRecordAnalysisStore({
      mapRecord: (input) => mapMahjongSoulRecord({ ...input, bundle }),
      replay: replayCanonicalStream,
    });
    const refusedService = createMahjongSoulPaipuImportService({
      bundle,
      analysis: refusedAnalysis,
      createWindow: () => refused,
      timeoutMs: 5_000,
    });
    await expect(refusedService.importPaipu({ shareUrl: fixtureUrl, selfActor: 0 }))
      .resolves.toEqual({ status: "no_capture" });
    expect(refused.closed).toBe(true);
  });
});
