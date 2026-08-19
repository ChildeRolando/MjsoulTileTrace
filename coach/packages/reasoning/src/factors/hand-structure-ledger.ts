import type {
  FactorFact,
  FactorValue,
  MergedHandFuritenV2,
} from "@riichi-coach/contracts";
import {
  FactorFactSchema,
  MergedHandFuritenV2Schema,
} from "@riichi-coach/contracts";

export interface HandStructureLedgerMapping {
  axis: "efficiency";
  facts: FactorFact[];
  diagnostics: string[];
}

const blockedDimensions = [
  "overall_shanten",
  "family_applicability:standard",
  "family_shanten:standard",
  "family_effective_tile_types:standard",
  "family_effective_tiles_remaining:standard",
  "family_applicability:chiitoitsu",
  "family_shanten:chiitoitsu",
  "family_effective_tile_types:chiitoitsu",
  "family_effective_tiles_remaining:chiitoitsu",
  "family_applicability:kokushi",
  "family_shanten:kokushi",
  "family_effective_tile_types:kokushi",
  "family_effective_tiles_remaining:kokushi",
  "best_families",
  "overall_effective_tile_types",
  "overall_effective_tiles_remaining",
  "non_dominated_decomposition_count",
  "shape_claims",
  "decomposition_truncated",
  "wait_tiles",
  "wait_details",
  "wait_tiles_remaining",
  "base_ron_eligibility",
  "discard_furiten",
  "temporary_furiten",
  "riichi_furiten",
  "final_ron_eligibility_status",
  "ron_eligible_wait_tiles",
  "ron_eligible_wait_count",
] as const;

export function blockedHandStructureEfficiencyFacts(
  status: "blocked_missing_facts" | "blocked_engine_failure",
  evidenceIds: readonly string[],
): HandStructureLedgerMapping {
  const limitation = status === "blocked_engine_failure"
    ? "手牌结构引擎请求失败，V2 事实不可用"
    : "缺少计算手牌结构与振听所需的绑定事实";
  return {
    axis: "efficiency",
    facts: blockedDimensions.map((dimension) => FactorFactSchema.parse({
      factorKey: `efficiency.v2.${dimension}`,
      dimension,
      status,
      evidenceClass: "deterministic_allowlisted",
      preferenceEligibility: "ineligible",
      evidenceIds: unique(evidenceIds),
      limitations: [limitation],
    })),
    diagnostics: [status === "blocked_engine_failure"
      ? "hand_structure_engine_failure_v1_fallback"
      : "hand_structure_missing_facts_v1_fallback"],
  };
}

