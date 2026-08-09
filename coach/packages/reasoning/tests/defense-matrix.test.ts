import { describe, expect, it } from "vitest";
import {
  DefenseMatrixV1Schema,
  KnownGameFactsSchema,
  STRUCTURAL_RISK_SCALE_VERSION,
  StructuredComparisonCandidateSchema,
  canonicalActionRef,
  defenseStructuralStateHash,
  type EngineIdentity,
  type KnownGameFacts,
  type StructuredComparisonCandidate,
  type ThreatRiskProjection,
  type Tile,
} from "@riichi-coach/contracts";
import {
  assembleDefenseMatrix,
  buildDeterministicDefenseMatrix,
  type ThreatRiskEngineOutcome,
} from "../src/factors/defense-matrix.js";

const tile = (id: Tile["id"]): Tile => ({ id, red: false });
const identity: EngineIdentity = {
  engine: "mahjong-helper",
  upstreamCommit: "514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0",
  adapterVersion: "0.2.0",
  protocolVersion: "mahjong-facts/v1",
};

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

function threeThreatFacts(): KnownGameFacts {
  const base = canonicalFacts();
  return KnownGameFactsSchema.parse({
    ...base,
    provenance: "mixed",
    defenseThreats: [
      ...base.defenseThreats,
      {
        actor: 3,
        kind: "user_marked_open",
        source: "user_asserted",
        sourceEventRefs: ["user:threat:3"],
        openMeldRefs: ["user:meld:3"],
        dealerStatus: "non_dealer",
        riichiTurn: { status: "not_applicable" },
        ippatsu: { status: "not_applicable" },
      },
    ],
  });
}

