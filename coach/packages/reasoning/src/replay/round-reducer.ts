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

function mergeCurrentDraw(privateState: SelfPrivateRoundState): void {
  if (privateState.currentDraw !== null) {
    privateState.concealedTiles.push(privateState.currentDraw.tile);
    privateState.currentDraw = null;
  }
}

function removeSelfTiles(
  privateState: SelfPrivateRoundState,
  tiles: readonly Tile[],
): void {
  mergeCurrentDraw(privateState);
  for (const tile of tiles) removeExactTile(privateState.concealedTiles, tile);
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
      mergeCurrentDraw(privateState);
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
  const riichi = publicState.riichiStates[event.actor]!;
  if (
    riichi.status === "accepted" &&
    event.riichiDeclarationEventRef === null
  ) {
    riichi.ippatsuAlive = false;
  }
}

function findRiverDiscard(
  publicState: PublicRoundState,
  eventRef: string,
): PublicRoundState["rivers"][number][number] {
  const discard = publicState.rivers.flat()
    .find((entry) => entry.eventRef === eventRef);
  if (discard === undefined) {
    throw new CanonicalReplayError("called_discard_not_found");
  }
  return discard;
}

function applyOpenCall(
  stream: CanonicalEventStream,
  event: Extract<CanonicalGameEvent, {
    type: "chi_called" | "pon_called" | "daiminkan_called";
  }>,
  publicState: PublicRoundState,
  privateState: SelfPrivateRoundState,
): void {
  const discard = findRiverDiscard(publicState, event.calledDiscardEventRef);
  discard.calledByEventRef = event.eventId;
  if (event.actor === stream.selfActor) {
    removeSelfTiles(privateState, event.consumedTiles);
    privateState.selfMeldRefs.push(event.eventId);
    privateState.evidenceIds.push(event.eventId);
  }
  const base = {
    meldRef: event.eventId,
    actor: event.actor,
    createdEventRef: event.eventId,
    latestEventRef: event.eventId,
    targetActor: event.targetActor,
    calledTile: clone(event.calledTile),
    calledDiscardEventRef: event.calledDiscardEventRef,
  };
  if (event.type === "chi_called") {
    publicState.melds.push({
      ...base,
      kind: "chi",
      consumedTiles: clone(event.consumedTiles),
    });
  } else if (event.type === "pon_called") {
    publicState.melds.push({
      ...base,
      kind: "pon",
      consumedTiles: clone(event.consumedTiles),
    });
  } else {
    publicState.melds.push({
      ...base,
      kind: "daiminkan",
      consumedTiles: clone(event.consumedTiles),
    });
  }
  publicState.expectedActor = event.actor;
  publicState.phase = event.type === "daiminkan_called"
    ? "awaiting_rinshan_draw"
    : "awaiting_post_call_discard";
  cancelIppatsu(publicState, false);
}

function cancelIppatsu(
  publicState: PublicRoundState,
  value: false | null,
): void {
  for (const riichi of publicState.riichiStates) {
    if (riichi.ippatsuAlive === true) riichi.ippatsuAlive = value;
  }
}

function applyAnkan(
  stream: CanonicalEventStream,
  event: Extract<CanonicalGameEvent, { type: "ankan_declared" }>,
  publicState: PublicRoundState,
  privateState: SelfPrivateRoundState,
): void {
  if (event.actor === stream.selfActor) {
    removeSelfTiles(privateState, event.tiles);
    privateState.selfMeldRefs.push(event.eventId);
    privateState.evidenceIds.push(event.eventId);
  }
  publicState.melds.push({
    meldRef: event.eventId,
    kind: "ankan",
    actor: event.actor,
    createdEventRef: event.eventId,
    latestEventRef: event.eventId,
    tiles: clone(event.tiles),
  });
  publicState.expectedActor = event.actor;
  publicState.phase = "awaiting_rinshan_draw";
  const rule = stream.ruleSet.ippatsuCancelledByAnkan;
  if (rule === true) cancelIppatsu(publicState, false);
  if (rule === "unknown") cancelIppatsu(publicState, null);
}

