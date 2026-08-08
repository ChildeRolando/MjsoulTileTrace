import { describe, expect, it } from "vitest";
import {
  KnownGameFactsSchema,
  StructuredComparisonCandidateSchema,
  canonicalActionRef,
  type CandidateFactorLedger,
  type Hand13FactResult,
  type Tile,
} from "@riichi-coach/contracts";
import {
  buildCandidateLedger,
  type CandidateLedgerBuildInput,
} from "../src/factors/ledger-builder.js";

const tile = (id: Tile["id"]): Tile => ({ id, red: false });
const action = {
  kind: "discard" as const,
  tile: tile("6s"),
  discardMode: "tsumogiri" as const,
};
const actionRef = canonicalActionRef(action);
const candidate = StructuredComparisonCandidateSchema.parse({
  action,
  actionRef,
  origins: ["actual", "model"],
});

const facts = KnownGameFactsSchema.parse({
  factSetId: "facts:e1:t6",
  provenance: "raw_replay",
  actor: 0,
  selfRiichi: false,
  decisionEventRef: "event-draw",
  decisionWindow: {
    kind: "self_turn",
    actor: 0,
    triggerEventRef: "event-draw",
  },
  concealedTiles: [],
  currentDraw: { tile: tile("6s"), eventRef: "event-draw" },
  melds: [],
  doraIndicators: [tile("4m")],
  rivers: [[], [], [{
    tile: tile("6s"),
    actor: 2,
    tsumogiri: false,
    eventId: "event-safe-6s",
    afterRiichiEventIds: [],
  }], []],
  threats: [{
    actor: 2,
    riichi: true,
    declarationEventId: "event-riichi-2",
    ippatsuAlive: true,
  }],
  roundWind: "E",
  seatWind: "E",
  dealer: true,
  remainingDraws: 50,
  completeness: {
    concealedTiles: true,
    melds: true,
    doraIndicators: true,
    rivers: true,
    remainingDraws: true,
    calledDiscardMarkers: true,
  },
  evidenceIds: ["event-draw", "event-safe-6s", "event-riichi-2"],
});

function handResult(overrides: Partial<Hand13FactResult> = {}): Hand13FactResult {
  return {
    kind: "hand13_result",
    requestId: "request:hand13",
    protocolVersion: "mahjong-facts/v1",
    actionRef,
    stateHash: "sha256:projected",
    identity: {
      engine: "mahjong-helper",
      upstreamCommit: "514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0",
      adapterVersion: "0.1.0",
      protocolVersion: "mahjong-facts/v1",
    },
    shanten: 2,
    effectiveTile34: [3, 12],
    waitsRemainingStatus: "calculated",
    waitsRemaining: [{ tile34: 3, count: 3 }, { tile34: 12, count: 4 }],
    improves: [],
    doraCountStatus: "calculated",
    doraCount: 1,
    estimates: [{
      field: "dama_point",
      numericValue: 3900,
      limitations: ["Pinned helper estimate"],
    }],
    diagnostics: [],
    ...overrides,
  };
}

function baseInput(): CandidateLedgerBuildInput {
  return {
    candidate,
    facts,
    scope: { kind: "applied_decision" },
    projection: {
      status: "ready",
      actionRef,
      projectedStateRef: "sha256:projected",
      hand13Request: {
        kind: "hand13",
        requestId: "request:hand13",
        protocolVersion: "mahjong-facts/v1",
        actionRef,
        stateHash: "sha256:projected",
        melds: [],
        doraTiles34: [4],
        redFiveCounts: [0, 0, 0],
        roundWindTile34: 27,
        selfWindTile34: 27,
        dealer: true,
        riichi: false,
        selfDiscards34: [23],
        handTiles34: Array(34).fill(0),
        leftTiles34: Array(34).fill(4),
        visibleCountsComplete: true,
        doraTilesComplete: true,
        selfDiscardsComplete: true,
        remainingDraws: 50,
      },
      threatRiskRequests: [],
      localEvidenceIds: [...facts.evidenceIds],
      diagnostics: [],
    },
    hand13Outcome: { status: "calculated", result: handResult() },
    threatRiskOutcomes: [{
      status: "calculated",
      result: {
        kind: "threat_risk_result",
        requestId: "request:risk:2",
        protocolVersion: "mahjong-facts/v1",
        actionRef,
        stateHash: "sha256:projected",
        identity: handResult().identity,
        threatActor: 2,
        riskScale: Array(34).fill(5).map((value, index) => index === 23 ? 0 : value),
        classifications: [{ tile34: 23, kind: "genbutsu" }],
        leftNoSujiTile34: [0, 8],
        evidenceIds: ["event-riichi-2", "event-safe-6s"],
        limitations: ["Not a calibrated Mortal deal-in probability"],
        diagnostics: [],
      },
    }],
  };
}

