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
      "evidence_ids_mismatch" |
      "threat_risk_semantic_mismatch",
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "HandStructureResultValidationError";
  }
}

function rejectThreatRiskSemanticMismatch(): never {
  throw new HandStructureResultValidationError(
    "threat_risk_semantic_mismatch",
    "fact engine threat result failed semantic validation",
  );
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

type StructuralRiskClassification =
  ThreatRiskFactResult["classifications"][number];

function structuralRiskKey(value: StructuralRiskClassification): string {
  return `${value.tile34}:${value.kind}`;
}

function addStructuralRisk(
  values: Map<string, StructuralRiskClassification>,
  tile34: number,
  kind: StructuralRiskClassification["kind"],
): void {
  const value = { tile34, kind };
  values.set(structuralRiskKey(value), value);
}

function addExpectedSujiClassifications(
  values: Map<string, StructuralRiskClassification>,
  safeTiles34: readonly boolean[],
): void {
  for (let tile34 = 0; tile34 < 27; tile34++) {
    if (safeTiles34[tile34]) {
      addStructuralRisk(values, tile34, "genbutsu");
      continue;
    }
    const rank = tile34 % 9;
    let safeCount = 0;
    if (rank <= 2) {
      if (safeTiles34[tile34 + 3]) safeCount++;
    } else if (rank >= 6) {
      if (safeTiles34[tile34 - 3]) safeCount++;
    } else {
      if (safeTiles34[tile34 - 3]) safeCount++;
      if (safeTiles34[tile34 + 3]) safeCount++;
    }
    if (rank >= 3 && rank <= 5) {
      addStructuralRisk(
        values,
        tile34,
        safeCount === 0 ? "no_suji" : safeCount === 1
          ? "half_suji"
          : "double_suji",
      );
    } else {
      addStructuralRisk(values, tile34, safeCount === 0 ? "no_suji" : "suji");
    }
  }
  for (let tile34 = 27; tile34 < 34; tile34++) {
    if (safeTiles34[tile34]) addStructuralRisk(values, tile34, "genbutsu");
  }
}

function noChanceTiles(leftTiles34: readonly number[]): number[] {
  const result: number[] = [];
  const zero = (tile34: number) => leftTiles34[tile34] === 0;
  for (let suit = 0; suit < 3; suit++) {
    const base = suit * 9;
    for (let rank = 0; rank < 3; rank++) {
      const tile34 = base + rank;
      if (zero(tile34 + 1) || zero(tile34 + 2)) result.push(tile34);
    }
    for (let rank = 3; rank < 6; rank++) {
      const tile34 = base + rank;
      if (
        (zero(tile34 - 2) || zero(tile34 - 1)) &&
        (zero(tile34 + 1) || zero(tile34 + 2))
      ) result.push(tile34);
    }
    for (let rank = 6; rank < 9; rank++) {
      const tile34 = base + rank;
      if (zero(tile34 - 2) || zero(tile34 - 1)) result.push(tile34);
    }
  }
  return result;
}

function doubleNoChanceTiles(
  leftTiles34: readonly number[],
  safeTiles34: readonly boolean[],
): number[] {
  const result: number[] = [];
  const zero = (tile34: number) => leftTiles34[tile34] === 0;
  const allZero = (...tiles: number[]) => tiles.every(zero);
  for (let suit = 0; suit < 3; suit++) {
    const base = suit * 9;
    if (zero(base + 1) || zero(base + 2)) result.push(base);
    if (zero(base + 2) || allZero(base, base + 3)) result.push(base + 1);
    for (let rank = 2; rank <= 6; rank++) {
      const tile34 = base + rank;
      if (
        allZero(tile34 - 2, tile34 + 1) ||
        allZero(tile34 - 1, tile34 + 1) ||
        allZero(tile34 - 1, tile34 + 2)
      ) result.push(tile34);
    }
    if (zero(base + 6) || allZero(base + 5, base + 8)) result.push(base + 7);
    if (zero(base + 6) || zero(base + 7)) result.push(base + 8);

    for (let rank = 1; rank < 3; rank++) {
      const tile34 = base + rank;
      if (zero(tile34 - 1) && safeTiles34[tile34 + 3]) result.push(tile34);
    }
    for (let rank = 3; rank < 6; rank++) {
      const tile34 = base + rank;
      if (
        (zero(tile34 - 1) && safeTiles34[tile34 + 3]) ||
        (zero(tile34 + 1) && safeTiles34[tile34 - 3])
      ) result.push(tile34);
    }
    for (let rank = 6; rank < 8; rank++) {
      const tile34 = base + rank;
      if (zero(tile34 + 1) && safeTiles34[tile34 - 3]) result.push(tile34);
    }
  }
  return result;
}

function oneChanceClassifications(
  leftTiles34: readonly number[],
): StructuralRiskClassification[] {
  const result: StructuralRiskClassification[] = [];
  const one = (tile34: number) => leftTiles34[tile34] === 1;
  const anyOne = (...tiles: number[]) => tiles.some(one);
  const allOne = (...tiles: number[]) => tiles.every(one);
  for (let suit = 0; suit < 3; suit++) {
    const base = suit * 9;
    for (let rank = 0; rank < 3; rank++) {
      const tile34 = base + rank;
      if (allOne(tile34 + 1, tile34 + 2)) {
        result.push({ tile34, kind: "double_one_chance" });
      } else if (anyOne(tile34 + 1, tile34 + 2)) {
        result.push({ tile34, kind: "one_chance" });
      }
    }
    for (let rank = 3; rank < 6; rank++) {
      const tile34 = base + rank;
      const left = [tile34 - 2, tile34 - 1];
      const right = [tile34 + 1, tile34 + 2];
      if (anyOne(...left) && anyOne(...right)) {
        const kind = allOne(...left, ...right)
          ? "double_one_chance"
          : allOne(...left) || allOne(...right)
          ? "mixed_one_chance"
          : "one_chance";
        result.push({ tile34, kind });
      }
    }
    for (let rank = 6; rank < 9; rank++) {
      const tile34 = base + rank;
      if (allOne(tile34 - 2, tile34 - 1)) {
        result.push({ tile34, kind: "double_one_chance" });
      } else if (anyOne(tile34 - 2, tile34 - 1)) {
        result.push({ tile34, kind: "one_chance" });
      }
    }
  }
  return result;
}

function expectedStructuralClassifications(
  request: ThreatRiskFactRequest,
): StructuralRiskClassification[] {
  const values = new Map<string, StructuralRiskClassification>();
  addExpectedSujiClassifications(values, request.safeTiles34);
  const noChance = noChanceTiles(request.leftTiles34);
  const oneChance = oneChanceClassifications(request.leftTiles34);
  for (const tile34 of noChance) {
    addStructuralRisk(values, tile34, "wall");
    addStructuralRisk(values, tile34, "no_chance");
  }
  for (const classification of oneChance) {
    addStructuralRisk(values, classification.tile34, "wall");
    addStructuralRisk(values, classification.tile34, classification.kind);
  }
  for (const tile34 of doubleNoChanceTiles(
    request.leftTiles34,
    request.safeTiles34,
  )) addStructuralRisk(values, tile34, "double_no_chance");
  for (const tile34 of request.earlyOutsideTiles34) {
    addStructuralRisk(values, tile34, "early_outside");
  }
  return [...values.values()].sort((left, right) =>
    left.tile34 - right.tile34 || (left.kind < right.kind ? -1 : 1)
  );
}

function expectedLeftNoSujiTiles(
  request: ThreatRiskFactRequest,
): number[] {
  const noSuji = Array<boolean>(27).fill(false);
  for (let suit = 0; suit < 3; suit++) {
    const base = suit * 9;
    for (let rank = 3; rank < 6; rank++) {
      if (!request.safeTiles34[base + rank]) {
        noSuji[base + rank - 3] = true;
        noSuji[base + rank + 3] = true;
      }
    }
    if (request.leftTiles34[base + 4] === 0) {
      noSuji[base + 2] = false;
      noSuji[base + 6] = false;
    }
  }
  request.leftTiles34.slice(0, 27).forEach((left, tile34) => {
    if (left === 0) noSuji[tile34] = false;
  });
  const lowRisk = request.safeTiles34.slice(0, 27);
  for (let suit = 0; suit < 3; suit++) {
    const base = suit * 9;
    if (request.leftTiles34[base + 1] === 0) lowRisk[base] = true;
    if (request.leftTiles34[base + 2] === 0) {
      lowRisk[base] = true;
      lowRisk[base + 1] = true;
    }
    if (request.leftTiles34[base + 3] === 0) {
      lowRisk[base + 1] = true;
      lowRisk[base + 2] = true;
    }
    if (request.leftTiles34[base + 5] === 0) {
      lowRisk[base + 6] = true;
      lowRisk[base + 7] = true;
    }
    if (request.leftTiles34[base + 6] === 0) {
      lowRisk[base + 7] = true;
      lowRisk[base + 8] = true;
    }
    if (request.leftTiles34[base + 7] === 0) lowRisk[base + 8] = true;
  }
  return noSuji.flatMap((value, tile34) =>
    value && !lowRisk[tile34] ? [tile34] : []
  );
}

function exactArrayEqual<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length &&
    left.every((value, index) => JSON.stringify(value) === JSON.stringify(right[index]));
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
  if (result.scaleVersion !== request.scaleVersion) {
    rejectThreatRiskSemanticMismatch();
  }
  if (!exactArrayEqual(
    result.classifications,
    expectedStructuralClassifications(request),
  )) rejectThreatRiskSemanticMismatch();
  for (let tile34 = 0; tile34 < 34; tile34++) {
    const safe = request.safeTiles34[tile34]!;
    if (safe && result.riskScale[tile34] !== 0) {
      rejectThreatRiskSemanticMismatch();
    }
  }
  for (const honor of result.honorClassifications) {
    const expectedCategory = honor.tile34 >= 31 ||
        honor.tile34 === request.roundWindTile34 ||
        honor.tile34 === request.threatWindTile34
      ? "yakuhai"
      : "guest_wind";
    if (
      honor.remainingCount !== request.leftTiles34[honor.tile34] ||
      honor.category !== expectedCategory
    ) rejectThreatRiskSemanticMismatch();
  }
  if (!exactArrayEqual(
    result.leftNoSujiTile34,
    expectedLeftNoSujiTiles(request),
  )) rejectThreatRiskSemanticMismatch();
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
