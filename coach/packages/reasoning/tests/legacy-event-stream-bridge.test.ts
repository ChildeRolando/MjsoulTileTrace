import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { RegressionFixture } from "../src/import/mortal-report.js";
import {
  freezeDecisionSnapshot,
  importRegressionFixture,
} from "../src/index.js";
import { bridgeLegacyRegressionEvents } from "../src/import/legacy-event-stream-bridge.js";

const fixtureUrl = new URL(
  "../../../fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json",
  import.meta.url,
);

async function fixture() {
  const raw = JSON.parse(await readFile(fixtureUrl, "utf8")) as RegressionFixture;
  return importRegressionFixture(raw);
}

describe("fixture-only legacy event stream bridge", () => {
  it("replays East 1 turns 6 and 7 as canonical decision snapshots", async () => {
    const imported = await fixture();
    const bridged = bridgeLegacyRegressionEvents(
      imported.events,
      imported.selfActor,
      { sourceKind: "fixture", gameId: "fixture:c1924cad66f66dd9" },
    );
    expect(bridged.status).toBe("ready");
    if (bridged.status !== "ready") return;
    expect(bridged.provenance).toBe("legacy_regression_bridge_only");
    expect(bridged.legacyEventRefToCanonicalEventRefs["event-50"]).toEqual([
      "fixture:c1924cad66f66dd9/0/50/0",
    ]);
    expect(bridged.stream.events.every((event) =>
      event.eventId.startsWith("fixture:c1924cad66f66dd9/0/")
    )).toBe(true);

    const turn6Ref = bridged.legacyEventRefToCanonicalEventRefs["event-50"]?.[0];
    const turn7Ref = bridged.legacyEventRefToCanonicalEventRefs["event-62"]?.[0];
    if (turn6Ref === undefined || turn7Ref === undefined) {
      throw new Error("fixture decision refs missing");
    }

    const turn6 = freezeDecisionSnapshot(bridged.stream, {
      kind: "self_turn",
      actor: imported.selfActor,
      triggerEventRef: turn6Ref,
    });
    const turn7 = freezeDecisionSnapshot(bridged.stream, {
      kind: "self_turn",
      actor: imported.selfActor,
      triggerEventRef: turn7Ref,
    });

    expect(turn6.privateState.currentDraw?.tile.id).toBe("6s");
    expect(turn6.publicState.riichiStates[2]).toMatchObject({
      status: "accepted",
      ippatsuAlive: true,
    });
    expect(turn7.privateState.currentDraw?.tile.id).toBe("8p");
    expect(turn7.publicState.riichiStates[2]?.ippatsuAlive).toBe(false);
    expect(turn6.publicState.scores).toEqual([25000, 25000, 24000, 25000]);
  });

  it("rejects non-fixture callers and malformed legacy streams with codes", async () => {
    const imported = await fixture();
    expect(bridgeLegacyRegressionEvents(
      imported.events,
      imported.selfActor,
      { sourceKind: "mjai", gameId: "not-a-fixture" },
    )).toEqual({
      status: "invalid_source",
      code: "legacy_bridge_fixture_only",
    });
    expect(bridgeLegacyRegressionEvents(
      imported.events.slice(1),
      imported.selfActor,
      { sourceKind: "fixture", gameId: "malformed" },
    )).toEqual({
      status: "invalid_source",
      code: "legacy_stream_missing_game_start",
    });

    const invalidSequence = structuredClone(imported.events);
    const firstDraw = invalidSequence.find((event) => event.type === "tsumo");
    if (firstDraw?.type !== "tsumo") throw new Error("fixture draw missing");
    firstDraw.actor = 1;
    expect(bridgeLegacyRegressionEvents(
      invalidSequence,
      imported.selfActor,
      { sourceKind: "fixture", gameId: "invalid-sequence" },
    )).toEqual({
      status: "invalid_source",
      code: "legacy_stream_sequence_invalid",
    });
  });
});
