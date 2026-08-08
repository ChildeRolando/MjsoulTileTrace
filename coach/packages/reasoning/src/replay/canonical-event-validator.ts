import type {
  CanonicalEventStream,
  CanonicalGameEvent,
  Tile,
} from "@riichi-coach/contracts";

export type CanonicalStreamDiagnosticCode =
  | "unexpected_event_for_phase"
  | "event_actor_mismatch"
  | "call_target_invalid"
  | "chi_target_not_left"
  | "called_discard_not_found"
  | "called_discard_already_consumed"
  | "kakan_pon_not_found"
  | "self_tile_not_owned"
  | "physical_tile_overflow"
  | "event_after_round_end";

export type CanonicalStreamValidation =
  | { status: "valid" }
  | {
    status: "invalid";
    code: CanonicalStreamDiagnosticCode;
    eventRef: string;
  };

type ValidationPhase =
  | "before_game"
  | "between_rounds"
  | "awaiting_draw"
  | "awaiting_action"
  | "awaiting_responses"
  | "awaiting_post_call_discard"
  | "awaiting_rinshan_draw"
  | "awaiting_kan_resolution"
  | "terminal"
  | "game_ended";

interface KnownDiscard {
  actor: number;
  tile: Tile;
}

interface KnownMeld {
  actor: number;
  kind: "pon" | "other";
  tileId: string;
}

interface ValidationState {
  phase: ValidationPhase;
  expectedActor: number | null;
  selfActor: number;
  selfConcealed: Tile[];
  selfCurrentDraw: Tile | null;
  publicCounts: Map<string, number>;
  discards: Map<string, KnownDiscard>;
  consumedDiscards: Set<string>;
  melds: Map<string, KnownMeld>;
  pendingRiichi: Map<number, string>;
  lastDiscardRef: string | null;
  atamahane: boolean | "unknown";
  terminalWinSourceRef: string | null;
  terminalWinTargetActor: number | null;
  terminalWinners: Set<number>;
}

function invalid(
  code: CanonicalStreamDiagnosticCode,
  event: Pick<CanonicalGameEvent, "eventId">,
): CanonicalStreamValidation {
  return { status: "invalid", code, eventRef: event.eventId };
}

function sameTile(left: Tile, right: Tile): boolean {
  return left.id === right.id && left.red === right.red;
}

function countTiles(tiles: readonly Tile[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const tile of tiles) counts.set(tile.id, (counts.get(tile.id) ?? 0) + 1);
  return counts;
}

function addPublicTile(state: ValidationState, tile: Tile): boolean {
  state.publicCounts.set(tile.id, (state.publicCounts.get(tile.id) ?? 0) + 1);
  return physicalCountsValid(state);
}

function physicalCountsValid(state: ValidationState): boolean {
  const owned = countTiles([
    ...state.selfConcealed,
    ...(state.selfCurrentDraw === null ? [] : [state.selfCurrentDraw]),
  ]);
  const keys = new Set([...owned.keys(), ...state.publicCounts.keys()]);
  for (const key of keys) {
    if ((owned.get(key) ?? 0) + (state.publicCounts.get(key) ?? 0) > 4) {
      return false;
    }
  }
  return true;
}

function removeExactTile(tiles: Tile[], wanted: Tile): boolean {
  const index = tiles.findIndex((tile) => sameTile(tile, wanted));
  if (index < 0) return false;
  tiles.splice(index, 1);
  return true;
}

function mergeDrawIntoConcealed(state: ValidationState): void {
  if (state.selfCurrentDraw !== null) {
    state.selfConcealed.push(state.selfCurrentDraw);
    state.selfCurrentDraw = null;
  }
}

function removeSelfTiles(state: ValidationState, tiles: readonly Tile[]): boolean {
  mergeDrawIntoConcealed(state);
  for (const tile of tiles) {
    if (!removeExactTile(state.selfConcealed, tile)) return false;
  }
  return true;
}

function addRevealedTiles(
  state: ValidationState,
  tiles: readonly Tile[],
): boolean {
  return tiles.every((tile) => addPublicTile(state, tile));
}

function validateCall(
  state: ValidationState,
  event: Extract<CanonicalGameEvent, {
    type: "chi_called" | "pon_called" | "daiminkan_called";
  }>,
): CanonicalStreamValidation | null {
  if (state.consumedDiscards.has(event.calledDiscardEventRef)) {
    return invalid("called_discard_already_consumed", event);
  }
  if (event.actor === event.targetActor) {
    return invalid("call_target_invalid", event);
  }
  const discard = state.discards.get(event.calledDiscardEventRef);
  if (discard === undefined || state.lastDiscardRef !== event.calledDiscardEventRef) {
    return invalid("called_discard_not_found", event);
  }
  if (
    state.phase !== "awaiting_responses" ||
    discard.actor !== event.targetActor ||
    !sameTile(discard.tile, event.calledTile)
  ) {
    return invalid("called_discard_not_found", event);
  }
  if (
    event.type === "chi_called" &&
    (event.targetActor + 1) % 4 !== event.actor
  ) {
    return invalid("chi_target_not_left", event);
  }

  if (event.actor === state.selfActor) {
    if (!removeSelfTiles(state, event.consumedTiles)) {
      return invalid("self_tile_not_owned", event);
    }
  }
  if (!addRevealedTiles(state, event.consumedTiles)) {
    return invalid("physical_tile_overflow", event);
  }
  state.consumedDiscards.add(event.calledDiscardEventRef);
  state.lastDiscardRef = null;
  state.melds.set(event.eventId, {
    actor: event.actor,
    kind: event.type === "pon_called" ? "pon" : "other",
    tileId: event.calledTile.id,
  });
  state.expectedActor = event.actor;
  state.phase = event.type === "daiminkan_called"
    ? "awaiting_rinshan_draw"
    : "awaiting_post_call_discard";
  return null;
}

