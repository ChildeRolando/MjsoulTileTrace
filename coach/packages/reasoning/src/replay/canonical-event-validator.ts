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
  | "red_five_rule_mismatch"
  | "post_call_tsumogiri_invalid"
  | "riichi_state_invalid"
  | "draw_source_mismatch"
  | "dora_kan_mismatch"
  | "win_source_mismatch"
  | "settlement_binding_invalid"
  | "settlement_score_mismatch"
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

interface PendingKan {
  eventRef: string;
  actor: number;
  tile: Tile;
  kind: "daiminkan" | "ankan" | "kakan";
}

interface ValidationState {
  phase: ValidationPhase;
  expectedActor: number | null;
  selfActor: number;
  selfConcealed: Tile[];
  selfCurrentDraw: Tile | null;
  publicCounts: Map<string, number>;
  publicRedCounts: Map<string, number>;
  redFives: CanonicalEventStream["ruleSet"]["redFives"];
  doraIndicatorsComplete: boolean;
  discards: Map<string, KnownDiscard>;
  consumedDiscards: Set<string>;
  melds: Map<string, KnownMeld>;
  pendingRiichi: Map<number, string>;
  riichiStatus: Array<"none" | "declared" | "accepted">;
  openHands: Set<number>;
  lastDiscardRef: string | null;
  lastDrawRef: string | null;
  lastDrawActor: number | null;
  lastDrawTile: Tile | null;
  pendingKan: PendingKan | null;
  atamahane: boolean | "unknown";
  terminalWinSourceRef: string | null;
  terminalWinTargetActor: number | null;
  terminalWinTile: Tile | null;
  terminalWinners: Set<number>;
  terminalEventRef: string | null;
  roundStartScores: [number, number, number, number];
  terminalScoreDeltas: [number, number, number, number] | null;
  settlementApplied: boolean;
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
  if (tile.red) {
    state.publicRedCounts.set(tile.id, (state.publicRedCounts.get(tile.id) ?? 0) + 1);
  }
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
  return redCountsValid(state);
}

function redCountsValid(state: ValidationState): boolean {
  for (const suit of ["m", "p", "s"] as const) {
    const id = `5${suit}`;
    const ownedRed = [
      ...state.selfConcealed,
      ...(state.selfCurrentDraw === null ? [] : [state.selfCurrentDraw]),
    ].filter((tile) => tile.id === id && tile.red).length;
    const totalRed = ownedRed + (state.publicRedCounts.get(id) ?? 0);
    const configured = suit === "m"
      ? state.redFives.man
      : suit === "p"
        ? state.redFives.pin
        : state.redFives.sou;
    if (totalRed > 1 || (configured !== "unknown" && totalRed > configured)) {
      return false;
    }
  }
  return true;
}

