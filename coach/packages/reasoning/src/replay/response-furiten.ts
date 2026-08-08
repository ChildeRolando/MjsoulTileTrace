import {
  ActionRefSchema,
  CanonicalEventStreamSchema,
  HandStructureResultV2Schema,
  type CanonicalEventStream,
  type CanonicalGameEvent,
  type CanonicalMeldV2,
  type FuritenStateV2,
  type HandStructureRequestV2,
  type HandStructureResultV2,
  type KnownMeld,
  type YakuContextV2,
} from "@riichi-coach/contracts";
import type { HandStructureFactEnginePort } from "../fact-engine/port.js";
import { buildHandStructureRequestV2 } from "../factors/hand-structure-projector.js";
import { tileIdTo34 } from "../factors/tile34.js";
import {
  CanonicalReplayError,
  reduceCanonicalEventStream,
  type ReducedCanonicalState,
} from "./round-reducer.js";

type FuritenComponent = FuritenStateV2["temporary"];

export interface ResponseFuritenAnalysis {
  temporary: FuritenComponent;
  riichi: FuritenComponent;
}

type SourceEvent = Extract<CanonicalGameEvent, {
  type: "tile_discarded" | "kakan_declared" | "ankan_declared";
}>;

type WindowClosure =
  | { kind: "open" }
  | { kind: "self_ron" }
  | { kind: "blocked" }
  | { kind: "uncertain"; eventIndex: number }
  | { kind: "passed"; eventIndex: number; closingEventRef: string };

interface DerivedUpdate {
  eventIndex: number;
  component: "temporary" | "riichi";
  status: "confirmed" | "unknown";
  evidenceIds: string[];
}

interface MutableComponent {
  status: "clear" | "unknown" | "confirmed";
  evidenceIds: Set<string>;
}

const unknownAnalysis = (): ResponseFuritenAnalysis => ({
  temporary: { status: "unknown", evidenceIds: [] },
  riichi: { status: "unknown", evidenceIds: [] },
});

function cloneKnownMeld(meld: CanonicalMeldV2): KnownMeld {
  if (meld.kind === "ankan") {
    return {
      meldRef: meld.meldRef,
      kind: meld.kind,
      actor: meld.actor,
      calledDiscardEventRef: null,
      tiles: meld.tiles.map((tile) => ({ ...tile })),
    };
  }
  if (meld.kind === "kakan") {
    return {
      meldRef: meld.meldRef,
      kind: meld.kind,
      actor: meld.actor,
      calledDiscardEventRef: meld.calledDiscardEventRef,
      tiles: [
        { ...meld.calledTile },
        ...meld.consumedTiles.map((tile) => ({ ...tile })),
        { ...meld.addedTile },
      ],
    };
  }
  return {
    meldRef: meld.meldRef,
    kind: meld.kind,
    actor: meld.actor,
    calledDiscardEventRef: meld.calledDiscardEventRef,
    tiles: [
      { ...meld.calledTile },
      ...meld.consumedTiles.map((tile) => ({ ...tile })),
    ],
  };
}

function windTile34(wind: "E" | "S" | "W" | "N"): number {
  return 27 + ["E", "S", "W", "N"].indexOf(wind);
}

function yakuContextAt(
  state: ReducedCanonicalState,
  selfActor: number,
): YakuContextV2 | null {
  if (state.publicState === null) return null;
  const publicState = state.publicState;
  const windsKnown = publicState.fields.roundContext === "complete";
  const selfRiichi = publicState.riichiStates[selfActor]!;
  const openTanyaoKnown = publicState.fields.ruleSet === "complete" &&
    publicState.ruleSet.openTanyao !== "unknown";
  return {
    windsStatus: windsKnown ? "known" : "unknown",
    roundWindTile34: windsKnown ? windTile34(publicState.roundWind) : null,
    selfWindTile34: windsKnown
      ? windTile34(publicState.seatWinds[selfActor]!)
      : null,
    riichiStatus: selfRiichi.status === "accepted"
      ? "accepted"
      : selfRiichi.status === "none" && windsKnown
        ? "inactive"
        : "unknown",
    openTanyaoStatus: openTanyaoKnown
      ? publicState.ruleSet.openTanyao ? "enabled" : "disabled"
      : "unknown",
  };
}

