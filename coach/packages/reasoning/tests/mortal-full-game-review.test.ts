import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type {
  CanonicalEventStream,
  CompletedHandFactRequest,
  CompletedHandFactResult,
  EngineIdentity,
  Hand13FactRequest,
  Hand13FactResult,
  HandStructureRequestV2,
  HandStructureResultV2,
  ThreatRiskFactRequest,
  ThreatRiskFactResult,
} from "@riichi-coach/contracts";
import {
  computeCanonicalGameFingerprint,
  computeMortalGameFingerprint,
  formatMjaiTile,
  parseMjaiTile,
  type MortalFetchedReport,
  type MortalReportDecisionEntry,
} from "@riichi-coach/mortal-source";
import type { HandStructureFactEnginePort } from "../src/fact-engine/port.js";
import {
  entryMatchesDecisionIdentity,
} from "../src/analysis/mortal-review-service.js";
import {
  buildMortalFullGameBindingPlan,
  runMortalFullGameReview,
} from "../src/analysis/mortal-full-game-review.js";
import { createMortalCoverageRegistry } from "../src/analysis/mortal-coverage-registry.js";
import {
  canonicalStartEvents,
  canonicalStream,
  canonicalTile,
} from "./fixtures/canonical-stream.js";
import { bridgeLegacyRegressionEvents } from "../src/import/legacy-event-stream-bridge.js";
import { importRegressionFixture } from "../src/import/mortal-report.js";
import {
  replayCanonicalStream,
  type ReplayedDecision,
} from "../src/replay/stream-replayer.js";

const fixtureUrl = new URL(
  "../../../fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json",
  import.meta.url,
);

const identity: EngineIdentity = {
  engine: "mahjong-helper",
  upstreamCommit: "514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0",
  adapterVersion: "0.2.0",
  protocolVersion: "mahjong-facts/v1",
};

class FailingEngine implements HandStructureFactEnginePort {
  async identity(): Promise<EngineIdentity> {
    return identity;
  }

  async analyzeHand13(_request: Hand13FactRequest): Promise<Hand13FactResult> {
    throw new Error("not available in this test");
  }

  async analyzeCompletedHand(
    _request: CompletedHandFactRequest,
  ): Promise<CompletedHandFactResult> {
    throw new Error("not available in this test");
  }

  async analyzeHandStructure(
    _request: HandStructureRequestV2,
  ): Promise<HandStructureResultV2> {
    throw new Error("not available in this test");
  }

  async analyzeThreatRisk(
    _request: ThreatRiskFactRequest,
  ): Promise<ThreatRiskFactResult> {
    throw new Error("not available in this test");
  }

  async close(): Promise<void> {}
}

function fakeEntry(overrides: Partial<MortalReportDecisionEntry> = {}): MortalReportDecisionEntry {
  return Object.freeze({
    roundOrdinal: 0,
    roundWind: "E" as const,
    dealer: 0,
    kyoku: 0,
    honba: 0,
    junme: 1,
    tilesLeft: 70,
    lastActor: 0,
    tile: "1m",
    tehai: Object.freeze(Array.from({ length: 14 }, () => "1m")),
    atSelfChiPon: false,
    atSelfRiichi: false,
    atOpponentKakan: false,
    expected: { type: "dahai", actor: 0, pai: "1p", tsumogiri: false },
    actual: { type: "dahai", actor: 0, pai: "1p", tsumogiri: false },
    isEqual: true,
    details: Object.freeze([{
      action: { type: "dahai", actor: 0, pai: "1p", tsumogiri: false },
      probability: 1,
      qValue: 0,
    }]),
    shanten: 1,
    atFuriten: false,
    actualIndex: 0,
    ...overrides,
  });
}

