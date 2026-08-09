import { describe, expect, it } from "vitest";
import {
  CandidateFactorLedgerSchema,
  MergedHandFuritenV2Schema,
  canonicalActionRef,
  type MergedHandFuritenV2,
} from "@riichi-coach/contracts";
import { mapMergedHandFuritenToEfficiencyFacts } from
  "../src/factors/hand-structure-ledger.js";
import { buildFactorDifferences } from
  "../src/factors/difference-builder.js";

const identity = {
  engine: "mahjong-helper" as const,
  upstreamCommit: "514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0" as const,
  adapterVersion: "0.2.0" as const,
  protocolVersion: "mahjong-facts/v1" as const,
};
const factSetId = "canonical-v2:sha256:ledger-prefix";
const decisionEventRef = "game:ledger/0/99/0";

type ResponseStatus = "clear" | "confirmed" | "unknown";
type BindingMode = "known" | "identity_failure" | "unavailable";

function responseComponent(
  status: ResponseStatus,
  kind: "temporary" | "riichi",
) {
  const source = kind === "temporary" ? 2 : 5;
  const closing = source + 1;
  const acceptance = kind === "riichi" ? "game:ledger/0/1/0" : null;
  const analysisRef = {
    requestId:
      `canonical-response:sha256:history-${kind}:hand-structure:sha256:${kind}`,
    actionRef: `response:game:ledger/0/${source}/0`,
    stateHash: `sha256:${kind}`,
    engineIdentity: identity,
    sourceStreamPrefixHash: `sha256:history-${kind}`,
    sourceEventRef: `game:ledger/0/${source}/0`,
    closingEventRef: `game:ledger/0/${closing}/0`,
  };
  const evidenceIds = status === "confirmed"
    ? [
        ...(acceptance === null ? [] : [acceptance]),
        analysisRef.sourceEventRef,
        analysisRef.closingEventRef,
      ]
    : [];
  return {
    status,
    unknownReason: status === "unknown" ? "response_window_uncertain" : null,
    evidenceIds,
    analysisRefs: status === "confirmed" ? [analysisRef] : [],
    riichiAcceptanceEventRef: status === "confirmed" ? acceptance : null,
  };
}

