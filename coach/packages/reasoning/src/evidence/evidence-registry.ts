import type {
  FactorEvidence,
  NormalizedEvent,
} from "@riichi-coach/contracts";

export type ReplayEvidenceNode = {
  evidenceId: string;
  kind: "replay_event";
  provenance: "raw_replay";
  event: NormalizedEvent;
};

export type ReplayEvidenceRegistry = Record<string, ReplayEvidenceNode>;

export function buildReplayEvidenceRegistry(input: {
  events: readonly NormalizedEvent[];
  visibleEventIds: readonly string[];
  factors: readonly FactorEvidence[];
}): ReplayEvidenceRegistry {
  const eventsById = new Map<string, NormalizedEvent>();
  for (const event of input.events) {
    if (eventsById.has(event.eventId)) {
      throw new Error(`Duplicate replay evidence ID: ${event.eventId}`);
    }
    eventsById.set(event.eventId, event);
  }

  const visible = new Set(input.visibleEventIds);
  const referenced = [
    ...new Set(input.factors.flatMap((factor) => factor.evidenceIds)),
  ].sort();
  const registry: ReplayEvidenceRegistry = {};

  for (const evidenceId of referenced) {
    if (!visible.has(evidenceId)) {
      throw new Error(
        `Evidence ${evidenceId} is not visible at the decision boundary`,
      );
    }
    const event = eventsById.get(evidenceId);
    if (!event) {
      throw new Error(`Evidence ${evidenceId} has no replay event`);
    }
    registry[evidenceId] = {
      evidenceId,
      kind: "replay_event",
      provenance: "raw_replay",
      event,
    };
  }

  return registry;
}
