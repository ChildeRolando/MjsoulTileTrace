import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  loadMahjongSoulProtocolBundle,
  mapMahjongSoulRecord,
  unwrapGameDetailRecords,
} from "@riichi-coach/mahjong-soul-source";
import {
  libriichiRuleCanonicalJson,
  type LibriichiRuleRequest,
  type LibriichiRuleResponse,
} from "@riichi-coach/contracts";
import {
  JsonlFactEngineClient,
  generateReviewReport,
  projectContextGraph,
  replayCanonicalStream,
  selectReviewDecisions,
  type ReplayedDecision,
} from "@riichi-coach/reasoning";
import { createRecordAnalysisStore } from "../src/record-analysis-store.js";
import {
  assertUsableLocalMortalRuleResult,
  createLocalMortalAnalysisService,
} from "../src/local-mortal-analysis-service.js";
import { createMahjongSoulPaipuImportService } from "../src/paipu-import-service.js";
import {
  createReviewSessionRepository,
  persistValidatedReviewSession,
} from "../src/review-session-repository.js";
import type { ManagedMortalRuntime } from "@riichi-coach/mortal-runtime";
import {
  formatMjaiTile,
} from "@riichi-coach/mortal-source";
import {
  bundleRoot,
  encodeSyntheticRecord,
  FakeWindow,
  fixturePaipuUrl,
  loadFixtureWire,
  scriptedCapture,
} from "./helpers/cdp-capture-harness.js";
import { encodeMahjongSoulPerspectiveAccountId } from "@riichi-coach/mahjong-soul-source";
import type { MahjongSoulRecordRuleEvidence } from "@riichi-coach/mahjong-soul-source";

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
// The _a suffix is the OBFUSCATED token of the scripted head's seat-3
// account — decode + join resolves the seat automatically.
const fixtureUrl = fixturePaipuUrl();

const fixtureDigest = (value: unknown): string =>
  createHash("sha256").update(libriichiRuleCanonicalJson(value)).digest("hex");

const localAnalysisRuntimeIdentity = {
  runtimeImplementation: "Equim-chan/Mortal" as const,
  runtimeRevision: "0".repeat(40),
  runtimeVersion: "Mortal V4" as const,
  runtimeArtifactSha256: "1".repeat(64),
  runtimeModelSha256: "2".repeat(64),
  runtimeEngineSha256: "3".repeat(64),
  checkpointRepository: "Yuchen1457/mortal-582500" as const,
  checkpointRevision: "4".repeat(40),
  checkpointModelTag: "mortal-hpc@582500" as const,
  checkpointFileSha256: "5".repeat(64),
  protocolVersion: "riichi-local-mortal-jsonl/v1" as const,
  adapterVersion: "local-mortal-adapter/v1" as const,
  nativeArtifactSha256: "6".repeat(64),
};

type CompleteRecordFixture = Readonly<{
  readonly recordId: string;
  readonly wire: string;
  readonly ruleEvidence: MahjongSoulRecordRuleEvidence;
}>;

function loadCompleteRecordFixture(): CompleteRecordFixture {
  return JSON.parse(readFileSync(new URL(
    "../../mahjong-soul-source/tests/fixtures/real-record-complete.json",
    import.meta.url,
  ), "utf8")) as CompleteRecordFixture;
}

/**
 * Keep the production import regression small while using the public,
 * sanitized record mapper and a real multi-decision canonical prefix. The
 * prefix ends immediately after the third self discard, so every test still
 * exercises the same capture -> map -> replay path without shipping another
 * record or model asset.
 */
function createRealPrefixAnalysisStore(
  bundle: Awaited<ReturnType<typeof loadMahjongSoulProtocolBundle>>,
  fixture: CompleteRecordFixture,
) {
  return createRecordAnalysisStore({
    mapRecord: (input) => {
      const mapped = mapMahjongSoulRecord({
        ...input,
        bundle,
        ruleEvidence: fixture.ruleEvidence,
      });
      if (mapped.status !== "ready") return mapped;
      const allDecisions = replayCanonicalStream(mapped.stream);
      const thirdDecision = allDecisions[2];
      if (thirdDecision === undefined) throw new Error("fixture_prefix_missing_decision");
      const triggerIndex = mapped.stream.events.findIndex(
        (event) => event.eventId === thirdDecision.decisionEventRef,
      );
      if (triggerIndex < 0) throw new Error("fixture_prefix_missing_trigger");
      return {
        ...mapped,
        stream: {
          ...mapped.stream,
          events: mapped.stream.events.slice(0, triggerIndex + 2),
        },
      };
    },
    replay: replayCanonicalStream,
  });
}

