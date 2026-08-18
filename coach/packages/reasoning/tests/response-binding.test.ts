import { describe, expect, it } from "vitest";
import type {
  CanonicalMeldV2,
  DecisionWindow,
  Tile,
} from "@riichi-coach/contracts";
import type {
  MortalFetchedReport,
  MortalReportDecisionEntry,
} from "@riichi-coach/mortal-source";
import { formatMjaiTile } from "@riichi-coach/mortal-source";
import { entryMatchesDecisionIdentity } from "../src/analysis/mortal-review-service.js";
import {
  buildMortalFullGameBindingPlan,
  type MortalBindingPlanRow,
} from "../src/analysis/mortal-full-game-review.js";
import {
  chiCombinations,
  collectResponseSingleCandidateProofs,
  enumerateResponseCandidates,
} from "../src/analysis/response-candidate-enumeration.js";
import { classifyCoverageBranches } from "../src/analysis/mortal-coverage-registry.js";
import type { ReplayedDecision } from "../src/replay/stream-replayer.js";

// M6-A4.2: response window identity fact table + isomorphic local candidate
// enumeration + binding plan partition + conservation gates. The identity
// table binds a response source row (lastActor = the OPPONENT who offered the
// tile) to the response window (owner = reviewed player, sourceActor =
// opponent, offeredTile = entry.tile, responseKind = window kind). The local
// enumeration mirrors Mortal's candidate space (chi by meld combination, pon,
// daiminkan, ron, none) BEFORE any source lookup.

// --- fixtures ---------------------------------------------------------------

const tile = (id: string, red = false): Tile => ({ id: id as Tile["id"], red });

function responseEntry(overrides: Partial<MortalReportDecisionEntry> = {}): MortalReportDecisionEntry {
  return Object.freeze({
    roundOrdinal: 0,
    roundWind: "E" as const,
    dealer: 0,
    kyoku: 0,
    honba: 0,
    junme: 2,
    tilesLeft: 62,
    lastActor: 3, // the opponent who discarded
    tile: "5p",
    tehai: Object.freeze([
      "1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m",
      "1p", "2p", "3p", "4p",
    ]),
    fuuros: Object.freeze([]),
    atSelfChiPon: false,
    atSelfRiichi: false,
    atOpponentKakan: false,
    expected: { type: "none" },
    actual: { type: "none" },
    isEqual: true,
    details: Object.freeze([
      { action: { type: "none" }, probability: 0.99, qValue: 0 },
      { action: { type: "chi", actor: 0, target: 3, pai: "5p", consumed: ["3p", "4p"] }, probability: 0.01, qValue: 0 },
    ]),
    shanten: 1,
    atFuriten: false,
    actualIndex: 0,
    ...overrides,
  });
}

function responseDecision(overrides: {
  window?: Partial<DecisionWindow>;
  concealed?: readonly Tile[];
  actualAction?: ReplayedDecision["actualAction"];
} = {}): ReplayedDecision {
  const concealed = overrides.concealed ?? [
    tile("1m"), tile("2m"), tile("3m"), tile("4m"), tile("5m"),
    tile("6m"), tile("7m"), tile("8m"), tile("9m"),
    tile("1p"), tile("2p"), tile("3p"), tile("4p"),
  ];
  const window: DecisionWindow = {
    kind: "discard_response",
    actor: 0,
    triggerEventRef: "game:test/0/3/0",
    sourceActor: 3,
    offeredTile: tile("5p"),
    ...overrides.window,
  } as DecisionWindow;
  return {
    decisionEventRef: "game:test/0/3/0",
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
        concealedTiles: concealed.map((t) => ({ ...t })),
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
        decisionWindow: window,
      },
      evidenceIds: ["game:test/0/3/0"],
    },
    facts: null as never,
    actualDiscard: null,
    actualAction: overrides.actualAction ?? {
      kind: "pass",
      responseEventRef: "game:test/0/3/0",
      responseKind: "discard",
    },
  } as unknown as ReplayedDecision;
}

