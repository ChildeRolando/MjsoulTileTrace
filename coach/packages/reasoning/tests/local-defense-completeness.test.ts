import { describe, expect, it } from "vitest";
import {
  KnownGameFactsSchema,
  StructuredComparisonCandidateSchema,
  canonicalActionRef,
  type Tile,
} from "@riichi-coach/contracts";
import {
  assembleDefenseMatrix,
  buildDeterministicDefenseMatrix,
} from "../src/factors/defense-matrix.js";
import { buildCandidateLedger } from "../src/factors/ledger-builder.js";
import { projectCandidate } from "../src/factors/candidate-projector.js";

const tile = (id: Tile["id"]): Tile => ({ id, red: false });
const action = {
  kind: "discard" as const,
  tile: tile("6s"),
  discardMode: "tedashi" as const,
};
const candidate = StructuredComparisonCandidateSchema.parse({
  action,
  actionRef: canonicalActionRef(action),
  origins: ["user"],
});

function facts(discardActor: number, ippatsuAlive: boolean | null = false) {
  return KnownGameFactsSchema.parse({
    factSetId: "user-asserted:defense-completeness",
    provenance: "user_asserted",
    actor: 0,
    selfRiichi: false,
    decisionEventRef: "event:draw",
    decisionWindow: { kind: "self_turn", actor: 0, triggerEventRef: "event:draw" },
    concealedTiles: [],
    currentDraw: null,
    melds: [],
    doraIndicators: [tile("1m")],
    rivers: [[], [], [], []].map((river, actor) => actor === discardActor
      ? [{
          tile: tile("6s"), actor, tsumogiri: false,
          eventId: "event:6s", afterRiichiEventIds: ["event:riichi"],
        }]
      : river),
    threats: [{
      actor: 2, riichi: true, declarationEventId: "event:riichi", ippatsuAlive,
    }],
    defenseThreats: [{
      actor: 2,
      kind: "riichi_accepted",
      source: "user_asserted",
      sourceEventRefs: ["event:riichi", "event:accepted"],
      openMeldRefs: [],
      dealerStatus: "non_dealer",
      riichiTurn: { status: "calculated", value: 1 },
      ippatsu: ippatsuAlive === null
        ? { status: "blocked_missing_facts" }
        : { status: "calculated", value: ippatsuAlive },
    }],
    roundWind: "E",
    seatWind: "E",
    dealer: true,
    remainingDraws: null,
    completeness: {
      concealedTiles: true, melds: true, doraIndicators: true,
      rivers: true, remainingDraws: false, calledDiscardMarkers: true,
      responseOpportunities: false,
      roundContext: true,
    },
    evidenceIds: ["event:draw", "event:riichi", "event:6s"],
  });
}

function defenseFacts(sourceFacts: ReturnType<typeof facts>) {
  const threatRiskProjections = [{
    threatActor: 2,
    status: "blocked_missing_facts" as const,
    missing: ["visibility"],
  }];
  const defenseMatrix = assembleDefenseMatrix({
    deterministic: buildDeterministicDefenseMatrix({
      candidate,
      facts: sourceFacts,
    }),
    threatRiskProjections,
    threatRiskOutcomes: [],
  });
  return buildCandidateLedger({
    candidate,
    defenseMatrix,
    scope: { kind: "applied_decision" },
    projection: {
      status: "ready",
      actionRef: candidate.actionRef,
      projectedStateRef: "sha256:defense-completeness",
      threatRiskProjections,
      localEvidenceIds: [...sourceFacts.evidenceIds],
      diagnostics: [],
    },
  }).axes.find((axis) => axis.axis === "defense")!.facts;
}

describe("local defense response-opportunity completeness", () => {
  it("blocks cross-player post-riichi genbutsu when ron opportunities are incomplete", () => {
    const result = defenseFacts(facts(1));
    expect(result.find((fact) => fact.dimension === "genbutsu:actor2"))
      .toMatchObject({ status: "blocked_missing_facts", preferenceEligibility: "ineligible" });
  });

  it("keeps the threat actor's own discard deterministic", () => {
    const result = defenseFacts(facts(2));
    expect(result.find((fact) => fact.dimension === "genbutsu:actor2"))
      .toMatchObject({
        status: "calculated",
        preferenceEligibility: "deterministic",
        value: { kind: "boolean", value: true },
      });
  });

  it("blocks ippatsu instead of converting an unknown state to false", () => {
    const result = defenseFacts(facts(2, null));
    expect(result.find((fact) => fact.dimension === "riichi_threat:actor2"))
      .toMatchObject({ status: "calculated", value: { kind: "boolean", value: true } });
    expect(result.find((fact) => fact.dimension === "genbutsu:actor2"))
      .toMatchObject({ status: "calculated", value: { kind: "boolean", value: true } });
    expect(result.find((fact) => fact.dimension === "ippatsu_alive:actor2"))
      .toMatchObject({
        status: "blocked_missing_facts",
        preferenceEligibility: "ineligible",
      });
  });

  it("keeps non-discard actions outside the Slice 3 projection boundary", () => {
    const chi = {
      kind: "chi" as const,
      calledTile: tile("2m"),
      consumedTiles: [tile("1m"), tile("3m")] as [Tile, Tile],
      targetActor: 3,
      responseEventRef: "event:discard",
    };
    const chiCandidate = StructuredComparisonCandidateSchema.parse({
      action: chi,
      actionRef: canonicalActionRef(chi),
      origins: ["user"],
    });

    expect(projectCandidate(chiCandidate, facts(2))).toMatchObject({
      status: "unsupported_action_in_slice",
      actionRef: chiCandidate.actionRef,
    });
  });
});
