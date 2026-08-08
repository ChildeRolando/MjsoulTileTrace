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

export function freezeDecisionSnapshot(
  rawStream: CanonicalEventStream,
  rawWindow: DecisionWindow,
): DecisionSnapshotV2 {
  const parsedStream = CanonicalEventStreamSchema.safeParse(rawStream);
  if (!parsedStream.success) {
    throw new CanonicalReplayError("canonical_stream_schema_invalid");
  }
  const stream = parsedStream.data;
  const parsedWindow = DecisionWindowSchema.safeParse(rawWindow);
  if (!parsedWindow.success) {
    throw new CanonicalReplayError("decision_window_schema_invalid");
  }
  const window = parsedWindow.data;
  if (stream.selfActor === null || window.actor !== stream.selfActor) mismatch();

  const event = stream.events.find((entry) =>
    entry.eventId === window.triggerEventRef
  );
  const reduced = reduceCanonicalEventStream(stream).find((entry) =>
    entry.eventRef === window.triggerEventRef
  );
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