function fakeDecision(overrides: Partial<ReplayedDecision> = {}): ReplayedDecision {
  const base = {
    decisionEventRef: "game:test/0/1/0",
    snapshot: {
      snapshotVersion: "decision-snapshot/v2",
      gameId: "game:test",
      streamHash: "sha256:test",
      streamPrefixHash: "sha256:test",
      decisionEventRef: "game:test/0/1/0",
      selfActor: 0,
      publicState: {
        gameId: "game:test",
        streamSchemaVersion: "canonical-riichi-events/v2",
        ruleSet: {
          length: "east",
          redFives: { man: 1, pin: 1, sou: 1 },
          openTanyao: true,
          atamahane: false,
          westExtension: "none",
          ippatsuCancelledByAnkan: true,
        },
        roundOrdinal: 0,
        roundWind: "E",
        hand: 1,
        honba: 0,
        riichiSticks: 0,
        dealer: 0,
        scores: [25000, 25000, 25000, 25000],
        seatWinds: ["E", "S", "W", "N"],
        phase: "awaiting_self_action",
        expectedActor: 0,
        doraIndicators: [{ id: "6p", red: false }],
        rivers: [[], [], [], []],
        melds: [],
        riichiStates: [
          { actor: 0, status: "none", declarationEventRef: null, acceptanceEventRef: null, ippatsuAlive: null },
          { actor: 1, status: "none", declarationEventRef: null, acceptanceEventRef: null, ippatsuAlive: null },
          { actor: 2, status: "none", declarationEventRef: null, acceptanceEventRef: null, ippatsuAlive: null },
          { actor: 3, status: "none", declarationEventRef: null, acceptanceEventRef: null, ippatsuAlive: null },
        ],
        remainingDraws: 70,
        terminal: null,
        fields: {
          roundContext: "complete",
          ruleSet: "complete",
          scores: "complete",
          doraIndicators: "complete",
          rivers: "complete",
          calledDiscardMarkers: "complete",
          melds: "complete",
          remainingDraws: "complete",
          settlement: "complete",
        },
        appliedEventRefs: ["game:test/0/1/0"],
      },
      privateState: {
        selfActor: 0,
        concealedTiles: Array.from({ length: 13 }, () => ({ id: "1m", red: false })),
        currentDraw: {
          tile: { id: "1m", red: false },
          eventRef: "game:test/0/1/0",
          from: "live_wall",
        },
        selfMeldRefs: [],
        furiten: {
          discard: { status: "unknown", evidenceIds: [] },
          temporary: { status: "unknown", evidenceIds: [] },
          riichi: { status: "unknown", evidenceIds: [] },
        },
        fields: {
          concealedTiles: "complete",
          currentDraw: "complete",
          responseOpportunities: "complete",
          furiten: "complete",
        },
        evidenceIds: ["game:test/0/1/0"],
        decisionWindow: {
          kind: "self_turn",
          actor: 0,
          triggerEventRef: "game:test/0/1/0",
          sourceActor: null,
          offeredTile: null,
          kanKind: null,
        },
      },
      evidenceIds: ["game:test/0/1/0"],
    },
    facts: null as never,
    actualDiscard: {
      type: "tile_discarded",
      eventId: "game:test/0/2/0",
      sourceRecordRef: "record:2",
      actor: 0,
      tile: { id: "1p", red: false },
      discardMode: "tedashi",
      riichiDeclarationEventRef: null,
    },
  } as unknown as ReplayedDecision;
  return { ...base, ...overrides } as unknown as ReplayedDecision;
}

function makeReport(
  entries: readonly MortalReportDecisionEntry[],
  overrides: Partial<MortalFetchedReport> = {},
  gameFingerprint = "mortal-game-fingerprint/v2:sha256:test",
): MortalFetchedReport {
  return Object.freeze({
    reportId: "0123456789abcdef",
    adapterVersion: "mortal-source/1" as const,
    engine: "Mortal" as const,
    version: "1.5.10",
    modelTag: "4.1b",
    playerId: 0,
    gameFingerprint,
    kyokus: Object.freeze([{
      roundOrdinal: 0,
      roundWind: "E" as const,
      dealer: 0,
      kyoku: 0,
      honba: 0,
      entries: Object.freeze(entries),
    }]),
    ...overrides,
  });
}

describe("entryMatchesDecisionIdentity for full-game binding", () => {
  it("does not require actual action for identity", () => {
    const decision = fakeDecision({
      actualDiscard: null,
    });
    expect(entryMatchesDecisionIdentity(fakeEntry(), decision)).toBe(true);
  });

  it("ignores actual action differences for identity", () => {
    const decision = fakeDecision();
    expect(entryMatchesDecisionIdentity(fakeEntry({
      actual: { type: "dahai", actor: 0, pai: "9p", tsumogiri: true },
    }), decision)).toBe(true);
  });

  it("rejects a different round context even with the same hand and draw", () => {
    const decision = fakeDecision();
    expect(entryMatchesDecisionIdentity(fakeEntry({ roundOrdinal: 1 }), decision)).toBe(false);
    expect(entryMatchesDecisionIdentity(fakeEntry({ honba: 1 }), decision)).toBe(false);
    expect(entryMatchesDecisionIdentity(fakeEntry({ roundWind: "S" }), decision)).toBe(false);
    expect(entryMatchesDecisionIdentity(fakeEntry({ dealer: 1 }), decision)).toBe(false);
  });
});

