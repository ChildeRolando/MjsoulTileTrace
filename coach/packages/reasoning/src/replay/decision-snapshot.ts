import {
  CanonicalEventStreamSchema,
  DECISION_SNAPSHOT_VERSION,
  DecisionPrivateStateSchema,
  DecisionSnapshotV2Schema,
  DecisionWindowSchema,
  type CanonicalEventStream,
  type CanonicalGameEvent,
  type DecisionSnapshotV2,
  type DecisionWindow,
  type Tile,
} from "@riichi-coach/contracts";
import {
  CanonicalReplayError,
  reduceCanonicalEventStream,
  type ReducedCanonicalState,
} from "./round-reducer.js";

function sameTile(left: Tile, right: Tile): boolean {
  return left.id === right.id && left.red === right.red;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}

function mismatch(): never {
  throw new CanonicalReplayError("decision_window_state_mismatch");
}

function assertWindowMatchesEvent(
  window: DecisionWindow,
  event: CanonicalGameEvent,
  phase: string,
  latestRiverEventRef: string | null,
  currentDrawEventRef: string | null,
): void {
  if (window.kind === "self_turn") {
    if (
      event.type !== "tile_drawn" ||
      event.actor !== window.actor ||
      event.tile.visibility !== "visible" ||
      phase !== "awaiting_self_action" ||
      currentDrawEventRef !== event.eventId
    ) mismatch();
    return;
  }

  if (window.kind === "discard_response") {
    if (
      event.type !== "tile_discarded" ||
      event.actor !== window.sourceActor ||
      !sameTile(event.tile, window.offeredTile) ||
      phase !== "awaiting_discard_responses" ||
      latestRiverEventRef !== event.eventId
    ) mismatch();
    return;
  }

  if (window.kind === "post_call_discard") {
    if (
      (event.type !== "chi_called" && event.type !== "pon_called") ||
      event.actor !== window.actor ||
      phase !== "awaiting_post_call_discard"
    ) mismatch();
    return;
  }

  if (window.kind === "post_riichi_discard") {
    if (
      event.type !== "riichi_declared" ||
      event.actor !== window.actor ||
      phase !== "awaiting_self_action"
    ) mismatch();
    return;
  }

  const expectedType = window.kanKind === "ankan"
    ? "ankan_declared"
    : "kakan_declared";
  const offeredTile = event.type === "ankan_declared"
    ? event.tiles[0]
    : event.type === "kakan_declared"
      ? event.addedTile
      : null;
  if (
    event.type !== expectedType ||
    event.actor !== window.sourceActor ||
    offeredTile === null ||
    !sameTile(offeredTile, window.offeredTile) ||
    phase !== "awaiting_kan_responses"
  ) mismatch();
}

/**
 * A stream parsed and reduced ONCE, shared by every window frozen against it.
 * replayCanonicalStream freezes ~a hundred windows per seat; re-reducing the
 * whole stream per window made that O(windows × events²). The freeze logic in
 * freezeDecisionSnapshotInContext is unchanged — sharing the reduction only.
 */
export interface DecisionStreamContext {
  readonly stream: CanonicalEventStream;
  readonly eventsByRef: ReadonlyMap<string, CanonicalGameEvent>;
  readonly statesByRef: ReadonlyMap<string, ReducedCanonicalState>;
}

export function freezeDecisionStreamContext(
  rawStream: CanonicalEventStream,
): DecisionStreamContext {
  const parsedStream = CanonicalEventStreamSchema.safeParse(rawStream);
  if (!parsedStream.success) {
    throw new CanonicalReplayError("canonical_stream_schema_invalid");
  }
  const stream = parsedStream.data;
  const states = reduceCanonicalEventStream(stream);
  // find()-first semantics: a duplicated ref resolves to the earliest entry.
  const eventsByRef = new Map<string, CanonicalGameEvent>();
  for (const event of stream.events) {
    if (!eventsByRef.has(event.eventId)) eventsByRef.set(event.eventId, event);
  }
  const statesByRef = new Map<string, ReducedCanonicalState>();
  for (const state of states) {
    if (!statesByRef.has(state.eventRef)) statesByRef.set(state.eventRef, state);
  }
  return { stream, eventsByRef, statesByRef };
}

export function freezeDecisionSnapshotInContext(
  context: DecisionStreamContext,
  rawWindow: DecisionWindow,
): DecisionSnapshotV2 {
  const parsedWindow = DecisionWindowSchema.safeParse(rawWindow);
  if (!parsedWindow.success) {
    throw new CanonicalReplayError("decision_window_schema_invalid");
  }
  const window = parsedWindow.data;
  const stream = context.stream;
  if (stream.selfActor === null || window.actor !== stream.selfActor) mismatch();

  const event = context.eventsByRef.get(window.triggerEventRef);
  const reduced = context.statesByRef.get(window.triggerEventRef);
  if (
    event === undefined ||
    reduced === undefined ||
    reduced.publicState === null ||
    reduced.privateState === null
  ) mismatch();

  const latestRiverEventRef = window.kind === "discard_response" &&
      window.sourceActor !== null
    ? reduced.publicState.rivers[window.sourceActor]?.at(-1)?.eventRef ?? null
    : null;
  assertWindowMatchesEvent(
    window,
    event,
    reduced.publicState.phase,
    latestRiverEventRef,
    reduced.privateState.currentDraw?.eventRef ?? null,
  );

  const privateState = DecisionPrivateStateSchema.parse({
    ...reduced.privateState,
    decisionWindow: window,
  });
  const snapshot = DecisionSnapshotV2Schema.parse({
    snapshotVersion: DECISION_SNAPSHOT_VERSION,
    gameId: stream.gameId,
    streamHash: reduced.streamHash,
    streamPrefixHash: reduced.streamPrefixHash,
    decisionEventRef: window.triggerEventRef,
    selfActor: stream.selfActor,
    publicState: reduced.publicState,
    privateState,
    evidenceIds: reduced.publicState.appliedEventRefs,
  });
  return deepFreeze(snapshot);
}

export function freezeDecisionSnapshot(
  rawStream: CanonicalEventStream,
  rawWindow: DecisionWindow,
): DecisionSnapshotV2 {
  return freezeDecisionSnapshotInContext(
    freezeDecisionStreamContext(rawStream),
    rawWindow,
  );
}