function offeredTile34(source: SourceEvent): number {
  if (source.type === "tile_discarded") return tileIdTo34(source.tile.id);
  if (source.type === "kakan_declared") return tileIdTo34(source.addedTile.id);
  return tileIdTo34(source.tiles[0].id);
}

function ronContext(
  source: SourceEvent,
  state: ReducedCanonicalState,
): HandStructureRequestV2["ronContext"] {
  if (source.type === "kakan_declared") return "known_kakan_chankan";
  if (source.type === "ankan_declared") return "known_ankan_chankan";
  if (
    state.publicState?.fields.remainingDraws !== "complete" ||
    state.publicState.remainingDraws === null
  ) return "unknown_future";
  return state.publicState.remainingDraws === 0
    ? "known_houtei"
    : "complete_none";
}

function buildResponseRequest(
  stream: CanonicalEventStream,
  source: SourceEvent,
  state: ReducedCanonicalState,
): HandStructureRequestV2 | null {
  if (
    state.privateState === null ||
    state.publicState === null ||
    state.privateState.fields.concealedTiles !== "complete" ||
    state.publicState.fields.melds !== "complete" ||
    state.privateState.currentDraw !== null
  ) return null;
  const yakuContext = yakuContextAt(state, stream.selfActor);
  if (yakuContext === null) return null;
  return buildHandStructureRequestV2({
    actionRef: ActionRefSchema.parse(`response:${source.eventId}`),
    factSetId: `canonical-response:${state.streamPrefixHash}`,
    projectedHand: state.privateState.concealedTiles,
    selfMelds: state.publicState.melds
      .filter((meld) => meld.actor === stream.selfActor)
      .map(cloneKnownMeld),
    leftTiles34: null,
    ronContext: ronContext(source, state),
    yakuContext,
  });
}

function sameSourceRon(
  event: CanonicalGameEvent,
  source: SourceEvent,
): event is Extract<CanonicalGameEvent, { type: "win_declared" }> {
  return event.type === "win_declared" &&
    event.method === "ron" &&
    event.winSourceEventRef === source.eventId;
}

function seatDistance(sourceActor: number, actor: number): number {
  return (actor - sourceActor + 4) % 4;
}

function winnerClosure(
  stream: CanonicalEventStream,
  source: SourceEvent,
  winners: readonly Extract<CanonicalGameEvent, { type: "win_declared" }>[],
  eventIndex: number,
  closingEventRef: string,
): WindowClosure {
  if (winners.some((winner) => winner.winnerActor === stream.selfActor)) {
    return { kind: "self_ron" };
  }
  if (stream.ruleSet.atamahane === "unknown") {
    return { kind: "uncertain", eventIndex };
  }
  if (stream.ruleSet.atamahane === true) {
    const sourceActor = source.actor;
    const selfDistance = seatDistance(sourceActor, stream.selfActor);
    if (winners.some((winner) =>
      seatDistance(sourceActor, winner.winnerActor) < selfDistance
    )) return { kind: "blocked" };
  }
  return { kind: "passed", eventIndex, closingEventRef };
}

