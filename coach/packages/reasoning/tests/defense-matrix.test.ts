import { describe, expect, it } from "vitest";
import {
  DefenseMatrixV1Schema,
  KnownGameFactsSchema,
  StructuredComparisonCandidateSchema,
  canonicalActionRef,
  type KnownGameFacts,
  type StructuredComparisonCandidate,
  type Tile,
} from "@riichi-coach/contracts";
import { buildDeterministicDefenseMatrix } from "../src/factors/defense-matrix.js";

const tile = (id: Tile["id"]): Tile => ({ id, red: false });

function discardCandidate(
  id: Tile["id"],
  red = false,
): StructuredComparisonCandidate {
  const action = {
    kind: "discard" as const,
    tile: { id, red },
    discardMode: "tedashi" as const,
  };
  return StructuredComparisonCandidateSchema.parse({
    action,
    actionRef: canonicalActionRef(action),
    origins: ["user"],
  });
}

function riichiDiscardCandidate(id: Tile["id"]): StructuredComparisonCandidate {
  const action = {
    kind: "riichi_discard" as const,
    tile: tile(id),
    discardMode: "tedashi" as const,
  };
  return StructuredComparisonCandidateSchema.parse({
    action,
    actionRef: canonicalActionRef(action),
    origins: ["user"],
  });
}

const refs = {
  threat1: "game:matrix/0/5/0",
  threat2: "game:matrix/0/6/0",
  accepted2: "game:matrix/0/7/0",
  crossSix: "game:matrix/0/10/0",
  other: "game:matrix/0/11/0",
  decision: "game:matrix/0/20/0",
} as const;

function canonicalFacts(overrides: Partial<KnownGameFacts> = {}): KnownGameFacts {
  return KnownGameFactsSchema.parse({
    factSetId: "canonical-v2:sha256:matrix-state",
    provenance: "raw_replay",
    actor: 0,
    selfRiichi: false,
    decisionEventRef: refs.decision,
    decisionWindow: {
      kind: "self_turn",
      actor: 0,
      triggerEventRef: refs.decision,
    },
    concealedTiles: [],
    currentDraw: null,
    melds: [],
    doraIndicators: [tile("1m")],
    rivers: [
      [],
      [{
        tile: tile("6s"),
        actor: 1,
        tsumogiri: false,
        eventId: refs.crossSix,
        afterRiichiEventIds: [refs.threat1, refs.threat2],
      }],
      [{
        tile: tile("5s"),
        actor: 2,
        tsumogiri: false,
        eventId: refs.other,
        afterRiichiEventIds: [refs.threat1, refs.threat2],
      }],
      [],
    ],
    threats: [
      {
        actor: 1,
        riichi: true,
        declarationEventId: refs.threat1,
        ippatsuAlive: false,
      },
      {
        actor: 2,
        riichi: true,
        declarationEventId: refs.threat2,
        ippatsuAlive: false,
      },
    ],
    defenseThreats: [
      {
        actor: 1,
        kind: "riichi_declared",
        source: "canonical_replay",
        sourceEventRefs: [refs.threat1],
        openMeldRefs: [],
        dealerStatus: "non_dealer",
        riichiTurn: { status: "calculated", value: 1 },
        ippatsu: { status: "calculated", value: false },
      },
      {
        actor: 2,
        kind: "riichi_accepted",
        source: "canonical_replay",
        sourceEventRefs: [refs.threat2, refs.accepted2],
        openMeldRefs: [],
        dealerStatus: "non_dealer",
        riichiTurn: { status: "calculated", value: 1 },
        ippatsu: { status: "calculated", value: false },
      },
    ],
    roundWind: "E",
    seatWind: "E",
    dealer: true,
    remainingDraws: null,
    completeness: {
      concealedTiles: true,
      melds: true,
      doraIndicators: true,
      rivers: true,
      remainingDraws: false,
      calledDiscardMarkers: true,
      responseOpportunities: true,
      eventSequence: true,
      roundContext: true,
    },
    evidenceIds: Object.values(refs),
    ...overrides,
  });
}