describe("buildMortalFullGameBindingPlan", () => {
  it("binds one local + one source exact match", () => {
    const report = makeReport([fakeEntry()]);
    const plan = buildMortalFullGameBindingPlan([fakeDecision()], report);
    expect(plan.rows[0]!.binding).toBe("bound");
    expect(plan.rows[0]!.sourceEntryRef).toContain("sha256:");
  });

  it("reports no_mortal_entry when no source row matches", () => {
    const report = makeReport([]);
    const plan = buildMortalFullGameBindingPlan([fakeDecision()], report);
    expect(plan.rows[0]!.binding).toBe("no_mortal_entry");
  });

  it("marks one local ambiguous and BOTH involved source rows ambiguous", () => {
    const report = makeReport([
      fakeEntry({ junme: 1 }),
      fakeEntry({ junme: 2 }),
    ]);
    const plan = buildMortalFullGameBindingPlan([fakeDecision()], report);
    expect(plan.rows[0]!.binding).toBe("ambiguous");
    expect(plan.rows[0]!.localDegree).toBe(2);
    // Source ledger must reflect the bipartite graph, not just the local row.
    expect(plan.sourceDegrees).toEqual([1, 1]);
    expect(plan.ambiguousSourceOrdinals).toEqual([0, 1]);
  });

  it("marks two locals ambiguous and the shared source row ambiguous", () => {
    const report = makeReport([fakeEntry()]);
    const plan = buildMortalFullGameBindingPlan([
      fakeDecision(),
      fakeDecision({ decisionEventRef: "game:test/0/2/0" }),
    ], report);
    expect(plan.rows[0]!.binding).toBe("ambiguous");
    expect(plan.rows[1]!.binding).toBe("ambiguous");
    expect(plan.sourceDegrees).toEqual([2]);
    expect(plan.ambiguousSourceOrdinals).toEqual([0]);
  });

  it("never greedily tie-breaks", () => {
    const report = makeReport([fakeEntry()]);
    const plan = buildMortalFullGameBindingPlan([
      fakeDecision(),
      fakeDecision({ decisionEventRef: "game:test/0/2/0" }),
    ], report);
    expect(plan.rows.some((row) => row.binding === "bound")).toBe(false);
  });

  it("fails closed on source/local order crossing", () => {
    const report = makeReport([
      fakeEntry({ tile: "2m", tehai: Object.freeze(Array.from({ length: 14 }, () => "2m")), actual: { type: "dahai", actor: 0, pai: "2p", tsumogiri: false } }),
      fakeEntry(),
    ]);
    const decisions = [
      fakeDecision(),
      fakeDecision({
        decisionEventRef: "game:test/0/2/0",
        snapshot: {
          ...fakeDecision().snapshot,
          privateState: {
            ...fakeDecision().snapshot.privateState,
            concealedTiles: Array.from({ length: 13 }, () => ({ id: "2m", red: false })),
            currentDraw: { tile: { id: "2m", red: false }, eventRef: "game:test/0/2/0", from: "live_wall" },
          },
        },
        actualDiscard: { type: "tile_discarded", eventId: "game:test/0/3/0", sourceRecordRef: "r", actor: 0, tile: { id: "2p", red: false }, discardMode: "tedashi", riichiDeclarationEventRef: null },
      }),
    ];
    const plan = buildMortalFullGameBindingPlan(decisions, report);
    // decision 0 binds source ordinal 1; decision 1 binds source ordinal 0.
    expect(plan.rows[0]!.binding).toBe("bound");
    expect(plan.rows[1]!.binding).toBe("ambiguous");
    expect(plan.rows[1]!.orderViolation).toBe(true);
    // The order-violating source row must be ambiguous, not unbound.
    expect(plan.ambiguousSourceOrdinals).toContain(0);
  });
});

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

function legacyReport(
  raw: RawLegacyFixture,
  entries: readonly MortalReportDecisionEntry[],
  overrides: Partial<MortalFetchedReport> = {},
): MortalFetchedReport {
  return Object.freeze({
    reportId: raw.source.reportId,
    adapterVersion: "mortal-source/1" as const,
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
    ...overrides,
  });
}

async function legacySetup(): Promise<{
  raw: RawLegacyFixture;
  stream: CanonicalEventStream;
  decisions: ReplayedDecision[];
}> {
  const raw = JSON.parse(await readFile(fixtureUrl, "utf8")) as RawLegacyFixture;
  const imported = importRegressionFixture(raw as never);
  const bridged = bridgeLegacyRegressionEvents(
    imported.events,
    imported.selfActor,
    { sourceKind: "fixture", gameId: "fixture:c1924cad66f66dd9" },
  );
  if (bridged.status !== "ready") throw new Error("bridge failed");
  const decisions = replayCanonicalStream(bridged.stream);
  return { raw, stream: bridged.stream, decisions };
}

