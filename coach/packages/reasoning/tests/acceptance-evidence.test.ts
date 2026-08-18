import { describe, expect, it } from "vitest";
import type { CanonicalEventStream, CanonicalMeldV2 } from "@riichi-coach/contracts";
import type {
  MortalFetchedReport,
  MortalReportDecisionEntry,
} from "@riichi-coach/mortal-source";
import type { MortalFullGameLedgerEntry } from "../src/analysis/mortal-full-game-review.js";
import {
  buildRedactedAcceptanceArtifact,
  extractAcceptedBranchEvidence,
} from "../src/analysis/acceptance-evidence.js";
import type { ReplayedDecision } from "../src/replay/stream-replayer.js";

// Minimal local builders mirroring mortal-full-game-review.test.ts: the base
// entry/decision pair is identity-compatible, the post-call pair carries the
// §9 fuuros ↔ melds alignment.
function fakeEntry(
  overrides: Partial<MortalReportDecisionEntry> = {},
): MortalReportDecisionEntry {
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
    fuuros: Object.freeze([]),
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

function fakeDecision(
  overrides: Partial<ReplayedDecision> = {},
): ReplayedDecision {
  const base = {
    decisionEventRef: "game:test/0/1/0",
    actualAction: {
      kind: "riichi_discard",
      tile: { id: "1p", red: false },
      riichiDeclarationEventRef: null,
    },
    snapshot: {
      selfActor: 0,
      publicState: {
        roundOrdinal: 0,
        roundWind: "E",
        dealer: 0,
        honba: 0,
        remainingDraws: 70,
        fields: { remainingDraws: "complete" },
        riichiStates: Array.from({ length: 4 }, () => ({ status: "none" })),
      },
      privateState: {
        concealedTiles: Array.from({ length: 13 }, () => ({ id: "1m", red: false })),
        currentDraw: { tile: { id: "1m", red: false } },
        decisionWindow: {
          kind: "self_turn",
          actor: 0,
          triggerEventRef: "game:test/0/1/0",
          sourceActor: null,
          offeredTile: null,
          kanKind: null,
        },
      },
    },
  };
  return { ...base, ...overrides } as unknown as ReplayedDecision;
}

const localPonMeld: CanonicalMeldV2 = {
  meldRef: "game:test/0/2/0",
  kind: "pon" as const,
  actor: 0,
  createdEventRef: "game:test/0/2/0",
  latestEventRef: "game:test/0/2/0",
  targetActor: 1,
  calledTile: { id: "5m", red: false },
  consumedTiles: [
    { id: "5m", red: false },
    { id: "5m", red: true },
  ],
  calledDiscardEventRef: "game:test/0/1/9",
};

const sourcePonFiveMan = [{
  kind: "pon" as const,
  tiles: Object.freeze([
    { id: "5m", red: false },
    { id: "5m", red: false },
    { id: "5m", red: true },
  ]),
}];

function chiDecision(): ReplayedDecision {
  return {
    decisionEventRef: "game:test/0/2/1",
    actualAction: {
      kind: "discard",
      tile: { id: "1p", red: false },
      discardMode: "tedashi",
    },
    snapshot: {
      selfActor: 0,
      publicState: {
        roundOrdinal: 0,
        roundWind: "E",
        dealer: 0,
        honba: 0,
        melds: [localPonMeld],
        remainingDraws: 70,
        fields: { remainingDraws: "complete" },
        riichiStates: Array.from({ length: 4 }, (_, actor) => ({ status: "none", actor })),
      },
      privateState: {
        concealedTiles: Array.from({ length: 11 }, () => ({ id: "1m", red: false })),
        currentDraw: null,
        selfMeldRefs: ["game:test/0/2/0"],
        decisionWindow: {
          kind: "post_call_discard",
          actor: 0,
          triggerEventRef: "game:test/0/2/0",
        },
      },
    },
  } as unknown as ReplayedDecision;
}

function makeReport(
  entries: readonly MortalReportDecisionEntry[],
): MortalFetchedReport {
  return Object.freeze({
    reportId: "0123456789abcdef",
    adapterVersion: "mortal-source/2",
    engine: "Mortal" as const,
    version: "1.5.10",
    modelTag: "4.1b",
    playerId: 0,
    gameFingerprint: "mortal-game-fingerprint/v2:sha256:test",
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

// Distinct draw tile (9m) so this decision's identity is unique — identical
// hand facts would make it mutually ambiguous with decision 0 in the
// bipartite plan and neither would bind. Built as a plain literal + cast
// (same as fakeDecision) so the Partial<ReplayedDecision> override path's
// deep literal checking does not apply.
function drawnNineManDecision(): ReplayedDecision {
  return {
    decisionEventRef: "game:test/0/3/0",
    actualAction: { kind: "discard", tile: { id: "1p", red: false }, discardMode: "tedashi" },
    snapshot: {
      selfActor: 0,
      publicState: {
        roundOrdinal: 0,
        roundWind: "E",
        dealer: 0,
        honba: 0,
        remainingDraws: 70,
        fields: { remainingDraws: "complete" },
        riichiStates: Array.from({ length: 4 }, (_, actor) => ({ status: "none", actor })),
      },
      privateState: {
        concealedTiles: Array.from({ length: 13 }, () => ({ id: "1m", red: false })),
        currentDraw: { tile: { id: "9m", red: false }, eventRef: "game:test/0/3/0", from: "live_wall" },
        decisionWindow: {
          kind: "self_turn",
          actor: 0,
          triggerEventRef: "game:test/0/3/0",
        },
      },
    },
  } as unknown as ReplayedDecision;
}

const stream = {
  selfActor: 0,
  events: [
    { eventId: "game:test/0/1/0", type: "tile_drawn" },
    { eventId: "game:test/0/2/0", type: "chi_called" },
  ],
} as unknown as CanonicalEventStream;

function ledgerRow(
  overrides: Partial<MortalFullGameLedgerEntry>,
): MortalFullGameLedgerEntry {
  return {
    decisionOrdinal: 0,
    roundOrdinal: 0,
    surface: "self",
    binding: "bound",
    support: "supported",
    review: "analysis_ready",
    outcome: "analysis_ready",
    reason: null,
    sourceEntryRef: "sha256:x:0",
    sourceOrdinal: 0,
    modelSummary: {
      actualActionRef: "action:v1:discard:1p",
      preferredActions: ["action:v1:discard:1p"],
      topModelProbabilityPercent: 92,
      errorGap: 0,
      detailClass: "not_error",
      factorAnalysisMode: "structured",
      deterministicPreference: null,
    },
    ...overrides,
  };
}

function reviewOf(decisions: readonly MortalFullGameLedgerEntry[]) {
  return {
    status: "coverage_ready" as const,
    summary: {
      replayDecisionCount: decisions.length,
      responseWindowCount: 0,
      mortalSelfEntryCount: decisions.length,
      responseEntryCount: 0,
      localConservation: decisions.length,
      sourceConservation: decisions.length,
      outcomes: {
        analysis_ready: decisions.filter((row) => row.outcome === "analysis_ready").length,
        unsupported_action: 0,
        source_row_not_expected: 0,
        no_mortal_entry: decisions.filter((row) => row.outcome === "no_mortal_entry").length,
        binding_mismatch: 0,
        model_output_incomplete: decisions.filter(
          (row) => row.outcome === "model_output_incomplete",
        ).length,
        analysis_blocked: 0,
      },
      binding: { bound: decisions.length, noMortalEntry: 0, ambiguous: 0 },
      supportedPairCount: decisions.filter((row) => row.review !== "not_attempted").length,
      unsupportedReasons: {},
      modelIncompleteReasons: {},
      analysisBlockedReasons: {},
      sourceUnboundReasons: {},
      coverageBranchEncounters: {},
      coverageBranchUncoveredBlocks: {},
    },
    decisions,
    sourceCoverage: {
      mortalSelfEntryCount: decisions.length,
      responseEntryCount: 0,
      boundMortalEntryCount: decisions.length,
      unboundMortalEntryCount: 0,
      ambiguousMortalEntryCount: 0,
      entries: [],
      responseEntries: [],
      responseBoundEntryCount: 0,
      responseUnboundEntryCount: 0,
      responseAmbiguousEntryCount: 0,
    },
  };
}

describe("extractAcceptedBranchEvidence (§9)", () => {
  const riichiEntry = fakeEntry({
    details: Object.freeze([
      { action: { type: "dahai", actor: 0, pai: "1p", tsumogiri: false }, probability: 0.6, qValue: 0 },
      { action: { type: "reach", actor: 0, pai: "1p", tsumogiri: false }, probability: 0.4, qValue: 0 },
    ]),
    actual: { type: "reach", actor: 0, pai: "1p", tsumogiri: false },
  });
  const chiEntry = fakeEntry({
    atSelfChiPon: true,
    tehai: Object.freeze(Array.from({ length: 11 }, () => "1m")),
    fuuros: Object.freeze(sourcePonFiveMan),
  });

  it("evidences branches only from analysis_ready rows", () => {
    const decisions = [fakeDecision(), chiDecision(), drawnNineManDecision()];
    const report = makeReport([
      riichiEntry,
      chiEntry,
      fakeEntry({
        tile: "9m",
        tehai: Object.freeze([
          ...Array.from({ length: 13 }, () => "1m"),
          "9m",
        ]),
        details: Object.freeze([
          { action: { type: "dahai", actor: 0, pai: "1p", tsumogiri: false }, probability: 0.5, qValue: 0 },
          { action: { type: "hora", actor: 0, pai: "1p", tsumogiri: false }, probability: 0.5, qValue: 0 },
        ]),
      }),
    ]);
    const review = reviewOf([
      ledgerRow({ decisionOrdinal: 0, sourceOrdinal: 0 }),
      ledgerRow({ decisionOrdinal: 1, sourceOrdinal: 1 }),
      // Row 2 would classify dama_with_tsumo_candidate, but its review broke
      // before the comparison set — it must lift nothing.
      ledgerRow({
        decisionOrdinal: 2,
        sourceOrdinal: 2,
        review: "model_output_incomplete",
        outcome: "model_output_incomplete",
        reason: "fewer_than_two_distinct_actions",
        modelSummary: null,
      }),
    ]);

    const evidence = extractAcceptedBranchEvidence({
      stream,
      decisions,
      report,
      review,
    });

    expect(evidence.branches).toEqual(["riichi_window", "post_call_chi"]);
    expect(evidence.analysisReadyRowCount).toBe(2);
  });

  it("an empty analysis_ready set evidences nothing", () => {
    const decisions = [fakeDecision()];
    const report = makeReport([riichiEntry]);
    const review = reviewOf([
      ledgerRow({
        review: "not_attempted",
        outcome: "unsupported_action",
        reason: "coverage_branch_uncovered",
        modelSummary: null,
      }),
    ]);
    const evidence = extractAcceptedBranchEvidence({ stream, decisions, report, review });
    expect(evidence.branches).toEqual([]);
    expect(evidence.analysisReadyRowCount).toBe(0);
  });
});

describe("buildRedactedAcceptanceArtifact (§10/§15)", () => {
  it("carries §23-safe fields and no report/player identifiers", () => {
    const decisions = [fakeDecision()];
    const report = makeReport([fakeEntry({
      details: Object.freeze([
        { action: { type: "dahai", actor: 0, pai: "1p", tsumogiri: false }, probability: 0.6, qValue: 0 },
        { action: { type: "reach", actor: 0, pai: "1p", tsumogiri: false }, probability: 0.4, qValue: 0 },
      ]),
      actual: { type: "reach", actor: 0, pai: "1p", tsumogiri: false },
    })]);
    const review = reviewOf([ledgerRow({})]);
    const evidence = extractAcceptedBranchEvidence({ stream, decisions, report, review });
    expect(evidence.branches).toEqual(["riichi_window"]);

    const artifact = buildRedactedAcceptanceArtifact({
      gameId: "tenhou-g:abc123",
      seat: 2,
      localSourceType: "tenhou",
      report,
      review,
      evidence,
    });
    const json = JSON.stringify(artifact);
    expect(artifact.schemaVersion).toBe("mortal-acceptance-artifact/v1");
    expect(artifact.gameId).toBe("tenhou-g:abc123");
    expect(artifact.seat).toBe(2);
    expect(artifact.localSourceType).toBe("tenhou");
    expect(json).toContain('"modelTag":"4.1b"');
    expect(json).toContain('"modelAdapterVersion":"mortal-source/2"');
    expect(json).toContain("riichi_window");
    // Privacy: no report id, no player id, no fingerprint bytes.
    expect(json).not.toContain("0123456789abcdef");
    expect(json).not.toContain("playerId");
    expect(json).not.toContain("reportId");
    expect(json).not.toContain("gameFingerprint");
  });
});
