import { describe, expect, it } from "vitest";
import {
  KnownGameFactsSchema,
  STRUCTURAL_RISK_SCALE_VERSION,
  StructuredComparisonCandidateSchema,
  canonicalActionRef,
  defenseStructuralStateHash,
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
    defenseThreats: [],
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
    expect(projected.handStructureRequest?.yakuContext).toEqual({
      windsStatus: "unknown",
      roundWindTile34: null,
      selfWindTile34: null,
      riichiStatus: "unknown",
      openTanyaoStatus: "unknown",
    });
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
      factSetId: "legacy-regression:risk",
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
      defenseThreats: [{
        actor: 2,
        kind: "riichi_accepted",
        source: "legacy_regression_bridge_only",
        sourceEventRefs: [reachEvent, "event-reach-accepted-2"],
        openMeldRefs: [],
        dealerStatus: "non_dealer",
        riichiTurn: { status: "calculated", value: 2 },
        ippatsu: { status: "calculated", value: true },
      }],
      completeness: {
        ...selfTurnFacts().completeness,
        roundContext: true,
        responseOpportunities: true,
      },
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
    expect(projected.threatRiskProjections).toHaveLength(1);
    expect(projected.threatRiskProjections[0]).toMatchObject({
      threatActor: 2,
      status: "ready",
      request: {
        scaleVersion: STRUCTURAL_RISK_SCALE_VERSION,
        threatActor: 2,
        earlyOutsideTiles34: [0, 1, 2],
      },
    });
    const risk = projected.threatRiskProjections[0];
    if (risk?.status !== "ready") throw new Error("expected ready risk");
    expect(risk.request.safeTiles34[23]).toBe(true);
    expect(risk.request.safeTiles34[9]).toBe(true);
    expect(risk.request.stateHash).toBe(defenseStructuralStateHash({
      sourceStateHash: "risk",
      factSetId: facts.factSetId,
      actionRef: discard.actionRef,
      threatActor: 2,
      visibility: {
        turns: risk.request.turns,
        safeTiles34: risk.request.safeTiles34,
        leftTiles34: risk.request.leftTiles34,
        doraTiles34: risk.request.doraTiles34,
        roundWindTile34: risk.request.roundWindTile34,
        threatWindTile34: risk.request.threatWindTile34,
        earlyOutsideTiles34: risk.request.earlyOutsideTiles34,
      },
      evidenceIds: risk.request.evidenceIds,
    }));

    const incompleteResponses = projectCandidate(discard, KnownGameFactsSchema.parse({
      ...facts,
      completeness: {
        ...facts.completeness,
        responseOpportunities: false,
      },
    }));
    expect(incompleteResponses.status).toBe("ready");
    if (incompleteResponses.status !== "ready") throw new Error("expected ready");
    const incompleteRisk = incompleteResponses.threatRiskProjections[0];
    if (incompleteRisk?.status !== "ready") throw new Error("expected ready risk");
    expect(incompleteRisk.request.safeTiles34[23]).toBe(true);
    expect(incompleteRisk.request.safeTiles34[9]).toBe(false);

    const changedFacts = KnownGameFactsSchema.parse({
      ...facts,
      rivers: facts.rivers.map((river) => river.map((riverDiscard) =>
        riverDiscard.eventId === "event-after"
          ? { ...riverDiscard, afterRiichiEventIds: [] }
          : riverDiscard
      )),
    });
    const changed = projectCandidate(discard, changedFacts);
    expect(changed.status).toBe("ready");
    if (changed.status !== "ready") throw new Error("expected ready");
    expect(changed.projectedStateRef).toBe(projected.projectedStateRef);
    const changedRisk = changed.threatRiskProjections[0];
    if (changedRisk?.status !== "ready") throw new Error("expected ready risk");
    expect(changedRisk.request.stateHash).not.toBe(risk.request.stateHash);
  });

  it("keeps one explicit blocked or unsupported projection per defense threat", () => {
    const base = selfTurnFacts();
    const openFacts = KnownGameFactsSchema.parse({
      ...base,
      factSetId: "user-asserted:open-risk",
      provenance: "user_asserted",
      defenseThreats: [{
        actor: 3,
        kind: "user_marked_open",
        source: "user_asserted",
        sourceEventRefs: ["user:threat:3"],
        openMeldRefs: ["user:meld:3:0"],
        dealerStatus: "unknown",
        riichiTurn: { status: "not_applicable" },
        ippatsu: { status: "not_applicable" },
      }],
    });
    const discard = candidate({
      kind: "discard",
      tile: tile("6s"),
      discardMode: "tsumogiri",
    });
    const unsupported = projectCandidate(discard, openFacts);
    expect(unsupported.status).toBe("ready");
    if (unsupported.status !== "ready") throw new Error("expected ready");
    expect(unsupported.threatRiskProjections).toEqual([{
      threatActor: 3,
      status: "unsupported_threat_kind",
      kind: "user_marked_open",
    }]);

    const riichiFacts = KnownGameFactsSchema.parse({
      ...base,
      factSetId: "legacy-regression:blocked-risk",
      threats: [{
        actor: 2,
        riichi: true,
        declarationEventId: "event:riichi:2",
        ippatsuAlive: null,
      }],
      defenseThreats: [{
        actor: 2,
        kind: "riichi_declared",
        source: "legacy_regression_bridge_only",
        sourceEventRefs: ["event:riichi:2"],
        openMeldRefs: [],
        dealerStatus: "unknown",
        riichiTurn: { status: "blocked_missing_facts" },
        ippatsu: { status: "blocked_missing_facts" },
      }],
      completeness: { ...base.completeness, rivers: false },
    });
    const blocked = projectCandidate(discard, riichiFacts);
    expect(blocked.status).toBe("ready");
    if (blocked.status !== "ready") throw new Error("expected ready");
    expect(blocked.threatRiskProjections).toEqual([{
      threatActor: 2,
      status: "blocked_missing_facts",
      missing: ["visibility"],
    }]);
  });

  it("keeps user-asserted riichi identity out of canonical helper evidence", () => {
    const declaration = "user:riichi:2";
    const base = selfTurnFacts();
    const mixed = KnownGameFactsSchema.parse({
      ...base,
      factSetId: "canonical-v2:mixed-risk",
      provenance: "mixed",
      decisionEventRef: "game/0/70/0",
      decisionWindow: {
        ...base.decisionWindow,
        triggerEventRef: "game/0/70/0",
      },
      currentDraw: { tile: tile("6s"), eventRef: "game/0/70/0" },
      rivers: [[], [], [{
        tile: tile("4m"),
        actor: 2,
        tsumogiri: false,
        eventId: "game/0/40/0",
        afterRiichiEventIds: [],
      }], []],
      threats: [{
        actor: 2,
        riichi: true,
        declarationEventId: declaration,
        ippatsuAlive: false,
      }],
      defenseThreats: [{
        actor: 2,
        kind: "riichi_accepted",
        source: "user_asserted",
        sourceEventRefs: [declaration],
        openMeldRefs: [],
        dealerStatus: "unknown",
        riichiTurn: { status: "calculated", value: 1 },
        ippatsu: { status: "calculated", value: false },
      }],
      evidenceIds: ["game/0/40/0", "game/0/70/0"],
    });
    const discard = candidate({
      kind: "discard",
      tile: tile("6s"),
      discardMode: "tsumogiri",
    });
    const projected = projectCandidate(discard, mixed);
    expect(projected.status).toBe("ready");
    if (projected.status !== "ready") throw new Error("expected ready");
    const risk = projected.threatRiskProjections[0];
    if (risk?.status !== "ready") throw new Error("expected ready risk");
    expect(risk.request.evidenceIds).toEqual(["game/0/40/0"]);
    expect(risk.request.evidenceIds).not.toContain(declaration);
    expect(risk.request.safeTiles34[3]).toBe(true);
  });

  it("does not cross-bind safe tiles or threat source evidence", () => {
    const base = selfTurnFacts();
    const actorOneReach = "event:riichi:1";
    const actorTwoReach = "event:riichi:2";
    const facts = KnownGameFactsSchema.parse({
      ...base,
      factSetId: "legacy-regression:two-threat-risk",
      rivers: [[], [{
        tile: tile("1m"), actor: 1, tsumogiri: false,
        eventId: "event:actor1:1m", afterRiichiEventIds: [],
      }], [{
        tile: tile("9p"), actor: 2, tsumogiri: false,
        eventId: "event:actor2:9p", afterRiichiEventIds: [],
      }], []],
      threats: [{
        actor: 1, riichi: true,
        declarationEventId: actorOneReach, ippatsuAlive: false,
      }, {
        actor: 2, riichi: true,
        declarationEventId: actorTwoReach, ippatsuAlive: false,
      }],
      defenseThreats: [{
        actor: 1,
        kind: "riichi_declared",
        source: "legacy_regression_bridge_only",
        sourceEventRefs: [actorOneReach],
        openMeldRefs: [],
        dealerStatus: "unknown",
        riichiTurn: { status: "calculated", value: 1 },
        ippatsu: { status: "calculated", value: false },
      }, {
        actor: 2,
        kind: "riichi_declared",
        source: "legacy_regression_bridge_only",
        sourceEventRefs: [actorTwoReach],
        openMeldRefs: [],
        dealerStatus: "unknown",
        riichiTurn: { status: "calculated", value: 1 },
        ippatsu: { status: "calculated", value: false },
      }],
      evidenceIds: [
        "event-draw", actorOneReach, actorTwoReach,
        "event:actor1:1m", "event:actor2:9p",
      ],
    });
    const projected = projectCandidate(candidate({
      kind: "discard",
      tile: tile("6s"),
      discardMode: "tsumogiri",
    }), facts);
    expect(projected.status).toBe("ready");
    if (projected.status !== "ready") throw new Error("expected ready");
    const actorOne = projected.threatRiskProjections[0];
    const actorTwo = projected.threatRiskProjections[1];
    if (actorOne?.status !== "ready" || actorTwo?.status !== "ready") {
      throw new Error("expected ready risks");
    }
    expect(actorOne.request.safeTiles34[0]).toBe(true);
    expect(actorOne.request.safeTiles34[17]).toBe(false);
    expect(actorTwo.request.safeTiles34[0]).toBe(false);
    expect(actorTwo.request.safeTiles34[17]).toBe(true);
    expect(actorOne.request.evidenceIds).not.toContain(actorTwoReach);
    expect(actorTwo.request.evidenceIds).not.toContain(actorOneReach);
  });
});