function runtimeTileIndex(tile: { readonly id: string; readonly red: boolean }): number {
  const rank = Number(tile.id[0]);
  const suit = tile.id[1];
  if (tile.red) return 34 + (suit === "m" ? 0 : suit === "p" ? 1 : 2);
  if (suit === "m") return rank - 1;
  if (suit === "p") return 9 + rank - 1;
  if (suit === "s") return 18 + rank - 1;
  return 27 + rank - 1;
}

type FixtureRuntimeHarness = Readonly<{
  readonly runtime: ManagedMortalRuntime;
  readonly stats: {
    queryCalls: number;
    scoreCalls: number;
    failNextRule(): void;
  };
}>;

function createFixtureLocalMortalRuntime(
  decisions: readonly ReplayedDecision[],
): FixtureRuntimeHarness {
  const ruleIdentity = {
    implementation: "Equim-chan/Mortal/libriichi" as const,
    revision: localAnalysisRuntimeIdentity.runtimeRevision,
    nativeArtifactSha256: localAnalysisRuntimeIdentity.nativeArtifactSha256,
    wrapperSha256: localAnalysisRuntimeIdentity.runtimeArtifactSha256,
    normalizationVersion: "libriichi-actions/v2" as const,
  };
  const decisionByRef = new Map(decisions.map((decision) => [decision.decisionEventRef, decision]));
  let failNextRule = false;
  const stats = {
    queryCalls: 0,
    scoreCalls: 0,
    failNextRule: () => { failNextRule = true; },
  };
  const runtime = {
    identity: localAnalysisRuntimeIdentity,
    ruleIdentity,
    queryRules: async (request: LibriichiRuleRequest): Promise<LibriichiRuleResponse> => {
      stats.queryCalls += 1;
      if (failNextRule) {
        failNextRule = false;
        throw new Error("injected_rule_runtime_failure");
      }
      if (request.decision.surface === "response") {
        const content = {
          protocolVersion: request.protocolVersion,
          requestId: request.requestId,
          identity: request.identity,
          status: "non_action" as const,
          reason: "native_cannot_act" as const,
        };
        return { ...content, resultId: fixtureDigest(content) };
      }
      const decision = decisionByRef.get(request.decision.decisionId);
      const actual = decision?.actualAction;
      if (decision === undefined || actual === null || actual === undefined || actual.kind !== "discard") {
        throw new Error("fixture_runtime_unknown_decision");
      }
      const alternateTile = decision.snapshot.privateState.concealedTiles.find((tile) =>
        tile.id !== actual.tile.id || tile.red !== actual.tile.red);
      if (alternateTile === undefined) throw new Error("fixture_runtime_missing_alternate");
      const actions = [
        {
          runtimeAction: { index: runtimeTileIndex(actual.tile), variant: null },
          mjaiActionJson: JSON.stringify({
            type: "dahai",
            actor: request.decision.selfActor,
            pai: formatMjaiTile(actual.tile),
            tsumogiri: actual.discardMode === "tsumogiri",
          }),
        },
        {
          runtimeAction: { index: runtimeTileIndex(alternateTile), variant: null },
          mjaiActionJson: JSON.stringify({
            type: "dahai",
            actor: request.decision.selfActor,
            pai: formatMjaiTile(alternateTile),
            tsumogiri: false,
          }),
        },
      ];
      const content = {
        protocolVersion: request.protocolVersion,
        requestId: request.requestId,
        identity: request.identity,
        status: "ok" as const,
        actions,
      };
      return { ...content, resultId: fixtureDigest(content) };
    },
    scoreRules: async (request: Parameters<ManagedMortalRuntime["scoreRules"]>[0]) => {
      stats.scoreCalls += 1;
      const candidates = request.ruleResult.actions.map((row, index) => ({
        runtimeAction: row.runtimeAction,
        ruleActionId: fixtureDigest({
          runtimeAction: row.runtimeAction,
          mjaiActionJson: row.mjaiActionJson,
          ...(row.physicalAliases === undefined ? {} : { physicalAliases: row.physicalAliases }),
        }),
        qValue: index === 0 ? 1 : 0,
      }));
      return {
        protocolVersion: "riichi-local-mortal-scoring-jsonl/v2" as const,
        requestId: request.requestId,
        identity: request.identity,
        status: "ok" as const,
        ruleResultId: request.ruleResult.resultId,
        candidates,
        preferredRuntimeAction: candidates[0]!.runtimeAction,
      };
    },
    close: async () => undefined,
  } as unknown as ManagedMortalRuntime;
  return { runtime, stats };
}

