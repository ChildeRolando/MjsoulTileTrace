import { describe, expect, it } from "vitest";
import {
  KnownGameFactsSchema,
  StructuredComparisonCandidateSchema,
  canonicalActionRef,
  type RiichiAction,
  type Tile,
} from "@riichi-coach/contracts";
import {
  projectCandidate,
} from "../src/factors/candidate-projector.js";

const tile = (id: Tile["id"], red = false): Tile => ({ id, red });

function candidate(action: RiichiAction) {
  return StructuredComparisonCandidateSchema.parse({
    action,
    actionRef: canonicalActionRef(action),
    origins: ["user"],
  });
}

function selfTurnFacts() {
  const concealed = [
    tile("1m"), tile("2m"), tile("3m"), tile("5m", true),
    tile("2p"), tile("3p"), tile("4p"), tile("5p"),
    tile("2s"), tile("3s"), tile("4s"), tile("7s"), tile("7s"),
  ];
  return KnownGameFactsSchema.parse({
    factSetId: "facts:self-turn",
    provenance: "raw_replay",
    actor: 0,
    selfRiichi: false,
    decisionEventRef: "event-draw",
    decisionWindow: {
      kind: "self_turn",
      actor: 0,
      triggerEventRef: "event-draw",
    },
    concealedTiles: concealed,
    currentDraw: { tile: tile("6s"), eventRef: "event-draw" },
    melds: [],
    doraIndicators: [tile("4m")],
    rivers: [[], [], [], []],
    threats: [],
    roundWind: "E",
    seatWind: "E",
    dealer: true,
    remainingDraws: 55,
    completeness: {
      concealedTiles: true,
      melds: true,
      doraIndicators: true,
      rivers: true,
      remainingDraws: true,
      calledDiscardMarkers: true,
    },
    evidenceIds: ["event-draw"],
  });
}

describe("candidate projector", () => {
  it("projects a red-five discard without merging identity", () => {
    const redDiscard = candidate({
      kind: "discard",
      tile: tile("5m", true),
      discardMode: "tedashi",
    });
    const projected = projectCandidate(redDiscard, selfTurnFacts());
    expect(projected.status).toBe("ready");
    if (projected.status !== "ready") throw new Error("expected ready");
    expect(projected.hand13Request?.redFiveCounts).toEqual([0, 0, 0]);
    expect(projected.actionRef).toBe(redDiscard.actionRef);
  });

  it("projects tsumogiri and tedashi from different sources", () => {
    const tsumogiri = candidate({
      kind: "discard",
      tile: tile("6s"),
      discardMode: "tsumogiri",
    });
    const tedashi = candidate({
      kind: "discard",
      tile: tile("2p"),
      discardMode: "tedashi",
    });
    expect(projectCandidate(tsumogiri, selfTurnFacts()).status).toBe("ready");
    expect(projectCandidate(tedashi, selfTurnFacts()).status).toBe("ready");
  });

  it("binds completeness assumptions into the projected state hash", () => {
    const discard = candidate({
      kind: "discard",
      tile: tile("6s"),
      discardMode: "tsumogiri",
    });
    const partialRivers = KnownGameFactsSchema.parse({
      ...selfTurnFacts(),
      completeness: {
        ...selfTurnFacts().completeness,
        rivers: false,
      },
    });
    const complete = projectCandidate(discard, partialRivers);
    const incomplete = projectCandidate(discard, KnownGameFactsSchema.parse({
      ...partialRivers,
      completeness: {
        ...partialRivers.completeness,
        doraIndicators: false,
      },
    }));
    expect(complete.status).toBe("ready");
    expect(incomplete.status).toBe("ready");
    if (complete.status !== "ready" || incomplete.status !== "ready") {
      throw new Error("expected ready projections");
    }
    expect(complete.projectedStateRef).not.toBe(incomplete.projectedStateRef);
  });

  it("requires complete win context for ron", () => {
    const facts = KnownGameFactsSchema.parse({
      ...selfTurnFacts(),
      factSetId: "facts:ron",
      decisionEventRef: "event-discard",
      decisionWindow: {
        kind: "discard_response",
        actor: 0,
        triggerEventRef: "event-discard",
        sourceActor: 1,
        offeredTile: tile("6s"),
      },
      currentDraw: null,
      completeness: {
        ...selfTurnFacts().completeness,
        doraIndicators: false,
      },
    });
    const ron = candidate({
      kind: "ron",
      winningTile: tile("6s"),
      targetActor: 1,
      responseEventRef: "event-discard",
      winContext: "discard",
    });
    expect(projectCandidate(ron, facts)).toMatchObject({
      status: "blocked_missing_facts",
    });
  });

  it("marks chi unsupported instead of inventing a hand", () => {
    const facts = KnownGameFactsSchema.parse({
      ...selfTurnFacts(),
      factSetId: "facts:chi",
      decisionEventRef: "event-discard",
      decisionWindow: {
        kind: "discard_response",
        actor: 0,
        triggerEventRef: "event-discard",
        sourceActor: 3,
        offeredTile: tile("2m"),
      },
      currentDraw: null,
    });
    const chi = candidate({
      kind: "chi",
      calledTile: tile("2m"),
      consumedTiles: [tile("1m"), tile("3m")],
      targetActor: 3,
      responseEventRef: "event-discard",
    });
    expect(projectCandidate(chi, facts)).toMatchObject({
      status: "unsupported_action_in_slice",
    });
  });

  it("builds risk input per riichi threat from replay evidence", () => {
    const reachEvent = "event-reach-2";
    const facts = KnownGameFactsSchema.parse({
      ...selfTurnFacts(),
      factSetId: "facts:risk",
      rivers: [
        [{
          tile: tile("1p"), actor: 0, tsumogiri: false,
          eventId: "event-after", afterRiichiEventIds: [reachEvent],
        }],
        [],
        [
          {
            tile: tile("4m"), actor: 2, tsumogiri: false,
            eventId: "event-before", afterRiichiEventIds: [],
          },
          {
            tile: tile("6s"), actor: 2, tsumogiri: true,
            eventId: "event-declaration-discard",
            afterRiichiEventIds: [reachEvent],
          },
        ],
        [],
      ],
      threats: [{
        actor: 2,
        riichi: true,
        declarationEventId: reachEvent,
        ippatsuAlive: true,
      }],
      evidenceIds: ["event-draw", reachEvent, "event-before", "event-after"],
    });
    const discard = candidate({
      kind: "discard",
      tile: tile("6s"),
      discardMode: "tsumogiri",
    });
    const projected = projectCandidate(discard, facts);
    expect(projected.status).toBe("ready");
    if (projected.status !== "ready") throw new Error("expected ready");
    expect(projected.threatRiskRequests).toHaveLength(1);
    expect(projected.threatRiskRequests[0]).toMatchObject({
      threatActor: 2,
      earlyOutsideTiles34: [0, 1, 2],
    });
    expect(projected.threatRiskRequests[0]?.safeTiles34[23]).toBe(true);
    expect(projected.threatRiskRequests[0]?.safeTiles34[9]).toBe(true);
  });
});
