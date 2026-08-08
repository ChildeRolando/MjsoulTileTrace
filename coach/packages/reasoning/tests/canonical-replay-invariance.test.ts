import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type {
  CanonicalEventStream,
  CanonicalGameEvent,
} from "@riichi-coach/contracts";
import type { RegressionFixture } from "../src/import/mortal-report.js";
import {
  bridgeLegacyRegressionEvents,
  freezeDecisionSnapshot,
  importRegressionFixture,
  projectKnownGameFactsV2,
  reduceCanonicalEventStream,
} from "../src/index.js";

const fixtureUrl = new URL(
  "../../../fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json",
  import.meta.url,
);

async function fixtureStream(): Promise<CanonicalEventStream> {
  const raw = JSON.parse(await readFile(fixtureUrl, "utf8")) as RegressionFixture;
  const imported = importRegressionFixture(raw);
  const bridged = bridgeLegacyRegressionEvents(
    imported.events,
    imported.selfActor,
    { sourceKind: "fixture", gameId: "fixture:c1924cad66f66dd9" },
  );
  if (bridged.status !== "ready") throw new Error(bridged.code);
  return bridged.stream;
}

function snapshot(stream: CanonicalEventStream) {
  return freezeDecisionSnapshot(stream, {
    kind: "self_turn",
    actor: 3,
    triggerEventRef: "event-50",
  });
}

function withoutActorTwoRiichi(stream: CanonicalEventStream): CanonicalEventStream {
  const copy = structuredClone(stream);
  copy.events = copy.events.flatMap((event): CanonicalGameEvent[] => {
    if (event.eventId === "event-47" || event.eventId === "event-49") return [];
    if (event.eventId === "event-48" && event.type === "tile_discarded") {
      return [{ ...event, riichiDeclarationEventRef: null }];
    }
    return [event];
  });
  return copy;
}

function moveRiichiToActorOne(stream: CanonicalEventStream): CanonicalEventStream {
  const copy = withoutActorTwoRiichi(stream);
  const events: CanonicalGameEvent[] = [];
  for (const event of copy.events) {
    if (event.eventId === "event-45" && event.type === "tile_discarded") {
      events.push({
        type: "riichi_declared",
        eventId: "transform-riichi-declared",
        sourceRecordRef: "transform:riichi-declared",
        actor: 1,
      });
      events.push({
        ...event,
        riichiDeclarationEventRef: "transform-riichi-declared",
      });
      events.push({
        type: "riichi_accepted",
        eventId: "transform-riichi-accepted",
        sourceRecordRef: "transform:riichi-accepted",
        actor: 1,
        declarationEventRef: "transform-riichi-declared",
      });
    } else {
      events.push(event);
    }
  }
  copy.events = events;
  return copy;
}

describe("canonical replay invariants", () => {
  it("is stable across a JSON round trip", async () => {
    const stream = await fixtureStream();
    expect(reduceCanonicalEventStream(JSON.parse(JSON.stringify(stream))))
      .toEqual(reduceCanonicalEventStream(stream));
  });

  it("does not let model evaluation data alter replay facts", async () => {
    const frozen = snapshot(await fixtureStream());
    const factsFrom = (input: { snapshot: typeof frozen; modelEvaluation?: unknown }) =>
      projectKnownGameFactsV2(input.snapshot);
    const withoutModel = factsFrom({ snapshot: frozen });
    const withModel = factsFrom({
      snapshot: frozen,
      modelEvaluation: {
        engineId: "mortal",
        preferredActionRef: "untrusted:model-choice",
      },
    });
    expect(withModel).toEqual(withoutModel);
  });

  it("derives riichi threats only from transformed replay events", async () => {
    const stream = await fixtureStream();
    const removed = snapshot(withoutActorTwoRiichi(stream));
    const changed = snapshot(moveRiichiToActorOne(stream));

    expect(removed.publicState.riichiStates[2]?.status).toBe("none");
    expect(changed.publicState.riichiStates[1]?.status).toBe("accepted");
    expect(changed.publicState.riichiStates[2]?.status).toBe("none");
  });

  it("never serializes opponent concealed information", async () => {
    const frozen = snapshot(await fixtureStream());
    expect(JSON.stringify(frozen)).not.toContain("opponentConcealed");
    expect(JSON.stringify(frozen)).not.toContain("opponent_concealed");
  });
});