type ProductionFixtureHarness = Readonly<{
  readonly bundle: Awaited<ReturnType<typeof loadMahjongSoulProtocolBundle>>;
  readonly fixture: CompleteRecordFixture;
  readonly wire: Uint8Array;
  readonly analysis: ReturnType<typeof createRecordAnalysisStore>;
  readonly localAnalysis: ReturnType<typeof createLocalMortalAnalysisService>;
  readonly runtime: FixtureRuntimeHarness;
  readonly root: string;
  readonly repository: ReturnType<typeof createReviewSessionRepository>;
  readonly service: ReturnType<typeof createMahjongSoulPaipuImportService>;
  readonly baseline: {
    readonly sessionId: string;
    readonly packageId: string;
  };
  readonly before: ReturnType<ReturnType<typeof createReviewSessionRepository>["openByPackageId"]>;
  readonly counters: {
    saveAttempts: number;
    reviewReadyReturns: number;
  };
}>;

async function createProductionFixtureHarness(): Promise<ProductionFixtureHarness> {
  const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
  const fixture = loadCompleteRecordFixture();
  const wire = Uint8Array.from(Buffer.from(fixture.wire, "hex"));
  const analysis = createRealPrefixAnalysisStore(bundle, fixture);
  const mapped = analysis.analyzeRecord({
    recordId: fixture.recordId,
    selfActor: 3,
    recordBytes: unwrapGameDetailRecords(bundle, wire),
    ruleEvidence: fixture.ruleEvidence,
  });
  if (mapped.status !== "analysis_ready") throw new Error("fixture_prefix_analysis_failed");
  expect(mapped.decisions).toHaveLength(3);
  const runtime = createFixtureLocalMortalRuntime(mapped.decisions);
  const localAnalysis = createLocalMortalAnalysisService({
    runtime: runtime.runtime,
    factEngineResourcesDir: fileURLToPath(new URL("../../../resources/", import.meta.url)),
  });
  const root = mkdtempSync("coac-106-production-import-");
  const repository = createReviewSessionRepository({ root });
  const baseline = await localAnalysis.analyze({
    recordId: fixture.recordId,
    selfActor: 3,
    stream: mapped.stream,
    decisions: mapped.decisions,
  });
  const persisted = persistValidatedReviewSession(repository, baseline.package);
  const report = await generateReviewReport(
    projectContextGraph(baseline.package),
    selectReviewDecisions(baseline.package),
    {
      descriptor: () => ({ providerId: "unconfigured", model: "unconfigured" }),
      complete: async () => ({ errorCode: "provider_unavailable" as const, transportRetries: 0 as const }),
    },
    "2026-10-01T00:00:00.000Z",
  );
  repository.saveReport(
    baseline.package.packageId,
    report,
    "production-report-ref",
    "production-report-operation",
  );
  const before = repository.openByPackageId(baseline.package.packageId);
  const counters = { saveAttempts: 0, reviewReadyReturns: 0 };
  const service = createMahjongSoulPaipuImportService({
    bundle,
    analysis,
    createWindow: () => scriptedCapture(bundle, { data: wire }).window,
    timeoutMs: 5_000,
    prepareReview: async (input) => {
      const analyzed = await localAnalysis.analyze({
        recordId: input.recordId,
        selfActor: input.selfActor,
        stream: input.stream,
        decisions: input.decisions,
      });
      counters.saveAttempts += 1;
      const saved = persistValidatedReviewSession(repository, analyzed.package);
      counters.reviewReadyReturns += 1;
      return saved;
    },
  });
  // Do not let setup traffic hide the failure matrix's whole-game census.
  runtime.stats.queryCalls = 0;
  runtime.stats.scoreCalls = 0;
  return {
    bundle,
    fixture,
    wire,
    analysis,
    localAnalysis,
    runtime,
    root,
    repository,
    service,
    baseline: persisted,
    before,
    counters,
  };
}

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
    // The scripted head pins the synthetic perspective account at seat 3 —
    // the seat was resolved by the identity join, not chosen by anyone.
    expect(result.selfActor).toBe(3);
    // The exact validated URL (including the _a suffix) reached the window.
    expect(window.loadedUrl).toBe(fixtureUrl);
    // The auto-resolved seat reached the mapper unchanged.
    expect(analysis.getMappedRecord(fixtureRecordId, 3)?.selfActor).toBe(3);
  });

  it("returns review-ready identities only after the main composition callback succeeds", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const fixture = loadFixtureWire("real-supported-round");
    const { createWindow } = scriptedCapture(bundle, { data: fixture.wire });
    const analysis = createRecordAnalysisStore({
      mapRecord: (input) => mapMahjongSoulRecord({ ...input, bundle }),
      replay: replayCanonicalStream,
    });
    let prepared: { recordId: string; selfActor: number; eventCount: number; decisionCount: number } | null = null;
    const service = createMahjongSoulPaipuImportService({
      bundle,
      analysis,
      createWindow,
      timeoutMs: 5_000,
      prepareReview: async (input) => {
        prepared = {
          recordId: input.recordId,
          selfActor: input.selfActor,
          eventCount: input.stream.events.length,
          decisionCount: input.decisions.length,
        };
        return { sessionId: "session-verified", packageId: "package-verified" };
      },
    });
    await expect(service.importPaipu({ shareUrl: fixtureUrl })).resolves.toMatchObject({
      status: "review_ready",
      recordId: fixtureRecordId,
      selfActor: 3,
      sessionId: "session-verified",
      packageId: "package-verified",
    });
    expect(prepared).toMatchObject({ recordId: fixtureRecordId, selfActor: 3 });
    const observed = prepared as unknown as { eventCount: number; decisionCount: number };
    expect(observed.eventCount).toBeGreaterThan(0);
    expect(observed.decisionCount).toBeGreaterThan(0);
  });

  it("does not return review-ready when package/session composition fails", async () => {
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
      prepareReview: async () => { throw new Error("package/session failure"); },
    });
    await expect(service.importPaipu({ shareUrl: fixtureUrl }))
      .resolves.toEqual({ status: "analysis_failed" });
  });

  it("keeps legal non-action distinct from missing/error rules evidence", () => {
    expect(() => assertUsableLocalMortalRuleResult(undefined)).toThrow("rules_result_missing");
    expect(() => assertUsableLocalMortalRuleResult({
      request: null,
      response: { status: "error", code: "rules_runtime_failed" },
      actions: [],
    })).toThrow("rules_runtime_failed");
    expect(() => assertUsableLocalMortalRuleResult({
      request: {} as never,
      response: {
        status: "non_action",
        protocolVersion: "riichi-libriichi-rules-jsonl/v2",
        requestId: "0".repeat(64),
        resultId: "1".repeat(64),
        reason: "native_cannot_act",
        identity: {} as never,
      },
      actions: [],
    })).not.toThrow();
  });

  it("routes a production rules failure to analysis_failed without saving, then permits a healthy retry", async () => {
    const harness = await createProductionFixtureHarness();
    const { repository, runtime, service, before, counters } = harness;
    try {
      runtime.stats.failNextRule();
      await expect(service.importPaipu({ shareUrl: fixtureUrl }))
        .resolves.toEqual({ status: "analysis_failed" });
      expect(runtime.stats.queryCalls).toBeGreaterThan(1);
      expect(counters.saveAttempts).toBe(0);
      expect(counters.reviewReadyReturns).toBe(0);
      expect(repository.listSessions()).toHaveLength(1);
      const afterFailure = repository.openByPackageId(before.analysisPackage.packageId);
      expect(afterFailure.sessionId).toBe(before.sessionId);
      expect(afterFailure.analysisPackage).toEqual(before.analysisPackage);
      expect(afterFailure.analysisPackage.semanticContentHash).toBe(before.analysisPackage.semanticContentHash);
      expect(afterFailure.activeReportRefId).toBe("production-report-ref");
      expect(afterFailure.activeReport).toEqual(before.activeReport);

      await expect(service.importPaipu({ shareUrl: fixtureUrl }))
        .resolves.toMatchObject({
          status: "review_ready",
          recordId: fixtureRecordId,
          selfActor: 3,
          sessionId: before.sessionId,
          packageId: before.analysisPackage.packageId,
        });
      expect(counters.saveAttempts).toBe(1);
      expect(counters.reviewReadyReturns).toBe(1);
      const afterRetry = repository.openByPackageId(before.analysisPackage.packageId);
      expect(afterRetry.sessionId).toBe(before.sessionId);
      expect(afterRetry.analysisPackage).toEqual(before.analysisPackage);
      expect(afterRetry.activeReportRefId).toBe("production-report-ref");
      expect(afterRetry.activeReport).toEqual(before.activeReport);
    } finally {
      repository.close();
      rmSync(harness.root, {
        recursive: true, force: true, maxRetries: 20, retryDelay: 100,
      });
    }
  }, 30_000);

  it("routes a production fact-helper failure to analysis_failed, then permits a healthy retry", async () => {
    const harness = await createProductionFixtureHarness();
    const { repository, service, before, counters } = harness;
    const helper = vi.spyOn(JsonlFactEngineClient.prototype, "analyzeHand13")
      .mockImplementationOnce(async () => {
        throw new Error("injected_fact_helper_failure");
      });
    try {
      await expect(service.importPaipu({ shareUrl: fixtureUrl }))
        .resolves.toEqual({ status: "analysis_failed" });
      // The first helper call fails, but the whole-game census still visits
      // the other decisions and delegates them to the real helper.
      expect(helper.mock.calls.length).toBeGreaterThan(1);
      const helperResults = await Promise.allSettled(
        helper.mock.results.map((result) => result.value as Promise<unknown>),
      );
      expect(helperResults[0]?.status).toBe("rejected");
      expect(helperResults.filter((result) => result.status === "fulfilled").length)
        .toBeGreaterThanOrEqual(2);
      expect(counters.saveAttempts).toBe(0);
      expect(counters.reviewReadyReturns).toBe(0);
      expect(repository.listSessions()).toHaveLength(1);
      const afterFailure = repository.openByPackageId(before.analysisPackage.packageId);
      expect(afterFailure.sessionId).toBe(before.sessionId);
      expect(afterFailure.analysisPackage).toEqual(before.analysisPackage);
      expect(afterFailure.activeReportRefId).toBe("production-report-ref");
      expect(afterFailure.activeReport).toEqual(before.activeReport);

      await expect(service.importPaipu({ shareUrl: fixtureUrl }))
        .resolves.toMatchObject({
          status: "review_ready",
          recordId: fixtureRecordId,
          selfActor: 3,
          sessionId: before.sessionId,
          packageId: before.analysisPackage.packageId,
        });
      expect(counters.saveAttempts).toBe(1);
      expect(counters.reviewReadyReturns).toBe(1);
      const afterRetry = repository.openByPackageId(before.analysisPackage.packageId);
      expect(afterRetry.sessionId).toBe(before.sessionId);
      expect(afterRetry.analysisPackage).toEqual(before.analysisPackage);
      expect(afterRetry.activeReportRefId).toBe("production-report-ref");
      expect(afterRetry.activeReport).toEqual(before.activeReport);
    } finally {
      helper.mockRestore();
      repository.close();
      rmSync(harness.root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    }
  }, 30_000);

  it("resolves whichever account the URL names — the suffix is an obfuscated token, not a seat", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const fixture = loadFixtureWire("real-supported-round");
    // Perspective account 100002 sits at seat 1 in the synthetic head; the
    // URL carries its encoded token.
    const url = fixturePaipuUrl(100002);
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
    // The URL names account 9999999 (as its encoded token), which no
    // scripted account matches.
    const url = fixturePaipuUrl(9_999_999);
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
    // A different perspective (a different account's encoded token) is a
    // different request identity and opens its own window.
    const third = service.importPaipu({
      shareUrl: fixturePaipuUrl(100002),
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
    // A structurally valid head describing a DIFFERENT record than the URL
    // names (same accounts, different uuid).
    const head = {
      uuid: "260811-00000000-0000-0000-0000-000000000002",
      accounts: [
        { account_id: 100001, seat: 0 },
        { account_id: 100002, seat: 1 },
        { account_id: 100004, seat: 2 },
        { account_id: 123_456_789, seat: 3 },
      ],
    };
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
