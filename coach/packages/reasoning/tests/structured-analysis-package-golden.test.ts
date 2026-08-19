/**
 * M6-C Slice 4 — whole-game golden (spec "Slice 4 测 whole-game golden：real
 * canonical fixture + self decisions + response decisions + Mortal + factor
 * pipeline → 校验通过的 StructuredAnalysisPackage"; 旧 golden test 继续保留,
 * 本测试不迁移/删除 golden-vertical-slice).
 *
 * The chain (all offline; packaged sidecar; real repository fixture — the
 * same fixture + sidecar calibre as golden-vertical-slice, spec "真实 sidecar
 * 依赖: 使用仓库内 packaged sidecar"):
 *
 *   real Mortal regression fixture (c1924cad66f66dd9-east1-turn6-7)
 *   → importRegressionFixture + bridgeLegacyRegressionEvents
 *   → CanonicalEventStream (real events)
 *   → replayCanonicalStream (self surface) + replayCanonicalResponseWindows
 *     (response surface)
 *   → real Mortal report (the fixture's own decision rows, gameFingerprint
 *     bound to the same events)
 *   → runMortalFullGameReview (acceptance-mode coverage registry + packaged
 *     fact-engine sidecar) → coverage_ready
 *   → buildStructuredAnalysisPackage (pure projection, no re-run)
 *   → validateStructuredAnalysisPackage (Slice 3 validator)
 *
 * Regression pins (external behavior only):
 *  - the two real Mortal rows bind and reach analysis_ready through the real
 *    factor pipeline (real packaged sidecar);
 *  - the response partition is replayed and projected into the package;
 *  - the aggregate status TRUTHFULLY reflects the whole-game outcomes and the
 *    validator ACCEPTS the package — schema validity ≠ completeness (CR-6) on
 *    a real fixture whose report covers only its two decision points (the
 *    other replayed windows truthfully read no_mortal_entry);
 *  - determinism (H2 / CR-5): same semantic input + explicit frozen policy
 *    snapshot → identical packageId + semanticContentHash, and the artifact
 *    identity binds the real producer chain versions.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FACT_ENGINE_ADAPTER_VERSION,
  FACT_ENGINE_PROTOCOL_VERSION,
  MAHJONG_HELPER_COMMIT,
  MORTAL_PROVIDER_IDENTITY,
  STRUCTURED_ANALYSIS_PACKAGE_SCHEMA_VERSION,
  type CanonicalEventStream,
  type ComponentVersions,
  type StructuredAnalysisPackage,
} from "@riichi-coach/contracts";
import {
  computeMortalGameFingerprint,
  type MortalFetchedReport,
  type MortalReportDecisionEntry,
} from "@riichi-coach/mortal-source";
import {
  importRegressionFixture,
  type RegressionFixture,
} from "../src/import/mortal-report.js";
import { bridgeLegacyRegressionEvents } from "../src/import/legacy-event-stream-bridge.js";
import {
  replayCanonicalResponseWindows,
  replayCanonicalStream,
  type ReplayedDecision,
} from "../src/replay/stream-replayer.js";
import {
  runMortalFullGameReview,
  type MortalFullGameReviewResult,
} from "../src/analysis/mortal-full-game-review.js";
import {
  MORTAL_COVERAGE_BRANCHES,
  createMortalCoverageRegistry,
} from "../src/analysis/mortal-coverage-registry.js";
import { buildStructuredAnalysisPackage } from "../src/analysis/structured-analysis-package-builder.js";
import { validateStructuredAnalysisPackage } from "../src/validate/structured-package-validator.js";
import {
  JsonlFactEngineClient,
  ManagedFactEngineTransport,
} from "../src/index.js";

const fixtureUrl = new URL(
  "../../../fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json",
  import.meta.url,
);
const resourcesUrl = new URL("../../../resources/", import.meta.url);

/** Deterministic wall clock for artifact-creation metadata only (CR-5). */
const FROZEN_NOW = Date.parse("2026-08-20T00:00:00.000Z");

type RawLegacyFixture = {
  source: { reportId: string; modelTag: string; playerId: number };
  mjaiLog: unknown[];
  decisions: Array<{
    junme: number;
    tile: string;
    state: { tehai: string[]; fuuros: unknown[] };
    expected: { type: string; actor: number; pai: string; tsumogiri: boolean };
    actual: { type: string; actor: number; pai: string; tsumogiri: boolean };
    is_equal: boolean;
    details: Array<{
      action: { type: string; actor: number; pai: string; tsumogiri: boolean };
      q_value: number;
      prob: number;
    }>;
    shanten: number;
    at_furiten: boolean;
    actual_index: number;
  }>;
};

/** Real-fixture report row → MortalReportDecisionEntry (same convention as
 *  mortal-full-game-review.test.ts). */