export function mapMergedHandFuritenToEfficiencyFacts(
  rawMerged: MergedHandFuritenV2,
): HandStructureLedgerMapping {
  const merged = MergedHandFuritenV2Schema.parse(rawMerged);
  const { hand } = merged;
  const facts: FactorFact[] = [];
  const diagnostics: string[] = [];
  // CR-3 evidence identity: the fact-engine REQUEST is the evidence record
  // (a self-contained, registry-resolvable id); `stateHash` / `actionRef` are
  // descriptors of that request (the stateHash is also embedded in the
  // request id), never peer evidence ids.
  const handEvidence = unique([hand.requestId]);

  const addEngineFact = (
    dimension: string,
    value: FactorValue,
    preferenceEligibility: "deterministic" | "ineligible" = "ineligible",
    evidenceClass: "deterministic_allowlisted" |
      "deterministic_under_assumptions" = "deterministic_allowlisted",
    evidenceIds: string[] = handEvidence,
    limitations: string[] = [LIMITATIONS.handEngine],
  ) => {
    facts.push(parseFact({
      factorKey: `efficiency.v2.${dimension}`,
      dimension,
      status: "calculated",
      evidenceClass,
      preferenceEligibility,
      engineIdentity: hand.identity,
      value,
      evidenceIds,
      limitations,
    }));
  };
  const addBlockedEngineFact = (
    dimension: string,
    status: "blocked_missing_facts" | "blocked_engine_failure",
    evidenceClass: "deterministic_allowlisted" |
      "deterministic_under_assumptions",
    evidenceIds: string[],
    limitations: string[],
  ) => {
    facts.push(parseFact({
      factorKey: `efficiency.v2.${dimension}`,
      dimension,
      status,
      evidenceClass,
      preferenceEligibility: "ineligible",
      engineIdentity: hand.identity,
      evidenceIds,
      limitations,
    }));
  };

  addEngineFact(
    "overall_shanten",
    { kind: "number", value: hand.overallShanten, unit: "shanten" },
    "deterministic",
  );

  for (const family of hand.families) {
    addEngineFact(
      `family_applicability:${family.family}`,
      { kind: "classification", value: family.applicability },
    );
    addEngineFact(
      `family_shanten:${family.family}`,
      family.shanten === null
        ? { kind: "classification", value: family.applicability }
        : { kind: "number", value: family.shanten, unit: "shanten" },
      "ineligible",
      "deterministic_allowlisted",
      handEvidence,
      family.shanten === null
        ? [LIMITATIONS.notApplicableOpen]
        : [LIMITATIONS.handEngine],
    );
    if (family.shanten === null) {
      addEngineFact(
        `family_effective_tile_types:${family.family}`,
        { kind: "classification", value: family.applicability },
        "ineligible",
        "deterministic_allowlisted",
        handEvidence,
        [LIMITATIONS.notApplicableOpen],
      );
      addEngineFact(
        `family_effective_tiles_remaining:${family.family}`,
        { kind: "classification", value: family.applicability },
        "ineligible",
        "deterministic_allowlisted",
        handEvidence,
        [LIMITATIONS.notApplicableOpen],
      );
      continue;
    }
    addEngineFact(
      `family_effective_tile_types:${family.family}`,
      {
        kind: "integer_ids",
        values: family.effectiveTiles.map((tile) => tile.tile34),
      },
    );
    const remaining = sumRemaining(family.effectiveTiles);
    if (remaining.status === "calculated") {
      addEngineFact(
        `family_effective_tiles_remaining:${family.family}`,
        { kind: "number", value: remaining.value, unit: "tiles_remaining" },
        "ineligible",
        "deterministic_under_assumptions",
        handEvidence,
        [LIMITATIONS.remainingCounts],
      );
    } else {
      addBlockedEngineFact(
        `family_effective_tiles_remaining:${family.family}`,
        remaining.status,
        "deterministic_under_assumptions",
        handEvidence,
        [remaining.status === "blocked_engine_failure"
          ? LIMITATIONS.remainingConflict
          : LIMITATIONS.remainingMissing],
      );
    }
  }

  addEngineFact("best_families", {
    kind: "string_set",
    values: [...hand.bestFamilies].sort(),
  });

  const bestFamilySet = new Set(hand.bestFamilies);
  const overallTiles = new Map<number, Array<{
    remainingStatus: "calculated" | "blocked_missing_facts";
    remaining: number | null;
  }>>();
  for (const family of hand.families) {
    if (!bestFamilySet.has(family.family)) continue;
    for (const tile of family.effectiveTiles) {
      const entries = overallTiles.get(tile.tile34) ?? [];
      entries.push(tile);
      overallTiles.set(tile.tile34, entries);
    }
  }
  const overallTileIds = [...overallTiles.keys()].sort((left, right) =>
    left - right
  );
  addEngineFact("overall_effective_tile_types", {
    kind: "integer_ids",
    values: overallTileIds,
  });
  const overallRemaining = sumDeduplicatedRemaining(overallTiles);
  if (overallRemaining.status === "calculated") {
    addEngineFact(
      "overall_effective_tiles_remaining",
      {
        kind: "tile_counts",
        value: overallTileIds.map((tile34) => ({
          tile34,
          count: overallTiles.get(tile34)![0]!.remaining!,
        })),
      },
      "deterministic",
      "deterministic_under_assumptions",
      handEvidence,
      [LIMITATIONS.remainingCounts],
    );
  } else {
    addBlockedEngineFact(
      "overall_effective_tiles_remaining",
      overallRemaining.status,
      "deterministic_under_assumptions",
      handEvidence,
      [overallRemaining.status === "blocked_engine_failure"
        ? LIMITATIONS.remainingConflict
        : LIMITATIONS.remainingMissing],
    );
    if (overallRemaining.status === "blocked_engine_failure") {
      diagnostics.push("hand_structure_remaining_count_conflict");
    }
  }

  const ordinalByRef = new Map(
    hand.decompositions.items.map((item, ordinal) => [
      item.decompositionRef,
      ordinal,
    ]),
  );
  if (hand.decompositions.status === "calculated") {
    addEngineFact("non_dominated_decomposition_count", {
      kind: "number",
      value: hand.decompositions.totalNonDominated,
      unit: "decompositions",
    });
    addEngineFact(
      "shape_claims",
      {
        kind: "shape_claims",
        claims: mapShapeClaims(
          hand.decompositions,
          ordinalByRef,
        ),
      },
      "ineligible",
      "deterministic_allowlisted",
      handEvidence,
      hand.decompositions.truncated
        ? [LIMITATIONS.decompositionTruncated]
        : [LIMITATIONS.handEngine],
    );
    addEngineFact(
      "decomposition_truncated",
      { kind: "boolean", value: hand.decompositions.truncated },
      "ineligible",
      "deterministic_allowlisted",
      handEvidence,
      hand.decompositions.truncated
        ? [LIMITATIONS.decompositionTruncated]
        : [LIMITATIONS.handEngine],
    );
    if (hand.decompositions.truncated) {
      diagnostics.push("hand_structure_decompositions_truncated");
    }
  } else {
    for (const dimension of [
      "non_dominated_decomposition_count",
      "shape_claims",
      "decomposition_truncated",
    ]) {
      addBlockedEngineFact(
        dimension,
        "blocked_engine_failure",
        "deterministic_allowlisted",
        handEvidence,
        [LIMITATIONS.decompositionFailure],
      );
    }
    diagnostics.push("hand_structure_decompositions_unavailable");
  }

  addEngineFact("wait_tiles", {
    kind: "integer_ids",
    values: hand.waits.map((wait) => wait.tile34),
  });
  addEngineFact("wait_details", {
    kind: "wait_details",
    waits: hand.waits.map((wait) => ({
      tile34: wait.tile34,
      families: wait.families,
      waitTypes: canonicalWaitTypes(wait.waitTypes),
      remainingStatus: wait.remainingStatus,
      remaining: wait.remaining,
      baseRonEligibility: wait.baseRonEligibility,
      decompositionOrdinals: wait.decompositionRefs
        .map((reference) => ordinalByRef.get(reference))
        .filter((ordinal): ordinal is number => ordinal !== undefined)
        .sort((left, right) => left - right),
    })),
  });
  const waitRemaining = sumRemaining(hand.waits);
  if (waitRemaining.status === "calculated") {
    addEngineFact(
      "wait_tiles_remaining",
      { kind: "number", value: waitRemaining.value, unit: "tiles_remaining" },
      "ineligible",
      "deterministic_under_assumptions",
      handEvidence,
      [LIMITATIONS.remainingCounts],
    );
  } else {
    addBlockedEngineFact(
      "wait_tiles_remaining",
      waitRemaining.status,
      "deterministic_under_assumptions",
      handEvidence,
      [waitRemaining.status === "blocked_engine_failure"
        ? LIMITATIONS.remainingConflict
        : LIMITATIONS.remainingMissing],
    );
  }
  addEngineFact("base_ron_eligibility", {
    kind: "string_set",
    values: hand.waits
      .map((wait) => `${wait.tile34}:${wait.baseRonEligibility}`)
      .sort(),
  });

  mapDiscardFuriten(merged, facts, diagnostics);
  mapResponseFuriten("temporary", merged, facts, diagnostics);
  mapResponseFuriten("riichi", merged, facts, diagnostics);
  mapFinalRonEligibility(merged, facts, diagnostics);

  return {
    axis: "efficiency",
    facts,
    diagnostics: unique(diagnostics),
  };
}

