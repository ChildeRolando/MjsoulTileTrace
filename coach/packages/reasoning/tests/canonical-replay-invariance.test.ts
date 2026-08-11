import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
  CanonicalEventStream,
  CanonicalGameEvent,
  KnownGameFacts,
} from "@riichi-coach/contracts";
import {
  canonicalActionRef,
  CurrentSceneFrameSchema,
  ResponseFuritenAnalysisV2Schema,
  StructuredComparisonSetSchema,
} from "@riichi-coach/contracts";
import type { RegressionFixture } from "../src/import/mortal-report.js";
import {
  freezeDecisionSnapshot,
  importRegressionFixture,
  projectKnownGameFactsV2,
  reduceCanonicalEventStream,
  JsonlFactEngineClient,
  ManagedFactEngineTransport,
  runStructuredFactorPipeline,
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
const resourcesUrl = new URL("../../../resources/", import.meta.url);

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
  async function runEndToEndDefense(
    current: Awaited<ReturnType<typeof replay>>,
    stream: CanonicalEventStream,
    decision: Awaited<ReturnType<typeof replay>>["decisions"][number],
  ): Promise<Awaited<ReturnType<typeof runStructuredFactorPipeline>>> {
    const facts = factsFor(current, stream, decision);
    const actual = legacyDiscardActionIdToAction(decision.actualAction);
    const model = legacyDiscardActionIdToAction(decision.modelAction);
    const actualRef = canonicalActionRef(actual);
    const modelRef = canonicalActionRef(model);
    const comparisonSet = StructuredComparisonSetSchema.parse({
      comparisonSetId: `e2e:${decision.decisionId}:${facts.factSetId}`,
      origin: "automatic_review",
      decisionLayerRef: `e2e:${decision.decisionId}:decision-layer`,
      decisionWindow: facts.decisionWindow,
      candidates: [
        { actionRef: actualRef, action: actual, origins: ["actual", "model"] },
        { actionRef: modelRef, action: model, origins: ["model"] },
      ],
    });
    const frame = CurrentSceneFrameSchema.parse({
      kind: "current_scene",
      frameId: `e2e:${decision.decisionId}:frame`,
      scope: { kind: "applied_decision" },
      sceneRef: facts.decisionEventRef,
      facts: [{ factId: facts.factSetId, provenance: "raw_replay" }],
    });
    const responseFuriten = ResponseFuritenAnalysisV2Schema.parse({
      binding: {
        source: "unavailable",
        factSetId: facts.factSetId,
        decisionEventRef: facts.decisionEventRef,
        selfActor: facts.actor,
        reason: "response_history_not_provided",
        engineIdentityStatus: "unknown",
        engineIdentity: null,
      },
      temporary: {
        status: "unknown",
        unknownReason: "response_history_not_provided",
        evidenceIds: [],
        analysisRefs: [],
        riichiAcceptanceEventRef: null,
      },
      riichi: {
        status: "unknown",
        unknownReason: "response_history_not_provided",
        evidenceIds: [],
        analysisRefs: [],
        riichiAcceptanceEventRef: null,
      },
    });
    const engine = new JsonlFactEngineClient(
      new ManagedFactEngineTransport(fileURLToPath(resourcesUrl)),
    );
    try {
      return await runStructuredFactorPipeline({
        frame,
        comparisonSet,
        facts,
        responseFuriten,
        engine,
      });
    } finally {
      await engine.close();
    }
  }

  function expectPreferenceUsesOnlyDeterministicDifferences(
    result: Awaited<ReturnType<typeof runStructuredFactorPipeline>>,
  ): void {
    const structuralDimension =
      /^helper_(?:risk_scale|classifications|honor):actor[0-3]$/u;
    const deterministicIds = new Set(
      result.differences.deterministic.map((entry) => entry.differenceId),
    );
    const heuristicIds = new Set(
      result.differences.heuristic.map((entry) => entry.differenceId),
    );
    const structuralDefense = result.differences.heuristic.filter((entry) =>
      entry.axis === "defense" &&
      structuralDimension.test(entry.dimension)
    );
    expect(structuralDefense.length).toBeGreaterThan(0);
    expect(structuralDefense.every((entry) =>
      entry.preferenceEligibility === "heuristic_only"
    )).toBe(true);
    expect(result.differences.deterministic.filter((entry) =>
      (entry.axis === "defense" && structuralDimension.test(entry.dimension)) ||
      entry.evidenceClass === "versioned_upstream_estimate"
    )).toEqual([]);
    for (const differenceId of
      result.deterministicPreference?.decisiveDifferenceIds ?? []) {
      expect(deterministicIds.has(differenceId)).toBe(true);
      expect(heuristicIds.has(differenceId)).toBe(false);
    }
  }

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
    // The threat row itself and the structural status are unchanged; only the
    // evidence that pointed at the rewritten discard disappears.
    expect(matrix.cells[0]?.threat).toMatchObject({
      actor: 2,
      kind: "riichi_accepted",
      source: "legacy_regression_bridge_only",
    });
    expect(matrix.cells[0]?.structural.status).toBe("blocked_missing_facts");
    expect(JSON.stringify(matrix)).not.toContain(mappedRef(current, "event-39"));
  });

  it("rebinds a deleted supporting discard through the full factor pipeline", async () => {
    const current = await replay();
    const decision = current.decisions[1]!;
    const safeActionRef = canonicalActionRef(
      legacyDiscardActionIdToAction(decision.modelAction),
    );
    const supportingDiscardRef = mappedRef(current, "event-39");
    // Remove the complete four-player rotation containing the support so the
    // canonical phase/actor sequence stays valid while the 8p river fact is
    // genuinely absent rather than merely ignored by the matrix builder.
    const removedRotation = new Set(
      Array.from({ length: 8 }, (_, offset) =>
        mappedRef(current, `event-${38 + offset}`)
      ),
    );
    const deleted = structuredClone(current.stream);
    deleted.events = deleted.events.filter((event) =>
      !removedRotation.has(event.eventId)
    );
    const before = await runEndToEndDefense(
      current,
      current.stream,
      decision,
    );
    const after = await runEndToEndDefense(current, deleted, decision);

    const beforeMatrix = before.defenseMatrices.find((matrix) =>
      matrix.actionRef === safeActionRef
    );
    const afterMatrix = after.defenseMatrices.find((matrix) =>
      matrix.actionRef === safeActionRef
    );
    const beforeCell = beforeMatrix?.cells.find((cell) =>
      cell.threat.actor === 2
    );
    const afterCell = afterMatrix?.cells.find((cell) =>
      cell.threat.actor === 2
    );

    expect(beforeCell?.deterministicSafety).toEqual({
      status: "calculated",
      genbutsu: true,
      evidenceRefs: [{
        role: "threat_own_discard",
        eventRef: supportingDiscardRef,
      }],
    });
    expect(afterCell?.deterministicSafety).toEqual({
      status: "calculated",
      genbutsu: false,
      evidenceRefs: [],
    });
    expect(beforeCell?.structural.status).toBe("calculated");
    expect(afterCell?.structural.status).toBe("calculated");
    if (
      beforeCell?.structural.status !== "calculated" ||
      afterCell?.structural.status !== "calculated"
    ) throw new Error("packaged sidecar did not calculate structural risk");
    expect(beforeCell.structural.visibility.safeTiles34[16]).toBe(true);
    expect(afterCell.structural.visibility.safeTiles34[16]).toBe(false);
    expect(afterCell.structural.evidenceIds).not.toContain(supportingDiscardRef);
    expect(afterCell.structural.stateHash)
      .not.toBe(beforeCell.structural.stateHash);
    expect(afterCell.structural.requestId).toBe(
      `${afterMatrix?.factSetId}:risk:2:${afterCell.structural.stateHash}`,
    );
    expect(JSON.stringify(afterMatrix)).not.toContain(supportingDiscardRef);

    // Removing deterministic evidence may remove a defense conflict, but the
    // packaged helper's structural estimate itself never becomes decisive.
    expect(before.deterministicPreference).toBeNull();
    expectPreferenceUsesOnlyDeterministicDifferences(before);
    expectPreferenceUsesOnlyDeterministicDifferences(after);
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

  it("rebinds every structural row when riichi moves actors through the full pipeline", async () => {
    const current = await replay();
    const decision = current.decisions[0]!;
    const moved = moveRiichiToActorZero(current);
    const result = await runEndToEndDefense(current, moved, decision);
    const actualActionRef = canonicalActionRef(
      legacyDiscardActionIdToAction(decision.actualAction),
    );
    const modelActionRef = canonicalActionRef(
      legacyDiscardActionIdToAction(decision.modelAction),
    );
    const actorTwoDeclarationRef = mappedRef(current, "event-47");
    const actorTwoDiscardRef = mappedRef(current, "event-48");
    const actorTwoAcceptanceRef = mappedRef(current, "event-49");
    const movedDeclaration = moved.events.find((event) =>
      event.type === "riichi_declared" && event.actor === 0
    );
    const movedAcceptance = moved.events.find((event) =>
      event.type === "riichi_accepted" && event.actor === 0
    );
    if (movedDeclaration === undefined || movedAcceptance === undefined) {
      throw new Error("moved actor 0 riichi evidence is missing");
    }

    expect(result.defenseMatrices).toHaveLength(2);
    for (const matrix of result.defenseMatrices) {
      expect(matrix.cells.map((cell) => cell.threat.actor)).toEqual([0]);
      const cell = matrix.cells[0]!;
      expect(cell.threat.sourceEventRefs).toEqual([
        movedDeclaration.eventId,
        movedAcceptance.eventId,
      ]);
      expect(cell.structural.status).toBe("calculated");
      if (cell.structural.status !== "calculated") {
        throw new Error("packaged sidecar did not calculate moved threat risk");
      }
      expect(cell.structural.threatActor).toBe(0);
      expect(cell.structural.actionRef).toBe(matrix.actionRef);
      expect(cell.structural.requestId).toBe(
        `${matrix.factSetId}:risk:0:${cell.structural.stateHash}`,
      );
      expect(cell.structural.evidenceIds).toContain(movedDeclaration.eventId);
      expect(cell.structural.evidenceIds).toContain(movedAcceptance.eventId);
      expect(cell.threat.sourceEventRefs).not.toContain(actorTwoDeclarationRef);
      expect(cell.threat.sourceEventRefs).not.toContain(actorTwoAcceptanceRef);
      if (matrix.actionRef === actualActionRef) {
        expect(cell.deterministicSafety).toEqual({
          status: "calculated",
          genbutsu: false,
          evidenceRefs: [],
        });
      } else {
        expect(matrix.actionRef).toBe(modelActionRef);
        expect(cell.deterministicSafety).toEqual({
          status: "blocked_missing_facts",
          evidenceRefs: [],
        });
      }
      expect("evidenceRefs" in cell.deterministicSafety
        ? cell.deterministicSafety.evidenceRefs.map((entry) => entry.eventRef)
        : []).not.toContain(actorTwoDiscardRef);
      // The old actor 2 discard remains legitimate public visibility, but is
      // no longer treated as threat-source or genbutsu evidence for actor 0.
      expect(cell.structural.evidenceIds).toContain(actorTwoDiscardRef);
    }
    expectPreferenceUsesOnlyDeterministicDifferences(result);
  });
});