function assemblyFixture() {
  const candidate = discardCandidate("6s");
  const deterministic = buildDeterministicDefenseMatrix({
    candidate,
    facts: threeThreatFacts(),
  });
  const safeTiles34 = Array<boolean>(34).fill(false);
  safeTiles34[23] = true;
  const visibility = {
    turns: 4,
    safeTiles34,
    leftTiles34: Array<number>(34).fill(4),
    doraTiles34: [8],
    roundWindTile34: 27,
    threatWindTile34: 29,
    earlyOutsideTiles34: [],
  };
  const evidenceIds = [refs.threat2, refs.accepted2];
  const stateHash = defenseStructuralStateHash({
    sourceStateHash: deterministic.sourceStateHash,
    factSetId: deterministic.factSetId,
    actionRef: candidate.actionRef,
    threatActor: 2,
    visibility,
    evidenceIds,
  });
  const request = {
    kind: "threat_risk" as const,
    requestId: `${deterministic.factSetId}:risk:2:${stateHash}`,
    protocolVersion: "mahjong-facts/v1" as const,
    actionRef: candidate.actionRef,
    stateHash,
    threatActor: 2,
    scaleVersion: STRUCTURAL_RISK_SCALE_VERSION,
    ...visibility,
    evidenceIds,
  };
  const projections: ThreatRiskProjection[] = [{
    threatActor: 1,
    status: "blocked_missing_facts",
    missing: ["visibility"],
  }, {
    threatActor: 2,
    status: "ready",
    request,
  }, {
    threatActor: 3,
    status: "unsupported_threat_kind",
    kind: "user_marked_open",
  }];
  const outcomes: ThreatRiskEngineOutcome[] = [{
    status: "calculated",
    result: {
      kind: "threat_risk_result",
      requestId: request.requestId,
      protocolVersion: request.protocolVersion,
      actionRef: request.actionRef,
      stateHash: request.stateHash,
      identity,
      threatActor: 2,
      scaleVersion: request.scaleVersion,
      riskScale: request.safeTiles34.map((safe) => safe ? 0 : 5),
      classifications: Array.from({ length: 27 }, (_, tile34) => {
        if (request.safeTiles34[tile34]) {
          return { tile34, kind: "genbutsu" as const };
        }
        const rank = tile34 % 9;
        const safeCount = rank <= 2
          ? Number(request.safeTiles34[tile34 + 3])
          : rank >= 6
          ? Number(request.safeTiles34[tile34 - 3])
          : Number(request.safeTiles34[tile34 - 3]) +
            Number(request.safeTiles34[tile34 + 3]);
        const kind = rank >= 3 && rank <= 5
          ? safeCount === 0 ? "no_suji" as const
          : safeCount === 1 ? "half_suji" as const : "double_suji" as const
          : safeCount === 0 ? "no_suji" as const : "suji" as const;
        return { tile34, kind };
      }),
      honorClassifications: Array.from({ length: 7 }, (_, index) => ({
        tile34: 27 + index,
        remainingCount: request.leftTiles34[27 + index]!,
        category: 27 + index >= 31 ||
            27 + index === request.roundWindTile34 ||
            27 + index === request.threatWindTile34
          ? "yakuhai" as const
          : "guest_wind" as const,
      })),
      leftNoSujiTile34: [
        0, 1, 2, 6, 7, 8,
        9, 10, 11, 15, 16, 17,
        18, 19, 24, 25,
      ],
      evidenceIds: request.evidenceIds,
      limitations: [
        "helper_risk_not_mortal_probability",
        "threats_analyzed_independently",
        "structural_labels_separate",
      ],
      diagnostics: [],
    },
  }];
  return { deterministic, projections, outcomes, request };
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

  it("assembles one structural row per threat without duplicating deterministic genbutsu", () => {
    const fixture = assemblyFixture();
    const matrix = assembleDefenseMatrix({
      deterministic: fixture.deterministic,
      threatRiskProjections: fixture.projections,
      threatRiskOutcomes: fixture.outcomes,
    });

    expect(DefenseMatrixV1Schema.parse(matrix)).toEqual(matrix);
    expect(matrix.cells.map((cell) => cell.threat.actor)).toEqual([1, 2, 3]);
    expect(cellFor(matrix, 1).structural).toEqual({
      status: "blocked_missing_facts",
      missing: ["visibility"],
    });
    expect(cellFor(matrix, 2).structural).toMatchObject({
      status: "calculated",
      visibility: {
        turns: fixture.request.turns,
        safeTiles34: fixture.request.safeTiles34,
        leftTiles34: fixture.request.leftTiles34,
      },
      helperRiskScale: 0,
      classifications: [],
      limitations: ["helper_risk_not_mortal_probability"],
      engineIdentity: identity,
    });
    expect(cellFor(matrix, 3).structural).toEqual({
      status: "unsupported_threat_kind",
      kind: "user_marked_open",
    });
    expect(JSON.stringify(cellFor(matrix, 2).structural))
      .not.toContain("genbutsu");
  });

  it("rejects a schema-valid semantic liar in an ignored noncandidate label", () => {
    const fixture = assemblyFixture();
    const calculated = fixture.outcomes[0]!;
    if (calculated.status !== "calculated") throw new Error("fixture mismatch");
    const classifications = calculated.result.classifications.slice(1);
    expect(() => assembleDefenseMatrix({
      deterministic: fixture.deterministic,
      threatRiskProjections: fixture.projections,
      threatRiskOutcomes: [{
        ...calculated,
        result: { ...calculated.result, classifications },
      }],
    })).toThrow("defense_matrix_invalid_ready_outcome_semantics");
  });

  it("rejects a schema-valid result with an unpinned engine identity", () => {
    const fixture = assemblyFixture();
    const calculated = fixture.outcomes[0]!;
    if (calculated.status !== "calculated") throw new Error("fixture mismatch");
    expect(() => assembleDefenseMatrix({
      deterministic: fixture.deterministic,
      threatRiskProjections: fixture.projections,
      threatRiskOutcomes: [{
        ...calculated,
        result: {
          ...calculated.result,
          identity: {
            ...calculated.result.identity,
            adapterVersion: "9.9.9",
          } as unknown as EngineIdentity,
        },
      }],
    })).toThrow("defense_matrix_invalid_ready_outcome_identity");
  });

  it("converts a missing result identity to the same fixed boundary code", () => {
    const fixture = assemblyFixture();
    const calculated = fixture.outcomes[0]!;
    if (calculated.status !== "calculated") throw new Error("fixture mismatch");
    expect(() => assembleDefenseMatrix({
      deterministic: fixture.deterministic,
      threatRiskProjections: fixture.projections,
      threatRiskOutcomes: [{
        ...calculated,
        result: {
          ...calculated.result,
          identity: undefined,
        } as unknown as typeof calculated.result,
      }],
    })).toThrow("defense_matrix_invalid_ready_outcome_identity");
  });

  it.each([
    {
      name: "duplicate projection",
      mutate: (fixture: ReturnType<typeof assemblyFixture>) => ({
        projections: [...fixture.projections, fixture.projections[0]!],
        outcomes: fixture.outcomes,
      }),
      code: "defense_matrix_duplicate_projection_actor",
    },
    {
      name: "foreign projection",
      mutate: (fixture: ReturnType<typeof assemblyFixture>) => ({
        projections: fixture.projections.map((projection, index) => index === 0
          ? { ...projection, threatActor: 0 }
          : projection) as ThreatRiskProjection[],
        outcomes: fixture.outcomes,
      }),
      code: "defense_matrix_foreign_projection_actor",
    },
    {
      name: "missing ready outcome",
      mutate: (fixture: ReturnType<typeof assemblyFixture>) => ({
        projections: fixture.projections,
        outcomes: [],
      }),
      code: "defense_matrix_missing_ready_outcome",
    },
    {
      name: "duplicate outcome",
      mutate: (fixture: ReturnType<typeof assemblyFixture>) => ({
        projections: fixture.projections,
        outcomes: [...fixture.outcomes, fixture.outcomes[0]!],
      }),
      code: "defense_matrix_duplicate_outcome_actor",
    },
    {
      name: "foreign outcome",
      mutate: (fixture: ReturnType<typeof assemblyFixture>) => ({
        projections: fixture.projections,
        outcomes: [{
          status: "blocked_engine_failure" as const,
          threatActor: 0,
          diagnostic: "unavailable",
        }],
      }),
      code: "defense_matrix_foreign_outcome_actor",
    },
  ])("rejects $name instead of guessing actor bindings", ({ mutate, code }) => {
    const fixture = assemblyFixture();
    const changed = mutate(fixture);
    expect(() => assembleDefenseMatrix({
      deterministic: fixture.deterministic,
      threatRiskProjections: changed.projections,
      threatRiskOutcomes: changed.outcomes,
    })).toThrow(code);
  });
});