function validateRoundEvent(
  state: ValidationState,
  event: CanonicalGameEvent,
): CanonicalStreamValidation | null {
  if (state.phase === "game_ended") {
    return invalid("event_after_round_end", event);
  }
  if (
    state.phase === "terminal" &&
    !["win_declared", "scores_updated", "round_ended", "game_ended"]
      .includes(event.type)
  ) {
    return invalid("event_after_round_end", event);
  }

  switch (event.type) {
    case "game_started":
      if (state.phase !== "before_game") {
        return invalid("unexpected_event_for_phase", event);
      }
      state.phase = "between_rounds";
      return null;

    case "round_started":
      if (state.phase !== "between_rounds") {
        return invalid("unexpected_event_for_phase", event);
      }
      state.selfConcealed = [...event.selfHand];
      state.selfCurrentDraw = null;
      state.publicCounts = new Map();
      state.discards.clear();
      state.consumedDiscards.clear();
      state.melds.clear();
      state.pendingRiichi.clear();
      state.lastDiscardRef = null;
      state.terminalWinSourceRef = null;
      state.terminalWinTargetActor = null;
      state.terminalWinners.clear();
      if (!addPublicTile(state, event.doraIndicator)) {
        return invalid("physical_tile_overflow", event);
      }
      state.expectedActor = event.dealer;
      state.phase = "awaiting_draw";
      return null;

    case "tile_drawn": {
      const allowed = state.phase === "awaiting_draw" ||
        state.phase === "awaiting_rinshan_draw" ||
        state.phase === "awaiting_kan_resolution" ||
        state.phase === "awaiting_responses";
      if (!allowed) return invalid("unexpected_event_for_phase", event);
      if (event.actor !== state.expectedActor) {
        return invalid("event_actor_mismatch", event);
      }
      if (event.actor === state.selfActor) {
        if (event.tile.visibility !== "visible") {
          return invalid("unexpected_event_for_phase", event);
        }
        state.selfCurrentDraw = event.tile.tile;
        if (!physicalCountsValid(state)) {
          return invalid("physical_tile_overflow", event);
        }
      }
      state.phase = "awaiting_action";
      state.lastDiscardRef = null;
      return null;
    }

    case "riichi_declared":
      if (state.phase !== "awaiting_action") {
        return invalid("unexpected_event_for_phase", event);
      }
      if (event.actor !== state.expectedActor) {
        return invalid("event_actor_mismatch", event);
      }
      state.pendingRiichi.set(event.actor, event.eventId);
      return null;

    case "tile_discarded": {
      if (
        state.phase !== "awaiting_action" &&
        state.phase !== "awaiting_post_call_discard"
      ) {
        return invalid("unexpected_event_for_phase", event);
      }
      if (event.actor !== state.expectedActor) {
        return invalid("event_actor_mismatch", event);
      }
      const declaration = state.pendingRiichi.get(event.actor) ?? null;
      if (event.riichiDeclarationEventRef !== declaration) {
        return invalid("unexpected_event_for_phase", event);
      }
      if (event.actor === state.selfActor) {
        if (event.discardMode === "tsumogiri") {
          if (
            state.selfCurrentDraw === null ||
            !sameTile(state.selfCurrentDraw, event.tile)
          ) {
            return invalid("self_tile_not_owned", event);
          }
          state.selfCurrentDraw = null;
        } else {
          if (!removeExactTile(state.selfConcealed, event.tile)) {
            return invalid("self_tile_not_owned", event);
          }
          mergeDrawIntoConcealed(state);
        }
      }
      if (!addPublicTile(state, event.tile)) {
        return invalid("physical_tile_overflow", event);
      }
      state.discards.set(event.eventId, { actor: event.actor, tile: event.tile });
      state.lastDiscardRef = event.eventId;
      state.expectedActor = (event.actor + 1) % 4;
      state.phase = "awaiting_responses";
      return null;
    }

    case "riichi_accepted":
      if (
        state.phase !== "awaiting_responses" ||
        state.pendingRiichi.get(event.actor) !== event.declarationEventRef
      ) {
        return invalid("unexpected_event_for_phase", event);
      }
      state.pendingRiichi.delete(event.actor);
      return null;

    case "chi_called":
    case "pon_called":
    case "daiminkan_called":
      return validateCall(state, event);

    case "ankan_declared":
      if (state.phase !== "awaiting_action") {
        return invalid("unexpected_event_for_phase", event);
      }
      if (event.actor !== state.expectedActor) {
        return invalid("event_actor_mismatch", event);
      }
      if (event.actor === state.selfActor && !removeSelfTiles(state, event.tiles)) {
        return invalid("self_tile_not_owned", event);
      }
      if (!addRevealedTiles(state, event.tiles)) {
        return invalid("physical_tile_overflow", event);
      }
      state.melds.set(event.eventId, {
        actor: event.actor,
        kind: "other",
        tileId: event.tiles[0].id,
      });
      state.phase = "awaiting_kan_resolution";
      return null;

    case "kakan_declared": {
      if (state.phase !== "awaiting_action") {
        return invalid("unexpected_event_for_phase", event);
      }
      if (event.actor !== state.expectedActor) {
        return invalid("event_actor_mismatch", event);
      }
      const pon = state.melds.get(event.upgradedPonEventRef);
      if (
        pon === undefined || pon.kind !== "pon" ||
        pon.actor !== event.actor || pon.tileId !== event.addedTile.id
      ) {
        return invalid("kakan_pon_not_found", event);
      }
      if (
        event.actor === state.selfActor &&
        !removeSelfTiles(state, [event.addedTile])
      ) {
        return invalid("self_tile_not_owned", event);
      }
      if (!addPublicTile(state, event.addedTile)) {
        return invalid("physical_tile_overflow", event);
      }
      state.phase = "awaiting_kan_resolution";
      state.expectedActor = event.actor;
      return null;
    }

    case "dora_revealed":
      if (
        state.phase === "before_game" ||
        state.phase === "between_rounds" ||
        state.phase === "terminal"
      ) {
        return invalid("unexpected_event_for_phase", event);
      }
      if (!addPublicTile(state, event.indicator)) {
        return invalid("physical_tile_overflow", event);
      }
      if (state.phase === "awaiting_kan_resolution") {
        state.phase = "awaiting_rinshan_draw";
      }
      return null;

    case "win_declared":
      if (state.phase === "terminal") {
        if (
          state.terminalWinSourceRef === null ||
          state.atamahane === true ||
          event.method !== "ron" ||
          event.winSourceEventRef !== state.terminalWinSourceRef ||
          event.targetActor !== state.terminalWinTargetActor ||
          state.terminalWinners.has(event.winnerActor)
        ) {
          return invalid("unexpected_event_for_phase", event);
        }
        state.terminalWinners.add(event.winnerActor);
        return null;
      }
      if (
        state.phase !== "awaiting_action" &&
        state.phase !== "awaiting_responses" &&
        state.phase !== "awaiting_kan_resolution"
      ) {
        return invalid("unexpected_event_for_phase", event);
      }
      if (
        event.method === "ron" &&
        event.winSourceEventRef !== state.lastDiscardRef &&
        state.phase === "awaiting_responses"
      ) {
        return invalid("unexpected_event_for_phase", event);
      }
      state.terminalWinSourceRef = event.winSourceEventRef;
      state.terminalWinTargetActor = event.targetActor;
      state.terminalWinners.add(event.winnerActor);
      state.phase = "terminal";
      state.expectedActor = null;
      return null;

    case "round_drawn":
      if (
        state.phase === "before_game" ||
        state.phase === "between_rounds" ||
        state.phase === "terminal"
      ) {
        return invalid("unexpected_event_for_phase", event);
      }
      state.phase = "terminal";
      state.expectedActor = null;
      return null;

    case "scores_updated":
      if (state.phase !== "terminal") {
        return invalid("unexpected_event_for_phase", event);
      }
      return null;

    case "round_ended":
      if (state.phase !== "terminal") {
        return invalid("unexpected_event_for_phase", event);
      }
      state.phase = "between_rounds";
      state.expectedActor = null;
      return null;

    case "game_ended":
      if (state.phase !== "between_rounds" && state.phase !== "terminal") {
        return invalid("unexpected_event_for_phase", event);
      }
      state.phase = "game_ended";
      state.expectedActor = null;
      return null;
  }
}

export function validateCanonicalEventStream(
  stream: CanonicalEventStream,
): CanonicalStreamValidation {
  const state: ValidationState = {
    phase: "before_game",
    expectedActor: null,
    selfActor: stream.selfActor,
    selfConcealed: [],
    selfCurrentDraw: null,
    publicCounts: new Map(),
    discards: new Map(),
    consumedDiscards: new Set(),
    melds: new Map(),
    pendingRiichi: new Map(),
    lastDiscardRef: null,
    atamahane: stream.ruleSet.atamahane,
    terminalWinSourceRef: null,
    terminalWinTargetActor: null,
    terminalWinners: new Set(),
  };
  for (const event of stream.events) {
    const result = validateRoundEvent(state, event);
    if (result !== null) return result;
  }
  return { status: "valid" };
}