function legacyEntryToMortalEntry(
  raw: RawLegacyFixture["decisions"][number],
): MortalReportDecisionEntry {
  return Object.freeze({
    roundOrdinal: 0,
    roundWind: "E" as const,
    dealer: 0,
    kyoku: 0,
    honba: 0,
    junme: raw.junme,
    tilesLeft: 46,
    lastActor: 3,
    tile: raw.tile,
    tehai: Object.freeze([...raw.state.tehai]),
    fuuros: Object.freeze([]),
    atSelfChiPon: false,
    atSelfRiichi: false,
    atOpponentKakan: false,
    expected: { ...raw.expected },
    actual: { ...raw.actual },
    isEqual: raw.is_equal,
    details: Object.freeze(raw.details.map((detail) => ({
      action: { ...detail.action },
      probability: detail.prob,
      qValue: detail.q_value,
    }))),
    shanten: raw.shanten,
    atFuriten: raw.at_furiten,
    actualIndex: raw.actual_index,
  });
}

/** The real report: the fixture's own rows, fingerprint-bound to the same
 *  mjaiLog the canonical stream was bridged from. */
function legacyReport(
  raw: RawLegacyFixture,
  entries: readonly MortalReportDecisionEntry[],
): MortalFetchedReport {
  return Object.freeze({
    reportId: raw.source.reportId,
    adapterVersion: "mortal-source/2" as const,
    engine: "Mortal" as const,
    version: "1.5.10",
    modelTag: raw.source.modelTag,
    playerId: raw.source.playerId,
    gameFingerprint: computeMortalGameFingerprint(raw.mjaiLog),
    kyokus: Object.freeze([{
      roundOrdinal: 0,
      roundWind: "E" as const,
      dealer: 0,
      kyoku: 0,
      honba: 0,
      entries: Object.freeze(entries),
    }]),
  });
}

/** The deterministic producer chain of the real run (D4): the packaged
 *  sidecar's pinned fact-engine identity (manifest == the literal schema),
 *  the bridge's replay version, and the report's Mortal source identity. */
function realComponentVersions(raw: RawLegacyFixture): ComponentVersions {
  return {
    packageSchema: STRUCTURED_ANALYSIS_PACKAGE_SCHEMA_VERSION,
    canonicalReplay: "canonical-riichi-events/v2",
    mapperAdapter: "legacy-regression-bridge/v2",
    factEngine: {
      engine: "mahjong-helper",
      upstreamCommit: MAHJONG_HELPER_COMMIT,
      adapterVersion: FACT_ENGINE_ADAPTER_VERSION,
      protocolVersion: FACT_ENGINE_PROTOCOL_VERSION,
    },
    factorPipeline: "factor-pipeline/v1",
    mortalSourceModel: {
      identity: MORTAL_PROVIDER_IDENTITY,
      version: "mortal-source/2",
      modelTag: raw.source.modelTag,
    },
  };
}

/** One whole-game golden run: real review (packaged sidecar, acceptance-mode
 *  coverage registry) → package builder (pure projection). */
async function wholeGameGolden(input: {
  raw: RawLegacyFixture;
  stream: CanonicalEventStream;
  decisions: readonly ReplayedDecision[];
  responseDecisions: readonly ReplayedDecision[];
}): Promise<{
  review: Extract<MortalFullGameReviewResult, { status: "coverage_ready" }>;
  pkg: StructuredAnalysisPackage;
}> {
  const { raw, stream, decisions, responseDecisions } = input;
  const entries = raw.decisions.map(legacyEntryToMortalEntry);
  const engine = new JsonlFactEngineClient(
    new ManagedFactEngineTransport(fileURLToPath(resourcesUrl)),
  );
  let review: MortalFullGameReviewResult;
  try {
    review = await runMortalFullGameReview({
      stream,
      decisions,
      responseDecisions,
      report: legacyReport(raw, entries),
      engine,
      now: () => FROZEN_NOW,
      // Acceptance-mode registry: this golden pins the whole-game chain, not
      // the coverage gate (the same registry runMortalAcceptanceEvidence uses
      // when producing real E2E evidence).
      coverageRegistry: createMortalCoverageRegistry(MORTAL_COVERAGE_BRANCHES),
    });
  } finally {
    await engine.close();
  }
  if (review.status !== "coverage_ready") {
    throw new Error(`golden review failed: ${review.code}`);
  }
  const retained = review.retainedAnalyses[0]!;
  const pkg = buildStructuredAnalysisPackage({
    review,
    stream,
    decisions,
    responseDecisions,
    componentVersions: realComponentVersions(raw),
    frozenPolicySnapshot: retained.modelEvaluation.detailPolicy,
    now: () => FROZEN_NOW,
  });
  return { review, pkg };
}

