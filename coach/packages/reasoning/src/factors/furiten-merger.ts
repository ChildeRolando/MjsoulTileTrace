import {
  CandidateDiscardEvidenceV2Schema,
  HandStructureResultV2Schema,
  MergedHandFuritenV2Schema,
  compareCanonicalEventPositions,
  parseCanonicalEventRef,
  ResponseFuritenAnalysisV2Schema,
  RiverDiscardV2Schema,
  type CandidateDiscardEvidenceV2,
  type HandStructureResultV2,
  type MergedHandFuritenV2,
  type RiverDiscardV2,
  type ResponseSceneBindingV2,
} from "@riichi-coach/contracts";
import type { ResponseFuritenAnalysis } from "../replay/response-furiten.js";
import { tileIdTo34 } from "./tile34.js";

interface FuritenMergeBase {
  factSetId: string;
  decisionEventRef: string;
  hand: HandStructureResultV2;
  selfActor: number;
  selfRiver: readonly RiverDiscardV2[];
  selfRiverComplete: boolean;
  response: ResponseFuritenAnalysis;
}

export type FuritenMergeInput = FuritenMergeBase & (
  | { source: "current_scene"; candidateDiscard: null }
  | {
      source: "candidate_discard";
      candidateDiscard: CandidateDiscardEvidenceV2;
    }
);

function validateSelfRiver(
  rawRiver: readonly RiverDiscardV2[],
  selfActor: number,
  binding: ResponseSceneBindingV2,
): RiverDiscardV2[] {
  const river = rawRiver.map((discard) => RiverDiscardV2Schema.parse(discard));
  const refs = new Set<string>();
  for (const discard of river) {
    if (discard.actor !== selfActor) {
      throw new Error("furiten_merge_self_river_actor_mismatch");
    }
    if (discard.eventRef.startsWith("action:v1:")) {
      throw new Error("furiten_merge_canonical_event_ref_is_action_ref");
    }
    if (refs.has(discard.eventRef)) {
      throw new Error("furiten_merge_duplicate_canonical_event_ref");
    }
    refs.add(discard.eventRef);
    if (binding.source === "canonical_replay") {
      const decision = parseCanonicalEventRef(binding.decisionEventRef);
      const event = parseCanonicalEventRef(discard.eventRef);
      if (
        decision === null || event === null ||
        event.gameId !== decision.gameId ||
        event.position.roundOrdinal !== decision.position.roundOrdinal ||
        compareCanonicalEventPositions(event.position, decision.position) > 0
      ) {
        throw new Error("furiten_merge_self_river_scene_mismatch");
      }
    }
  }
  return river;
}

function validateResponse(
  raw: ResponseFuritenAnalysis,
  factSetId: string,
  decisionEventRef: string,
  selfActor: number,
  hand: HandStructureResultV2,
): ResponseFuritenAnalysis {
  const parsed = ResponseFuritenAnalysisV2Schema.parse(raw);
  if (parsed.binding.factSetId !== factSetId) {
    throw new Error("furiten_merge_response_fact_set_mismatch");
  }
  if (parsed.binding.decisionEventRef !== decisionEventRef) {
    throw new Error("furiten_merge_response_decision_event_mismatch");
  }
  if (parsed.binding.selfActor !== selfActor) {
    throw new Error("furiten_merge_response_self_actor_mismatch");
  }
  if (
    parsed.binding.source === "canonical_replay" &&
    parsed.binding.engineIdentityStatus === "known" &&
    JSON.stringify(parsed.binding.engineIdentity) !== JSON.stringify(hand.identity)
  ) {
    throw new Error("furiten_merge_engine_identity_mismatch");
  }
  for (const component of [parsed.temporary, parsed.riichi]) {
    if (component.evidenceIds.some((reference) =>
      reference.startsWith("action:v1:")
    )) {
      throw new Error("furiten_merge_response_event_ref_is_action_ref");
    }
  }
  return parsed;
}

function validateCandidate(
  raw: CandidateDiscardEvidenceV2 | null,
  hand: HandStructureResultV2,
  selfActor: number,
): CandidateDiscardEvidenceV2 | null {
  if (raw === null) return null;
  const candidate = CandidateDiscardEvidenceV2Schema.parse(raw);
  if (candidate.actor !== selfActor) {
    throw new Error("furiten_merge_candidate_actor_mismatch");
  }
  if (candidate.actionRef !== hand.actionRef) {
    throw new Error("furiten_merge_candidate_action_ref_mismatch");
  }
  if (candidate.stateHash !== hand.stateHash) {
    throw new Error("furiten_merge_candidate_state_hash_mismatch");
  }
  return candidate;
}