function conservationInvalid(
  state: ValidationState,
  event: Pick<CanonicalGameEvent, "eventId">,
): CanonicalStreamValidation {
  return invalid(
    redCountsValid(state) ? "physical_tile_overflow" : "red_five_rule_mismatch",
    event,
  );
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
  if (state.riichiStatus[event.actor] !== "none") {
    return invalid("riichi_state_invalid", event);
  }
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
    return conservationInvalid(state, event);
  }
  state.consumedDiscards.add(event.calledDiscardEventRef);
  state.lastDiscardRef = null;
  state.melds.set(event.eventId, {
    actor: event.actor,
    kind: event.type === "pon_called" ? "pon" : "other",
    tileId: event.calledTile.id,
  });
  state.openHands.add(event.actor);
  state.expectedActor = event.actor;
  state.phase = event.type === "daiminkan_called"
    ? "awaiting_rinshan_draw"
    : "awaiting_post_call_discard";
  state.pendingKan = event.type === "daiminkan_called"
    ? {
        eventRef: event.eventId,
        actor: event.actor,
        tile: event.calledTile,
        kind: "daiminkan",
      }
    : null;
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
      state.publicRedCounts = new Map();
      state.discards.clear();
      state.consumedDiscards.clear();
      state.melds.clear();
      state.pendingRiichi.clear();
      state.riichiStatus = ["none", "none", "none", "none"];
      state.openHands.clear();
      state.lastDiscardRef = null;
      state.lastDrawRef = null;
      state.lastDrawActor = null;
      state.lastDrawTile = null;
      state.pendingKan = null;
      state.terminalWinSourceRef = null;
      state.terminalWinTargetActor = null;
      state.terminalWinTile = null;
      state.terminalWinners.clear();
      state.terminalEventRef = null;
      state.roundStartScores = [...event.scores];
      state.terminalScoreDeltas = [0, 0, 0, 0];
      state.settlementApplied = false;
      if (!addPublicTile(state, event.doraIndicator)) {
        return conservationInvalid(state, event);
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
      const rinshan = state.phase === "awaiting_rinshan_draw" ||
        state.phase === "awaiting_kan_resolution";
      if ((rinshan ? "rinshan" : "live_wall") !== event.from) {
        return invalid("draw_source_mismatch", event);
      }
      if (
        state.pendingKan !== null &&
        state.doraIndicatorsComplete
      ) return invalid("dora_kan_mismatch", event);
      if (event.actor === state.selfActor) {
        if (event.tile.visibility !== "visible") {
          return invalid("unexpected_event_for_phase", event);
        }
        state.selfCurrentDraw = event.tile.tile;
        if (!physicalCountsValid(state)) {
          return conservationInvalid(state, event);
        }
      }
      state.phase = "awaiting_action";
      state.lastDiscardRef = null;
      state.lastDrawRef = event.eventId;
      state.lastDrawActor = event.actor;
      state.lastDrawTile = event.tile.visibility === "visible"
        ? event.tile.tile
        : null;
      state.pendingKan = null;
      return null;
    }

    case "riichi_declared":
      if (state.phase !== "awaiting_action") {
        return invalid("unexpected_event_for_phase", event);
      }
      if (event.actor !== state.expectedActor) {
        return invalid("event_actor_mismatch", event);
      }
      if (
        state.riichiStatus[event.actor] !== "none" ||
        state.openHands.has(event.actor)
      ) return invalid("riichi_state_invalid", event);
      state.pendingRiichi.set(event.actor, event.eventId);
      state.riichiStatus[event.actor] = "declared";
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
      if (
        state.phase === "awaiting_post_call_discard" &&
        event.discardMode === "tsumogiri"
      ) return invalid("post_call_tsumogiri_invalid", event);
      if (
        state.riichiStatus[event.actor] === "accepted" &&
        event.discardMode !== "tsumogiri"
      ) return invalid("riichi_state_invalid", event);
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
        return conservationInvalid(state, event);
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
      state.riichiStatus[event.actor] = "accepted";
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
        return conservationInvalid(state, event);
      }
      state.melds.set(event.eventId, {
        actor: event.actor,
        kind: "other",
        tileId: event.tiles[0].id,
      });
      state.phase = "awaiting_kan_resolution";
      state.pendingKan = {
        eventRef: event.eventId,
        actor: event.actor,
        tile: event.tiles[0],
        kind: "ankan",
      };
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
        return conservationInvalid(state, event);
      }
      state.phase = "awaiting_kan_resolution";
      state.expectedActor = event.actor;
      state.pendingKan = {
        eventRef: event.eventId,
        actor: event.actor,
        tile: event.addedTile,
        kind: "kakan",
      };
      return null;
    }

    case "dora_revealed":
      if (
        state.pendingKan === null ||
        event.kanEventRef !== state.pendingKan.eventRef ||
        (state.phase !== "awaiting_kan_resolution" &&
          state.phase !== "awaiting_rinshan_draw")
      ) return invalid("dora_kan_mismatch", event);
      if (!addPublicTile(state, event.indicator)) {
        return conservationInvalid(state, event);
      }
      if (state.phase === "awaiting_kan_resolution") {
        state.phase = "awaiting_rinshan_draw";
      }
      state.pendingKan = null;
      return null;

    case "win_declared":
      if (state.phase === "terminal") {
        if (state.settlementApplied) {
          return invalid("settlement_binding_invalid", event);
        }
        if (
          state.terminalWinSourceRef === null ||
          state.atamahane === true ||
          event.method !== "ron" ||
          event.winSourceEventRef !== state.terminalWinSourceRef ||
          event.targetActor !== state.terminalWinTargetActor ||
          state.terminalWinTile === null ||
          !sameTile(event.winningTile, state.terminalWinTile) ||
          state.terminalWinners.has(event.winnerActor)
        ) {
          return invalid("unexpected_event_for_phase", event);
        }
        state.terminalWinners.add(event.winnerActor);
        if (event.scoreDeltas === null) {
          state.terminalScoreDeltas = null;
        } else if (state.terminalScoreDeltas !== null) {
          state.terminalScoreDeltas = state.terminalScoreDeltas.map(
            (value, actor) => value + event.scoreDeltas![actor]!,
          ) as [number, number, number, number];
        }
        return null;
      }
      if (event.method === "tsumo") {
        if (
          state.phase !== "awaiting_action" ||
          event.winnerActor !== state.expectedActor ||
          event.winSourceEventRef !== state.lastDrawRef ||
          event.winnerActor !== state.lastDrawActor ||
          (state.lastDrawTile !== null &&
            !sameTile(event.winningTile, state.lastDrawTile))
        ) return invalid("win_source_mismatch", event);
      } else if (state.phase === "awaiting_responses") {
        const discard = state.lastDiscardRef === null
          ? undefined
          : state.discards.get(state.lastDiscardRef);
        if (
          discard === undefined ||
          event.winSourceEventRef !== state.lastDiscardRef ||
          event.targetActor !== discard.actor ||
          !sameTile(event.winningTile, discard.tile)
        ) return invalid("win_source_mismatch", event);
      } else if (state.phase === "awaiting_kan_resolution") {
        if (
          state.pendingKan === null ||
          event.winSourceEventRef !== state.pendingKan.eventRef ||
          event.targetActor !== state.pendingKan.actor ||
          !sameTile(event.winningTile, state.pendingKan.tile)
        ) return invalid("win_source_mismatch", event);
      } else {
        return invalid("unexpected_event_for_phase", event);
      }
      state.terminalWinSourceRef = event.winSourceEventRef;
      state.terminalWinTargetActor = event.targetActor;
      state.terminalWinTile = event.winningTile;
      state.terminalWinners.add(event.winnerActor);
      state.terminalEventRef = event.eventId;
      state.terminalScoreDeltas = event.scoreDeltas === null
        ? null
        : [...event.scoreDeltas];
      state.phase = "terminal";
      state.terminalEventRef = event.eventId;
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
      state.terminalEventRef = event.eventId;
      state.terminalScoreDeltas = null;
      state.expectedActor = null;
      return null;

    case "scores_updated":
      if (state.phase !== "terminal") {
        return invalid("unexpected_event_for_phase", event);
      }
      if (
        state.terminalEventRef === null ||
        event.settlementEventRef !== state.terminalEventRef ||
        state.settlementApplied
      ) return invalid("settlement_binding_invalid", event);
      if (
        state.terminalScoreDeltas !== null &&
        event.scores.some((score, actor) =>
          score !== state.roundStartScores[actor]! +
            state.terminalScoreDeltas![actor]!
        )
      ) return invalid("settlement_score_mismatch", event);
      state.settlementApplied = true;
      return null;

    case "round_ended":
      if (state.phase !== "terminal") {
        return invalid("unexpected_event_for_phase", event);
      }
      if (
        state.terminalEventRef === null ||
        event.terminalEventRef !== state.terminalEventRef
      ) return invalid("settlement_binding_invalid", event);
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
    publicRedCounts: new Map(),
    redFives: stream.ruleSet.redFives,
    doraIndicatorsComplete: stream.completeness.doraIndicators === "complete",
    discards: new Map(),
    consumedDiscards: new Set(),
    melds: new Map(),
    pendingRiichi: new Map(),
    riichiStatus: ["none", "none", "none", "none"],
    openHands: new Set(),
    lastDiscardRef: null,
    lastDrawRef: null,
    lastDrawActor: null,
    lastDrawTile: null,
    pendingKan: null,
    atamahane: stream.ruleSet.atamahane,
    terminalWinSourceRef: null,
    terminalWinTargetActor: null,
    terminalWinTile: null,
    terminalWinners: new Set(),
    terminalEventRef: null,
    roundStartScores: [0, 0, 0, 0],
    terminalScoreDeltas: null,
    settlementApplied: false,
  };
  for (const event of stream.events) {
    const result = validateRoundEvent(state, event);
    if (result !== null) return result;
  }
  return { status: "valid" };
}