describe("runMortalFullGameReview", () => {
  it("fails the whole run on a wrong game fingerprint", async () => {
    const fixture = await legacySetup();
    const review = await runMortalFullGameReview({
      stream: fixture.stream,
      decisions: fixture.decisions,
      report: legacyReport(fixture.raw, [], {
        gameFingerprint: "mortal-game-fingerprint/v2:sha256:deadbeef",
      }),
      engine: new FailingEngine(),
    });
    expect(review.status).toBe("failed");
    if (review.status !== "failed") return;
    expect(review.code).toBe("mortal_report_game_fingerprint_mismatch");
  });

  it("fails the whole run on a wrong perspective", async () => {
    const fixture = await legacySetup();
    const review = await runMortalFullGameReview({
      stream: fixture.stream,
      decisions: fixture.decisions,
      report: legacyReport(fixture.raw, [], { playerId: 0 }),
      engine: new FailingEngine(),
    });
    expect(review.status).toBe("failed");
    if (review.status !== "failed") return;
    expect(review.code).toBe("mortal_report_perspective_mismatch");
  });

  it("accounts every local decision when no source rows match", async () => {
    const fixture = await legacySetup();
    const review = await runMortalFullGameReview({
      stream: fixture.stream,
      decisions: fixture.decisions,
      report: legacyReport(fixture.raw, []),
      engine: new FailingEngine(),
    });
    expect(review.status).toBe("coverage_ready");
    if (review.status !== "coverage_ready") return;
    expect(review.summary.localConservation).toBe(fixture.decisions.length);
    expect(review.summary.sourceConservation).toBe(0);
    expect(review.summary.outcomes.no_mortal_entry).toBe(fixture.decisions.length);
    expect(review.decisions.length).toBe(fixture.decisions.length);
  });

  it("derives conservation totals from actual outcomes and source dispositions", async () => {
    const fixture = await legacySetup();
    const review = await runMortalFullGameReview({
      stream: fixture.stream,
      decisions: fixture.decisions,
      report: legacyReport(fixture.raw, []),
      engine: new FailingEngine(),
    });
    expect(review.status).toBe("coverage_ready");
    if (review.status !== "coverage_ready") return;
    const outcomeSum = Object.values(review.summary.outcomes).reduce(
      (total, count) => total + count,
      0,
    );
    const sourceSum = review.sourceCoverage.boundMortalEntryCount
      + review.sourceCoverage.unboundMortalEntryCount
      + review.sourceCoverage.ambiguousMortalEntryCount;
    expect(outcomeSum).toBe(review.summary.localConservation);
    expect(review.summary.localConservation).toBe(fixture.decisions.length);
    expect(sourceSum).toBe(review.summary.sourceConservation);
    expect(review.summary.sourceConservation).toBe(0);
  });

  it("classifies an unbound post-call source row as an identity failure", async () => {
    const fixture = await legacySetup();
    const entry = legacyEntryToMortalEntry(fixture.raw.decisions[0]!);
    const postCall = Object.freeze({
      ...entry,
      atSelfChiPon: true,
      tehai: Object.freeze(Array.from({ length: 14 }, () => "1m")),
    });
    const review = await runMortalFullGameReview({
      stream: fixture.stream,
      decisions: fixture.decisions,
      report: legacyReport(fixture.raw, [postCall]),
      engine: new FailingEngine(),
    });
    expect(review.status).toBe("coverage_ready");
    if (review.status !== "coverage_ready") return;
    // M6-A3: post-call windows are enumerated locally, so a degree-0 row in
    // this shape is identity debt, not enumeration debt.
    expect(review.sourceCoverage.unboundMortalEntryCount).toBe(1);
    expect(review.sourceCoverage.entries[0]!.unboundReason).toBe(
      "identity_fact_mismatch",
    );
    expect(review.summary.sourceUnboundReasons.identity_fact_mismatch).toBe(1);
  });

  it("marks both source rows ambiguous when one local matches two source rows", async () => {
    const fixture = await legacySetup();
    const first = legacyEntryToMortalEntry(fixture.raw.decisions[0]!);
    const second = Object.freeze({ ...first, junme: first.junme + 1 });
    const review = await runMortalFullGameReview({
      stream: fixture.stream,
      decisions: fixture.decisions,
      report: legacyReport(fixture.raw, [first, second]),
      engine: new FailingEngine(),
    });
    expect(review.status).toBe("coverage_ready");
    if (review.status !== "coverage_ready") return;
    expect(review.sourceCoverage.boundMortalEntryCount).toBe(0);
    expect(review.sourceCoverage.ambiguousMortalEntryCount).toBe(2);
    expect(review.sourceCoverage.unboundMortalEntryCount).toBe(0);
    expect(review.sourceCoverage.entries[0]!.disposition).toBe("ambiguous");
    expect(review.sourceCoverage.entries[1]!.disposition).toBe("ambiguous");
  });

  it("marks a degree-0 ordinary-shaped source row as identity_fact_mismatch", async () => {
    const fixture = await legacySetup();
    const entry = Object.freeze({
      ...legacyEntryToMortalEntry(fixture.raw.decisions[0]!),
      tehai: Object.freeze(Array.from({ length: 14 }, () => "1m")),
    });
    const review = await runMortalFullGameReview({
      stream: fixture.stream,
      decisions: fixture.decisions,
      report: legacyReport(fixture.raw, [entry]),
      engine: new FailingEngine(),
    });
    expect(review.status).toBe("coverage_ready");
    if (review.status !== "coverage_ready") return;
    expect(review.sourceCoverage.unboundMortalEntryCount).toBe(1);
    expect(review.sourceCoverage.entries[0]!.unboundReason).toBe(
      "identity_fact_mismatch",
    );
    expect(review.summary.sourceUnboundReasons.identity_fact_mismatch).toBe(1);
  });

  it("does not label an unproven atSelfRiichi dahai row as post-riichi", async () => {
    const fixture = await legacySetup();
    const entry = Object.freeze({
      ...legacyEntryToMortalEntry(fixture.raw.decisions[0]!),
      atSelfRiichi: true,
      tehai: Object.freeze(Array.from({ length: 14 }, () => "1m")),
    });
    const review = await runMortalFullGameReview({
      stream: fixture.stream,
      decisions: fixture.decisions,
      report: legacyReport(fixture.raw, [entry]),
      engine: new FailingEngine(),
    });
    expect(review.status).toBe("coverage_ready");
    if (review.status !== "coverage_ready") return;
    expect(review.sourceCoverage.entries[0]!.unboundReason).toBe(
      "source_semantics_not_understood",
    );
    expect(review.summary.sourceUnboundReasons.source_semantics_not_understood).toBe(1);
  });

  it("classifies a degree-0 reach row as identity_fact_mismatch", async () => {
    const fixture = await legacySetup();
    const entry = Object.freeze({
      ...legacyEntryToMortalEntry(fixture.raw.decisions[0]!),
      actual: { type: "reach", actor: 3 },
      tehai: Object.freeze(Array.from({ length: 14 }, () => "1m")),
    });
    const review = await runMortalFullGameReview({
      stream: fixture.stream,
      decisions: fixture.decisions,
      report: legacyReport(fixture.raw, [entry]),
      engine: new FailingEngine(),
    });
    expect(review.status).toBe("coverage_ready");
    if (review.status !== "coverage_ready") return;
    expect(review.sourceCoverage.entries[0]!.unboundReason).toBe(
      "identity_fact_mismatch",
    );
  });

  it("classifies a degree-0 hora row as an identity failure", async () => {
    const fixture = await legacySetup();
    const entry = Object.freeze({
      ...legacyEntryToMortalEntry(fixture.raw.decisions[0]!),
      actual: { type: "hora", actor: 3, target: 3 },
      tehai: Object.freeze(Array.from({ length: 14 }, () => "1m")),
    });
    const review = await runMortalFullGameReview({
      stream: fixture.stream,
      decisions: fixture.decisions,
      report: legacyReport(fixture.raw, [entry]),
      engine: new FailingEngine(),
    });
    expect(review.status).toBe("coverage_ready");
    if (review.status !== "coverage_ready") return;
    // M6-A3: tsumo terminal windows are enumerated locally, so a degree-0
    // win row is identity debt.
    expect(review.sourceCoverage.entries[0]!.unboundReason).toBe(
      "identity_fact_mismatch",
    );
  });

  it("classifies a degree-0 ryukyoku row as local terminal coverage debt", async () => {
    const fixture = await legacySetup();
    const entry = Object.freeze({
      ...legacyEntryToMortalEntry(fixture.raw.decisions[0]!),
      actual: { type: "ryukyoku", actor: 3 },
      tehai: Object.freeze(Array.from({ length: 14 }, () => "1m")),
    });
    const review = await runMortalFullGameReview({
      stream: fixture.stream,
      decisions: fixture.decisions,
      report: legacyReport(fixture.raw, [entry]),
      engine: new FailingEngine(),
    });
    expect(review.status).toBe("coverage_ready");
    if (review.status !== "coverage_ready") return;
    // Kyuushu attribution depends on the mapper carrying the abort; a
    // degree-0 row is local terminal coverage debt.
    expect(review.sourceCoverage.entries[0]!.unboundReason).toBe(
      "local_terminal_action_not_replayed",
    );
  });

  it("keeps accounting when a supported bound row hits an engine failure", async () => {
    const fixture = await legacySetup();
    const rawDecision = fixture.raw.decisions[0]!;
    const targetDraw = parseMjaiTile(rawDecision.tile);
    const decisions = fixture.decisions;
    const entries = [legacyEntryToMortalEntry(rawDecision)];
    const review = await runMortalFullGameReview({
      stream: fixture.stream,
      decisions,
      report: legacyReport(fixture.raw, entries),
      engine: new FailingEngine(),
    });
    expect(review.status).toBe("coverage_ready");
    if (review.status !== "coverage_ready") return;
    expect(review.summary.localConservation).toBe(decisions.length);
    expect(review.summary.sourceConservation).toBe(1);
    const boundRow = review.decisions.find((row) => row.binding === "bound");
    expect(boundRow).toBeDefined();
    if (boundRow === undefined) return;
    expect(boundRow.outcome).toBe("analysis_blocked");
    expect(boundRow.reason).toBe("fact_engine_failure");
    // The remaining rows must still be accounted for.
    expect(
      review.decisions.reduce((sum, row) => sum + (row.outcome === "no_mortal_entry" ? 1 : 0), 0),
    ).toBe(decisions.length - 1);
  });
});

