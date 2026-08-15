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
  syntheticRecordHead,
} from "./helpers/cdp-capture-harness.js";

// The paipu-URL ingestion route without manual seat selection. Pins:
//   1. the request is { shareUrl } only — no seat exists in the API;
//   2. an invalid URL never opens a window; the exact validated URL is
//      navigated verbatim;
//   3. the seat is auto-resolved by joining the URL's perspective account
//      against the SAME-response captured record identity — a mismatch
//      fails closed with NO replay and NO cache;
//   4. URL-captured bytes at the resolved seat converge on the same analysis
//      as account-fetched bytes.

const fixtureRecordId = "000000-00000000-0000-0000-0000-000000000001";
// The _a suffix IS the perspective account id — it must match the scripted
// response's head accounts for the seat to resolve.
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

describe("paipu import service (automatic perspective resolution)", () => {
  it("accepts the exact CN share URL shape and rejects every deviation without opening a window", async () => {
    const { service, windows } = await makeService({ timeoutMs: 25 });
    const id = "260811-00000000-0000-0000-0000-000000000001";
    const valid = `https://game.maj-soul.com/1/?paipu=${id}_a123456`;
    const invalid = [
      "share me this game",
      "",
      `http://game.maj-soul.com/1/?paipu=${id}_a1`,
      `https://evil.com/1/?paipu=${id}_a1`,
      `https://game.maj-soul.com/2/?paipu=${id}_a1`,
      `https://game.maj-soul.com/1/extra?paipu=${id}_a1`,
      `https://game.maj-soul.com/1/?paipu=${id}_a1&x=2`,
      `https://game.maj-soul.com/1/?paipu=${id}_a1#top`,
      `https://game.maj-soul.com/1/?paipu=${id}`,
      `https://game.maj-soul.com/1/?paipu=${id}_a0`,
      `https://game.maj-soul.com/1/?paipu=not-a-paipu-value_a1`,
      `https://game.maj-soul.com/1/?paipu=${id.slice(0, -1)}_a1`,
    ];
    for (const url of invalid) {
      await expect(service.importPaipu({ shareUrl: url }))
        .resolves.toEqual({ status: "invalid_url" });
    }
    expect(windows()).toBe(0);

    // The valid shape parses and opens a window (no capture here).
    await expect(service.importPaipu({ shareUrl: valid }))
      .resolves.toEqual({ status: "no_capture" });
    expect(windows()).toBe(1);
  });

  it("navigates the original share URL verbatim and resolves the seat automatically", async () => {
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

    const result = await service.importPaipu({ shareUrl: fixtureUrl });
    expect(result).toMatchObject({
      status: "analysis_ready",
      recordId: fixtureRecordId,
    });
    if (result.status !== "analysis_ready") return;
    // The scripted head pins perspective account 62115198 at seat 3 — the
    // seat was resolved by the identity join, not chosen by anyone.
    expect(result.selfActor).toBe(3);
    // The exact validated URL (including the _a suffix) reached the window.
    expect(window.loadedUrl).toBe(fixtureUrl);
    // The auto-resolved seat reached the mapper unchanged.
    expect(analysis.getMappedRecord(fixtureRecordId, 3)?.selfActor).toBe(3);
  });

  it("resolves whichever account the URL names — the suffix is an account id, not a seat", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const fixture = loadFixtureWire("real-supported-round");
    // Perspective account 100002 sits at seat 1 in the synthetic head.
    const url = `https://game.maj-soul.com/1/?paipu=${fixtureRecordId}_a100002`;
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
    const result = await service.importPaipu({ shareUrl: url });
    expect(result).toMatchObject({ status: "analysis_ready", selfActor: 1 });
  });

  it("fails closed on identity mismatch: no analysis_ready, no replay, no cache", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const fixture = loadFixtureWire("real-supported-round");
    // The URL names account 999999999, which no scripted account matches.
    const url = `https://game.maj-soul.com/1/?paipu=${fixtureRecordId}_a999999999`;
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
    const result = await service.importPaipu({ shareUrl: url });
    expect(result).toEqual({ status: "identity_mismatch" });
    for (const seat of [0, 1, 2, 3]) {
      expect(analysis.getMappedRecord(fixtureRecordId, seat)).toBeUndefined();
      expect(analysis.getReplayedDecisions(fixtureRecordId, seat)).toBeUndefined();
    }
  });

  it("converges: URL-captured bytes at the resolved seat analyze identically to account-fetched bytes", async () => {
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

    // Account-style route: INNER bytes handed straight to the shared store
    // at the seat the identity join will resolve (3).
    const accountOutcome = analysis.analyzeRecord({
      recordId: fixtureRecordId,
      selfActor: 3,
      recordBytes: Uint8Array.from(unwrapGameDetailRecords(bundle, fixture.wire)),
    });
    expect(accountOutcome.status).toBe("analysis_ready");

    // URL-style route: the outer-wrapped wire captured over CDP, seat auto-
    // resolved from the scripted head.
    const urlResult = await service.importPaipu({ shareUrl: fixtureUrl });
    expect(urlResult.status).toBe("analysis_ready");
    if (urlResult.status !== "analysis_ready" || accountOutcome.status !== "analysis_ready") return;

    expect(urlResult.selfActor).toBe(3);
    expect(urlResult.canonicalEventCount).toBe(accountOutcome.stream.events.length);
    expect(urlResult.replayDecisionCount).toBe(accountOutcome.decisions.length);
    const cached = analysis.getMappedRecord(fixtureRecordId, 3);
    expect(cached?.sourceRecordHash).toBe(accountOutcome.stream.sourceRecordHash);
    expect(JSON.stringify(cached?.events)).toBe(JSON.stringify(accountOutcome.stream.events));
    expect(JSON.stringify(analysis.getReplayedDecisions(fixtureRecordId, 3)))
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

    const first = service.importPaipu({ shareUrl: fixtureUrl });
    const second = service.importPaipu({ shareUrl: fixtureUrl });
    // A different perspective (different _a suffix) is a different request
    // identity and opens its own window.
    const third = service.importPaipu({
      shareUrl: `https://game.maj-soul.com/1/?paipu=${fixtureRecordId}_a100002`,
    });
    const [a, b, c] = await Promise.all([first, second, third]);
    expect(a).toEqual(b);
    expect(a).toMatchObject({ status: "analysis_ready", selfActor: 3 });
    expect(c).toMatchObject({ status: "analysis_ready", selfActor: 1 });
    expect(windowsCreated).toBe(2);
  });

  it("requires no catalog: a record absent from any catalog imports fine (structural check)", async () => {
    const { service } = await makeService({ timeoutMs: 25 });
    const result = await service.importPaipu({ shareUrl: fixtureUrl });
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
    const result = await service.importPaipu({ shareUrl: fixtureUrl });
    expect(result).toEqual({ status: "unsupported_semantics" });
    expect(analysis.getMappedRecord(fixtureRecordId, 3)).toBeUndefined();
    expect(analysis.getReplayedDecisions(fixtureRecordId, 3)).toBeUndefined();
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
    const result = await service.importPaipu({ shareUrl: fixtureUrl });
    expect(result).toEqual({ status: "unsupported_semantics" });
    expect(analysis.getMappedRecord(fixtureRecordId, 3)).toBeUndefined();
  });

  it("reports no capture for a timeout, a malformed record, or a failed navigation", async () => {
    const timeout = await makeService({ timeoutMs: 20 });
    await expect(timeout.service.importPaipu({ shareUrl: fixtureUrl }))
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
    await expect(brokenService.importPaipu({ shareUrl: fixtureUrl }))
      .resolves.toEqual({ status: "no_capture" });
    expect(brokenAnalysis.getMappedRecord(fixtureRecordId, 3)).toBeUndefined();

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
    await expect(refusedService.importPaipu({ shareUrl: fixtureUrl }))
      .resolves.toEqual({ status: "no_capture" });
    expect(refused.closed).toBe(true);
  });

  it("rejects a captured record whose uuid does not match the URL's record id", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const fixture = loadFixtureWire("real-supported-round");
    // A head describing a DIFFERENT record than the URL names.
    const head = syntheticRecordHead();
    head.uuid = "260811-00000000-0000-0000-0000-000000000002";
    const { createWindow } = scriptedCapture(bundle, { data: fixture.wire }, { head });
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
    const result = await service.importPaipu({ shareUrl: fixtureUrl });
    expect(result).toEqual({ status: "identity_mismatch" });
    expect(analysis.getMappedRecord(fixtureRecordId, 3)).toBeUndefined();
  });
});