export function mergeHandStructureFuriten(
  raw: FuritenMergeInput,
): MergedHandFuritenV2 {
  const hand = HandStructureResultV2Schema.parse(raw.hand);
  if (typeof raw.factSetId !== "string" || raw.factSetId.length === 0) {
    throw new Error("furiten_merge_invalid_fact_set_id");
  }
  if (
    typeof raw.decisionEventRef !== "string" ||
    raw.decisionEventRef.length === 0
  ) {
    throw new Error("furiten_merge_invalid_decision_event_ref");
  }
  if (
    hand.requestId !== `${raw.factSetId}:hand-structure:${hand.stateHash}`
  ) {
    throw new Error("furiten_merge_hand_request_mismatch");
  }
  if (!Number.isInteger(raw.selfActor) || raw.selfActor < 0 || raw.selfActor > 3) {
    throw new Error("furiten_merge_invalid_self_actor");
  }
  if (typeof raw.selfRiverComplete !== "boolean") {
    throw new Error("furiten_merge_invalid_river_completeness");
  }
  if (raw.source === "candidate_discard" && raw.candidateDiscard === null) {
    throw new Error("furiten_merge_candidate_evidence_required");
  }
  if (raw.source === "current_scene" && raw.candidateDiscard !== null) {
    throw new Error("furiten_merge_current_scene_rejects_candidate_evidence");
  }
  if (raw.source !== "current_scene" && raw.source !== "candidate_discard") {
    throw new Error("furiten_merge_invalid_source");
  }
  if (raw.source === "current_scene" && hand.actionRef.startsWith("action:v1:")) {
    throw new Error("furiten_merge_current_scene_rejects_candidate_action_ref");
  }
  if (
    raw.source === "candidate_discard" &&
    !hand.actionRef.startsWith("action:v1:")
  ) {
    throw new Error("furiten_merge_candidate_source_requires_action_ref");
  }
  const response = validateResponse(
    raw.response,
    raw.factSetId,
    raw.decisionEventRef,
    raw.selfActor,
    hand,
  );
  const selfRiver = validateSelfRiver(
    raw.selfRiver,
    raw.selfActor,
    response.binding,
  );
  const candidate = validateCandidate(raw.candidateDiscard, hand, raw.selfActor);
  const structuralWaits = new Set(hand.waits.map((wait) => wait.tile34));
  const canonicalEventRefs = selfRiver
    .filter((discard) => structuralWaits.has(tileIdTo34(discard.tile.id)))
    .map((discard) => discard.eventRef);
  const candidateActionRefs = candidate !== null &&
      structuralWaits.has(tileIdTo34(candidate.tile.id))
    ? [candidate.actionRef]
    : [];
  const hasMatch = canonicalEventRefs.length > 0 ||
    candidateActionRefs.length > 0;
  const discard = hasMatch
    ? {
        status: "confirmed" as const,
        source: raw.source,
        selfActor: raw.selfActor,
        selfRiver,
        selfRiverComplete: raw.selfRiverComplete,
        candidateDiscard: candidate,
        canonicalEventRefs,
        candidateActionRefs,
      }
    : raw.selfRiverComplete
      ? {
          status: "clear" as const,
          source: raw.source,
          selfActor: raw.selfActor,
          selfRiver,
          selfRiverComplete: raw.selfRiverComplete,
          candidateDiscard: candidate,
          canonicalEventRefs: [],
          candidateActionRefs: [],
        }
      : {
          status: "unknown" as const,
          source: raw.source,
          selfActor: raw.selfActor,
          selfRiver,
          selfRiverComplete: raw.selfRiverComplete,
          candidateDiscard: candidate,
          canonicalEventRefs: [],
          candidateActionRefs: [],
        };
  const components = [discard, response.temporary, response.riichi];
  const anyConfirmed = components.some((component) =>
    component.status === "confirmed"
  );
  const noPotentialRonWait = hand.waits.length === 0 ||
    hand.waits.every((wait) => wait.baseRonEligibility === "ineligible");
  const hasUnknownDependency = components.some((component) =>
    component.status === "unknown"
  ) || hand.waits.some((wait) =>
    wait.baseRonEligibility === "unknown_missing_situational_yaku_context"
  );
  const ronEligibilityStatus = anyConfirmed || noPotentialRonWait ||
      !hasUnknownDependency
    ? "calculated" as const
    : "unknown_missing_facts" as const;
  const ronEligibleWaits34 = ronEligibilityStatus === "calculated" &&
      !anyConfirmed && !noPotentialRonWait
    ? hand.waits
        .filter((wait) => wait.baseRonEligibility === "eligible")
        .map((wait) => wait.tile34)
        .sort((left, right) => left - right)
    : [];
  return MergedHandFuritenV2Schema.parse({
    binding: response.binding,
    hand,
    furiten: {
      discard,
      temporary: response.temporary,
      riichi: response.riichi,
    },
    ronEligibilityStatus,
    ronEligibleWaits34,
  });
}
