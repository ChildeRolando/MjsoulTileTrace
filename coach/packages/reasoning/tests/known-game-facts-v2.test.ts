import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { RegressionFixture } from "../src/import/mortal-report.js";
import {
  canonicalSelfDrawDiscardEvents,
  canonicalStream,
} from "./fixtures/canonical-stream.js";
import {
  buildLegacyRegressionPipelineInput,
  freezeDecisionSnapshot,
  importRegressionFixture,
  projectKnownGameFactsV2,
  replayToDecision,
} from "../src/index.js";
import { bridgeLegacyRegressionEvents } from "../src/import/legacy-event-stream-bridge.js";

const fixtureUrl = new URL(
  "../../../fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json",
  import.meta.url,
);

describe("V2 snapshot to KnownGameFacts projection", () => {
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
        completeness: legacy.completeness,
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
});