const LIMITATIONS = {
  handEngine: "由固定版本手牌结构引擎计算",
  remainingCounts: "剩余枚数基于输入的可见牌与牌山计数",
  remainingMissing: "缺少至少一种相关牌的剩余枚数，不能计算合计",
  remainingConflict: "同一牌的剩余枚数在结构结果中不一致",
  notApplicableOpen: "该手型在副露手牌中不适用",
  decompositionTruncated: "非支配分解已截断，结构声明不能视为穷尽",
  decompositionFailure: "手牌结构引擎未返回可用的非支配分解",
  discardReplay: "舍牌振听由当前绑定场景的自家牌河确定",
  discardMissing: "自家牌河不完整，不能排除舍牌振听",
  responseReplay: "响应振听由已绑定的规范牌谱前缀重放确认",
  responseMissing: "响应历史不完整，不能判定响应振听",
  responseUnavailable: "未提供可验证的响应历史，不能判定响应振听",
  responseEngineFailure: "响应历史的手牌结构引擎身份不可验证",
  responseHandStructureFailure: "响应历史的手牌结构分析失败，不能判定响应振听",
  finalMissing: "至少一项振听或荣和资格事实未知，不能计算最终荣和资格",
  finalEngineFailure: "响应历史的引擎身份或手牌结构分析失败，不能计算最终荣和资格",
  finalCalculated: "最终荣和资格由手牌等待、舍牌振听与响应振听的绑定事实共同计算",
} as const;

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function parseFact(raw: Parameters<typeof FactorFactSchema.parse>[0]): FactorFact {
  return FactorFactSchema.parse(raw);
}