function applyKakan(
  stream: CanonicalEventStream,
  event: Extract<CanonicalGameEvent, { type: "kakan_declared" }>,
  publicState: PublicRoundState,
  privateState: SelfPrivateRoundState,
): void {
  const meldIndex = publicState.melds.findIndex((meld) =>
    meld.kind === "pon" &&
    meld.actor === event.actor &&
    meld.createdEventRef === event.upgradedPonEventRef &&
    meld.calledTile.id === event.addedTile.id
  );
  if (meldIndex < 0) throw new CanonicalReplayError("kakan_pon_not_found");
  const pon = publicState.melds[meldIndex]!;
  if (pon.kind !== "pon") throw new CanonicalReplayError("kakan_pon_not_found");
  if (event.actor === stream.selfActor) {
    removeSelfTiles(privateState, [event.addedTile]);
    privateState.evidenceIds.push(event.eventId);
  }
  publicState.melds[meldIndex] = {
    meldRef: pon.meldRef,
    kind: "kakan",
    actor: pon.actor,
    createdEventRef: pon.createdEventRef,
    latestEventRef: event.eventId,
    targetActor: pon.targetActor,
    calledTile: clone(pon.calledTile),
    consumedTiles: clone(pon.consumedTiles),
    addedTile: clone(event.addedTile),
    calledDiscardEventRef: pon.calledDiscardEventRef,
    upgradedPonEventRef: event.upgradedPonEventRef,
  };
  publicState.expectedActor = event.actor;
  publicState.phase = "awaiting_kan_responses";
  cancelIppatsu(publicState, false);
}

function applyRiichiDeclared(
  stream: CanonicalEventStream,
  event: Extract<CanonicalGameEvent, { type: "riichi_declared" }>,
  publicState: PublicRoundState,
  privateState: SelfPrivateRoundState,
): void {
  publicState.riichiStates[event.actor] = {
    actor: event.actor,
    status: "declared",
    declarationEventRef: event.eventId,
    acceptanceEventRef: null,
    ippatsuAlive: false,
  };
  if (event.actor === stream.selfActor) {
    privateState.evidenceIds.push(event.eventId);
  }
}

function applyRiichiAccepted(
  stream: CanonicalEventStream,
  event: Extract<CanonicalGameEvent, { type: "riichi_accepted" }>,
  publicState: PublicRoundState,
  privateState: SelfPrivateRoundState,
): void {
  const state = publicState.riichiStates[event.actor]!;
  if (
    state.status !== "declared" ||
    state.declarationEventRef !== event.declarationEventRef
  ) {
    throw new CanonicalReplayError("riichi_declaration_not_found");
  }
  state.status = "accepted";
  state.acceptanceEventRef = event.eventId;
  state.ippatsuAlive = true;
  publicState.scores[event.actor] = publicState.scores[event.actor]! - 1000;
  publicState.riichiSticks += 1;
  if (event.actor === stream.selfActor) {
    privateState.evidenceIds.push(event.eventId);
  }
}

function applyWin(
  event: Extract<CanonicalGameEvent, { type: "win_declared" }>,
  publicState: PublicRoundState,
): void {
  if (publicState.terminal?.kind === "win") {
    publicState.terminal.eventRefs.push(event.eventId);
  } else {
    publicState.terminal = { kind: "win", eventRefs: [event.eventId] };
  }
  publicState.phase = "round_ended";
  publicState.expectedActor = null;
  cancelIppatsu(publicState, false);
}

function applyRoundDrawn(
  event: Extract<CanonicalGameEvent, { type: "round_drawn" }>,
  publicState: PublicRoundState,
): void {
  publicState.terminal = {
    kind: "draw",
    eventRef: event.eventId,
    reason: event.reason,
  };
  publicState.phase = "round_ended";
  publicState.expectedActor = null;
  cancelIppatsu(publicState, false);
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
  } else if (
    event.type === "chi_called" ||
    event.type === "pon_called" ||
    event.type === "daiminkan_called"
  ) {
    applyOpenCall(stream, event, publicState, privateState);
  } else if (event.type === "ankan_declared") {
    applyAnkan(stream, event, publicState, privateState);
  } else if (event.type === "kakan_declared") {
    applyKakan(stream, event, publicState, privateState);
  } else if (event.type === "riichi_declared") {
    applyRiichiDeclared(stream, event, publicState, privateState);
  } else if (event.type === "riichi_accepted") {
    applyRiichiAccepted(stream, event, publicState, privateState);
  } else if (event.type === "dora_revealed") {
    publicState.doraIndicators.push(clone(event.indicator));
  } else if (event.type === "win_declared") {
    applyWin(event, publicState);
  } else if (event.type === "round_drawn") {
    applyRoundDrawn(event, publicState);
  } else if (event.type === "scores_updated") {
    publicState.scores = clone(event.scores);
  } else if (event.type === "round_ended") {
    publicState.phase = "round_ended";
    publicState.expectedActor = null;
  } else if (event.type === "game_ended") {
    publicState.phase = "game_ended";
    publicState.expectedActor = null;
    publicState.scores = clone(event.scores);
  } else {
    const exhaustive: never = event;
    throw new CanonicalReplayError(`canonical_reducer_event_not_implemented:${String(exhaustive)}`);
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