function makeMerged(options: {
  binding?: BindingMode;
  temporary?: ResponseStatus;
  riichi?: ResponseStatus;
  riverComplete?: boolean;
  riverMatch?: boolean;
  missingRemaining?: boolean;
  conflictingRemaining?: boolean;
  openHand?: boolean;
  truncated?: boolean;
  baseRonEligibility?: "eligible" | "ineligible" |
    "unknown_missing_situational_yaku_context";
  responseHandStructureFailure?: boolean;
} = {}): MergedHandFuritenV2 {
  const bindingMode = options.binding ?? "known";
  const temporaryStatus = bindingMode === "known"
    ? options.temporary ?? "clear"
    : "unknown";
  const riichiStatus = bindingMode === "known"
    ? options.riichi ?? "clear"
    : "unknown";
  const fixedUnknownReason = bindingMode === "identity_failure"
    ? "response_engine_identity_failure"
    : bindingMode === "unavailable"
      ? "response_history_not_provided"
      : null;
  const temporary = fixedUnknownReason === null
    ? responseComponent(temporaryStatus, "temporary")
    : {
        status: "unknown" as const,
        unknownReason: fixedUnknownReason,
        evidenceIds: [],
        analysisRefs: [],
        riichiAcceptanceEventRef: null,
      };
  const riichi = fixedUnknownReason === null
    ? responseComponent(riichiStatus, "riichi")
    : {
        status: "unknown" as const,
        unknownReason: fixedUnknownReason,
        evidenceIds: [],
        analysisRefs: [],
        riichiAcceptanceEventRef: null,
      };
  if (options.responseHandStructureFailure) {
    if (temporary.status === "unknown") {
      temporary.unknownReason = "response_hand_structure_unavailable";
    }
    if (riichi.status === "unknown") {
      riichi.unknownReason = "response_hand_structure_unavailable";
    }
  }
  const binding = bindingMode === "unavailable"
    ? {
        source: "unavailable" as const,
        factSetId,
        decisionEventRef: "hypothesis:decision",
        selfActor: 0,
        reason: "response_history_not_provided" as const,
        engineIdentityStatus: "unknown" as const,
        engineIdentity: null,
      }
    : {
        source: "canonical_replay" as const,
        factSetId,
        streamPrefixHash: "sha256:ledger-prefix",
        decisionEventRef,
        selfActor: 0,
        engineIdentityStatus: bindingMode === "known" ? "known" as const : "unknown" as const,
        engineIdentity: bindingMode === "known" ? identity : null,
      };
  const effective = (tile34: number, remaining: number) => options.missingRemaining && tile34 === 6
    ? { tile34, remainingStatus: "blocked_missing_facts" as const, remaining: null }
    : { tile34, remainingStatus: "calculated" as const, remaining };
  const truncated = options.truncated ?? false;
  const openHand = options.openHand ?? false;
  const waits = [{
    tile34: 6,
    families: openHand
      ? ["standard" as const]
      : ["standard" as const, "chiitoitsu" as const],
    waitTypes: openHand
      ? ["ryanmen" as const]
      : ["tanki" as const, "ryanmen" as const],
    remainingStatus: options.missingRemaining
      ? "blocked_missing_facts" as const
      : "calculated" as const,
    remaining: options.missingRemaining ? null : 2,
    baseRonEligibility: options.baseRonEligibility ?? "eligible",
    decompositionRefs: openHand
      ? ["raw:z-standard"]
      : ["raw:z-standard", "raw:a-chiitoitsu"],
  }];
  const hand = {
    kind: "hand_structure_result" as const,
    schemaVersion: "hand-structure/v2" as const,
    requestId: `${factSetId}:hand-structure:sha256:ledger-hand`,
    protocolVersion: "mahjong-facts/v1" as const,
    actionRef: "scene:ledger",
    stateHash: "sha256:ledger-hand",
    identity,
    overallShanten: 0,
    bestFamilies: openHand
      ? ["standard" as const]
      : ["standard" as const, "chiitoitsu" as const],
    families: [{
      family: "standard" as const,
      applicability: "applicable" as const,
      shanten: 0,
      effectiveTiles: [effective(3, 4), effective(6, 2)],
    }, openHand ? {
      family: "chiitoitsu" as const,
      applicability: "not_applicable_open_hand" as const,
      shanten: null,
      effectiveTiles: [],
    } : {
      family: "chiitoitsu" as const,
      applicability: "applicable" as const,
      shanten: 0,
      effectiveTiles: [
        effective(6, options.conflictingRemaining ? 1 : 2),
        effective(8, 1),
      ],
    }, openHand ? {
      family: "kokushi" as const,
      applicability: "not_applicable_open_hand" as const,
      shanten: null,
      effectiveTiles: [],
    } : {
      family: "kokushi" as const,
      applicability: "applicable" as const,
      shanten: 4,
      effectiveTiles: [effective(27, 3)],
    }],
    decompositions: {
      status: "calculated" as const,
      totalNonDominated: truncated ? 3 : 2,
      truncated,
      items: [{
        decompositionRef: "raw:z-standard",
        family: "standard" as const,
        shanten: 0,
        groups: [
          { kind: "sequence" as const, tiles34: [0, 1, 2] },
          { kind: "sequence" as const, tiles34: [0, 1, 2] },
        ],
      }, {
        decompositionRef: "raw:a-chiitoitsu",
        family: "chiitoitsu" as const,
        shanten: 0,
        groups: [{ kind: "pair_candidate" as const, tiles34: [6, 6] }],
      }],
      invariantClaims: [
        { kind: "floating" as const, tiles34: [30] },
        { kind: "floating" as const, tiles34: [30] },
      ],
      alternativeClaims: [{
        kind: "pair_candidate" as const,
        tiles34: [6, 6],
        decompositionRefs: ["raw:a-chiitoitsu"],
      }],
    },
    waits,
    diagnostics: [
      ...(truncated ? ["truncated_non_dominated_decompositions" as const] : []),
      ...(options.baseRonEligibility ===
          "unknown_missing_situational_yaku_context"
        ? ["ron_eligibility_missing_situational_context" as const]
        : []),
    ],
  };
  const riverComplete = options.riverComplete ?? true;
  const riverMatch = options.riverMatch ?? false;
  const selfRiver = riverMatch ? [{
    eventRef: "game:ledger/0/10/0",
    actor: 0,
    tile: { id: "7m" as const, red: false },
    discardMode: "tedashi" as const,
    riichiDeclarationEventRef: null,
    calledByEventRef: null,
  }] : [];
  const discardStatus = riverMatch
    ? "confirmed" as const
    : riverComplete
      ? "clear" as const
      : "unknown" as const;
  const anyConfirmed = riverMatch || temporaryStatus === "confirmed" ||
    riichiStatus === "confirmed";
  const anyUnknown = !riverComplete || temporaryStatus === "unknown" ||
    riichiStatus === "unknown" ||
    options.baseRonEligibility === "unknown_missing_situational_yaku_context";
  const ronEligibilityStatus = anyConfirmed || !anyUnknown
    ? "calculated" as const
    : "unknown_missing_facts" as const;
  return MergedHandFuritenV2Schema.parse({
    binding,
    hand,
    furiten: {
      discard: {
        status: discardStatus,
        source: "current_scene",
        selfActor: 0,
        selfRiver,
        selfRiverComplete: riverComplete,
        candidateDiscard: null,
        canonicalEventRefs: riverMatch ? ["game:ledger/0/10/0"] : [],
        candidateActionRefs: [],
      },
      temporary,
      riichi,
    },
    ronEligibilityStatus,
    ronEligibleWaits34: ronEligibilityStatus === "calculated" && !anyConfirmed &&
        options.baseRonEligibility !== "ineligible"
      ? [6]
      : [],
  });
}

