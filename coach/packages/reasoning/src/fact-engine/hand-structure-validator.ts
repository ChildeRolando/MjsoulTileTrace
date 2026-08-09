import {
  CompletedHandFactResultSchema,
  Hand13FactResultSchema,
  HandStructureResultV2Schema,
  ThreatRiskFactResultSchema,
  type CompletedHandFactRequest,
  type CompletedHandFactResult,
  type Hand13FactRequest,
  type Hand13FactResult,
  type HandStructureRequestV2,
  type HandStructureResultV2,
  type ThreatRiskFactRequest,
  type ThreatRiskFactResult,
} from "@riichi-coach/contracts";

export class HandStructureResultValidationError extends Error {
  constructor(
    readonly code: "invalid_fact_engine_response" |
      "hand_structure_result_mismatch" |
      "request_id_mismatch" |
      "action_ref_mismatch" |
      "state_hash_mismatch" |
      "threat_actor_mismatch" |
      "evidence_ids_mismatch",
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "HandStructureResultValidationError";
  }
}

function rejectInvalidResponse(): never {
  throw new HandStructureResultValidationError(
    "invalid_fact_engine_response",
    "fact engine response failed schema validation",
  );
}

function rejectMismatch(): never {
  throw new HandStructureResultValidationError(
    "hand_structure_result_mismatch",
    "hand structure result does not match the bound request",
  );
}

interface ResultShapeGroup {
  kind: string;
  tiles34: number[];
}

function shapeGroupKey(group: ResultShapeGroup): string {
  return JSON.stringify([group.kind, group.tiles34]);
}

