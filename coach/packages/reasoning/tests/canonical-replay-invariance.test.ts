import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type {
  CanonicalEventStream,
  CanonicalGameEvent,
  KnownGameFacts,
} from "@riichi-coach/contracts";
import { canonicalActionRef } from "@riichi-coach/contracts";
import type { RegressionFixture } from "../src/import/mortal-report.js";
import {
  freezeDecisionSnapshot,
  importRegressionFixture,
  projectKnownGameFactsV2,
  reduceCanonicalEventStream,
} from "../src/index.js";
import { bridgeLegacyRegressionEvents } from "../src/import/legacy-event-stream-bridge.js";
import { buildDeterministicDefenseMatrix } from
  "../src/factors/defense-matrix.js";
import { legacyDiscardActionIdToAction } from
  "../src/candidate/legacy-action-bridge.js";

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

describe("East 1 defense matrix replay invariants", () => {
  async function replay() {
    const raw = JSON.parse(await readFile(fixtureUrl, "utf8")) as RegressionFixture;
    const imported = importRegressionFixture(raw);
    const bridged = bridgeLegacyRegressionEvents(imported.events, imported.selfActor, {
      sourceKind: "fixture",
      gameId: "fixture:c1924cad66f66dd9",
    });
    if (bridged.status !== "ready") throw new Error(bridged.code);
    return {
      ...bridged,
      selfActor: imported.selfActor,
      decisions: imported.decisions,
    };
  }

  function factsFor(
    current: Awaited<ReturnType<typeof replay>>,
    stream: CanonicalEventStream,
    decision: { sceneEventId: string },
  ): KnownGameFacts {
    const triggerEventRef = mappedRef(current, decision.sceneEventId);
    const snap = freezeDecisionSnapshot(stream, {
      kind: "self_turn",
      actor: current.selfActor,
      triggerEventRef,
    });
    return projectKnownGameFactsV2({
      stream,
      decisionWindow: snap.privateState.decisionWindow,
      cachedSnapshot: snap,
    });
  }

  function matrixFor(facts: KnownGameFacts, modelActionId: string) {
    const action = legacyDiscardActionIdToAction(modelActionId);
    const actionRef = canonicalActionRef(action);
    return buildDeterministicDefenseMatrix({
      candidate: { actionRef, action, origins: ["model"] },
      facts,
    });
  }

  function cellFor(
    matrix: ReturnType<typeof buildDeterministicDefenseMatrix>,
    actor: number,
  ) {
    const cell = matrix.cells.find((entry) => entry.threat.actor === actor);
    if (cell === undefined) throw new Error(`missing actor ${actor}`);
    return cell;
  }

  it("binds East 1 genbutsu to the exact supporting river discard", async () => {
    const current = await replay();
    const turn6 = matrixFor(
      factsFor(current, current.stream, current.decisions[0]!),
      current.decisions[0]!.modelAction,
    );
    const turn7 = matrixFor(
      factsFor(current, current.stream, current.decisions[1]!),
      current.decisions[1]!.modelAction,
    );

    expect(turn6.cells.map((cell) => cell.threat.actor)).toEqual([2]);
    expect(cellFor(turn6, 2).deterministicSafety).toEqual({
      status: "calculated",
      genbutsu: true,
      evidenceRefs: [{
        role: "threat_own_discard",
        eventRef: mappedRef(current, "event-48"),
      }],
    });
    expect(cellFor(turn7, 2).deterministicSafety).toEqual({
      status: "calculated",
      genbutsu: true,
      evidenceRefs: [{
        role: "threat_own_discard",
        eventRef: mappedRef(current, "event-39"),
      }],
    });
  });

  it("changes only the dependent genbutsu cell when one river discard is rewritten", async () => {
    const current = await replay();
    const stream = structuredClone(current.stream);
    stream.events = stream.events.flatMap((event): CanonicalGameEvent[] => {
      if (event.eventId !== mappedRef(current, "event-39")) return [event];
      if (event.type !== "tile_discarded") {
        throw new Error("expected the supporting 8p discard");
      }
      return [{ ...event, tile: { id: "9p", red: false } }];
    });
    const matrix = matrixFor(
      factsFor(current, stream, current.decisions[1]!),
      current.decisions[1]!.modelAction,
    );

    expect(cellFor(matrix, 2).deterministicSafety).toEqual({
      status: "calculated",
      genbutsu: false,
      evidenceRefs: [],
    });
  });

  it("relocates the matrix row when the riichi moves to another actor without stale evidence", async () => {
    const current = await replay();
    const moved = moveRiichiToActorZero(current);
    const matrix = matrixFor(
      factsFor(current, moved, current.decisions[0]!),
      current.decisions[0]!.modelAction,
    );

    expect(matrix.cells.map((cell) => cell.threat.actor)).toEqual([0]);
    expect(matrix.cells[0]?.threat.kind).toBe("riichi_accepted");
    expect(matrix.cells[0]?.deterministicSafety.status)
      .toBe("blocked_missing_facts");
    expect(JSON.stringify(matrix)).not.toContain(mappedRef(current, "event-48"));
  });
});
