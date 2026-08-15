import type {
  CanonicalEventStream,
  CanonicalGameEvent,
  DecisionSnapshotV2,
  KnownGameFacts,
  RiichiAction,
  Tile,
} from "@riichi-coach/contracts";
import { freezeDecisionSnapshot } from "./decision-snapshot.js";
import { projectKnownGameFactsV2 } from "../factors/known-game-facts-v2.js";

export interface ReplayedDecision {
  readonly decisionEventRef: string;
  readonly snapshot: DecisionSnapshotV2;
  readonly facts: KnownGameFacts;
  // The self actor's discard action immediately following this draw, if any.
  readonly actualDiscard: Extract<CanonicalGameEvent, { type: "tile_discarded" }> | null;
  // M6-A3: the local actual as a typed action for every replay surface. null
  // when the window was not resolved by a self action we represent (e.g. a
  // round-ending event with no actor, such as 荒牌流局).
  readonly actualAction: RiichiAction | null;
}

type DiscardEvent = Extract<CanonicalGameEvent, { type: "tile_discarded" }>;

// How a decision window was resolved on the self side, scanned forward from
// the window's trigger event. The scan stops at the first event that cannot
// legally sit between the trigger and the self action, so it can never leak a
// later turn or a later round's action into the current decision.
type SelfResolution =
  | { kind: "discard"; event: DiscardEvent }
  | {
      kind: "tsumo";
      winningTile: Tile;
      drawEventRef: string;
    }
  | {
      kind: "ankan";
      tiles: [Tile, Tile, Tile, Tile];
    }
  | {
      kind: "kakan";
      addedTile: Tile;
      existingMeldRef: string;
    }
  | {
      // 九种九牌: the self actor aborts the round on their own draw. Within
      // a scan that starts at the self draw, no other actor can intervene,
      // so a kyuushu round_drawn reached here is unambiguously the self
      // actor's declaration.
      kind: "kyuushu";
      drawEventRef: string;
    };

function tileDiscardedBy(
  event: CanonicalGameEvent,
  selfActor: number,
): event is DiscardEvent {
  return event.type === "tile_discarded" && event.actor === selfActor;
}

// Scan forward from the trigger for the self action that resolves the window.
// `declaredRiichiPending` allows a self riichi declaration between a draw and
// its discard (the declaration turn); every other surface expects its action
// directly after the trigger.
function scanSelfResolution(
  stream: CanonicalEventStream,
  startIndex: number,
  drawEventRef: string | null,
  declaredRiichiPending: boolean,
): SelfResolution | null {
  for (let index = startIndex; index < stream.events.length; index += 1) {
    const event = stream.events[index]!;
    if (tileDiscardedBy(event, stream.selfActor)) {
      return { kind: "discard", event };
    }
    if (declaredRiichiPending && event.type === "riichi_declared" &&
      event.actor === stream.selfActor) {
      continue;
    }
    if (
      event.type === "win_declared" &&
      event.method === "tsumo" &&
      event.winnerActor === stream.selfActor &&
      drawEventRef !== null &&
      event.winSourceEventRef === drawEventRef
    ) {
      return {
        kind: "tsumo",
        winningTile: event.winningTile,
        drawEventRef,
      };
    }
    if (event.type === "ankan_declared" && event.actor === stream.selfActor) {
      return {
        kind: "ankan",
        tiles: event.tiles,
      };
    }
    if (event.type === "kakan_declared" && event.actor === stream.selfActor) {
      return {
        kind: "kakan",
        addedTile: event.addedTile,
        existingMeldRef: event.upgradedPonEventRef,
      };
    }
    if (
      event.type === "round_drawn"
      && event.reason === "kyuushu_kyuuhai"
      && drawEventRef !== null
    ) {
      return { kind: "kyuushu", drawEventRef };
    }
    return null;
  }
  return null;
}

