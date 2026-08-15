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
  computeMortalGameFingerprint,
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

  it("marks one local ambiguous when two source entries match it", () => {
    const report = makeReport([
      fakeEntry({ junme: 1 }),
      fakeEntry({ junme: 2 }),
    ]);
    const plan = buildMortalFullGameBindingPlan([fakeDecision()], report);
    expect(plan.rows[0]!.binding).toBe("ambiguous");
    expect(plan.rows[0]!.localDegree).toBe(2);
  });

  it("marks two locals ambiguous when one source entry matches both", () => {
    const report = makeReport([fakeEntry()]);
    const plan = buildMortalFullGameBindingPlan([
      fakeDecision(),
      fakeDecision({ decisionEventRef: "game:test/0/2/0" }),
    ], report);
    expect(plan.rows[0]!.binding).toBe("ambiguous");
    expect(plan.rows[1]!.binding).toBe("ambiguous");
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