function mapped(options: Parameters<typeof makeMerged>[0] = {}) {
  return mapMergedHandFuritenToEfficiencyFacts(makeMerged(options));
}

function fact(
  result: ReturnType<typeof mapMergedHandFuritenToEfficiencyFacts>,
  dimension: string,
) {
  const found = result.facts.find((item) => item.dimension === dimension);
  expect(found, `missing ${dimension}`).toBeDefined();
  return found!;
}

function candidateLedger(
  actionRef: string,
  result: ReturnType<typeof mapMergedHandFuritenToEfficiencyFacts>,
) {
  return CandidateFactorLedgerSchema.parse({
    actionRef,
    projectedStateRef: `projected:${actionRef}`,
    axes: [{
      axis: "efficiency",
      status: "calculated",
      facts: result.facts,
    }, ...(["value", "defense", "placement", "option_value"] as const)
      .map((axis) => ({ axis, status: "unsupported_dimension", facts: [] }))],
    diagnostics: result.diagnostics,
  });
}

describe("hand structure V2 ledger mapper", () => {
  it("maps family applicability and only allows the two registered efficiency totals", () => {
    const result = mapped({ openHand: true });
    expect(result.axis).toBe("efficiency");
    expect(fact(result, "family_applicability:standard").value).toEqual({
      kind: "classification", value: "applicable",
    });
    expect(fact(result, "family_applicability:chiitoitsu").value).toEqual({
      kind: "classification", value: "not_applicable_open_hand",
    });
    expect(fact(result, "family_applicability:kokushi").value).toEqual({
      kind: "classification", value: "not_applicable_open_hand",
    });
    expect(fact(result, "family_shanten:chiitoitsu").value).toEqual({
      kind: "classification", value: "not_applicable_open_hand",
    });
    expect(fact(result, "family_effective_tile_types:chiitoitsu").value)
      .toEqual({
        kind: "classification", value: "not_applicable_open_hand",
      });
    expect(fact(result, "family_effective_tiles_remaining:kokushi").value)
      .toEqual({
        kind: "classification", value: "not_applicable_open_hand",
      });
    const closed = mapped();
    expect(fact(closed, "family_applicability:chiitoitsu").value).toEqual({
      kind: "classification", value: "applicable",
    });
    expect(fact(closed, "family_applicability:kokushi").value).toEqual({
      kind: "classification", value: "applicable",
    });
    expect(result.facts.filter((item) =>
      item.preferenceEligibility === "deterministic"
    ).map((item) => item.dimension)).toEqual([
      "overall_shanten",
      "overall_effective_tiles_remaining",
    ]);
    expect(new Set(result.facts.map((item) => item.dimension)).size)
      .toBe(result.facts.length);
  });

  it("deduplicates overall effective tiles across best families and blocks unknown totals", () => {
    const complete = mapped();
    expect(fact(complete, "family_effective_tiles_remaining:standard").value)
      .toEqual({ kind: "number", value: 6, unit: "tiles_remaining" });
    expect(fact(complete, "family_effective_tiles_remaining:chiitoitsu").value)
      .toEqual({ kind: "number", value: 3, unit: "tiles_remaining" });
    expect(fact(complete, "overall_effective_tile_types").value)
      .toEqual({ kind: "integer_ids", values: [3, 6, 8] });
    expect(fact(complete, "overall_effective_tiles_remaining").value)
      .toEqual({
        kind: "tile_counts",
        value: [
          { tile34: 3, count: 4 },
          { tile34: 6, count: 2 },
          { tile34: 8, count: 1 },
        ],
      });
    const leftRef = canonicalActionRef({
      kind: "discard",
      tile: { id: "2p", red: false },
      discardMode: "tedashi",
    });
    const rightRef = canonicalActionRef({
      kind: "discard",
      tile: { id: "6s", red: false },
      discardMode: "tsumogiri",
    });
    const fewer = {
      ...complete,
      facts: complete.facts.map((item) =>
        item.dimension === "overall_effective_tiles_remaining"
          ? {
              ...item,
              value: {
                kind: "tile_counts" as const,
                value: [{ tile34: 3, count: 4 }],
              },
            }
          : item
      ),
    };
    expect(buildFactorDifferences([
      candidateLedger(leftRef, complete),
      candidateLedger(rightRef, fewer),
    ]).deterministic.find((item) =>
      item.dimension === "overall_effective_tiles_remaining"
    )).toMatchObject({
      preferenceEligibility: "deterministic",
      direction: "supports_left",
    });

    const missing = mapped({ missingRemaining: true });
    expect(fact(missing, "family_effective_tiles_remaining:standard").status)
      .toBe("blocked_missing_facts");
    expect(fact(missing, "overall_effective_tiles_remaining").status)
      .toBe("blocked_missing_facts");
    expect(fact(missing, "wait_tiles_remaining").status)
      .toBe("blocked_missing_facts");

    const conflict = mapped({ conflictingRemaining: true });
    expect(fact(conflict, "overall_effective_tiles_remaining").status)
      .toBe("blocked_engine_failure");
    expect(conflict.diagnostics)
      .toContain("hand_structure_remaining_count_conflict");
  });

  it("maps stable local ordinals, multiplicity, composite waits, and no raw refs", () => {
    const result = mapped();
    expect(fact(result, "shape_claims").value).toEqual({
      kind: "shape_claims",
      claims: [{
        certainty: "invariant",
        group: { kind: "floating", tiles34: [30], occurrence: 1 },
        decompositionOrdinals: [0, 1],
      }, {
        certainty: "invariant",
        group: { kind: "floating", tiles34: [30], occurrence: 2 },
        decompositionOrdinals: [0, 1],
      }, {
        certainty: "alternative",
        group: { kind: "pair_candidate", tiles34: [6, 6], occurrence: 1 },
        decompositionOrdinals: [1],
      }],
    });
    expect(fact(result, "wait_details").value).toEqual({
      kind: "wait_details",
      waits: [{
        tile34: 6,
        families: ["standard", "chiitoitsu"],
        waitTypes: ["ryanmen", "tanki"],
        remainingStatus: "calculated",
        remaining: 2,
        baseRonEligibility: "eligible",
        decompositionOrdinals: [0, 1],
      }],
    });
    expect(JSON.stringify(result)).not.toContain("raw:");
    expect(JSON.stringify(result)).not.toContain("decompositionRef");
  });

  it("marks truncation as non-exhaustive using fixed project wording", () => {
    const result = mapped({ truncated: true });
    const truncation = fact(result, "decomposition_truncated");
    expect(truncation.value).toEqual({ kind: "boolean", value: true });
    expect(truncation.limitations).toContain("非支配分解已截断，结构声明不能视为穷尽");
    expect(result.diagnostics).toEqual(["hand_structure_decompositions_truncated"]);
  });

  it("maps clear and confirmed furiten as descriptive booleans with typed proof", () => {
    const clear = mapped();
    for (const dimension of [
      "discard_furiten", "temporary_furiten", "riichi_furiten",
    ]) {
      expect(fact(clear, dimension).value).toEqual({ kind: "boolean", value: false });
      expect(fact(clear, dimension).preferenceEligibility).toBe("ineligible");
    }
    expect(fact(clear, "temporary_furiten").evidenceIds).toEqual([
      factSetId,
      "sha256:ledger-prefix",
      decisionEventRef,
    ]);

    const confirmed = mapped({ temporary: "confirmed" });
    expect(fact(confirmed, "temporary_furiten").value)
      .toEqual({ kind: "boolean", value: true });
    expect(fact(confirmed, "temporary_furiten").evidenceIds)
      .toContain("canonical-response:sha256:history-temporary:hand-structure:sha256:temporary");
    expect(fact(confirmed, "ron_eligible_wait_count").value)
      .toEqual({ kind: "number", value: 0, unit: "tile_types" });

    const riichiConfirmed = mapped({ riichi: "confirmed" });
    expect(fact(riichiConfirmed, "riichi_furiten").value)
      .toEqual({ kind: "boolean", value: true });
    expect(fact(riichiConfirmed, "riichi_furiten").evidenceIds)
      .toContain("game:ledger/0/1/0");
  });

  it("blocks unknown, unavailable, and engine-failed response facts without inventing zero", () => {
    const incomplete = mapped({ temporary: "unknown" });
    expect(fact(incomplete, "temporary_furiten").status)
      .toBe("blocked_missing_facts");
    expect(fact(incomplete, "temporary_furiten").value).toBeUndefined();
    expect(fact(incomplete, "ron_eligible_wait_count").status)
      .toBe("blocked_missing_facts");

    const incompleteRiver = mapped({ riverComplete: false });
    expect(fact(incompleteRiver, "discard_furiten").status)
      .toBe("blocked_missing_facts");
    expect(fact(incompleteRiver, "discard_furiten").value).toBeUndefined();

    const unavailable = mapped({ binding: "unavailable" });
    expect(fact(unavailable, "temporary_furiten").status)
      .toBe("blocked_missing_facts");
    expect(fact(unavailable, "temporary_furiten").engineIdentity)
      .toBeUndefined();
    expect(fact(unavailable, "riichi_furiten").status)
      .toBe("blocked_missing_facts");
    expect(fact(unavailable, "ron_eligible_wait_count").engineIdentity)
      .toBeUndefined();

    const failed = mapped({ binding: "identity_failure" });
    expect(fact(failed, "temporary_furiten").status)
      .toBe("blocked_engine_failure");
    expect(fact(failed, "temporary_furiten").engineIdentity).toBeUndefined();
    expect(fact(failed, "riichi_furiten").status)
      .toBe("blocked_engine_failure");
    expect(fact(failed, "ron_eligible_wait_count").status)
      .toBe("blocked_engine_failure");

    const handFailure = mapped({
      temporary: "unknown",
      responseHandStructureFailure: true,
    });
    expect(fact(handFailure, "temporary_furiten").status)
      .toBe("blocked_engine_failure");
    expect(fact(handFailure, "temporary_furiten").limitations).toEqual([
      "响应历史的手牌结构分析失败，不能判定响应振听",
    ]);
    expect(fact(handFailure, "ron_eligible_wait_count").status)
      .toBe("blocked_engine_failure");
    expect(handFailure.diagnostics)
      .toContain("response_temporary_hand_structure_failure");
  });

  it("maps discard proof, base ron eligibility, and final eligibility descriptively", () => {
    const result = mapped({ riverMatch: true });
    expect(fact(result, "discard_furiten").value)
      .toEqual({ kind: "boolean", value: true });
    expect(fact(result, "discard_furiten").evidenceIds)
      .toContain("game:ledger/0/10/0");
    expect(fact(result, "base_ron_eligibility").value).toEqual({
      kind: "string_set", values: ["6:eligible"],
    });
    expect(fact(result, "final_ron_eligibility_status").value).toEqual({
      kind: "classification", value: "calculated",
    });
    expect(fact(result, "final_ron_eligibility_status").limitations).toEqual([
      "最终荣和资格由手牌等待、舍牌振听与响应振听的绑定事实共同计算",
    ]);
    for (const item of result.facts.filter((entry) =>
      entry.dimension.includes("furiten") ||
      entry.dimension.startsWith("ron_eligible") ||
      entry.dimension.includes("ron_eligibility")
    )) {
      expect(item.preferenceEligibility).toBe("ineligible");
    }
  });
});