function entryForDecision(
  decision: ReplayedDecision,
  overrides: Partial<MortalReportDecisionEntry> = {},
): MortalReportDecisionEntry {
  const pub = decision.snapshot.publicState;
  const priv = decision.snapshot.privateState;
  const draw = priv.currentDraw;
  const hand = draw === null
    ? [...priv.concealedTiles]
    : [...priv.concealedTiles, draw.tile];
  return fakeEntry({
    roundOrdinal: pub.roundOrdinal,
    roundWind: pub.roundWind,
    dealer: pub.dealer,
    honba: pub.honba,
    tilesLeft: pub.remainingDraws ?? 70,
    tile: draw === null ? "5p" : formatMjaiTile(draw.tile),
    tehai: Object.freeze(hand.map(formatMjaiTile)),
    ...overrides,
  });
}

function riichiDeclarationStream(): CanonicalEventStream {
  return canonicalStream([
    ...canonicalStartEvents(),
    {
      type: "tile_drawn",
      eventId: "game:fixture/0/2/0",
      sourceRecordRef: "record:2",
      actor: 0,
      tile: { visibility: "visible", tile: canonicalTile("5p") },
      from: "live_wall",
    },
    {
      type: "riichi_declared",
      eventId: "game:fixture/0/3/0",
      sourceRecordRef: "record:3",
      actor: 0,
    },
    {
      type: "tile_discarded",
      eventId: "game:fixture/0/4/0",
      sourceRecordRef: "record:4",
      actor: 0,
      tile: canonicalTile("4p"),
      discardMode: "tedashi",
      riichiDeclarationEventRef: "game:fixture/0/3/0",
    },
    {
      type: "riichi_accepted",
      eventId: "game:fixture/0/5/0",
      sourceRecordRef: "record:5",
      actor: 0,
      declarationEventRef: "game:fixture/0/3/0",
    },
  ]);
}

