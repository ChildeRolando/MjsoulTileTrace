import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { RegressionFixture } from "../src/import/mortal-report.js";
import type { CanonicalEventStream, CanonicalGameEvent } from
  "@riichi-coach/contracts";
import {
  canonicalStartEvents,
  canonicalSelfDrawDiscardEvents,
  canonicalStream,
  canonicalTile,
} from "./fixtures/canonical-stream.js";
import {
  freezeDecisionSnapshot,
  importRegressionFixture,
  projectKnownGameFactsV2,
  replayToDecision,
} from "../src/index.js";
import { buildLegacyRegressionPipelineInput } from
  "../src/factors/legacy-facts-bridge.js";
import { bridgeLegacyRegressionEvents } from "../src/import/legacy-event-stream-bridge.js";

const fixtureUrl = new URL(
  "../../../fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json",
  import.meta.url,
);

describe("V2 snapshot to KnownGameFacts projection", () => {
  it("preserves declared status and blocks only riichi turn when rivers are partial", async () => {
    const raw = JSON.parse(await readFile(fixtureUrl, "utf8")) as RegressionFixture;
    const { selfActor, events } = importRegressionFixture(raw);
    const bridged = bridgeLegacyRegressionEvents(events, selfActor, {
      sourceKind: "fixture",
      gameId: "fixture:c1924cad66f66dd9",
    });
    if (bridged.status !== "ready") throw new Error(bridged.code);
    const declarationRef = bridged
      .legacyEventRefToCanonicalEventRefs["event-47"]?.[0];
    const acceptanceRef = bridged
      .legacyEventRefToCanonicalEventRefs["event-49"]?.[0];
    const declaringDiscardRef = bridged
      .legacyEventRefToCanonicalEventRefs["event-48"]?.[0];
    const triggerEventRef = bridged
      .legacyEventRefToCanonicalEventRefs["event-50"]?.[0];
    if (declarationRef === undefined || acceptanceRef === undefined ||
      declaringDiscardRef === undefined ||
      triggerEventRef === undefined) throw new Error("fixture ref missing");
    const withoutAcceptance: CanonicalEventStream = {
      ...bridged.stream,
      events: bridged.stream.events.slice(
        0,
        bridged.stream.events.findIndex((event) =>
          event.eventId === acceptanceRef
        ),
      ),
    };
    const declaredWindow = {
      kind: "discard_response" as const,
      actor: selfActor,
      triggerEventRef: declaringDiscardRef,
      sourceActor: 2,
      offeredTile: canonicalTile("6s"),
    };
    expect(projectKnownGameFactsV2({
      stream: withoutAcceptance,
      decisionWindow: declaredWindow,
    }).defenseThreats).toEqual([{
      actor: 2,
      kind: "riichi_declared",
      source: "legacy_regression_bridge_only",
      sourceEventRefs: [declarationRef],
      openMeldRefs: [],
      dealerStatus: "non_dealer",
      riichiTurn: { status: "calculated", value: 6 },
      ippatsu: { status: "calculated", value: false },
    }]);

    const partialRivers: CanonicalEventStream = {
      ...bridged.stream,
      completeness: { ...bridged.stream.completeness, rivers: "partial" },
    };
    expect(projectKnownGameFactsV2({
      stream: partialRivers,
      decisionWindow: {
        kind: "self_turn",
        actor: selfActor,
        triggerEventRef,
      },
    }).defenseThreats[0]).toMatchObject({
      kind: "riichi_accepted",
      dealerStatus: "non_dealer",
      riichiTurn: { status: "blocked_missing_facts" },
      ippatsu: { status: "calculated", value: true },
    });
  });

  it("preserves unknown ippatsu as a blocked datum", () => {
    const selfHand = [
      canonicalTile("1m"), canonicalTile("1m"), canonicalTile("1m"),
      canonicalTile("2m"), canonicalTile("3m"), canonicalTile("4m"),
      canonicalTile("5m"), canonicalTile("6m"), canonicalTile("7m"),
      canonicalTile("1p"), canonicalTile("2p"), canonicalTile("3p"),
      canonicalTile("4p"),
    ];
    const event = (
      type: CanonicalGameEvent["type"],
      record: number,
      value: Omit<CanonicalGameEvent, "type" | "eventId" | "sourceRecordRef">,
    ): CanonicalGameEvent => ({
      type,
      eventId: `game:fixture/0/${record}/0`,
      sourceRecordRef: `record:${record}`,
      ...value,
    } as CanonicalGameEvent);
    const events: CanonicalGameEvent[] = [
      ...canonicalStartEvents(selfHand),
      event("tile_drawn", 2, {
        actor: 0,
        tile: { visibility: "visible", tile: canonicalTile("9p") },
        from: "live_wall",
      }),
      event("tile_discarded", 3, {
        actor: 0, tile: canonicalTile("9p"), discardMode: "tsumogiri",
        riichiDeclarationEventRef: null,
      }),
      event("tile_drawn", 4, {
        actor: 1, tile: { visibility: "hidden" }, from: "live_wall",
      }),
      event("riichi_declared", 5, { actor: 1 }),
      event("tile_discarded", 6, {
        actor: 1, tile: canonicalTile("9s"), discardMode: "tedashi",
        riichiDeclarationEventRef: "game:fixture/0/5/0",
      }),
      event("riichi_accepted", 7, {
        actor: 1, declarationEventRef: "game:fixture/0/5/0",
      }),
      ...[2, 3].flatMap((actor, index) => [
        event("tile_drawn", 8 + index * 2, {
          actor, tile: { visibility: "hidden" }, from: "live_wall",
        }),
        event("tile_discarded", 9 + index * 2, {
          actor, tile: canonicalTile(actor === 2 ? "8s" : "7s"),
          discardMode: "tedashi", riichiDeclarationEventRef: null,
        }),
      ]),
      event("tile_drawn", 12, {
        actor: 0,
        tile: { visibility: "visible", tile: canonicalTile("1m") },
        from: "live_wall",
      }),
      event("ankan_declared", 13, {
        actor: 0,
        tiles: [canonicalTile("1m"), canonicalTile("1m"),
          canonicalTile("1m"), canonicalTile("1m")],
      }),
      event("dora_revealed", 14, {
        indicator: canonicalTile("2s"), kanEventRef: "game:fixture/0/13/0",
      }),
      event("tile_drawn", 15, {
        actor: 0,
        tile: { visibility: "visible", tile: canonicalTile("5p") },
        from: "rinshan",
      }),
    ];
    const base = canonicalStream(events);
    const stream: CanonicalEventStream = {
      ...base,
      completeness: { ...base.completeness, ruleSet: "partial" },
      ruleSet: { ...base.ruleSet, ippatsuCancelledByAnkan: "unknown" },
    };
    expect(projectKnownGameFactsV2({
      stream,
      decisionWindow: {
        kind: "self_turn", actor: 0, triggerEventRef: "game:fixture/0/15/0",
      },
    }).defenseThreats[0]?.ippatsu).toEqual({
      status: "blocked_missing_facts",
    });
  });

  it("maps only complete canonical wind, riichi, and kuitan sources to known yaku context", () => {
    const complete = canonicalStream(canonicalSelfDrawDiscardEvents());
    const decisionWindow = {
      kind: "self_turn" as const,
      actor: 0,
      triggerEventRef: "game:fixture/0/2/0",
    };
    expect(projectKnownGameFactsV2({ stream: complete, decisionWindow }))
      .toMatchObject({
        handStructureYakuContext: {
          windsStatus: "known",
          roundWindTile34: 27,
          selfWindTile34: 27,
          riichiStatus: "inactive",
          openTanyaoStatus: "enabled",
        },
      });

    const incomplete = {
      ...complete,
      completeness: {
        ...complete.completeness,
        eventSequence: "partial" as const,
        ruleSet: "partial" as const,
      },
      ruleSet: {
        ...complete.ruleSet,
        openTanyao: "unknown" as const,
      },
    };
    expect(projectKnownGameFactsV2({ stream: incomplete, decisionWindow }))
      .toMatchObject({
        selfRiichi: false,
        handStructureYakuContext: {
          windsStatus: "unknown",
          roundWindTile34: null,
          selfWindTile34: null,
          riichiStatus: "unknown",
          openTanyaoStatus: "unknown",
        },
      });

    const disabled = {
      ...complete,
      ruleSet: { ...complete.ruleSet, openTanyao: false as const },
    };
    expect(projectKnownGameFactsV2({ stream: disabled, decisionWindow }))
      .toMatchObject({
        handStructureYakuContext: { openTanyaoStatus: "disabled" },
      });
  });

  it("keeps an explicit accepted riichi known when event sequence completeness is partial", () => {
    const stream = canonicalStream([
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
        tile: canonicalTile("5p"),
        discardMode: "tsumogiri",
        riichiDeclarationEventRef: "game:fixture/0/3/0",
      },
      {
        type: "riichi_accepted",
        eventId: "game:fixture/0/5/0",
        sourceRecordRef: "record:5",
        actor: 0,
        declarationEventRef: "game:fixture/0/3/0",
      },
      ...[1, 2, 3].flatMap((actor, index) => [{
        type: "tile_drawn" as const,
        eventId: `game:fixture/0/${6 + index * 2}/0`,
        sourceRecordRef: `record:${6 + index * 2}`,
        actor,
        tile: { visibility: "hidden" as const },
        from: "live_wall" as const,
      }, {
        type: "tile_discarded" as const,
        eventId: `game:fixture/0/${7 + index * 2}/0`,
        sourceRecordRef: `record:${7 + index * 2}`,
        actor,
        tile: canonicalTile(`${actor}z` as "1z" | "2z" | "3z"),
        discardMode: "tedashi" as const,
        riichiDeclarationEventRef: null,
      }]),
      {
        type: "tile_drawn",
        eventId: "game:fixture/0/12/0",
        sourceRecordRef: "record:12",
        actor: 0,
        tile: { visibility: "visible", tile: canonicalTile("6p") },
        from: "live_wall",
      },
    ]);
    const partial = {
      ...stream,
      completeness: {
        ...stream.completeness,
        eventSequence: "partial" as const,
      },
    };
    const projected = projectKnownGameFactsV2({
      stream: partial,
      decisionWindow: {
        kind: "self_turn",
        actor: 0,
        triggerEventRef: "game:fixture/0/12/0",
      },
    });

    expect(projected).toMatchObject({
      selfRiichi: true,
      handStructureYakuContext: {
        windsStatus: "unknown",
        riichiStatus: "accepted",
      },
    });
  });

  it("preserves the East 1 hand, river, threat and completeness facts", async () => {
    const raw = JSON.parse(await readFile(fixtureUrl, "utf8")) as RegressionFixture;
    const { selfActor, events, decisions } = importRegressionFixture(raw);
    const bridged = bridgeLegacyRegressionEvents(events, selfActor, {
      sourceKind: "fixture",
      gameId: "fixture:c1924cad66f66dd9",
    });
    expect(bridged.status).toBe("ready");
    if (bridged.status !== "ready") return;

    for (const decision of decisions) {
      const triggerEventRef = bridged
        .legacyEventRefToCanonicalEventRefs[decision.sceneEventId]?.[0];
      if (triggerEventRef === undefined) throw new Error("decision ref missing");
      const snapshot = freezeDecisionSnapshot(bridged.stream, {
        kind: "self_turn",
        actor: selfActor,
        triggerEventRef,
      });
      const projected = projectKnownGameFactsV2({
        stream: bridged.stream,
        decisionWindow: snapshot.privateState.decisionWindow,
        cachedSnapshot: snapshot,
      });
      const legacy = buildLegacyRegressionPipelineInput(
        events,
        decision,
        replayToDecision(events, decision, selfActor),
        { kind: "applied_decision" },
      ).facts;
      expect(legacy.provenance).toBe("raw_replay");
      const canonicalRef = (legacyRef: string): string => {
        const eventRef = bridged
          .legacyEventRefToCanonicalEventRefs[legacyRef]?.[0];
        if (eventRef === undefined) throw new Error(`legacy ref missing: ${legacyRef}`);
        return eventRef;
      };

      expect(projected).toMatchObject({
        provenance: "legacy_regression_bridge_only",
        actor: legacy.actor,
        selfRiichi: legacy.selfRiichi,
        decisionEventRef: canonicalRef(legacy.decisionEventRef),
        decisionWindow: {
          ...legacy.decisionWindow,
          triggerEventRef: canonicalRef(legacy.decisionWindow.triggerEventRef),
        },
        concealedTiles: legacy.concealedTiles,
        currentDraw: legacy.currentDraw === null ? null : {
          ...legacy.currentDraw,
          eventRef: canonicalRef(legacy.currentDraw.eventRef),
        },
        melds: legacy.melds.map((meld, index) => ({
          ...meld,
          meldRef: snapshot.publicState.melds[index]?.meldRef,
          calledDiscardEventRef: meld.calledDiscardEventRef === null ||
              meld.calledDiscardEventRef === undefined
            ? meld.calledDiscardEventRef
            : canonicalRef(meld.calledDiscardEventRef),
        })),
        doraIndicators: legacy.doraIndicators,
        rivers: legacy.rivers.map((river) => river.map((discard) => ({
          ...discard,
          eventId: canonicalRef(discard.eventId),
          afterRiichiEventIds: discard.afterRiichiEventIds.map(canonicalRef),
        }))),
        threats: legacy.threats.map((threat) => ({
          ...threat,
          declarationEventId: threat.declarationEventId === null
            ? null
            : canonicalRef(threat.declarationEventId),
        })),
        defenseThreats: [{
          actor: 2,
          kind: "riichi_accepted",
          source: "legacy_regression_bridge_only",
          sourceEventRefs: [canonicalRef("event-47"), canonicalRef("event-49")],
          openMeldRefs: [],
          dealerStatus: "non_dealer",
          riichiTurn: { status: "calculated", value: 6 },
          ippatsu: {
            status: "calculated",
            value: decision.decisionId === "east1-turn6",
          },
        }],
        roundWind: legacy.roundWind,
        seatWind: legacy.seatWind,
        dealer: legacy.dealer,
        remainingDraws: legacy.remainingDraws,
        completeness: {
          ...legacy.completeness,
          eventSequence: true,
          roundContext: true,
        },
      });
      expect(projected.evidenceIds).toEqual(snapshot.evidenceIds);
      expect(projected.factSetId).toContain(snapshot.streamPrefixHash);
      expect(projected.factSetId).toBe(
        `legacy-regression:${snapshot.streamPrefixHash}`,
      );
      if (decision.decisionId === "east1-turn7") {
        expect(projected.melds[0]?.meldRef).toBe(
          bridged.legacyEventRefToCanonicalEventRefs["event-58"]?.[0],
        );
      }
    }
  });

  it("keeps threat and fact-set provenance distinct for replay, fixture, and user sources", async () => {
    const raw = JSON.parse(await readFile(fixtureUrl, "utf8")) as RegressionFixture;
    const { selfActor, events } = importRegressionFixture(raw);
    const bridged = bridgeLegacyRegressionEvents(events, selfActor, {
      sourceKind: "fixture",
      gameId: "fixture:c1924cad66f66dd9",
    });
    if (bridged.status !== "ready") throw new Error(bridged.code);
    const triggerEventRef = bridged
      .legacyEventRefToCanonicalEventRefs["event-50"]?.[0];
    if (triggerEventRef === undefined) throw new Error("decision ref missing");
    const window = { kind: "self_turn" as const, actor: selfActor, triggerEventRef };

    for (const [sourceKind, source, factSetPrefix, provenance] of [
      ["fixture", "legacy_regression_bridge_only", "legacy-regression", "legacy_regression_bridge_only"],
      ["mjai", "canonical_replay", "canonical-v2", "raw_replay"],
      ["user_asserted", "user_asserted", "user-asserted", "user_asserted"],
    ] as const) {
      const stream: CanonicalEventStream = { ...bridged.stream, sourceKind };
      const snapshot = freezeDecisionSnapshot(stream, window);
      const facts = projectKnownGameFactsV2({ stream, decisionWindow: window });
      expect(facts.provenance).toBe(provenance);
      expect(facts.factSetId).toBe(`${factSetPrefix}:${snapshot.streamPrefixHash}`);
      expect(facts.defenseThreats[0]?.source).toBe(source);
    }
  });

  it("fails closed when a legacy regression scene cites an absent riichi declaration", async () => {
    const raw = JSON.parse(await readFile(fixtureUrl, "utf8")) as RegressionFixture;
    const { selfActor, events, decisions } = importRegressionFixture(raw);
    const decision = decisions[0]!;
    const scene = replayToDecision(events, decision, selfActor);
    const inconsistent = {
      ...scene,
      threats: scene.threats.map((threat) => threat.actor === 2
        ? { ...threat, declarationEventId: "event-missing-riichi" }
        : threat),
    };
    expect(() => buildLegacyRegressionPipelineInput(
      events,
      decision,
      inconsistent,
      { kind: "applied_decision" },
    )).toThrow("legacy regression riichi declaration is absent");
  });

  it("rejects cached snapshots whose state, hash, or evidence was tampered", async () => {
    const raw = JSON.parse(await readFile(fixtureUrl, "utf8")) as RegressionFixture;
    const { selfActor, events } = importRegressionFixture(raw);
    const bridged = bridgeLegacyRegressionEvents(events, selfActor, {
      sourceKind: "fixture",
      gameId: "fixture:c1924cad66f66dd9",
    });
    if (bridged.status !== "ready") throw new Error(bridged.code);
    const triggerEventRef = bridged
      .legacyEventRefToCanonicalEventRefs["event-50"]?.[0];
    if (triggerEventRef === undefined) throw new Error("decision ref missing");
    const window = {
      kind: "self_turn" as const,
      actor: selfActor,
      triggerEventRef,
    };
    const frozen = freezeDecisionSnapshot(bridged.stream, window);
    const mutations = [
      {
        ...frozen,
        streamPrefixHash: "sha256:forged",
      },
      {
        ...frozen,
        privateState: {
          ...frozen.privateState,
          concealedTiles: frozen.privateState.concealedTiles.slice(1),
        },
      },
      {
        ...frozen,
        evidenceIds: frozen.evidenceIds.slice(0, -1),
      },
    ];

    for (const cachedSnapshot of mutations) {
      expect(() => projectKnownGameFactsV2({
        stream: bridged.stream,
        decisionWindow: window,
        cachedSnapshot,
      })).toThrow("decision_snapshot_verification_failed");
    }
  });

  it("preserves user-asserted provenance instead of upgrading it to replay", () => {
    const stream = canonicalStream(canonicalSelfDrawDiscardEvents());
    const asserted = { ...stream, sourceKind: "user_asserted" as const };
    const decisionWindow = {
      kind: "self_turn" as const,
      actor: 0,
      triggerEventRef: "game:fixture/0/2/0",
    };
    expect(projectKnownGameFactsV2({ stream: asserted, decisionWindow }))
      .toMatchObject({ provenance: "user_asserted" });
  });

  it("projects the exact canonical self river only when river markers are complete", () => {
    const stream = canonicalStream(canonicalSelfDrawDiscardEvents());
    const decisionWindow = {
      kind: "self_turn" as const,
      actor: 0,
      triggerEventRef: "game:fixture/0/2/0",
    };
    expect(projectKnownGameFactsV2({ stream, decisionWindow }).furitenSelfRiver)
      .toEqual([]);

    const incomplete = {
      ...stream,
      completeness: {
        ...stream.completeness,
        calledDiscardMarkers: "partial" as const,
      },
    };
    expect(projectKnownGameFactsV2({ stream: incomplete, decisionWindow }))
      .not.toHaveProperty("furitenSelfRiver");

    const incompleteSequence = {
      ...stream,
      completeness: {
        ...stream.completeness,
        eventSequence: "partial" as const,
      },
    };
    expect(projectKnownGameFactsV2({
      stream: incompleteSequence,
      decisionWindow,
    })).not.toHaveProperty("furitenSelfRiver");
  });
});