function findClosure(
  stream: CanonicalEventStream,
  prefix: readonly CanonicalGameEvent[],
  sourceIndex: number,
  source: SourceEvent,
): WindowClosure {
  const winners: Extract<CanonicalGameEvent, { type: "win_declared" }>[] = [];
  for (let index = sourceIndex + 1; index < prefix.length; index++) {
    const event = prefix[index]!;
    if (sameSourceRon(event, source)) {
      if (event.winnerActor === stream.selfActor) return { kind: "self_ron" };
      winners.push(event);
      continue;
    }
    if (winners.length > 0) {
      if (
        event.type === "scores_updated" ||
        event.type === "round_ended" ||
        event.type === "game_ended"
      ) {
        return winnerClosure(stream, source, winners, index, event.eventId);
      }
      continue;
    }
    if (event.type === "round_drawn") {
      return { kind: "uncertain", eventIndex: index };
    }
    if (source.type === "tile_discarded") {
      if (
        (event.type === "chi_called" ||
          event.type === "pon_called" ||
          event.type === "daiminkan_called") &&
        event.calledDiscardEventRef === source.eventId
      ) {
        return {
          kind: "passed",
          eventIndex: index,
          closingEventRef: event.eventId,
        };
      }
      if (event.type === "tile_drawn") {
        return {
          kind: "passed",
          eventIndex: index,
          closingEventRef: event.eventId,
        };
      }
    } else {
      if (
        event.type === "dora_revealed" &&
        event.kanEventRef === source.eventId
      ) {
        return {
          kind: "passed",
          eventIndex: index,
          closingEventRef: event.eventId,
        };
      }
      if (
        event.type === "tile_drawn" &&
        event.actor === source.actor &&
        event.from === "rinshan"
      ) {
        return {
          kind: "passed",
          eventIndex: index,
          closingEventRef: event.eventId,
        };
      }
    }
  }
  if (winners.length > 0) {
    return { kind: "uncertain", eventIndex: prefix.length - 1 };
  }
  return { kind: "open" };
}

function requestCacheKey(request: HandStructureRequestV2): string {
  return JSON.stringify({
    requestId: request.requestId,
    actionRef: request.actionRef,
    stateHash: request.stateHash,
  });
}

function bindResultToRequest(
  request: HandStructureRequestV2,
  rawResult: unknown,
): HandStructureResultV2 {
  const result = HandStructureResultV2Schema.parse(rawResult);
  if (
    result.requestId !== request.requestId ||
    result.actionRef !== request.actionRef ||
    result.stateHash !== request.stateHash
  ) throw new Error("response_furiten_hand_structure_result_mismatch");
  return result;
}

