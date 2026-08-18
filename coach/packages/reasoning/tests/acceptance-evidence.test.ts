import { describe, expect, it } from "vitest";
import type {
  CanonicalEventStream,
  CanonicalMeldV2,
  Tile,
} from "@riichi-coach/contracts";
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

// M6-A4.3 pass-family sub-coverage fixtures: a response pass window whose
// local enumeration proves candidate families (mirrors response-binding.test.ts).
const tile = (id: string, red = false): Tile => ({ id: id as Tile["id"], red });

function responsePassWindow(input: {
  concealed: readonly Tile[];
  offeredTile: Tile;
}): ReplayedDecision {
  return {
    decisionEventRef: "game:test/0/3/0",
    actualAction: {
      kind: "pass",
      responseEventRef: "game:test/0/3/0",
      responseKind: "discard",
    },
    snapshot: {
      snapshotVersion: "decision-snapshot/v2",
      gameId: "game:test",
      streamHash: "sha256:test",
      streamPrefixHash: "sha256:test",
      decisionEventRef: "game:test/0/3/0",
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
        phase: "awaiting_discard_responses",
        expectedActor: 3,
        doraIndicators: [{ id: "6p", red: false }],
        rivers: [[], [], [], []],
        melds: [],
        riichiStates: [
          { actor: 0, status: "none", declarationEventRef: null, acceptanceEventRef: null, ippatsuAlive: null },
          { actor: 1, status: "none", declarationEventRef: null, acceptanceEventRef: null, ippatsuAlive: null },
          { actor: 2, status: "none", declarationEventRef: null, acceptanceEventRef: null, ippatsuAlive: null },
          { actor: 3, status: "none", declarationEventRef: null, acceptanceEventRef: null, ippatsuAlive: null },
        ],
        remainingDraws: 62,
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
        appliedEventRefs: ["game:test/0/3/0"],
      },
      privateState: {
        selfActor: 0,
        concealedTiles: input.concealed.map((t) => ({ ...t })),
        currentDraw: null,
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
        evidenceIds: ["game:test/0/3/0"],
        decisionWindow: {
          kind: "discard_response",
          actor: 0,
          triggerEventRef: "game:test/0/3/0",
          sourceActor: 3,
          offeredTile: input.offeredTile,
        },
      },
      evidenceIds: ["game:test/0/3/0"],
    },
    facts: null as never,
    actualDiscard: null,
  } as unknown as ReplayedDecision;
}

function responsePassEntry(
  tehai: readonly string[],
  tileName: string,
  familyDetails: MortalReportDecisionEntry["details"] = [],
): MortalReportDecisionEntry {
  return Object.freeze({
    roundOrdinal: 0,
    roundWind: "E" as const,
    dealer: 0,
    kyoku: 0,
    honba: 0,
    junme: 2,
    tilesLeft: 62,
    lastActor: 3, // the opponent who discarded
    tile: tileName,
    tehai: Object.freeze([...tehai]),
    fuuros: Object.freeze([]),
    atSelfChiPon: false,
    atSelfRiichi: false,
    atOpponentKakan: false,
    expected: { type: "none" },
    actual: { type: "none" },
    isEqual: true,
    details: Object.freeze([
      { action: { type: "none" }, probability: 0.99, qValue: 0 },
      ...familyDetails.map((detail) => ({ ...detail })),
    ]),
    shanten: 1,
    atFuriten: false,
    actualIndex: 0,
  });
}

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
    retainedAnalyses: [],
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
    expect(evidence.responsePassFamilies).toEqual([]);
  });

  it("M6-A4.3: records resp_pass_on_discard candidate-family sub-coverage from pass windows", () => {
    // Two response pass windows (actual none, surface response) whose bound
    // source rows score candidate families. The acceptance authority is the
    // report's candidate set (Mortal is furiten-aware, so a scored hora is a
    // genuinely legal 能荣而过); the local shape enumeration cannot prove
    // furiten, so families come from the source details.
    const passWindow = responsePassWindow({
      concealed: [
        tile("1m"), tile("2m"), tile("3m"), tile("4m"), tile("5m"),
        tile("6m"), tile("7m"), tile("8m"), tile("9m"),
        tile("3p"), tile("4p"), tile("5p"), tile("5p"),
      ],
      offeredTile: tile("5p"),
    });
    const daiminkanPassWindow = responsePassWindow({
      concealed: [
        tile("1m"), tile("2m"), tile("3m"), tile("4m"), tile("5m"),
        tile("6m"), tile("7m"), tile("8m"), tile("9m"),
        tile("5p"), tile("5p"), tile("5p"), tile("2s"),
      ],
      offeredTile: tile("5p"),
    });
    const responseDecisions = [passWindow, daiminkanPassWindow];
    // Source rows: actor-less `none` pass rows; details score the candidate
    // families — window 1: chi + pon + hora; window 2: ankan (daiminkan).
    const passEntry = responsePassEntry(
      passWindow.snapshot.privateState.concealedTiles.map((t) => `${t.id}${t.red ? "r" : ""}`),
      "5p",
      [
        { action: { type: "chi", actor: 0, target: 3, pai: "5p", consumed: ["3p", "4p"] }, probability: 0.01, qValue: 0 },
        { action: { type: "pon", actor: 0, target: 3, pai: "5p", consumed: ["5p", "5p"] }, probability: 0.01, qValue: 0 },
        { action: { type: "hora", actor: 0, target: 3, pai: "5p" }, probability: 0.01, qValue: 0 },
      ],
    );
    const daiminkanPassEntry = responsePassEntry(
      daiminkanPassWindow.snapshot.privateState.concealedTiles.map((t) => `${t.id}${t.red ? "r" : ""}`),
      "5p",
      [
        // Mortal serializes a daiminkan candidate as ankan of the offered tile.
        { action: { type: "ankan", actor: 0, pai: "5p", consumed: ["5p", "5p", "5p"] }, probability: 0.01, qValue: 0 },
      ],
    );
    const report = makeReport([passEntry, daiminkanPassEntry]);
    const review = reviewOf([
      ledgerRow({ decisionOrdinal: 0, sourceOrdinal: 0, surface: "response" }),
      ledgerRow({ decisionOrdinal: 1, sourceOrdinal: 1, surface: "response" }),
    ]);
    const evidence = extractAcceptedBranchEvidence({
      stream,
      decisions: [],
      responseDecisions,
      report,
      review,
    });
    // Both windows bound as response pass rows → resp_pass_on_discard, and
    // the source candidate sets prove chi/pon/daiminkan/hora families.
    expect(evidence.branches).toEqual(["resp_pass_on_discard"]);
    expect(evidence.responsePassFamilies).toEqual([
      "chi", "pon", "daiminkan", "hora",
    ]);
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
