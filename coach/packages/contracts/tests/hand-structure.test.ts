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
    diagnostics: [],
  };
}

describe("hand-structure/v2 contracts", () => {
  it("accepts a strict independent request", () => {
    expect(HandStructureRequestV2Schema.parse(request()).schemaVersion)
      .toBe("hand-structure/v2");
    expect(() => HandStructureRequestV2Schema.parse({ ...request(), extra: true }))
      .toThrow();
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
});