function actualActionFromResolution(
  resolution: SelfResolution | null,
  windowKind: "self_turn" | "post_call_discard" | "post_riichi_discard",
): RiichiAction | null {
  if (resolution === null) return null;
  switch (resolution.kind) {
    case "discard":
      // The declaration turn's discard is shared by two windows with
      // different action identities: the self_turn window carries the full
      // riichi_discard (Mortal's reach entry), while the post_riichi window
      // carries the same tile as a plain discard (Mortal's same-turn dahai
      // entry with at_self_riichi=true).
      return windowKind === "self_turn" &&
          resolution.event.riichiDeclarationEventRef !== null
        ? {
          kind: "riichi_discard",
          tile: resolution.event.tile,
          discardMode: resolution.event.discardMode,
        }
        : {
          kind: "discard",
          tile: resolution.event.tile,
          discardMode: resolution.event.discardMode,
        };
    case "tsumo":
      return {
        kind: "tsumo",
        winningTile: resolution.winningTile,
        drawEventRef: resolution.drawEventRef,
      };
    case "ankan":
      return { kind: "ankan", tiles: resolution.tiles };
    case "kyuushu":
      return {
        kind: "kyuushu_kyuuhai",
        drawEventRef: resolution.drawEventRef,
      };
    case "kakan":
      return {
        kind: "kakan",
        addedTile: resolution.addedTile,
        existingMeldRef: resolution.existingMeldRef,
      };
  }
}

function freezeWindow(
  stream: CanonicalEventStream,
  window: { kind: "self_turn" | "post_call_discard" | "post_riichi_discard"; actor: number; triggerEventRef: string },
  resolution: SelfResolution | null,
): ReplayedDecision {
  const snapshot = freezeDecisionSnapshot(stream, {
    kind: window.kind,
    actor: window.actor,
    triggerEventRef: window.triggerEventRef,
  });
  const facts = projectKnownGameFactsV2({
    stream,
    decisionWindow: snapshot.privateState.decisionWindow,
    cachedSnapshot: snapshot,
  });
  return {
    decisionEventRef: window.triggerEventRef,
    snapshot,
    facts,
    actualDiscard: resolution !== null && resolution.kind === "discard"
      ? resolution.event
      : null,
    actualAction: actualActionFromResolution(resolution, window.kind),
  };
}

// Replay a canonical stream from the self actor's perspective: freeze a
// decision snapshot and project KnownGameFacts for every self decision
// surface — every visible self draw (self_turn), the discard after a self
// chi/pon (post_call_discard), and the declaration turn's discard after a
// self riichi declaration (post_riichi_discard). This proves a mapped record
// is re-playable into the auditable fact layer (M5's "freeze, replay, audit"
// criterion) without requiring a model.
export function replayCanonicalStream(
  stream: CanonicalEventStream,
): ReplayedDecision[] {
  const decisions: ReplayedDecision[] = [];
  for (let index = 0; index < stream.events.length; index += 1) {
    const event = stream.events[index]!;
    if (event.type === "tile_drawn" && event.actor === stream.selfActor &&
      event.tile.visibility === "visible") {
      decisions.push(freezeWindow(
        stream,
        {
          kind: "self_turn",
          actor: stream.selfActor,
          triggerEventRef: event.eventId,
        },
        scanSelfResolution(stream, index + 1, event.eventId, true),
      ));
      continue;
    }
    if (
      (event.type === "chi_called" || event.type === "pon_called") &&
      event.actor === stream.selfActor
    ) {
      decisions.push(freezeWindow(
        stream,
        {
          kind: "post_call_discard",
          actor: stream.selfActor,
          triggerEventRef: event.eventId,
        },
        scanSelfResolution(stream, index + 1, null, false),
      ));
      continue;
    }
    if (event.type === "riichi_declared" && event.actor === stream.selfActor) {
      decisions.push(freezeWindow(
        stream,
        {
          kind: "post_riichi_discard",
          actor: stream.selfActor,
          triggerEventRef: event.eventId,
        },
        scanSelfResolution(stream, index + 1, null, false),
      ));
    }
  }
  return decisions;
}
