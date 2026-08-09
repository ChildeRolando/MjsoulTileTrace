import { describe, expect, it } from "vitest";
import {
  KnownGameFactsSchema,
  StructuredComparisonCandidateSchema,
  canonicalActionRef,
  type Tile,
} from "@riichi-coach/contracts";
import { buildLocalDefenseFacts } from "../src/factors/local-defense.js";

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
    factSetId: "legacy-regression:defense-completeness",
    provenance: "raw_replay",
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
      source: "legacy_regression_bridge_only",
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

describe("local defense response-opportunity completeness", () => {
  it("blocks cross-player post-riichi genbutsu when ron opportunities are incomplete", () => {
    const result = buildLocalDefenseFacts(candidate, facts(1));
    expect(result.find((fact) => fact.dimension === "genbutsu:actor2"))
      .toMatchObject({ status: "blocked_missing_facts", preferenceEligibility: "ineligible" });
  });

  it("keeps the threat actor's own discard deterministic", () => {
    const result = buildLocalDefenseFacts(candidate, facts(2));
    expect(result.find((fact) => fact.dimension === "genbutsu:actor2"))
      .toMatchObject({
        status: "calculated",
        preferenceEligibility: "deterministic",
        value: { kind: "boolean", value: true },
      });
  });

  it("blocks ippatsu instead of converting an unknown state to false", () => {
    const result = buildLocalDefenseFacts(candidate, facts(2, null));
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
});
