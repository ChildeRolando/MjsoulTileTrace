import { describe, expect, it } from "vitest";
import {
  HAND_STRUCTURE_SCHEMA_VERSION,
  HandStructureRequestV2Schema,
  HandStructureResultV2Schema,
  type HandStructureRequestV2,
  type HandStructureResultV2,
} from "../src/hand-structure.js";
import { ActionRefSchema } from "../src/comparison.js";

const zeroes = Array<number>(34).fill(0);
const actionRef = ActionRefSchema.parse(
  "action:v1:discard:9s:normal:tedashi",
);

function request(): HandStructureRequestV2 {
  const hand = [...zeroes];
  [0, 1, 2, 9, 10, 11, 18, 19, 20, 24, 25, 27, 27]
    .forEach((tile) => {
      hand[tile] = hand[tile]! + 1;
    });
  return {
    kind: "hand_structure" as const,
    schemaVersion: HAND_STRUCTURE_SCHEMA_VERSION,
    requestId: "request:shape",
    protocolVersion: "mahjong-facts/v1" as const,
    actionRef,
    stateHash: "sha256:shape",
    handTiles34: hand,
    melds: [],
    leftTiles34: null,
    visibleCountsComplete: false,
    ronContext: "unknown_future" as const,
    yakuContext: {
      windsStatus: "known" as const,
      roundWindTile34: 27,
      selfWindTile34: 28,
      riichiStatus: "inactive" as const,
      openTanyaoStatus: "enabled" as const,
    },
  };
}

function result(): HandStructureResultV2 {
  return {
    kind: "hand_structure_result",
    schemaVersion: HAND_STRUCTURE_SCHEMA_VERSION,
    requestId: "request:shape",
    protocolVersion: "mahjong-facts/v1",
    actionRef,
    stateHash: "sha256:shape",
    identity: {
      engine: "mahjong-helper",
      upstreamCommit: "514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0",
      adapterVersion: "0.1.0",
      protocolVersion: "mahjong-facts/v1",
    },
    overallShanten: 0,
    bestFamilies: ["standard"],
    families: [
      {
        family: "standard",
        applicability: "applicable",
        shanten: 0,
        effectiveTiles: [
          { tile34: 23, remainingStatus: "blocked_missing_facts", remaining: null },
          { tile34: 26, remainingStatus: "blocked_missing_facts", remaining: null },
        ],
      },
      {
        family: "chiitoitsu",
        applicability: "applicable",
        shanten: 5,
        effectiveTiles: [],
      },
      {
        family: "kokushi",
        applicability: "applicable",
        shanten: 8,
        effectiveTiles: [],
      },
    ],
    decompositions: {
      status: "calculated",
      totalNonDominated: 1,
      truncated: false,
      items: [{
        decompositionRef: "standard:abc",
        family: "standard",
        shanten: 0,
        groups: [
          { kind: "sequence", tiles34: [0, 1, 2] },
          { kind: "pair_candidate", tiles34: [27, 27] },
        ],
      }],
      invariantClaims: [
        { kind: "sequence", tiles34: [0, 1, 2] },
        { kind: "pair_candidate", tiles34: [27, 27] },
      ],
      alternativeClaims: [],
    },
    waits: [
      {
        tile34: 23,
        families: ["standard"],
        waitTypes: ["ryanmen"],
        remainingStatus: "blocked_missing_facts",
        remaining: null,
        baseRonEligibility: "unknown_missing_situational_yaku_context",
        decompositionRefs: ["standard:abc"],
      },
    ],
    diagnostics: ["ron_eligibility_missing_situational_context"],
  };
}

