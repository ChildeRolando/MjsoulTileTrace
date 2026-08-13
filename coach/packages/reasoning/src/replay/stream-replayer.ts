import type {
  CanonicalEventStream,
  DecisionSnapshotV2,
  KnownGameFacts,
} from "@riichi-coach/contracts";
import { freezeDecisionSnapshot } from "./decision-snapshot.js";
import { projectKnownGameFactsV2 } from "../factors/known-game-facts-v2.js";

export interface ReplayedDecision {
  readonly decisionEventRef: string;
  readonly snapshot: DecisionSnapshotV2;
  readonly facts: KnownGameFacts;
}

// Replay a canonical stream from the self actor's perspective: freeze a
// self-turn decision snapshot and project KnownGameFacts for every visible
// self draw. This proves a mapped record is re-playable into the auditable
// fact layer (M5's "freeze, replay, audit" criterion) without requiring a model.
export function replayCanonicalStream(
  stream: CanonicalEventStream,
): ReplayedDecision[] {
  const decisions: ReplayedDecision[] = [];
  for (const event of stream.events) {
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
    decisions.push({
      decisionEventRef: event.eventId,
      snapshot,
      facts,
    });
  }
  return decisions;
}