describe("M6-C Slice 4 whole-game golden", () => {
  it("walks the real whole-game chain to a validated StructuredAnalysisPackage", async () => {
    const raw = JSON.parse(await readFile(fixtureUrl, "utf8")) as RawLegacyFixture;
    const imported = importRegressionFixture(raw as unknown as RegressionFixture);
    const bridged = bridgeLegacyRegressionEvents(
      imported.events,
      imported.selfActor,
      { sourceKind: "fixture", gameId: "fixture:c1924cad66f66dd9" },
    );
    if (bridged.status !== "ready") throw new Error(bridged.code);
    const stream = bridged.stream;
    const decisions = replayCanonicalStream(stream);
    const responseDecisions = replayCanonicalResponseWindows(stream);

    // The real fixture replays BOTH surfaces: 7 self draws (the report's two
    // east1-turn6/7 rows are the last two) and 2 response pass windows on
    // opponent discards.
    expect(decisions.length).toBeGreaterThanOrEqual(2);
    expect(responseDecisions.length).toBeGreaterThan(0);

    const { review, pkg } = await wholeGameGolden({
      raw,
      stream,
      decisions,
      responseDecisions,
    });

    // The real Mortal rows bind and reach analysis_ready through the real
    // factor pipeline (packaged sidecar); the other replayed windows
    // truthfully read no_mortal_entry because the report covers only its two
    // decision points.
    expect(review.summary.outcomes.analysis_ready).toBe(2);
    expect(review.summary.outcomes.no_mortal_entry).toBe(
      decisions.length + responseDecisions.length - 2,
    );
    expect(review.retainedAnalyses).toHaveLength(2);
    expect(review.decisions.filter((row) => row.binding === "bound")).toHaveLength(2);
    expect(review.decisions.filter((row) => row.outcome === "analysis_ready")).toHaveLength(2);

    // The package projects BOTH replay surfaces and truthfully marks the
    // aggregate status (CR-6: schema validity ≠ completeness — the validator
    // accepts this real, incomplete package).
    expect(pkg.decisions).toHaveLength(decisions.length + responseDecisions.length);
    expect(pkg.decisions.some((decision) => decision.surface === "response")).toBe(true);
    expect(pkg.decisions.filter((decision) => decision.outcome === "analysis_ready")).toHaveLength(2);
    expect(pkg.record.status).toBe("integrity_failed");

    // The Slice 3 validator accepts the real whole-game package (校验通过).
    expect(() => validateStructuredAnalysisPackage(pkg)).not.toThrow();
  }, 120000);

  it("is deterministic across reruns and binds the real producer chain (H2 / CR-5 / CR-4)", async () => {
    const raw = JSON.parse(await readFile(fixtureUrl, "utf8")) as RawLegacyFixture;
    const imported = importRegressionFixture(raw as unknown as RegressionFixture);
    const bridged = bridgeLegacyRegressionEvents(
      imported.events,
      imported.selfActor,
      { sourceKind: "fixture", gameId: "fixture:c1924cad66f66dd9" },
    );
    if (bridged.status !== "ready") throw new Error(bridged.code);
    const stream = bridged.stream;
    const decisions = replayCanonicalStream(stream);
    const responseDecisions = replayCanonicalResponseWindows(stream);

    const first = await wholeGameGolden({
      raw,
      stream,
      decisions,
      responseDecisions,
    });
    const second = await wholeGameGolden({
      raw,
      stream,
      decisions,
      responseDecisions,
    });
    // Same semantic input + explicit frozen policy snapshot → identical
    // logical slot, artifact identity and content hash (H2 / CR-5).
    expect(second.pkg.analysisKey).toBe(first.pkg.analysisKey);
    expect(second.pkg.packageId).toBe(first.pkg.packageId);
    expect(second.pkg.semanticContentHash).toBe(first.pkg.semanticContentHash);
    expect(second.pkg.decisions.map((decision) => decision.decisionId)).toEqual(
      first.pkg.decisions.map((decision) => decision.decisionId),
    );

    // The artifact identity binds the real producer chain (CR-4): a different
    // Mortal source version over the SAME review yields a different packageId
    // (built from the same coverage_ready review — pure projection, no rerun).
    const retained = first.review.retainedAnalyses[0]!;
    const other = buildStructuredAnalysisPackage({
      review: first.review,
      stream,
      decisions,
      responseDecisions,
      componentVersions: {
        ...realComponentVersions(raw),
        mortalSourceModel: {
          ...realComponentVersions(raw).mortalSourceModel,
          version: "mortal-source/3",
        },
      },
      frozenPolicySnapshot: retained.modelEvaluation.detailPolicy,
      now: () => FROZEN_NOW,
    });
    expect(other.packageId).not.toBe(first.pkg.packageId);
    expect(other.semanticContentHash).not.toBe(first.pkg.semanticContentHash);
  }, 120000);
});
