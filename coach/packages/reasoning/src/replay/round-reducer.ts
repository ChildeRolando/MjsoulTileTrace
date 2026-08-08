import { createHash } from "node:crypto";
import {
  CanonicalEventStreamSchema,
  PublicRoundStateSchema,
  SelfPrivateRoundStateSchema,
  type CanonicalEventStream,
  type CanonicalGameEvent,
  type PublicRoundState,
  type SelfPrivateRoundState,
  type Tile,
} from "@riichi-coach/contracts";
import {
  validateCanonicalEventStream,
  type CanonicalStreamDiagnosticCode,
} from "./canonical-event-validator.js";

export class CanonicalReplayError extends Error {
  constructor(public readonly code: CanonicalStreamDiagnosticCode | string) {
    super(`canonical_replay_failed:${code}`);
    this.name = "CanonicalReplayError";
  }
}

export interface ReducedCanonicalState {
  readonly eventRef: string;
  readonly eventIndex: number;
  readonly streamHash: string;
  readonly streamPrefixHash: string;
  readonly publicState: PublicRoundState | null;
  readonly privateState: SelfPrivateRoundState | null;
}

function hashJson(value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
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

function sameTile(left: Tile, right: Tile): boolean {
  return left.id === right.id && left.red === right.red;
}

function removeExactTile(tiles: Tile[], wanted: Tile): void {
  const index = tiles.findIndex((tile) => sameTile(tile, wanted));
  if (index < 0) throw new CanonicalReplayError("self_tile_not_owned");
  tiles.splice(index, 1);
}

function seatWinds(dealer: number): ["E" | "S" | "W" | "N", "E" | "S" | "W" | "N", "E" | "S" | "W" | "N", "E" | "S" | "W" | "N"] {
  const winds = ["E", "S", "W", "N"] as const;
  return [0, 1, 2, 3].map((actor) =>
    winds[(actor - dealer + 4) % 4]!
  ) as ReturnType<typeof seatWinds>;
}

function initialRiichiStates(): PublicRoundState["riichiStates"] {
  return [0, 1, 2, 3].map((actor) => ({
    actor,
    status: "none" as const,
    declarationEventRef: null,
    acceptanceEventRef: null,
    ippatsuAlive: false,
  })) as PublicRoundState["riichiStates"];
}

function unknownFuriten(): SelfPrivateRoundState["furiten"] {
  return {
    discard: { status: "unknown", evidenceIds: [] },
    temporary: { status: "unknown", evidenceIds: [] },
    riichi: { status: "unknown", evidenceIds: [] },
  };
}

function startRound(
  stream: CanonicalEventStream,
  event: Extract<CanonicalGameEvent, { type: "round_started" }>,
  appliedEventRefs: readonly string[],
): {
  publicState: PublicRoundState;
  privateState: SelfPrivateRoundState;
} {
  const publicState = PublicRoundStateSchema.parse({
    gameId: stream.gameId,
    streamSchemaVersion: stream.schemaVersion,
    ruleSet: stream.ruleSet,
    roundOrdinal: event.roundOrdinal,
    roundWind: event.roundWind,
    hand: event.hand,
    honba: event.honba,
    riichiSticks: event.riichiSticks,
    dealer: event.dealer,
    scores: event.scores,
    seatWinds: seatWinds(event.dealer),
    phase: "awaiting_draw",
    expectedActor: event.dealer,
    doraIndicators: [event.doraIndicator],
    rivers: [[], [], [], []],
    melds: [],
    riichiStates: initialRiichiStates(),
    remainingDraws: event.remainingDraws,
    terminal: null,
    fields: {
      roundContext: stream.completeness.eventSequence,
      ruleSet: stream.completeness.ruleSet,
      scores: stream.completeness.scores,
      doraIndicators: stream.completeness.doraIndicators,
      rivers: stream.completeness.rivers,
      calledDiscardMarkers: stream.completeness.calledDiscardMarkers,
      melds: stream.completeness.melds,
      remainingDraws: stream.completeness.remainingDraws,
      settlement: stream.completeness.settlement,
    },
    appliedEventRefs,
  });
  const privateState = SelfPrivateRoundStateSchema.parse({
    selfActor: stream.selfActor,
    concealedTiles: event.selfHand,
    currentDraw: null,
    selfMeldRefs: [],
    furiten: unknownFuriten(),
    fields: {
      concealedTiles: "complete",
      currentDraw: "complete",
      responseOpportunities: stream.completeness.responseOpportunities,
      furiten: "unknown",
    },
    evidenceIds: [event.eventId],
  });
  return { publicState, privateState };
}

function applyDraw(
  stream: CanonicalEventStream,
  event: Extract<CanonicalGameEvent, { type: "tile_drawn" }>,
  publicState: PublicRoundState,
  privateState: SelfPrivateRoundState,
): void {
  publicState.phase = "awaiting_self_action";
  publicState.expectedActor = event.actor;
  if (publicState.remainingDraws !== null) {
    publicState.remainingDraws -= 1;
  }
  if (event.actor === stream.selfActor) {
    if (event.tile.visibility !== "visible") {
      throw new CanonicalReplayError("self_draw_hidden");
    }
    privateState.currentDraw = {
      tile: clone(event.tile.tile),
      eventRef: event.eventId,
      from: event.from,
    };
    privateState.evidenceIds.push(event.eventId);
  }
}

function applyDiscard(
  stream: CanonicalEventStream,
  event: Extract<CanonicalGameEvent, { type: "tile_discarded" }>,
  publicState: PublicRoundState,
  privateState: SelfPrivateRoundState,
): void {
  if (event.actor === stream.selfActor) {
    if (event.discardMode === "tsumogiri") {
      if (
        privateState.currentDraw === null ||
        !sameTile(privateState.currentDraw.tile, event.tile)
      ) {
        throw new CanonicalReplayError("self_tile_not_owned");
      }
      privateState.currentDraw = null;
    } else {
      removeExactTile(privateState.concealedTiles, event.tile);
      if (privateState.currentDraw !== null) {
        privateState.concealedTiles.push(privateState.currentDraw.tile);
        privateState.currentDraw = null;
      }
    }
    privateState.evidenceIds.push(event.eventId);
  }
  publicState.rivers[event.actor]!.push({
    eventRef: event.eventId,
    actor: event.actor,
    tile: clone(event.tile),
    discardMode: event.discardMode,
    riichiDeclarationEventRef: event.riichiDeclarationEventRef,
    calledByEventRef: null,
  });
  publicState.phase = "awaiting_discard_responses";
  publicState.expectedActor = (event.actor + 1) % 4;
}

function applyCoreEvent(
  stream: CanonicalEventStream,
  event: CanonicalGameEvent,
  appliedEventRefs: readonly string[],
  publicState: PublicRoundState | null,
  privateState: SelfPrivateRoundState | null,
): {
  publicState: PublicRoundState | null;
  privateState: SelfPrivateRoundState | null;
} {
  if (event.type === "game_started") return { publicState, privateState };
  if (event.type === "round_started") {
    return startRound(stream, event, appliedEventRefs);
  }
  if (publicState === null || privateState === null) {
    throw new CanonicalReplayError("round_state_unavailable");
  }
  if (event.type === "tile_drawn") {
    applyDraw(stream, event, publicState, privateState);
  } else if (event.type === "tile_discarded") {
    applyDiscard(stream, event, publicState, privateState);
  } else {
    throw new CanonicalReplayError(`canonical_reducer_event_not_implemented:${event.type}`);
  }
  publicState.appliedEventRefs = [...appliedEventRefs];
  return { publicState, privateState };
}

export function reduceCanonicalEventStream(
  raw: CanonicalEventStream,
): readonly ReducedCanonicalState[] {
  const stream = CanonicalEventStreamSchema.parse(raw);
  const validation = validateCanonicalEventStream(stream);
  if (validation.status === "invalid") {
    throw new CanonicalReplayError(validation.code);
  }

  const streamHash = hashJson(stream);
  const states: ReducedCanonicalState[] = [];
  const appliedEventRefs: string[] = [];
  let publicState: PublicRoundState | null = null;
  let privateState: SelfPrivateRoundState | null = null;

  stream.events.forEach((event, eventIndex) => {
    appliedEventRefs.push(event.eventId);
    const next = applyCoreEvent(
      stream,
      event,
      appliedEventRefs,
      publicState === null ? null : clone(publicState),
      privateState === null ? null : clone(privateState),
    );
    publicState = next.publicState === null
      ? null
      : PublicRoundStateSchema.parse(next.publicState);
    privateState = next.privateState === null
      ? null
      : SelfPrivateRoundStateSchema.parse(next.privateState);
    const prefix = {
      ...stream,
      events: stream.events.slice(0, eventIndex + 1),
    };
    states.push(deepFreeze({
      eventRef: event.eventId,
      eventIndex,
      streamHash,
      streamPrefixHash: hashJson(prefix),
      publicState: publicState === null ? null : clone(publicState),
      privateState: privateState === null ? null : clone(privateState),
    }));
  });
  return deepFreeze(states);
}