function countShapeGroups(groups: ResultShapeGroup[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const group of groups) {
    const key = shapeGroupKey(group);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

interface BoundFactRequest {
  requestId: string;
  actionRef: string;
  stateHash: string;
}

interface BoundFactResult extends BoundFactRequest {}

function validateBoundResult(
  request: BoundFactRequest,
  result: BoundFactResult,
): void {
  for (const [matches, code, message] of [
    [result.requestId === request.requestId, "request_id_mismatch",
      "fact engine response request ID does not match the bound request"],
    [result.actionRef === request.actionRef, "action_ref_mismatch",
      "fact engine response action reference does not match the bound request"],
    [result.stateHash === request.stateHash, "state_hash_mismatch",
      "fact engine response state hash does not match the bound request"],
  ] as const) {
    if (!matches) throw new HandStructureResultValidationError(code, message);
  }
}

export function validateHand13Result(
  request: Hand13FactRequest,
  rawResult: unknown,
): Hand13FactResult {
  const parsed = Hand13FactResultSchema.safeParse(rawResult);
  if (!parsed.success) rejectInvalidResponse();
  const result = parsed.data;
  validateBoundResult(request, result);
  return result;
}

export function validateCompletedHandResult(
  request: CompletedHandFactRequest,
  rawResult: unknown,
): CompletedHandFactResult {
  const parsed = CompletedHandFactResultSchema.safeParse(rawResult);
  if (!parsed.success) rejectInvalidResponse();
  validateBoundResult(request, parsed.data);
  return parsed.data;
}

export function validateThreatRiskResult(
  request: ThreatRiskFactRequest,
  rawResult: unknown,
): ThreatRiskFactResult {
  const parsed = ThreatRiskFactResultSchema.safeParse(rawResult);
  if (!parsed.success) rejectInvalidResponse();
  const result = parsed.data;
  validateBoundResult(request, result);
  if (result.threatActor !== request.threatActor) {
    throw new HandStructureResultValidationError(
      "threat_actor_mismatch",
      "fact engine response threat actor does not match the bound request",
    );
  }
  if (
    result.evidenceIds.length !== request.evidenceIds.length ||
    result.evidenceIds.some((id, index) => id !== request.evidenceIds[index])
  ) {
    throw new HandStructureResultValidationError(
      "evidence_ids_mismatch",
      "fact engine response evidence IDs do not match the bound request",
    );
  }
  return result;
}

export function validateHandStructureResult(
  request: HandStructureRequestV2,
  rawResult: unknown,
): HandStructureResultV2 {
  const parsed = HandStructureResultV2Schema.safeParse(rawResult);
  if (!parsed.success) rejectInvalidResponse();
  const result = parsed.data;
  validateBoundResult(request, result);

  const isClosed = request.melds.length === 0;
  for (const family of result.families) {
    const expectedApplicable = family.family === "standard" || isClosed;
    if (
      (family.applicability === "applicable") !== expectedApplicable ||
      (family.shanten !== null) !== expectedApplicable
    ) rejectMismatch();

    for (const effective of family.effectiveTiles) {
      if (request.visibleCountsComplete) {
        if (
          effective.remainingStatus !== "calculated" ||
          effective.remaining !== request.leftTiles34?.[effective.tile34]
        ) rejectMismatch();
      } else if (
        effective.remainingStatus !== "blocked_missing_facts" ||
        effective.remaining !== null
      ) rejectMismatch();
    }
  }

  for (const decomposition of result.decompositions.items) {
    const represented = Array<number>(34).fill(0);
    for (const group of decomposition.groups) {
      for (const tile34 of group.tiles34) {
        represented[tile34] = represented[tile34]! + 1;
      }
    }
    if (represented.some(
      (count, tile34) => count !== request.handTiles34[tile34]!,
    )) rejectMismatch();
  }

  if (result.decompositions.status === "calculated") {
    if (result.decompositions.totalNonDominated === 0) rejectMismatch();
    for (const family of result.bestFamilies) {
      if (!result.decompositions.items.some((item) => item.family === family)) {
        rejectMismatch();
      }
    }
    for (const item of result.decompositions.items) {
      if (
        !result.bestFamilies.includes(item.family) ||
        item.shanten !== result.overallShanten
      ) rejectMismatch();
    }

    const countsByRef = new Map(
      result.decompositions.items.map((item) => [
        item.decompositionRef,
        countShapeGroups(item.groups),
      ]),
    );
    const invariantCounts = countShapeGroups(
      result.decompositions.invariantClaims,
    );
    for (const [key, occurrenceCount] of invariantCounts) {
      if ([...countsByRef.values()].some(
        (counts) => (counts.get(key) ?? 0) < occurrenceCount,
      )) rejectMismatch();
    }

    const alternativesByKey = new Map<
      string,
      typeof result.decompositions.alternativeClaims
    >();
    for (const claim of result.decompositions.alternativeClaims) {
      const key = shapeGroupKey(claim);
      const alternatives = alternativesByKey.get(key) ?? [];
      alternatives.push(claim);
      alternativesByKey.set(key, alternatives);
    }
    const allClaimKeys = new Set<string>([
      ...invariantCounts.keys(),
      ...alternativesByKey.keys(),
      ...[...countsByRef.values()].flatMap((counts) => [...counts.keys()]),
    ]);
    for (const key of allClaimKeys) {
      const invariantCount = invariantCounts.get(key) ?? 0;
      if (!result.decompositions.truncated) {
        const minimumReturned = Math.min(
          ...[...countsByRef.values()].map((counts) => counts.get(key) ?? 0),
        );
        if (invariantCount !== minimumReturned) rejectMismatch();
      }
      const maximumReturned = Math.max(
        0,
        ...[...countsByRef.values()].map((counts) => counts.get(key) ?? 0),
      );
      const alternatives = alternativesByKey.get(key) ?? [];
      if (alternatives.length !== maximumReturned - invariantCount) {
        rejectMismatch();
      }
      alternatives.forEach((claim, index) => {
        const occurrence = invariantCount + index + 1;
        const expectedRefs = [...countsByRef.entries()]
          .filter(([, counts]) => (counts.get(key) ?? 0) >= occurrence)
          .map(([reference]) => reference)
          .sort();
        const claimedRefs = [...claim.decompositionRefs].sort();
        if (
          expectedRefs.length !== claimedRefs.length ||
          expectedRefs.some((reference, refIndex) =>
            reference !== claimedRefs[refIndex]
          )
        ) rejectMismatch();
      });
    }
  }

  const waitByTile = new Map(result.waits.map((wait) => [wait.tile34, wait]));
  for (const wait of result.waits) {
    for (const familyName of wait.families) {
      const family = result.families.find(
        (candidate) => candidate.family === familyName,
      );
      const effective = family?.effectiveTiles.find(
        (candidate) => candidate.tile34 === wait.tile34,
      );
      if (
        effective === undefined ||
        wait.remainingStatus !== effective.remainingStatus ||
        wait.remaining !== effective.remaining
      ) rejectMismatch();
    }
  }
  for (const family of result.families) {
    if (family.shanten !== 0) continue;
    for (const effective of family.effectiveTiles) {
      if (!waitByTile.get(effective.tile34)?.families.includes(family.family)) {
        rejectMismatch();
      }
    }
  }
  return result;
}
