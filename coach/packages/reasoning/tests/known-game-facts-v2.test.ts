import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { RegressionFixture } from "../src/import/mortal-report.js";
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
      if (decision.decisionId === "east1-turn7") {
        expect(projected.melds[0]?.meldRef).toBe(
          bridged.legacyEventRefToCanonicalEventRefs["event-58"]?.[0],
        );
      }
    }
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
