import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type {
  CanonicalEventStream,
  CanonicalGameEvent,
} from "@riichi-coach/contracts";
import type { RegressionFixture } from "../src/import/mortal-report.js";
import {
  freezeDecisionSnapshot,
  importRegressionFixture,
  projectKnownGameFactsV2,
  reduceCanonicalEventStream,
} from "../src/index.js";
import { bridgeLegacyRegressionEvents } from "../src/import/legacy-event-stream-bridge.js";

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

async function fixtureReplay() {
  const raw = JSON.parse(await readFile(fixtureUrl, "utf8")) as RegressionFixture;
  const imported = importRegressionFixture(raw);
  const bridged = bridgeLegacyRegressionEvents(
    imported.events,
    imported.selfActor,
    { sourceKind: "fixture", gameId: "fixture:c1924cad66f66dd9" },
  );
  if (bridged.status !== "ready") throw new Error(bridged.code);
  return bridged;
}

function mappedRef(
  replay: Awaited<ReturnType<typeof fixtureReplay>>,
  legacyEventRef: string,
): string {
  const eventRef = replay.legacyEventRefToCanonicalEventRefs[legacyEventRef]?.[0];
  if (eventRef === undefined) throw new Error(`missing ref: ${legacyEventRef}`);
  return eventRef;
}

function snapshot(replay: Awaited<ReturnType<typeof fixtureReplay>>) {
  return freezeDecisionSnapshot(replay.stream, {
    kind: "self_turn",
    actor: 3,
    triggerEventRef: mappedRef(replay, "event-50"),
  });
}

function withoutActorTwoRiichi(
  replay: Awaited<ReturnType<typeof fixtureReplay>>,
): CanonicalEventStream {
  const stream = replay.stream;
  const copy = structuredClone(stream);
  const declarationRef = mappedRef(replay, "event-47");
  const discardRef = mappedRef(replay, "event-48");
  const acceptanceRef = mappedRef(replay, "event-49");
  copy.events = copy.events.flatMap((event): CanonicalGameEvent[] => {
    if (event.eventId === declarationRef || event.eventId === acceptanceRef) return [];
    if (event.eventId === discardRef && event.type === "tile_discarded") {
      return [{ ...event, riichiDeclarationEventRef: null }];
    }
    return [event];
  });
  return copy;
}

function moveRiichiToActorZero(
  replay: Awaited<ReturnType<typeof fixtureReplay>>,
): CanonicalEventStream {
  const copy = withoutActorTwoRiichi(replay);
  const events: CanonicalGameEvent[] = [];
  const actorZeroDiscardRef = mappedRef(replay, "event-43");
  const sourcePrefix = actorZeroDiscardRef.slice(0, actorZeroDiscardRef.lastIndexOf("/") + 1);
  const declarationRef = `${sourcePrefix}0`;
  const transformedDiscardRef = `${sourcePrefix}1`;
  const acceptanceRef = `${sourcePrefix}2`;
  for (const event of copy.events) {
    if (event.eventId === actorZeroDiscardRef && event.type === "tile_discarded") {
      events.push({
        type: "riichi_declared",
        eventId: declarationRef,
        sourceRecordRef: event.sourceRecordRef,
        actor: 0,
      });
      events.push({
        ...event,
        eventId: transformedDiscardRef,
        riichiDeclarationEventRef: declarationRef,
      });
      events.push({
        type: "riichi_accepted",
        eventId: acceptanceRef,
        sourceRecordRef: event.sourceRecordRef,
        actor: 0,
        declarationEventRef: declarationRef,
      });
    } else {
      events.push(event);
    }
  }
  const decisionIndex = events.findIndex((event) =>
    event.eventId === mappedRef(replay, "event-50")
  );
  copy.events = events.slice(0, decisionIndex + 1);
  return copy;
}

describe("canonical replay invariants", () => {
  it("is stable across a JSON round trip", async () => {
    const stream = await fixtureStream();
    expect(reduceCanonicalEventStream(JSON.parse(JSON.stringify(stream))))
      .toEqual(reduceCanonicalEventStream(stream));
  });

  it("does not let model evaluation data alter replay facts", async () => {
    const replay = await fixtureReplay();
    const frozen = snapshot(replay);
    const stream = replay.stream;
    const factsFrom = (input: { snapshot: typeof frozen; modelEvaluation?: unknown }) =>
      projectKnownGameFactsV2({
        stream,
        decisionWindow: input.snapshot.privateState.decisionWindow,
        cachedSnapshot: input.snapshot,
      });
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
    const replay = await fixtureReplay();
    const removed = freezeDecisionSnapshot(withoutActorTwoRiichi(replay), {
      kind: "self_turn",
      actor: 3,
      triggerEventRef: mappedRef(replay, "event-50"),
    });
    const changed = freezeDecisionSnapshot(moveRiichiToActorZero(replay), {
      kind: "self_turn",
      actor: 3,
      triggerEventRef: mappedRef(replay, "event-50"),
    });

    expect(removed.publicState.riichiStates[2]?.status).toBe("none");
    expect(changed.publicState.riichiStates[0]?.status).toBe("accepted");
    expect(changed.publicState.riichiStates[2]?.status).toBe("none");
  });

  it("never serializes opponent concealed information", async () => {
    const frozen = snapshot(await fixtureReplay());
    expect(JSON.stringify(frozen)).not.toContain("opponentConcealed");
    expect(JSON.stringify(frozen)).not.toContain("opponent_concealed");
  });
});
