import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { RegressionFixture } from "../src/import/mortal-report.js";
import {
  bridgeLegacyRegressionEvents,
  buildLegacyRegressionPipelineInput,
  freezeDecisionSnapshot,
  importRegressionFixture,
  projectKnownGameFactsV2,
  replayToDecision,
} from "../src/index.js";

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
      const snapshot = freezeDecisionSnapshot(bridged.stream, {
        kind: "self_turn",
        actor: selfActor,
        triggerEventRef: decision.sceneEventId,
      });
      const projected = projectKnownGameFactsV2(snapshot);
      const legacy = buildLegacyRegressionPipelineInput(
        events,
        decision,
        replayToDecision(events, decision, selfActor),
        { kind: "applied_decision" },
      ).facts;

      expect(projected).toMatchObject({
        provenance: "raw_replay",
        actor: legacy.actor,
        selfRiichi: legacy.selfRiichi,
        decisionEventRef: legacy.decisionEventRef,
        decisionWindow: legacy.decisionWindow,
        concealedTiles: legacy.concealedTiles,
        currentDraw: legacy.currentDraw,
        melds: legacy.melds.map((meld, index) => ({
          ...meld,
          meldRef: snapshot.publicState.melds[index]?.meldRef,
        })),
        doraIndicators: legacy.doraIndicators,
        rivers: legacy.rivers,
        threats: legacy.threats,
        roundWind: legacy.roundWind,
        seatWind: legacy.seatWind,
        dealer: legacy.dealer,
        remainingDraws: legacy.remainingDraws,
        completeness: legacy.completeness,
      });
      expect(projected.evidenceIds).toEqual(snapshot.evidenceIds);
      expect(projected.factSetId).toContain(snapshot.streamPrefixHash);
      if (decision.decisionId === "east1-turn7") {
        expect(projected.melds[0]?.meldRef).toBe("event-58");
      }
    }
  });
});