function fact(ledger: CandidateFactorLedger, factorKey: string) {
  const found = ledger.axes.flatMap((axis) => axis.facts)
    .find((entry) => entry.factorKey === factorKey);
  if (found === undefined) throw new Error(`missing fact ${factorKey}`);
  return found;
}

describe("structured ledger builder", () => {
  it("keeps genbutsu deterministic and helper risk heuristic", () => {
    const ledger = buildCandidateLedger(baseInput());
    expect(fact(ledger, "defense.genbutsu.actor2")).toMatchObject({
      evidenceClass: "deterministic_local_replay",
      preferenceEligibility: "deterministic",
      value: { kind: "boolean", value: true },
    });
    expect(fact(ledger, "defense.helper_risk.actor2")).toMatchObject({
      evidenceClass: "versioned_upstream_estimate",
      preferenceEligibility: "heuristic_only",
      engineIdentity: handResult().identity,
    });
    expect(fact(ledger, "efficiency.shanten").engineIdentity)
      .toEqual(handResult().identity);
    expect(fact(ledger, "defense.genbutsu.actor2").engineIdentity)
      .toBeUndefined();
  });

  it("maps helper value estimates but never recommendation order", () => {
    const ledger = buildCandidateLedger(baseInput());
    expect(fact(ledger, "value.dama_point").preferenceEligibility)
      .toBe("heuristic_only");
    expect(JSON.stringify(ledger)).not.toContain("recommended");
  });

  it("blocks only remaining counts for incomplete visibility", () => {
    const input = baseInput();
    input.hand13Outcome = {
      status: "calculated",
      result: handResult({
        waitsRemainingStatus: "blocked_missing_facts",
        waitsRemaining: [],
      }),
    };
    const ledger = buildCandidateLedger(input);
    expect(fact(ledger, "efficiency.shanten").status).toBe("calculated");
    expect(fact(ledger, "efficiency.ukeire_remaining").status)
      .toBe("blocked_missing_facts");
  });

  it("skips defense for an explicit flat-discard scope", () => {
    const ledger = buildCandidateLedger({
      ...baseInput(),
      scope: { kind: "flat_discard" },
    });
    expect(ledger.axes.find((axis) => axis.axis === "defense")?.status)
      .toBe("skipped_out_of_scope");
  });

  it("produces every canonical axis exactly once", () => {
    const ledger = buildCandidateLedger(baseInput());
    expect(ledger.axes.map((axis) => axis.axis)).toEqual([
      "efficiency", "value", "defense", "placement", "option_value",
    ]);
  });

  it("records a threat-specific blocked fact when the risk engine fails", () => {
    const input = baseInput();
    input.threatRiskOutcomes = [{
      status: "blocked_engine_failure",
      threatActor: 2,
      diagnostic: "risk sidecar exited",
    }];

    const ledger = buildCandidateLedger(input);
    expect(fact(ledger, "defense.helper_risk.actor2")).toMatchObject({
      status: "blocked_engine_failure",
      preferenceEligibility: "heuristic_only",
      limitations: ["risk sidecar exited"],
    });
  });
});