function tsumoTerminalStream(): CanonicalEventStream {
  return canonicalStream([
    ...canonicalStartEvents(),
    {
      type: "tile_drawn",
      eventId: "game:fixture/0/2/0",
      sourceRecordRef: "record:2",
      actor: 0,
      tile: { visibility: "visible", tile: canonicalTile("5p") },
      from: "live_wall",
    },
    {
      type: "win_declared",
      eventId: "game:fixture/0/3/0",
      sourceRecordRef: "record:3",
      winnerActor: 0,
      targetActor: null,
      method: "tsumo",
      winningTile: canonicalTile("5p"),
      winSourceEventRef: "game:fixture/0/2/0",
      scoreDeltas: null,
    },
    {
      type: "round_ended",
      eventId: "game:fixture/0/4/0",
      sourceRecordRef: "record:4",
      terminalEventRef: "game:fixture/0/3/0",
    },
  ]);
}

function riichiPairEntries(decisions: readonly ReplayedDecision[]): MortalReportDecisionEntry[] {
  return [
    entryForDecision(decisions[0]!, {
      atSelfRiichi: false,
      actual: { type: "reach", actor: 0 },
      details: Object.freeze([{
        action: { type: "reach", actor: 0 },
        probability: 0.6,
        qValue: 0.9,
      }, {
        action: { type: "dahai", actor: 0, pai: "9m", tsumogiri: false },
        probability: 0.4,
        qValue: 0.2,
      }]),
    }),
    entryForDecision(decisions[1]!, {
      atSelfRiichi: true,
      actual: { type: "dahai", actor: 0, pai: "4p", tsumogiri: false },
      details: Object.freeze([{
        action: { type: "dahai", actor: 0, pai: "4p", tsumogiri: false },
        probability: 0.9,
        qValue: 1.1,
      }, {
        action: { type: "dahai", actor: 0, pai: "9m", tsumogiri: false },
        probability: 0.1,
        qValue: 0.05,
      }]),
    }),
  ];
}

