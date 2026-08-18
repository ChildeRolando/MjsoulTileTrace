import type {
  CanonicalEventStream,
  CanonicalGameEvent,
  DecisionSnapshotV2,
  DecisionWindow,
  KnownGameFacts,
  RiichiAction,
  Tile,
} from "@riichi-coach/contracts";
import {
  freezeDecisionSnapshotInContext,
  freezeDecisionStreamContext,
  type DecisionStreamContext,
} from "./decision-snapshot.js";
import type { ReducedCanonicalState } from "./round-reducer.js";
import { projectKnownGameFactsV2 } from "../factors/known-game-facts-v2.js";
import {
  canChi,
  canDaiminkan,
  canPon,
  canRon,
  seatDistance,
} from "./response-eligibility.js";

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
  getContext: () => DecisionStreamContext,
  window: { kind: "self_turn" | "post_call_discard" | "post_riichi_discard"; actor: number; triggerEventRef: string },
  resolution: SelfResolution | null,
): ReplayedDecision {
  const context = getContext();
  const snapshot = freezeDecisionSnapshotInContext(context, {
    kind: window.kind,
    actor: window.actor,
    triggerEventRef: window.triggerEventRef,
  });
  const facts = projectKnownGameFactsV2({
    stream,
    decisionWindow: snapshot.privateState.decisionWindow,
    cachedSnapshot: snapshot,
    streamContext: context,
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

// ---------------------------------------------------------------------------
// M6-A4.1: response surface — windows the reviewed player owns in response to
// an opponent's discard (chi / pon / daiminkan / ron / pass) or an opponent's
// kakan (chankan ron / pass). Opening authority is canonical events + local
// rules/hand content ONLY (开窗权威分离): a window opens when the local hand
// holds >= 1 legal non-pass response candidate, or when the canonical stream
// proves the reviewed player actually responded. Mortal markers are never
// consulted here — they are A4.2's source-side binding anchors.
// ---------------------------------------------------------------------------

type ResponseSourceEvent = Extract<
  CanonicalGameEvent,
  { type: "tile_discarded" | "kakan_declared" }
>;

// How a response window was resolved on the canonical side, scanned forward
// from the trigger (an opponent discard or kakan). `pass` is the explicit
// "the reviewed player did not call" outcome (Mortal's `none`); `unresolved`
// means the stream ended before the window closed.
type ResponseResolution =
  | { kind: "pass"; closingEventRef: string }
  | { kind: "unresolved" }
  | { kind: "chi"; responder: number; event: Extract<CanonicalGameEvent, { type: "chi_called" }> }
  | { kind: "pon"; responder: number; event: Extract<CanonicalGameEvent, { type: "pon_called" }> }
  | { kind: "daiminkan"; responder: number; event: Extract<CanonicalGameEvent, { type: "daiminkan_called" }> }
  | { kind: "ron"; responder: number; event: Extract<CanonicalGameEvent, { type: "win_declared" }> };

function scanDiscardResponse(
  stream: CanonicalEventStream,
  startIndex: number,
  sourceEventId: string,
): ResponseResolution {
  for (let index = startIndex; index < stream.events.length; index += 1) {
    const event = stream.events[index]!;
    // The discard passed without a call: the next draw closes the window.
    if (event.type === "tile_drawn") {
      return { kind: "pass", closingEventRef: event.eventId };
    }
    if (event.type === "chi_called") {
      if (event.calledDiscardEventRef !== sourceEventId) continue;
      return { kind: "chi", responder: event.actor, event };
    }
    if (event.type === "pon_called") {
      if (event.calledDiscardEventRef !== sourceEventId) continue;
      return { kind: "pon", responder: event.actor, event };
    }
    if (event.type === "daiminkan_called") {
      if (event.calledDiscardEventRef !== sourceEventId) continue;
      return { kind: "daiminkan", responder: event.actor, event };
    }
    if (
      event.type === "win_declared" &&
      event.method === "ron" &&
      event.winSourceEventRef === sourceEventId
    ) {
      return { kind: "ron", responder: event.winnerActor, event };
    }
    if (
      event.type === "round_drawn" ||
      event.type === "round_ended" ||
      event.type === "game_ended"
    ) {
      return { kind: "pass", closingEventRef: event.eventId };
    }
  }
  return { kind: "unresolved" };
}

function scanKanResponse(
  stream: CanonicalEventStream,
  startIndex: number,
  sourceEventId: string,
  sourceActor: number,
): ResponseResolution {
  for (let index = startIndex; index < stream.events.length; index += 1) {
    const event = stream.events[index]!;
    if (
      event.type === "win_declared" &&
      event.method === "ron" &&
      event.winSourceEventRef === sourceEventId
    ) {
      return { kind: "ron", responder: event.winnerActor, event };
    }
    // The kan's dora reveal (or the declarer's rinshan draw) closes the
    // chankan window without a call.
    if (event.type === "dora_revealed" && event.kanEventRef === sourceEventId) {
      return { kind: "pass", closingEventRef: event.eventId };
    }
    if (
      event.type === "tile_drawn" &&
      event.actor === sourceActor &&
      event.from === "rinshan"
    ) {
      return { kind: "pass", closingEventRef: event.eventId };
    }
    if (
      event.type === "round_drawn" ||
      event.type === "round_ended" ||
      event.type === "game_ended"
    ) {
      return { kind: "pass", closingEventRef: event.eventId };
    }
  }
  return { kind: "unresolved" };
}

/**
 * Local window eligibility for a response source event. Returns false
 * (fail-closed: do not open) when the private facts are incomplete — the
 * canonical stream of a mapped game always carries the complete concealed
 * hand; fixtures that cannot prove a candidate are skipped rather than
 * guessed. A riichi'd reviewed player keeps only the ron candidate (chi/pon/
 * daiminkan would break riichi).
 */
function responseWindowEligible(
  state: ReducedCanonicalState | undefined,
  source: ResponseSourceEvent,
  selfActor: number,
): boolean {
  if (state === undefined) return false;
  const privateState = state.privateState;
  const publicState = state.publicState;
  if (privateState === null || publicState === null) return false;
  if (privateState.fields.concealedTiles !== "complete") return false;
  if (privateState.currentDraw !== null) return false;
  const concealed = privateState.concealedTiles;
  const meldCount = publicState.melds.filter(
    (meld) => meld.actor === selfActor,
  ).length;
  const inRiichi = publicState.riichiStates[selfActor]!.status !== "none";
  if (source.type === "tile_discarded") {
    const offered = source.tile;
    const distance = seatDistance(source.actor, selfActor);
    if (!inRiichi) {
      // Chi is the next seat's right only; pon/daiminkan are any opponent's
      // right (M6-A4.1, pinned by H2: the reviewed player at seat distance 3
      // both pon'd a discard and was given pon candidates by Mortal).
      if (distance === 1 && canChi(concealed, offered)) return true;
      if (canPon(concealed, offered) || canDaiminkan(concealed, offered)) {
        return true;
      }
    }
    return canRon(concealed, meldCount, offered);
  }
  // kakan: chankan ron eligibility on the added tile. Ankan chankan (kokushi)
  // is wave-2 — no ankan source opens a window in A4.1.
  return canRon(concealed, meldCount, source.addedTile);
}

function responseActualAction(
  responseKind: "discard" | "kakan",
  source: ResponseSourceEvent,
  selfActor: number,
  resolution: ResponseResolution,
): RiichiAction | null {
  const pass = (): RiichiAction => ({
    kind: "pass",
    responseEventRef: source.eventId,
    responseKind,
  });
  if (resolution.kind === "unresolved") return null;
  if (resolution.kind === "pass") return pass();
  // Someone else called the source before the reviewed player: the reviewed
  // player's decision was to pass (the window still exists as their decision
  // point; priority semantics are canonical, not guessed).
  if (resolution.responder !== selfActor) return pass();
  if (resolution.kind === "ron") {
    const event = resolution.event;
    return {
      kind: "ron",
      winningTile: event.winningTile,
      targetActor: event.targetActor ?? source.actor,
      responseEventRef: source.eventId,
      winContext: responseKind === "discard" ? "discard" : "kakan",
    };
  }
  switch (resolution.kind) {
    case "chi": {
      const event = resolution.event;
      return {
        kind: "chi",
        calledTile: event.calledTile,
        consumedTiles: event.consumedTiles,
        targetActor: event.targetActor,
        responseEventRef: source.eventId,
      };
    }
    case "pon": {
      const event = resolution.event;
      return {
        kind: "pon",
        calledTile: event.calledTile,
        consumedTiles: event.consumedTiles,
        targetActor: event.targetActor,
        responseEventRef: source.eventId,
      };
    }
    case "daiminkan": {
      const event = resolution.event;
      return {
        kind: "daiminkan",
        calledTile: event.calledTile,
        consumedTiles: event.consumedTiles,
        targetActor: event.targetActor,
        responseEventRef: source.eventId,
      };
    }
  }
}

function freezeResponseWindow(
  stream: CanonicalEventStream,
  getContext: () => DecisionStreamContext,
  window: DecisionWindow,
  source: ResponseSourceEvent,
  resolution: ResponseResolution,
): ReplayedDecision {
  const context = getContext();
  const snapshot = freezeDecisionSnapshotInContext(context, window);
  const facts = projectKnownGameFactsV2({
    stream,
    decisionWindow: snapshot.privateState.decisionWindow,
    cachedSnapshot: snapshot,
    streamContext: context,
  });
  const responseKind = window.kind === "discard_response" ? "discard" : "kakan";
  return {
    decisionEventRef: window.triggerEventRef,
    snapshot,
    facts,
    actualDiscard: null,
    actualAction: responseActualAction(
      responseKind,
      source,
      stream.selfActor,
      resolution,
    ),
  };
}

/**
 * M6-A4.1: replay the response surface — a discard_response window for every
 * opponent discard where the reviewed player holds a legal non-pass response
 * candidate (chi / pon / daiminkan / ron), and a kan_response window for every
 * opponent kakan where chankan ron is locally possible. The actual resolution
 * (chi / pon / daiminkan / ron / pass) is scanned forward from the trigger.
 * Shares the one streamContext parse+reduce with the self-surface replay
 * (freezeDecisionStreamContext). A stream with no selfActor (no reviewed seat)
 * yields no response windows.
 */
export function replayCanonicalResponseWindows(
  stream: CanonicalEventStream,
): ReplayedDecision[] {
  const decisions: ReplayedDecision[] = [];
  if (stream.selfActor === null) return decisions;
  let context: DecisionStreamContext | undefined;
  const getContext = (): DecisionStreamContext =>
    (context ??= freezeDecisionStreamContext(stream));
  for (let index = 0; index < stream.events.length; index += 1) {
    const event = stream.events[index]!;
    if (
      (event.type === "tile_discarded" || event.type === "kakan_declared") &&
      event.actor !== stream.selfActor
    ) {
      const source = event as ResponseSourceEvent;
      const resolution = source.type === "tile_discarded"
        ? scanDiscardResponse(stream, index + 1, source.eventId)
        : scanKanResponse(stream, index + 1, source.eventId, source.actor);
      // Never under-approximate: a window the canonical stream proves the
      // reviewed player resolved by calling always opens, even when local
      // eligibility cannot be proven (incomplete private facts).
      const selfResponded =
        resolution.kind !== "pass" &&
        resolution.kind !== "unresolved" &&
        resolution.responder === stream.selfActor;
      const state = getContext().statesByRef.get(source.eventId);
      const eligible = selfResponded ||
        responseWindowEligible(state, source, stream.selfActor);
      if (!eligible) continue;
      const window: DecisionWindow = source.type === "tile_discarded"
        ? {
          kind: "discard_response",
          actor: stream.selfActor,
          triggerEventRef: source.eventId,
          sourceActor: source.actor,
          offeredTile: source.tile,
        }
        : {
          kind: "kan_response",
          actor: stream.selfActor,
          triggerEventRef: source.eventId,
          sourceActor: source.actor,
          offeredTile: source.addedTile,
          kanKind: "kakan",
        };
      decisions.push(freezeResponseWindow(
        stream,
        getContext,
        window,
        source,
        resolution,
      ));
    }
  }
  return decisions;
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
  // Parse + reduce once, lazily: built on the FIRST window so a stream with
  // no self windows is never validated (the per-window freeze used to defer
  // all parsing/validation the same way). Every window below then shares the
  // one reduction — re-reducing per window made the replay O(windows ×
  // events²), ~172s per seat on corpus games — with identical outputs.
  let context: DecisionStreamContext | undefined;
  const getContext = (): DecisionStreamContext =>
    (context ??= freezeDecisionStreamContext(stream));
  for (let index = 0; index < stream.events.length; index += 1) {
    const event = stream.events[index]!;
    if (event.type === "tile_drawn" && event.actor === stream.selfActor &&
      event.tile.visibility === "visible") {
      decisions.push(freezeWindow(
        stream,
        getContext,
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
        getContext,
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
        getContext,
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