type RemainingEntry = {
  remainingStatus: "calculated" | "blocked_missing_facts";
  remaining: number | null;
};

type RemainingResult =
  | { status: "calculated"; value: number }
  | { status: "blocked_missing_facts" }
  | { status: "blocked_engine_failure" };

function sumRemaining(entries: readonly RemainingEntry[]): RemainingResult {
  if (entries.some((entry) =>
    entry.remainingStatus !== "calculated" || entry.remaining === null
  )) {
    return { status: "blocked_missing_facts" };
  }
  return {
    status: "calculated",
    value: entries.reduce((sum, entry) => sum + entry.remaining!, 0),
  };
}

function sumDeduplicatedRemaining(
  entriesByTile: ReadonlyMap<number, readonly RemainingEntry[]>,
): RemainingResult {
  let sum = 0;
  for (const entries of entriesByTile.values()) {
    if (entries.some((entry) =>
      entry.remainingStatus !== "calculated" || entry.remaining === null
    )) {
      return { status: "blocked_missing_facts" };
    }
    const values = new Set(entries.map((entry) => entry.remaining!));
    if (values.size !== 1) return { status: "blocked_engine_failure" };
    sum += entries[0]!.remaining!;
  }
  return { status: "calculated", value: sum };
}

type DecompositionSet = MergedHandFuritenV2["hand"]["decompositions"];
type ShapeClaimValue = Extract<FactorValue, { kind: "shape_claims" }>;

const shapeKindOrder = [
  "sequence",
  "triplet",
  "pair_candidate",
  "ryanmen_taatsu",
  "kanchan_taatsu",
  "penchan_taatsu",
  "floating",
] as const;

function mapShapeClaims(
  decompositions: DecompositionSet,
  ordinalByRef: ReadonlyMap<string, number>,
): ShapeClaimValue["claims"] {
  const allOrdinals = [...ordinalByRef.values()].sort((left, right) =>
    left - right
  );
  const occurrences = new Map<string, number>();
  const makeClaim = (
    certainty: "invariant" | "alternative",
    group: { kind: typeof shapeKindOrder[number]; tiles34: number[] },
    decompositionOrdinals: number[],
  ) => {
    const identity = `${certainty}:${group.kind}:${group.tiles34.join(",")}`;
    const occurrence = (occurrences.get(identity) ?? 0) + 1;
    occurrences.set(identity, occurrence);
    return {
      certainty,
      group: { kind: group.kind, tiles34: group.tiles34, occurrence },
      decompositionOrdinals,
    };
  };
  const claims = [
    ...decompositions.invariantClaims.map((claim) =>
      makeClaim("invariant", claim, allOrdinals)
    ),
    ...decompositions.alternativeClaims.map((claim) =>
      makeClaim(
        "alternative",
        claim,
        claim.decompositionRefs
          .map((reference) => ordinalByRef.get(reference))
          .filter((ordinal): ordinal is number => ordinal !== undefined)
          .sort((left, right) => left - right),
      )
    ),
  ];
  return claims.sort((left, right) =>
    ["invariant", "alternative"].indexOf(left.certainty) -
      ["invariant", "alternative"].indexOf(right.certainty) ||
    shapeKindOrder.indexOf(left.group.kind) -
      shapeKindOrder.indexOf(right.group.kind) ||
    compareNumbers(left.group.tiles34, right.group.tiles34) ||
    left.group.occurrence - right.group.occurrence
  );
}