function sortEvidence(
  evidenceIds: Iterable<string>,
  eventOrder: ReadonlyMap<string, number>,
): string[] {
  return [...new Set(evidenceIds)].sort((left, right) =>
    (eventOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
      (eventOrder.get(right) ?? Number.MAX_SAFE_INTEGER) ||
    left.localeCompare(right)
  );
}

function applyUpdate(
  component: MutableComponent,
  update: DerivedUpdate,
): void {
  if (update.status === "confirmed") {
    component.status = "confirmed";
    for (const eventRef of update.evidenceIds) {
      component.evidenceIds.add(eventRef);
    }
  } else if (component.status === "clear") {
    component.status = "unknown";
  }
}

function finalizeComponent(
  component: MutableComponent,
  eventOrder: ReadonlyMap<string, number>,
): FuritenComponent {
  return component.status === "confirmed"
    ? {
        status: "confirmed",
        evidenceIds: sortEvidence(component.evidenceIds, eventOrder),
      }
    : { status: component.status, evidenceIds: [] };
}

export async function deriveResponseFuriten(
  rawStream: CanonicalEventStream,
  decisionEventRef: string,
  engine: HandStructureFactEnginePort,
): Promise<ResponseFuritenAnalysis> {
  const rawEvents = (rawStream as { events?: unknown }).events;
  if (!Array.isArray(rawEvents)) {
    throw new CanonicalReplayError("canonical_stream_schema_invalid");
  }
  const targetIndex = rawEvents.findIndex((event) =>
    typeof event === "object" && event !== null &&
    "eventId" in event && event.eventId === decisionEventRef
  );
  if (targetIndex < 0) {
    throw new CanonicalReplayError("response_furiten_decision_event_not_found");
  }
  const parsed = CanonicalEventStreamSchema.safeParse({
    ...rawStream,
    events: rawEvents.slice(0, targetIndex + 1),
  });
  if (!parsed.success) {
    throw new CanonicalReplayError("canonical_stream_schema_invalid");
  }
  const stream = parsed.data;
  const prefix = stream.events;
  const activeRoundStart = prefix.findLastIndex((event) =>
    event.type === "round_started"
  );
  if (
    activeRoundStart < 0 ||
    stream.completeness.eventSequence !== "complete" ||
    stream.completeness.responseOpportunities !== "complete" ||
    stream.completeness.melds !== "complete"
  ) return unknownAnalysis();

  const reduced = reduceCanonicalEventStream(stream);
  const targetState = reduced[targetIndex];
  if (
    targetState?.privateState === null ||
    targetState?.privateState === undefined ||
    targetState.publicState === null ||
    targetState.privateState.fields.concealedTiles !== "complete" ||
    targetState.publicState.fields.melds !== "complete" ||
    targetState.privateState.fields.responseOpportunities !== "complete"
  ) return unknownAnalysis();

  const cache = new Map<string, Promise<HandStructureResultV2>>();
  const updates: DerivedUpdate[] = [];
  for (let sourceIndex = activeRoundStart; sourceIndex < prefix.length; sourceIndex++) {
    const source = prefix[sourceIndex]!;
    if (
      (source.type !== "tile_discarded" &&
        source.type !== "kakan_declared" &&
        source.type !== "ankan_declared") ||
      source.actor === stream.selfActor
    ) continue;
    const closure = findClosure(stream, prefix, sourceIndex, source);
    if (
      closure.kind === "open" ||
      closure.kind === "self_ron" ||
      closure.kind === "blocked"
    ) continue;
    const state = reduced[sourceIndex];
    if (state === undefined) return unknownAnalysis();
    const acceptedRiichiRef = state.publicState
      ?.riichiStates[stream.selfActor]?.acceptanceEventRef ?? null;
    const component = acceptedRiichiRef === null ? "temporary" : "riichi";
    const request = buildResponseRequest(stream, source, state);
    if (request === null) {
      updates.push({
        eventIndex: closure.eventIndex,
        component,
        status: "unknown",
        evidenceIds: [],
      });
      continue;
    }
    const key = requestCacheKey(request);
    let pending = cache.get(key);
    if (pending === undefined) {
      pending = Promise.resolve()
        .then(() => engine.analyzeHandStructure(request))
        .then((result) => bindResultToRequest(request, result));
      cache.set(key, pending);
    }
    let result: HandStructureResultV2;
    try {
      result = await pending;
    } catch {
      updates.push({
        eventIndex: closure.eventIndex,
        component,
        status: "unknown",
        evidenceIds: [],
      });
      continue;
    }
    const wait = result.waits.find((item) =>
      item.tile34 === offeredTile34(source)
    );
    if (
      wait === undefined ||
      (source.type === "ankan_declared" &&
        !wait.families.includes("kokushi"))
    ) continue;
    if (closure.kind === "uncertain") {
      updates.push({
        eventIndex: closure.eventIndex,
        component,
        status: "unknown",
        evidenceIds: [],
      });
      continue;
    }
    updates.push({
      eventIndex: closure.eventIndex,
      component,
      status: "confirmed",
      evidenceIds: [
        ...(acceptedRiichiRef === null ? [] : [acceptedRiichiRef]),
        source.eventId,
        closure.closingEventRef,
      ],
    });
  }

  const temporary: MutableComponent = {
    status: "clear",
    evidenceIds: new Set(),
  };
  const riichi: MutableComponent = {
    status: "clear",
    evidenceIds: new Set(),
  };
  const updatesByIndex = new Map<number, DerivedUpdate[]>();
  for (const update of updates) {
    const atIndex = updatesByIndex.get(update.eventIndex) ?? [];
    atIndex.push(update);
    updatesByIndex.set(update.eventIndex, atIndex);
  }
  for (let index = activeRoundStart; index < prefix.length; index++) {
    for (const update of updatesByIndex.get(index) ?? []) {
      applyUpdate(update.component === "temporary" ? temporary : riichi, update);
    }
    const event = prefix[index]!;
    if (event.type === "tile_drawn" && event.actor === stream.selfActor) {
      temporary.status = "clear";
      temporary.evidenceIds.clear();
    }
  }
  const eventOrder = new Map(prefix.map((event, index) => [event.eventId, index]));
  return {
    temporary: finalizeComponent(temporary, eventOrder),
    riichi: finalizeComponent(riichi, eventOrder),
  };
}
