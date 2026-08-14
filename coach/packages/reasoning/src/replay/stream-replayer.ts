import type {
  CanonicalEventStream,
  CanonicalGameEvent,
  DecisionSnapshotV2,
  KnownGameFacts,
} from "@riichi-coach/contracts";
import { freezeDecisionSnapshot } from "./decision-snapshot.js";
import { projectKnownGameFactsV2 } from "../factors/known-game-facts-v2.js";

export interface ReplayedDecision {
  readonly decisionEventRef: string;
  readonly snapshot: DecisionSnapshotV2;
  readonly facts: KnownGameFacts;
  // The self actor's discard action immediately following this draw, if any.
  readonly actualDiscard: Extract<CanonicalGameEvent, { type: "tile_discarded" }> | null;
}

// The self actor's immediate discard for a visible self draw, or null when the
// draw was not resolved by a discard (ankan, tsumo, or any round-ending event).
// A discard is only bound when it belongs to the decision window this draw
// opened: the scan allows a self riichi declaration between draw and discard,
// and stops at the next self draw or any other event so it can never leak a
// later turn or a later round's discard into the current decision.
function immediateSelfDiscard(
  stream: CanonicalEventStream,
  drawIndex: number,
): Extract<CanonicalGameEvent, { type: "tile_discarded" }> | null {
  for (let index = drawIndex + 1; index < stream.events.length; index += 1) {
    const event = stream.events[index]!;
    if (event.type === "tile_discarded" && event.actor === stream.selfActor) {
      return event;
    }
    if (event.type === "riichi_declared" && event.actor === stream.selfActor) {
      continue;
    }
    return null;
  }
  return null;
}

// Replay a canonical stream from the self actor's perspective: freeze a
// self-turn decision snapshot and project KnownGameFacts for every visible
// self draw. This proves a mapped record is re-playable into the auditable
// fact layer (M5's "freeze, replay, audit" criterion) without requiring a model.
export function replayCanonicalStream(
  stream: CanonicalEventStream,
): ReplayedDecision[] {
  const decisions: ReplayedDecision[] = [];
  for (let index = 0; index < stream.events.length; index += 1) {
    const event = stream.events[index]!;
    if (event.type !== "tile_drawn" || event.actor !== stream.selfActor) {
      continue;
    }
    if (event.tile.visibility !== "visible") continue;
    const snapshot = freezeDecisionSnapshot(stream, {
      kind: "self_turn",
      actor: stream.selfActor,
      triggerEventRef: event.eventId,
    });
    const facts = projectKnownGameFactsV2({
      stream,
      decisionWindow: snapshot.privateState.decisionWindow,
      cachedSnapshot: snapshot,
    });
    const actualDiscard = immediateSelfDiscard(stream, index);
    decisions.push({
      decisionEventRef: event.eventId,
      snapshot,
      facts,
      actualDiscard,
    });
  }
  return decisions;
}