function compareNumbers(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) return left[index]! - right[index]!;
  }
  return left.length - right.length;
}

const waitTypeOrder = [
  "ryanmen",
  "kanchan",
  "penchan",
  "shanpon",
  "tanki",
  "kokushi_single",
  "kokushi_thirteen_sided",
] as const;

function canonicalWaitTypes<T extends typeof waitTypeOrder[number]>(
  values: readonly T[],
): T[] {
  return [...values].sort((left, right) =>
    waitTypeOrder.indexOf(left) - waitTypeOrder.indexOf(right)
  );
}

function bindingEvidence(merged: MergedHandFuritenV2): string[] {
  // The scene binding's canonical decision event is the replay evidence; the
  // factSetId / streamPrefixHash are provenance of the hand-structure request
  // (the request id embeds the factSetId), never peer evidence ids (CR-3).
  return [merged.binding.decisionEventRef];
}

function responseEvidence(
  merged: MergedHandFuritenV2,
  component: "temporary" | "riichi",
): string[] {
  const response = merged.furiten[component];
  // Only actual evidence identities: the response analysis request ids and
  // the typed canonical event refs. `stateHash` / `actionRef` /
  // `sourceStreamPrefixHash` are descriptors of those request records.
  return unique([
    ...bindingEvidence(merged),
    ...response.evidenceIds,
    ...response.analysisRefs.flatMap((reference) => [
      reference.requestId,
      reference.sourceEventRef,
      reference.closingEventRef,
    ]),
    ...(response.riichiAcceptanceEventRef === null
      ? []
      : [response.riichiAcceptanceEventRef]),
  ]);
}

function mapDiscardFuriten(
  merged: MergedHandFuritenV2,
  facts: FactorFact[],
  diagnostics: string[],
): void {
  const discard = merged.furiten.discard;
  // The candidate action ref is a descriptor of the analyzed hand-structure
  // request (the ledger's actionRef already binds the candidate), never a
  // peer evidence id; the wait analysis that proves the furiten IS the
  // hand-structure request (CR-3).
  const evidenceIds = unique([
    ...bindingEvidence(merged),
    merged.hand.requestId,
    ...discard.selfRiver.map((entry) => entry.eventRef),
    ...discard.canonicalEventRefs,
  ]);
  const common = {
    factorKey: "efficiency.v2.discard_furiten",
    dimension: "discard_furiten",
    evidenceClass: "deterministic_local_replay" as const,
    preferenceEligibility: "ineligible" as const,
    evidenceIds,
  };
  if (discard.status === "unknown") {
    facts.push(parseFact({
      ...common,
      status: "blocked_missing_facts",
      limitations: [LIMITATIONS.discardMissing],
    }));
    diagnostics.push("discard_furiten_river_incomplete");
    return;
  }
  facts.push(parseFact({
    ...common,
    status: "calculated",
    value: { kind: "boolean", value: discard.status === "confirmed" },
    limitations: [LIMITATIONS.discardReplay],
  }));
}

function responseBlockedStatus(
  merged: MergedHandFuritenV2,
  component: "temporary" | "riichi",
): "blocked_missing_facts" | "blocked_engine_failure" {
  if (
    merged.binding.source === "canonical_replay" &&
    merged.binding.engineIdentityStatus === "unknown" ||
    isResponseEngineFailureReason(merged.furiten[component].unknownReason)
  ) {
    return "blocked_engine_failure";
  }
  return "blocked_missing_facts";
}

function isResponseEngineFailureReason(
  reason: MergedHandFuritenV2["furiten"]["temporary"]["unknownReason"],
): boolean {
  return reason === "response_engine_identity_failure" ||
    reason === "response_hand_structure_unavailable";
}