function reportOf(entries: readonly MortalReportDecisionEntry[]): MortalFetchedReport {
  return Object.freeze({
    reportId: "0123456789abcdef",
    adapterVersion: "mortal-source/2" as const,
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

function meldOf(kind: CanonicalMeldV2["kind"], actor: number, tiles: readonly Tile[]): CanonicalMeldV2 {
  return {
    meldRef: `meld:${kind}:${actor}`,
    kind,
    actor,
    createdEventRef: `event:${kind}`,
    tiles: tiles.map((t) => ({ ...t })),
  } as unknown as CanonicalMeldV2;
}

// --- identity fact table ----------------------------------------------------

describe("M6-A4.2 response window identity fact table", () => {
  it("binds a discard_response window to its source row (owner/triggerActor/offeredTile/responseKind)", () => {
    const decision = responseDecision();
    const entry = responseEntry();
    expect(entryMatchesDecisionIdentity(entry, decision)).toBe(true);
  });

  it("rejects a row whose lastActor is not the window sourceActor (trigger actor)", () => {
    const decision = responseDecision({ window: { sourceActor: 1 } });
    expect(entryMatchesDecisionIdentity(responseEntry(), decision)).toBe(false);
  });

  it("rejects a row whose offered tile differs from the window offeredTile", () => {
    const decision = responseDecision({ window: { offeredTile: tile("6p") } });
    expect(entryMatchesDecisionIdentity(responseEntry(), decision)).toBe(false);
  });

  it("rejects a kan_response row against a discard_response window (responseKind gate)", () => {
    const decision = responseDecision();
    expect(entryMatchesDecisionIdentity(
      responseEntry({ atOpponentKakan: true }),
      decision,
    )).toBe(false);
  });

  it("rejects a discard_response row against a kan_response window", () => {
    const decision = responseDecision({
      window: {
        kind: "kan_response",
        kanKind: "kakan",
        offeredTile: tile("5p"),
      } as unknown as DecisionWindow,
    });
    expect(entryMatchesDecisionIdentity(
      responseEntry({ atOpponentKakan: false }),
      decision,
    )).toBe(false);
  });

  it("rejects a different round/hand identity", () => {
    const decision = responseDecision();
    expect(entryMatchesDecisionIdentity(responseEntry({ roundOrdinal: 1 }), decision)).toBe(false);
    expect(entryMatchesDecisionIdentity(
      responseEntry({ tehai: Object.freeze(Array.from({ length: 13 }, () => "9s")) }),
      decision,
    )).toBe(false);
  });

  it("binds a meld-bearing response row through fuuro identity", () => {
    const ponMeld = {
      meldRef: "game:test/0/2/0",
      kind: "pon" as const,
      actor: 0,
      createdEventRef: "game:test/0/2/0",
      calledTile: tile("1z"),
      consumedTiles: [tile("1z"), tile("1z")],
      tiles: [tile("1z"), tile("1z"), tile("1z")],
    } as unknown as CanonicalMeldV2;
    const decision = responseDecision({
      concealed: [
        tile("2m"), tile("3m"), tile("4m"), tile("5m"), tile("6m"),
        tile("7m"), tile("8m"), tile("9m"),
        tile("1p"), tile("2p"), tile("3p"),
      ],
    });
    const withFuuro = {
      ...decision,
      snapshot: {
        ...decision.snapshot,
        publicState: {
          ...decision.snapshot.publicState,
          melds: [ponMeld],
        },
        privateState: {
          ...decision.snapshot.privateState,
          selfMeldRefs: [ponMeld.meldRef],
        },
      },
    } as unknown as ReplayedDecision;
    const entry = responseEntry({
      tehai: Object.freeze([
        "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m",
        "1p", "2p", "3p",
      ]),
      fuuros: Object.freeze([{
        kind: "pon",
        tiles: Object.freeze([
          { id: "1z", red: false },
          { id: "1z", red: false },
          { id: "1z", red: false },
        ]),
      }]),
    });
    expect(entryMatchesDecisionIdentity(entry, withFuuro)).toBe(true);
  });
});

// --- local candidate enumeration --------------------------------------------

describe("M6-A4.2 response local candidate enumeration (isomorphic to Mortal)", () => {
  it("expands chi by meld combination (distinct combinations count separately)", () => {
    // Offered 5p with concealed 3p4p AND 4p6p: two distinct chi combinations.
    const decision = responseDecision({
      concealed: [
        tile("1m"), tile("2m"), tile("3m"), tile("4m"), tile("5m"),
        tile("6m"), tile("7m"), tile("8m"), tile("9m"),
        tile("3p"), tile("4p"), tile("4p"), tile("6p"),
      ],
    });
    const combo = chiCombinations(
      decision.snapshot.privateState.concealedTiles as readonly Tile[],
      tile("5p"),
    );
    expect(combo).toHaveLength(2);
  });

  it("counts chi combos + pon + daiminkan + ron + none (none always one)", () => {
    // Hand with a 5p pair (pon) and 3p4p (a 5p chi) — 1m..9m + 5p5p + 3p4p IS
    // tenpai on 5p (3p4p5p + 5p5p pair), so instead assert pon without a
    // tenpai trap: 1m..9m + 5p5p + 2s3s on offered 5p → pon + none = 2.
    const ponOnly = responseDecision({
      window: { offeredTile: tile("5p") } as unknown as DecisionWindow,
      concealed: [
        tile("1m"), tile("2m"), tile("3m"), tile("4m"), tile("5m"),
        tile("6m"), tile("7m"), tile("8m"), tile("9m"),
        tile("5p"), tile("5p"), tile("2s"), tile("3s"),
      ],
    });
    const ponEnumeration = enumerateResponseCandidates(ponOnly);
    expect(ponEnumeration).not.toBeNull();
    expect(ponEnumeration!.chiCombinations).toHaveLength(0);
    expect(ponEnumeration!.pon).toBe(true);
    expect(ponEnumeration!.daiminkan).toBe(false);
    expect(ponEnumeration!.ron).toBe(false);
    expect(ponEnumeration!.none).toBe(true);
    expect(ponEnumeration!.candidateCount).toBe(2);

    // The chi-1 + pon-1 case from the chi test: 1m..9m + 3p4p + 5p5p + 2s is
    // tenpai on 5p — use it to assert ron is counted when the shape closes.
    const tenpaiOn5p = responseDecision({
      window: { offeredTile: tile("5p") } as unknown as DecisionWindow,
      concealed: [
        tile("1m"), tile("2m"), tile("3m"), tile("4m"), tile("5m"),
        tile("6m"), tile("7m"), tile("8m"), tile("9m"),
        tile("3p"), tile("4p"), tile("5p"), tile("5p"),
      ],
    });
    const tenpaiEnumeration = enumerateResponseCandidates(tenpaiOn5p);
    expect(tenpaiEnumeration).not.toBeNull();
    expect(tenpaiEnumeration!.chiCombinations).toHaveLength(1);
    expect(tenpaiEnumeration!.pon).toBe(true);
    expect(tenpaiEnumeration!.ron).toBe(true);
    expect(tenpaiEnumeration!.candidateCount).toBe(4); // chi + pon + ron + none
  });

  it("proves single-candidate (only none legal) when no non-pass candidate exists", () => {
    // Offered 7s; hand has no 7s meld and is not tenpai on 7s.
    const decision = responseDecision({
      window: { offeredTile: tile("7s") } as unknown as DecisionWindow,
      concealed: [
        tile("1m"), tile("2m"), tile("3m"), tile("4m"), tile("5m"),
        tile("6m"), tile("7m"), tile("8m"), tile("9m"),
        tile("1p"), tile("2p"), tile("3p"), tile("4p"),
      ],
    });
    const enumeration = enumerateResponseCandidates(decision);
    expect(enumeration).not.toBeNull();
    expect(enumeration!.candidateCount).toBe(1);
    expect(collectResponseSingleCandidateProofs([decision]).get(0)).toEqual({
      shape: "response_single_candidate",
      candidateCount: 1,
    });
  });

  it("suppresses chi/pon/daiminkan for a riichi'd reviewed player (ron-only space)", () => {
    // riichi'd tenpai on 2p (1m..9m + 111p + 2p): seat 1 offers 2p — ron only.
    const riichiDecision = responseDecision({
      window: { sourceActor: 1, offeredTile: tile("2p") } as unknown as DecisionWindow,
      concealed: [
        tile("1m"), tile("2m"), tile("3m"), tile("4m"), tile("5m"),
        tile("6m"), tile("7m"), tile("8m"), tile("9m"),
        tile("1p"), tile("1p"), tile("1p"), tile("2p"),
      ],
    });
    const withRiichi = {
      ...riichiDecision,
      snapshot: {
        ...riichiDecision.snapshot,
        publicState: {
          ...riichiDecision.snapshot.publicState,
          riichiStates: [
            { actor: 0, status: "accepted", declarationEventRef: "r", acceptanceEventRef: "a", ippatsuAlive: null },
            { actor: 1, status: "none", declarationEventRef: null, acceptanceEventRef: null, ippatsuAlive: null },
            { actor: 2, status: "none", declarationEventRef: null, acceptanceEventRef: null, ippatsuAlive: null },
            { actor: 3, status: "none", declarationEventRef: null, acceptanceEventRef: null, ippatsuAlive: null },
          ],
        },
      },
    } as unknown as ReplayedDecision;
    const enumeration = enumerateResponseCandidates(withRiichi);
    expect(enumeration).not.toBeNull();
    // riichi'd + tenpai on 2p: only ron + none.
    expect(enumeration!.pon).toBe(false);
    expect(enumeration!.chiCombinations).toHaveLength(0);
    expect(enumeration!.ron).toBe(true);
    expect(enumeration!.candidateCount).toBe(2);
  });
});

// --- binding plan + conservation gates --------------------------------------

describe("M6-A4.2 response binding plan + conservation", () => {
  it("binds a response window to its response source row (separate partition)", () => {
    const plan = buildMortalFullGameBindingPlan(
      [responseDecision()],
      reportOf([responseEntry()]),
    );
    expect(plan.rows[0]!.binding).toBe("bound");
    expect(plan.rows[0]!.sourceEntry).not.toBeNull();
  });

  it("reports no_mortal_entry when no response source row matches", () => {
    const plan = buildMortalFullGameBindingPlan(
      [responseDecision()],
      reportOf([]),
    );
    expect(plan.rows[0]!.binding).toBe("no_mortal_entry");
  });

  it("never binds a response window to a self-surface source row", () => {
    // A self row has lastActor === playerId; the response window requires
    // lastActor === sourceActor (an opponent), so the identity tables keep the
    // partitions disjoint even inside one flattened plan.
    const selfRow = responseEntry({
      lastActor: 0,
      tile: "5p",
    });
    const plan = buildMortalFullGameBindingPlan(
      [responseDecision()],
      reportOf([selfRow]),
    );
    expect(plan.rows[0]!.binding).toBe("no_mortal_entry");
  });

  it("marks a response window ambiguous when multiple response rows match", () => {
    const plan = buildMortalFullGameBindingPlan(
      [responseDecision()],
      reportOf([
        responseEntry({ junme: 2 }),
        responseEntry({ junme: 3 }),
      ]),
    );
    expect(plan.rows[0]!.binding).toBe("ambiguous");
    expect(plan.rows[0]!.localDegree).toBe(2);
  });

  it("keeps source rows of the response partition out of self ambiguity", () => {
    // Response source rows are degree-0 against self windows; they must not
    // appear as ambiguous in a self-only plan.
    const selfDecision = responseDecision({
      window: {
        kind: "self_turn",
        actor: 0,
        triggerEventRef: "game:test/0/2/0",
      } as unknown as DecisionWindow,
    });
    const selfDecisionWithDraw = {
      ...selfDecision,
      snapshot: {
        ...selfDecision.snapshot,
        privateState: {
          ...selfDecision.snapshot.privateState,
          currentDraw: { tile: tile("1p"), eventRef: "game:test/0/2/0", from: "live_wall" },
        },
      },
    } as unknown as ReplayedDecision;
    const plan = buildMortalFullGameBindingPlan(
      [selfDecisionWithDraw],
      reportOf([responseEntry()]),
    );
    expect(plan.rows[0]!.binding).toBe("no_mortal_entry");
    expect(plan.ambiguousSourceOrdinals).toEqual([]);
  });
});

// --- coverage branch classification for response rows -----------------------

describe("M6-A4.2 response coverage branches", () => {
  it("classifies the wave-1 actual branches", () => {
    expect(classifyCoverageBranches({
      windowKind: "discard_response",
      actualActionKind: "chi",
      callKind: null,
      candidateActionTypes: ["none", "chi"],
    })).toEqual(["resp_chi_actual"]);
    expect(classifyCoverageBranches({
      windowKind: "discard_response",
      actualActionKind: "pon",
      callKind: null,
      candidateActionTypes: ["none", "pon"],
    })).toEqual(["resp_pon_actual"]);
    expect(classifyCoverageBranches({
      windowKind: "discard_response",
      actualActionKind: "daiminkan",
      callKind: null,
      candidateActionTypes: ["none", "daiminkan"],
    })).toEqual(["resp_daiminkan_actual"]);
    expect(classifyCoverageBranches({
      windowKind: "discard_response",
      actualActionKind: "ron",
      callKind: null,
      candidateActionTypes: ["none", "hora"],
    })).toEqual(["resp_hora_actual"]);
    expect(classifyCoverageBranches({
      windowKind: "kan_response",
      actualActionKind: "ron",
      callKind: null,
      candidateActionTypes: ["none", "hora"],
    })).toEqual(["resp_chankan_actual"]);
  });

  it("classifies the explicit pass branch (never a proxy for another branch)", () => {
    expect(classifyCoverageBranches({
      windowKind: "discard_response",
      actualActionKind: "pass",
      callKind: null,
      candidateActionTypes: ["none", "chi"],
    })).toEqual(["resp_pass_on_discard"]);
    expect(classifyCoverageBranches({
      windowKind: "kan_response",
      actualActionKind: "pass",
      callKind: null,
      candidateActionTypes: ["none"],
    })).toEqual(["resp_pass_on_kakan"]);
  });

  it("does not classify a response row into a self-surface branch", () => {
    expect(classifyCoverageBranches({
      windowKind: "discard_response",
      actualActionKind: "discard",
      callKind: null,
      candidateActionTypes: ["dahai"],
    })).toEqual([]);
  });
});