describe("M6-A3 per-window-kind identity tables", () => {
  it("matches a post-riichi entry only to the post-riichi window, never the same turn's self-turn window", () => {
    const stream = riichiDeclarationStream();
    const decisions = replayCanonicalStream(stream);
    expect(decisions).toHaveLength(2);
    expect(decisions[0]!.snapshot.privateState.decisionWindow.kind).toBe("self_turn");
    expect(decisions[1]!.snapshot.privateState.decisionWindow.kind).toBe("post_riichi_discard");

    const [reachEntry, postRiichiEntry] = riichiPairEntries(decisions);
    if (reachEntry === undefined || postRiichiEntry === undefined) {
      throw new Error("riichi pair entries missing");
    }

    // The reach row binds the draw-frozen self_turn window (declaration not
    // yet visible there), and only that window.
    expect(entryMatchesDecisionIdentity(reachEntry, decisions[0]!)).toBe(true);
    expect(entryMatchesDecisionIdentity(reachEntry, decisions[1]!)).toBe(false);
    // The same-turn dahai row (at_self_riichi=true) binds only the
    // declaration-frozen post-riichi window.
    expect(entryMatchesDecisionIdentity(postRiichiEntry, decisions[1]!)).toBe(true);
    expect(entryMatchesDecisionIdentity(postRiichiEntry, decisions[0]!)).toBe(false);
  });

  it("matches a post-call entry only to a post-call window by the 11-tile multiset", () => {
    const base = fakeDecision();
    const baseSnapshot = base.snapshot as never as {
      publicState: Record<string, unknown>;
      privateState: Record<string, unknown>;
    };
    const postCallDecision = fakeDecision({
      snapshot: {
        ...baseSnapshot,
        privateState: {
          ...baseSnapshot.privateState,
          concealedTiles: Array.from({ length: 11 }, (_unused, index) => ({
            id: index % 2 === 0 ? "1m" : "2m",
            red: false,
          })),
          currentDraw: null,
          decisionWindow: {
            kind: "post_call_discard",
            actor: 0,
            triggerEventRef: "game:test/0/4/0",
          },
        },
      } as never,
    });
    const postCallEntry = fakeEntry({
      atSelfChiPon: true,
      tile: "5p",
      tehai: Object.freeze([
        "1m", "1m", "1m", "1m", "1m", "1m",
        "2m", "2m", "2m", "2m", "2m",
      ]),
      actual: { type: "dahai", actor: 0, pai: "1m", tsumogiri: false },
    });

    expect(entryMatchesDecisionIdentity(postCallEntry, postCallDecision)).toBe(true);
    // A post-call row must never bind an ordinary self-turn window.
    expect(entryMatchesDecisionIdentity(postCallEntry, fakeDecision())).toBe(false);
    // And a self-turn row must never bind a post-call window.
    expect(entryMatchesDecisionIdentity(fakeEntry(), postCallDecision)).toBe(false);
  });
});