function mapResponseFuriten(
  component: "temporary" | "riichi",
  merged: MergedHandFuritenV2,
  facts: FactorFact[],
  diagnostics: string[],
): void {
  const dimension = `${component}_furiten`;
  const response = merged.furiten[component];
  const common = {
    factorKey: `efficiency.v2.${dimension}`,
    dimension,
    evidenceClass: "deterministic_allowlisted" as const,
    preferenceEligibility: "ineligible" as const,
    evidenceIds: responseEvidence(merged, component),
  };
  const canonicalKnown = merged.binding.source === "canonical_replay" &&
    merged.binding.engineIdentityStatus === "known";
  if (canonicalKnown && response.status !== "unknown") {
    facts.push(parseFact({
      ...common,
      status: "calculated",
      engineIdentity: merged.hand.identity,
      value: { kind: "boolean", value: response.status === "confirmed" },
      limitations: [LIMITATIONS.responseReplay],
    }));
    return;
  }
  const status = responseBlockedStatus(merged, component);
  const handStructureFailure = response.unknownReason ===
    "response_hand_structure_unavailable";
  facts.push(parseFact({
    ...common,
    status,
    limitations: [status === "blocked_engine_failure"
      ? handStructureFailure
        ? LIMITATIONS.responseHandStructureFailure
        : LIMITATIONS.responseEngineFailure
      : merged.binding.source === "unavailable"
        ? LIMITATIONS.responseUnavailable
        : LIMITATIONS.responseMissing],
  }));
  diagnostics.push(status === "blocked_engine_failure"
    ? handStructureFailure
      ? `response_${component}_hand_structure_failure`
      : `response_${component}_engine_identity_failure`
    : `response_${component}_facts_incomplete`);
}

function finalEvidence(merged: MergedHandFuritenV2): string[] {
  return unique([
    merged.hand.requestId,
    ...bindingEvidence(merged),
    ...merged.furiten.discard.selfRiver.map((entry) => entry.eventRef),
    ...merged.furiten.discard.canonicalEventRefs,
    ...responseEvidence(merged, "temporary"),
    ...responseEvidence(merged, "riichi"),
  ]);
}

function mapFinalRonEligibility(
  merged: MergedHandFuritenV2,
  facts: FactorFact[],
  diagnostics: string[],
): void {
  const evidenceIds = finalEvidence(merged);
  const dimensions = [
    "final_ron_eligibility_status",
    "ron_eligible_wait_tiles",
    "ron_eligible_wait_count",
  ] as const;
  if (merged.ronEligibilityStatus === "calculated") {
    const values: FactorValue[] = [{
      kind: "classification",
      value: "calculated",
    }, {
      kind: "integer_ids",
      values: merged.ronEligibleWaits34,
    }, {
      kind: "number",
      value: merged.ronEligibleWaits34.length,
      unit: "tile_types",
    }];
    dimensions.forEach((dimension, index) => {
      facts.push(parseFact({
        factorKey: `efficiency.v2.${dimension}`,
        dimension,
        status: "calculated",
        evidenceClass: "deterministic_allowlisted",
        preferenceEligibility: "ineligible",
        engineIdentity: merged.hand.identity,
        value: values[index],
        evidenceIds,
        limitations: [LIMITATIONS.finalCalculated],
      }));
    });
    return;
  }
  const engineFailure = merged.binding.source === "canonical_replay" &&
    merged.binding.engineIdentityStatus === "unknown" ||
    isResponseEngineFailureReason(merged.furiten.temporary.unknownReason) ||
    isResponseEngineFailureReason(merged.furiten.riichi.unknownReason);
  const status = engineFailure
    ? "blocked_engine_failure" as const
    : "blocked_missing_facts" as const;
  for (const dimension of dimensions) {
    facts.push(parseFact({
      factorKey: `efficiency.v2.${dimension}`,
      dimension,
      status,
      evidenceClass: "deterministic_allowlisted",
      preferenceEligibility: "ineligible",
      evidenceIds,
      limitations: [engineFailure
        ? LIMITATIONS.finalEngineFailure
        : LIMITATIONS.finalMissing],
    }));
  }
  diagnostics.push(engineFailure
    ? "final_ron_eligibility_engine_failure"
    : "final_ron_eligibility_incomplete");
}