describe("hand-structure/v2 contracts", () => {
  it("accepts a strict independent request", () => {
    expect(HandStructureRequestV2Schema.parse(request()).schemaVersion)
      .toBe("hand-structure/v2");
    expect(() => HandStructureRequestV2Schema.parse({ ...request(), extra: true }))
      .toThrow();
  });

  it("requires a strict, stable yaku context shape", () => {
    const missingContext = { ...request() } as Record<string, unknown>;
    delete missingContext.yakuContext;
    expect(() => HandStructureRequestV2Schema.parse(missingContext)).toThrow();

    for (const field of [
      "windsStatus",
      "roundWindTile34",
      "selfWindTile34",
      "riichiStatus",
      "openTanyaoStatus",
    ] as const) {
      const missing = request() as unknown as {
        yakuContext: Record<string, unknown>;
      };
      delete missing.yakuContext[field];
      expect(() => HandStructureRequestV2Schema.parse(missing)).toThrow();
    }

    const unknownNested = request() as unknown as {
      yakuContext: Record<string, unknown>;
    };
    unknownNested.yakuContext.extra = true;
    expect(() => HandStructureRequestV2Schema.parse(unknownNested)).toThrow();
  });

  it("binds wind status to known wind values and their ranges", () => {
    const cases = [
      {
        ...request(),
        yakuContext: {
          ...request().yakuContext,
          windsStatus: "known",
          roundWindTile34: null,
        },
      },
      {
        ...request(),
        yakuContext: {
          ...request().yakuContext,
          windsStatus: "unknown",
        },
      },
      {
        ...request(),
        yakuContext: {
          ...request().yakuContext,
          windsStatus: "unknown",
          roundWindTile34: null,
          selfWindTile34: 28,
        },
      },
      {
        ...request(),
        yakuContext: {
          ...request().yakuContext,
          roundWindTile34: 30,
        },
      },
      {
        ...request(),
        yakuContext: {
          ...request().yakuContext,
          selfWindTile34: 31,
        },
      },
    ];
    for (const invalid of cases) {
      expect(HandStructureRequestV2Schema.safeParse(invalid).success).toBe(false);
    }

    const unknown = request();
    unknown.yakuContext = {
      ...unknown.yakuContext,
      windsStatus: "unknown",
      roundWindTile34: null,
      selfWindTile34: null,
    };
    expect(HandStructureRequestV2Schema.parse(unknown).yakuContext.windsStatus)
      .toBe("unknown");
  });

  it("accepts every explicit open-tanyao state", () => {
    for (const openTanyaoStatus of ["enabled", "disabled", "unknown"] as const) {
      const candidate = request();
      candidate.yakuContext.openTanyaoStatus = openTanyaoStatus;
      expect(HandStructureRequestV2Schema.parse(candidate).yakuContext.openTanyaoStatus)
        .toBe(openTanyaoStatus);
    }
  });

  it("rejects unknown riichi and open-tanyao status values", () => {
    const badRiichi = request() as unknown as {
      yakuContext: Record<string, unknown>;
    };
    badRiichi.yakuContext.riichiStatus = "declared";
    expect(HandStructureRequestV2Schema.safeParse(badRiichi).success).toBe(false);

    const badOpenTanyao = request() as unknown as {
      yakuContext: Record<string, unknown>;
    };
    badOpenTanyao.yakuContext.openTanyaoStatus = "optional";
    expect(HandStructureRequestV2Schema.safeParse(badOpenTanyao).success).toBe(false);
  });

  it("rejects accepted riichi with open melds but permits ankan", () => {
    const concealed = [...zeroes];
    [3, 4, 5, 9, 10, 11, 18, 19, 20, 31].forEach((tile) => {
      concealed[tile] = concealed[tile]! + 1;
    });
    for (const meld of [
      { kind: "chi" as const, tiles34: [0, 1, 2] },
      { kind: "pon" as const, tiles34: [27, 27, 27] },
      { kind: "daiminkan" as const, tiles34: [27, 27, 27, 27] },
      { kind: "kakan" as const, tiles34: [27, 27, 27, 27] },
    ]) {
      const open = request();
      open.handTiles34 = concealed;
      open.melds = [meld];
      open.yakuContext.riichiStatus = "accepted";
      expect(HandStructureRequestV2Schema.safeParse(open).success).toBe(false);
    }

    const closedKan = request();
    closedKan.handTiles34 = concealed;
    closedKan.melds = [{ kind: "ankan", tiles34: [27, 27, 27, 27] }];
    closedKan.yakuContext.riichiStatus = "accepted";
    expect(HandStructureRequestV2Schema.safeParse(closedKan).success).toBe(true);
  });

  it("uses precise ron-context variants and rejects the ambiguous legacy value", () => {
    for (const ronContext of [
      "complete_none",
      "known_kakan_chankan",
      "known_ankan_chankan",
      "known_houtei",
      "unknown_future",
    ] as const) {
      expect(HandStructureRequestV2Schema.parse({ ...request(), ronContext }).ronContext)
        .toBe(ronContext);
    }
    expect(HandStructureRequestV2Schema.safeParse({
      ...request(),
      ronContext: "known_chankan",
    }).success).toBe(false);
  });

  it("requires family order and exact best-family minima", () => {
    expect(HandStructureResultV2Schema.parse(result()).bestFamilies)
      .toEqual(["standard"]);
    const reversed = result();
    reversed.families = [
      reversed.families[2],
      reversed.families[1],
      reversed.families[0],
    ];
    expect(() => HandStructureResultV2Schema.parse(reversed)).toThrow();
    const falseBest = result();
    falseBest.bestFamilies = ["chiitoitsu"];
    expect(() => HandStructureResultV2Schema.parse(falseBest)).toThrow();
  });

  it("rejects wrong concealed counts, unsorted waits and false truncation", () => {
    const open = request();
    open.melds = [{ kind: "pon", tiles34: [31, 31, 31] }];
    expect(HandStructureRequestV2Schema.safeParse(open).success).toBe(false);
    const unsorted = result();
    unsorted.waits = [
      { ...unsorted.waits[0]!, tile34: 26 },
      { ...unsorted.waits[0]!, tile34: 23 },
    ];
    expect(() => HandStructureResultV2Schema.parse(unsorted)).toThrow();
    const falseTruncation = result();
    falseTruncation.decompositions.truncated = true;
    expect(() => HandStructureResultV2Schema.parse(falseTruncation)).toThrow();
  });

  it("rejects physical-left contradictions and malformed shape groups", () => {
    const impossibleLeft = request();
    impossibleLeft.visibleCountsComplete = true;
    impossibleLeft.leftTiles34 = [...zeroes];
    impossibleLeft.leftTiles34[27] = 3;
    expect(() => HandStructureRequestV2Schema.parse(impossibleLeft)).toThrow();

    const malformed = result();
    malformed.decompositions.items[0]!.groups[0] = {
      kind: "sequence",
      tiles34: [0, 1, 3],
    };
    expect(() => HandStructureResultV2Schema.parse(malformed)).toThrow();
  });

  it("binds blocked payloads and every decomposition reference", () => {
    const blocked = result();
    blocked.decompositions.status = "blocked_engine_failure";
    expect(() => HandStructureResultV2Schema.parse(blocked)).toThrow();

    const impossibleCount = result();
    impossibleCount.decompositions.totalNonDominated = 0;
    expect(() => HandStructureResultV2Schema.parse(impossibleCount)).toThrow();

    const danglingAlternative = result();
    danglingAlternative.decompositions.alternativeClaims = [{
      kind: "floating",
      tiles34: [8],
      decompositionRefs: ["standard:missing"],
    }];
    expect(() => HandStructureResultV2Schema.parse(danglingAlternative)).toThrow();

    const danglingWait = result();
    danglingWait.waits[0]!.decompositionRefs = ["standard:missing"];
    expect(() => HandStructureResultV2Schema.parse(danglingWait)).toThrow();
  });

  it("requires wait/family/diagnostic semantics to agree", () => {
    const notTenpai = result();
    notTenpai.families[0].shanten = 1;
    notTenpai.overallShanten = 1;
    expect(() => HandStructureResultV2Schema.parse(notTenpai)).toThrow();

    const duplicateWaitFamily = result();
    duplicateWaitFamily.waits[0]!.families = ["standard", "standard"];
    expect(() => HandStructureResultV2Schema.parse(duplicateWaitFamily)).toThrow();

    const missingDiagnostic = result();
    missingDiagnostic.waits[0]!.baseRonEligibility =
      "unknown_missing_situational_yaku_context";
    missingDiagnostic.diagnostics = [];
    expect(() => HandStructureResultV2Schema.parse(missingDiagnostic)).toThrow();

    const strayDiagnostic = result();
    strayDiagnostic.waits[0]!.baseRonEligibility = "eligible";
    strayDiagnostic.diagnostics = [
      "ron_eligibility_missing_situational_context",
    ];
    expect(() => HandStructureResultV2Schema.parse(strayDiagnostic)).toThrow();
  });
});