describe("M6-A3 runMortalFullGameReview new surfaces", () => {
  it("fails the riichi and post-riichi windows closed until the coverage branches are lifted", async () => {
    const stream = riichiDeclarationStream();
    const decisions = replayCanonicalStream(stream);
    const report = makeReport(riichiPairEntries(decisions), {
      gameFingerprint: computeCanonicalGameFingerprint(stream),
    });

    const review = await runMortalFullGameReview({
      stream,
      decisions,
      report,
      engine: new FailingEngine(),
    });
    expect(review.status).toBe("coverage_ready");
    if (review.status !== "coverage_ready") return;
    // Both windows bind their entries but stay fail-closed: no real E2E hit
    // has lifted riichi_window / post_riichi yet.
    for (const row of review.decisions) {
      expect(row.binding).toBe("bound");
      expect(row.outcome).toBe("unsupported_action");
      expect(row.reason).toBe("coverage_branch_uncovered");
    }
    expect(review.summary.unsupportedReasons.coverage_branch_uncovered).toBe(2);
  });

  it("runs the riichi window through the import once its coverage branch is lifted", async () => {
    const stream = riichiDeclarationStream();
    const decisions = replayCanonicalStream(stream);
    const report = makeReport(riichiPairEntries(decisions), {
      gameFingerprint: computeCanonicalGameFingerprint(stream),
    });

    const review = await runMortalFullGameReview({
      stream,
      decisions,
      report,
      engine: new FailingEngine(),
      coverageRegistry: createMortalCoverageRegistry(["riichi_window"]),
    });
    expect(review.status).toBe("coverage_ready");
    if (review.status !== "coverage_ready") return;
    const selfTurnRow = review.decisions[0]!;
    // Past the coverage gate and past the structured import (the riichi
    // unification ran); only the deliberately failing engine stops analysis.
    expect(selfTurnRow.outcome).toBe("analysis_blocked");
    // The post-riichi branch is still uncovered: fail closed.
    expect(review.decisions[1]!.outcome).toBe("unsupported_action");
    expect(review.decisions[1]!.reason).toBe("coverage_branch_uncovered");
  });

  it("cross-checks the riichi actual by type correspondence, not tile equality", async () => {
    const stream = riichiDeclarationStream();
    const decisions = replayCanonicalStream(stream);
    // The reach row's actual carries no tile at all; the local side owns the
    // tile. A mismatching non-reach actual must fail the cross-check.
    const reachEntryActualMismatch = entryForDecision(decisions[0]!, {
      atSelfRiichi: false,
      actual: { type: "dahai", actor: 0, pai: "9m", tsumogiri: false },
      details: Object.freeze([{
        action: { type: "reach", actor: 0 },
        probability: 0.6,
        qValue: 0.9,
      }, {
        action: { type: "dahai", actor: 0, pai: "9m", tsumogiri: false },
        probability: 0.4,
        qValue: 0.2,
      }]),
    });
    const report = makeReport([reachEntryActualMismatch], {
      gameFingerprint: computeCanonicalGameFingerprint(stream),
    });
    const review = await runMortalFullGameReview({
      stream,
      decisions,
      report,
      engine: new FailingEngine(),
      coverageRegistry: createMortalCoverageRegistry(["riichi_window"]),
    });
    expect(review.status).toBe("coverage_ready");
    if (review.status !== "coverage_ready") return;
    expect(review.decisions[0]!.outcome).toBe("binding_mismatch");
    expect(review.decisions[0]!.reason).toBe("mortal_actual_mismatch");
  });

  it("binds a tsumo terminal window and gates it on its coverage branch", async () => {
    const stream = tsumoTerminalStream();
    const decisions = replayCanonicalStream(stream);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.actualAction?.kind).toBe("tsumo");
    const horaEntry = entryForDecision(decisions[0]!, {
      actual: { type: "hora", actor: 0, target: 0, pai: "5p" },
      details: Object.freeze([{
        action: { type: "hora", actor: 0, target: 0, pai: "5p" },
        probability: 0.7,
        qValue: 1.5,
      }, {
        action: { type: "dahai", actor: 0, pai: "9m", tsumogiri: false },
        probability: 0.3,
        qValue: 0.4,
      }]),
    });
    const report = makeReport([horaEntry], {
      gameFingerprint: computeCanonicalGameFingerprint(stream),
    });

    const gated = await runMortalFullGameReview({
      stream,
      decisions,
      report,
      engine: new FailingEngine(),
    });
    expect(gated.status).toBe("coverage_ready");
    if (gated.status !== "coverage_ready") return;
    expect(gated.decisions[0]!.binding).toBe("bound");
    expect(gated.decisions[0]!.outcome).toBe("unsupported_action");
    expect(gated.decisions[0]!.reason).toBe("coverage_branch_uncovered");

    const lifted = await runMortalFullGameReview({
      stream,
      decisions,
      report,
      engine: new FailingEngine(),
      coverageRegistry: createMortalCoverageRegistry(["self_turn_tsumo_actual"]),
    });
    expect(lifted.status).toBe("coverage_ready");
    if (lifted.status !== "coverage_ready") return;
    // Past coverage, past the type-correspondence cross-check and past the
    // hora→tsumo import; only the failing engine blocks the assembly.
    expect(lifted.decisions[0]!.outcome).toBe("analysis_blocked");
  });

  it("marks a degenerate terminal candidate set as terminal_window_action_unsupported", async () => {
    const stream = tsumoTerminalStream();
    const decisions = replayCanonicalStream(stream);
    const degenerateEntry = entryForDecision(decisions[0]!, {
      actual: { type: "hora", actor: 0, target: 0, pai: "5p" },
      details: Object.freeze([{
        action: { type: "hora", actor: 0, target: 0, pai: "5p" },
        probability: 1,
        qValue: 2,
      }]),
    });
    const report = makeReport([degenerateEntry], {
      gameFingerprint: computeCanonicalGameFingerprint(stream),
    });
    const review = await runMortalFullGameReview({
      stream,
      decisions,
      report,
      engine: new FailingEngine(),
      coverageRegistry: createMortalCoverageRegistry(["self_turn_tsumo_actual"]),
    });
    expect(review.status).toBe("coverage_ready");
    if (review.status !== "coverage_ready") return;
    expect(review.decisions[0]!.outcome).toBe("model_output_incomplete");
    expect(review.decisions[0]!.reason).toBe("terminal_window_action_unsupported");
  });
});