function cellFor(
  matrix: ReturnType<typeof buildDeterministicDefenseMatrix>,
  actor: number,
) {
  const cell = matrix.cells.find((entry) => entry.threat.actor === actor);
  if (cell === undefined) throw new Error(`missing actor ${actor}`);
  return cell;
}

describe("deterministic per-threat defense matrix", () => {
  function expectStableError(run: () => unknown, code: string): void {
    try {
      run();
      throw new Error("expected defense matrix failure");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(code);
      expect((error as Error).message).not.toContain("game:matrix");
      expect((error as Error).message).not.toContain("Zod");
    }
  }

  it("binds one candidate independently to own-discard and post-riichi-pass evidence", () => {
    const candidate = discardCandidate("6s");
    const matrix = buildDeterministicDefenseMatrix({
      candidate,
      facts: canonicalFacts(),
    });

    expect(DefenseMatrixV1Schema.parse(matrix)).toEqual(matrix);
    expect(matrix).toMatchObject({
      source: "canonical_replay",
      factSetId: "canonical-v2:sha256:matrix-state",
      sourceStateHash: "sha256:matrix-state",
      decisionEventRef: refs.decision,
      actionRef: candidate.actionRef,
      candidateTile34: 23,
    });
    expect(cellFor(matrix, 1).deterministicSafety).toEqual({
      status: "calculated",
      genbutsu: true,
      evidenceRefs: [{
        role: "threat_own_discard",
        eventRef: refs.crossSix,
      }],
    });
    expect(cellFor(matrix, 2).deterministicSafety).toEqual({
      status: "calculated",
      genbutsu: true,
      evidenceRefs: [{
        role: "post_riichi_pass",
        eventRef: refs.crossSix,
      }],
    });
    expect(matrix.cells.map((cell) => cell.structural)).toEqual([
      { status: "blocked_missing_facts", missing: ["visibility"] },
      { status: "blocked_missing_facts", missing: ["visibility"] },
    ]);
  });

  it("blocks only cross-player passage when response opportunities are incomplete", () => {
    const base = canonicalFacts();
    const matrix = buildDeterministicDefenseMatrix({
      candidate: discardCandidate("6s"),
      facts: canonicalFacts({
        completeness: {
          ...base.completeness,
          responseOpportunities: false,
        },
      }),
    });

    expect(cellFor(matrix, 1).deterministicSafety.status).toBe("calculated");
    expect(cellFor(matrix, 2).deterministicSafety).toEqual({
      status: "blocked_missing_facts",
      evidenceRefs: [],
    });
  });

  it("blocks every riichi cell before inspecting an incomplete river", () => {
    const base = canonicalFacts();
    const matrix = buildDeterministicDefenseMatrix({
      candidate: discardCandidate("6s"),
      facts: canonicalFacts({
        completeness: { ...base.completeness, rivers: false },
      }),
    });

    expect(matrix.cells.map((cell) => cell.deterministicSafety)).toEqual([
      { status: "blocked_missing_facts", evidenceRefs: [] },
      { status: "blocked_missing_facts", evidenceRefs: [] },
    ]);
  });

  it("calculates false separately for a nonmatching tile", () => {
    const matrix = buildDeterministicDefenseMatrix({
      candidate: discardCandidate("7s"),
      facts: canonicalFacts(),
    });

    expect(matrix.cells.map((cell) => cell.deterministicSafety)).toEqual([
      { status: "calculated", genbutsu: false, evidenceRefs: [] },
      { status: "calculated", genbutsu: false, evidenceRefs: [] },
    ]);
  });

  it("treats red and normal fives as the same genbutsu tile type", () => {
    const base = canonicalFacts();
    const normalFiveRef = "game:matrix/0/12/0";
    const facts = canonicalFacts({
      rivers: base.rivers.map((river, actor) => actor === 1
        ? [{
            tile: tile("5p"),
            actor,
            tsumogiri: false,
            eventId: normalFiveRef,
            afterRiichiEventIds: [refs.threat1, refs.threat2],
          }]
        : river),
    });
    const matrix = buildDeterministicDefenseMatrix({
      candidate: discardCandidate("5p", true),
      facts,
    });

    expect(cellFor(matrix, 1).deterministicSafety).toEqual({
      status: "calculated",
      genbutsu: true,
      evidenceRefs: [{
        role: "threat_own_discard",
        eventRef: normalFiveRef,
      }],
    });
    expect(cellFor(matrix, 2).deterministicSafety).toEqual({
      status: "calculated",
      genbutsu: true,
      evidenceRefs: [{
        role: "post_riichi_pass",
        eventRef: normalFiveRef,
      }],
    });
  });

  it("returns no cells when no threat exists", () => {
    const matrix = buildDeterministicDefenseMatrix({
      candidate: discardCandidate("6s"),
      facts: canonicalFacts({ threats: [], defenseThreats: [] }),
    });

    expect(matrix.cells).toEqual([]);
    expect(DefenseMatrixV1Schema.safeParse(matrix).success).toBe(true);
  });

  it("accepts a riichi-discard candidate through the discard matrix path", () => {
    const candidate = riichiDiscardCandidate("6s");
    const matrix = buildDeterministicDefenseMatrix({
      candidate,
      facts: canonicalFacts(),
    });

    expect(matrix.actionRef).toBe(candidate.actionRef);
    expect(matrix.candidateTile34).toBe(23);
    expect(cellFor(matrix, 1).deterministicSafety).toMatchObject({
      status: "calculated",
      genbutsu: true,
    });
  });

  it("does not trust derived evidence merely because the threat was user asserted", () => {
    const base = canonicalFacts();
    const mixed = KnownGameFactsSchema.parse({
      ...base,
      provenance: "mixed",
      rivers: [
        [],
        [{
          ...base.rivers[1]![0]!,
          eventId: "user:claimed-own-discard",
        }],
        [],
        [],
      ],
      threats: [{
        actor: 1,
        riichi: true,
        declarationEventId: "user:riichi",
        ippatsuAlive: false,
      }],
      defenseThreats: [{
        ...base.defenseThreats[0]!,
        source: "user_asserted",
        sourceEventRefs: ["user:riichi"],
      }],
      evidenceIds: [refs.decision, "user:riichi"],
    });
    expectStableError(() => buildDeterministicDefenseMatrix({
      candidate: discardCandidate("6s"),
      facts: mixed,
    }), "defense_matrix_requires_canonical_replay_evidence");

    const future = KnownGameFactsSchema.parse({
      ...mixed,
      rivers: mixed.rivers.map((river, actor) => actor === 1
        ? river.map((discard) => ({
            ...discard,
            eventId: "game:matrix/0/21/0",
          }))
        : river),
    });
    expectStableError(() => buildDeterministicDefenseMatrix({
      candidate: discardCandidate("6s"),
      facts: future,
    }), "defense_matrix_invalid_output");
  });

  it("marks deterministic safety not applicable for a user-marked open threat", () => {
    const facts = KnownGameFactsSchema.parse({
      ...canonicalFacts({ threats: [], defenseThreats: [] }),
      factSetId: "user-asserted:sha256:user-matrix",
      provenance: "user_asserted",
      decisionEventRef: "hypothesis:decision",
      decisionWindow: {
        kind: "self_turn",
        actor: 0,
        triggerEventRef: "hypothesis:decision",
      },
      defenseThreats: [{
        actor: 3,
        kind: "user_marked_open",
        source: "user_asserted",
        sourceEventRefs: ["hypothesis:open-threat"],
        openMeldRefs: ["hypothesis:meld"],
        dealerStatus: "non_dealer",
        riichiTurn: { status: "not_applicable" },
        ippatsu: { status: "not_applicable" },
      }],
      evidenceIds: ["hypothesis:decision", "hypothesis:open-threat"],
    });
    const matrix = buildDeterministicDefenseMatrix({
      candidate: discardCandidate("6s"),
      facts,
    });

    expect(matrix.source).toBe("user_asserted");
    expect(matrix.sourceStateHash).toBe("sha256:user-matrix");
    expect(matrix.cells).toHaveLength(1);
    expect(matrix.cells[0]).toMatchObject({
      deterministicSafety: { status: "not_applicable" },
      structural: {
        status: "unsupported_threat_kind",
        kind: "user_marked_open",
      },
    });
    expect(DefenseMatrixV1Schema.safeParse(matrix).success).toBe(true);
  });

  it("binds a canonical legacy bridge but refuses its old noncanonical evidence", () => {
    const base = canonicalFacts();
    const legacy = KnownGameFactsSchema.parse({
      ...base,
      factSetId: "legacy-regression:sha256:legacy-matrix",
      provenance: "legacy_regression_bridge_only",
      defenseThreats: base.defenseThreats.map((threat) => ({
        ...threat,
        source: "legacy_regression_bridge_only" as const,
      })),
    });
    const matrix = buildDeterministicDefenseMatrix({
      candidate: discardCandidate("6s"),
      facts: legacy,
    });
    expect(matrix).toMatchObject({
      source: "legacy_regression_bridge_only",
      sourceStateHash: "sha256:legacy-matrix",
    });
    expect(DefenseMatrixV1Schema.safeParse(matrix).success).toBe(true);

    const noncanonical = KnownGameFactsSchema.parse({
      ...legacy,
      decisionEventRef: "event:decision",
      decisionWindow: {
        ...legacy.decisionWindow,
        triggerEventRef: "event:decision",
      },
      rivers: [
        [],
        [{
          ...legacy.rivers[1]![0]!,
          eventId: "event:cross-six",
          afterRiichiEventIds: ["event:threat-1", "event:threat-2"],
        }],
        [{
          ...legacy.rivers[2]![0]!,
          eventId: "event:other",
          afterRiichiEventIds: ["event:threat-1", "event:threat-2"],
        }],
        [],
      ],
      threats: [
        {
          ...legacy.threats[0]!,
          declarationEventId: "event:threat-1",
        },
        {
          ...legacy.threats[1]!,
          declarationEventId: "event:threat-2",
        },
      ],
      defenseThreats: [
        {
          ...legacy.defenseThreats[0]!,
          sourceEventRefs: ["event:threat-1"],
        },
        {
          ...legacy.defenseThreats[1]!,
          sourceEventRefs: ["event:threat-2", "event:accepted-2"],
        },
      ],
      evidenceIds: ["event:decision", "event:threat-1", "event:threat-2"],
    });
    expect(() => buildDeterministicDefenseMatrix({
      candidate: discardCandidate("6s"),
      facts: noncanonical,
    })).toThrow("defense_matrix_requires_canonical_replay_evidence");
  });

  it("rejects non-discard actions at the matrix boundary", () => {
    const action = {
      kind: "chi" as const,
      calledTile: tile("2m"),
      consumedTiles: [tile("1m"), tile("3m")] as [Tile, Tile],
      targetActor: 3,
      responseEventRef: "game:matrix/0/19/0",
    };
    const candidate = StructuredComparisonCandidateSchema.parse({
      action,
      actionRef: canonicalActionRef(action),
      origins: ["user"],
    });

    expect(() => buildDeterministicDefenseMatrix({
      candidate,
      facts: canonicalFacts(),
    })).toThrow("defense_matrix_requires_discard_candidate");
  });

  it("converts every schema rejection to a fixed project-owned code", () => {
    expectStableError(() => buildDeterministicDefenseMatrix({
      candidate: {} as StructuredComparisonCandidate,
      facts: canonicalFacts(),
    }), "defense_matrix_invalid_candidate");
    expectStableError(() => buildDeterministicDefenseMatrix({
      candidate: discardCandidate("6s"),
      facts: {} as KnownGameFacts,
    }), "defense_matrix_invalid_known_facts");

    const base = canonicalFacts();
    const temporallyInvalid = KnownGameFactsSchema.parse({
      ...base,
      rivers: base.rivers.map((river, actor) => actor === 1
        ? river.map((discard) => ({
            ...discard,
            eventId: "game:matrix/0/4/0",
          }))
        : river),
    });
    expectStableError(() => buildDeterministicDefenseMatrix({
      candidate: discardCandidate("6s"),
      facts: temporallyInvalid,
    }), "defense_matrix_invalid_output");
  });
});
