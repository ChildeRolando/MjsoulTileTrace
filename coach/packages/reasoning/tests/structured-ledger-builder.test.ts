import { describe, expect, it } from "vitest";
import {
  DefenseMatrixV1Schema,
  STRUCTURAL_RISK_SCALE_VERSION,
  KnownGameFactsSchema,
  StructuredComparisonCandidateSchema,
  canonicalActionRef,
  defenseStructuralStateHash,
  type CandidateFactorLedger,
  type DefenseMatrixV1,
  type Hand13FactResult,
  type Tile,
} from "@riichi-coach/contracts";
import {
  assembleDefenseMatrix,
  buildDeterministicDefenseMatrix,
} from "../src/factors/defense-matrix.js";
import {
  buildCandidateLedger,
  type CandidateLedgerBuildInput,
} from "../src/factors/ledger-builder.js";

const tile = (id: Tile["id"]): Tile => ({ id, red: false });
const action = {
  kind: "discard" as const,
  tile: tile("6s"),
  discardMode: "tsumogiri" as const,
};
const actionRef = canonicalActionRef(action);
const candidate = StructuredComparisonCandidateSchema.parse({
  action,
  actionRef,
  origins: ["actual", "model"],
});

const facts = KnownGameFactsSchema.parse({
  factSetId: "user-asserted:e1:t6",
  provenance: "user_asserted",
  actor: 0,
  selfRiichi: false,
  decisionEventRef: "event-draw",
  decisionWindow: {
    kind: "self_turn",
    actor: 0,
    triggerEventRef: "event-draw",
  },
  concealedTiles: [],
  currentDraw: { tile: tile("6s"), eventRef: "event-draw" },
  melds: [],
  doraIndicators: [tile("4m")],
  rivers: [[], [], [{
    tile: tile("6s"),
    actor: 2,
    tsumogiri: false,
    eventId: "event-safe-6s",
    afterRiichiEventIds: [],
  }], []],
  threats: [{
    actor: 2,
    riichi: true,
    declarationEventId: "event-riichi-2",
    ippatsuAlive: true,
  }],
  defenseThreats: [{
    actor: 2,
    kind: "riichi_accepted",
    source: "user_asserted",
    sourceEventRefs: ["event-riichi-2", "event-riichi-accepted-2"],
    openMeldRefs: [],
    dealerStatus: "non_dealer",
    riichiTurn: { status: "calculated", value: 1 },
    ippatsu: { status: "calculated", value: true },
  }],
  roundWind: "E",
  seatWind: "E",
  dealer: true,
  remainingDraws: 50,
  completeness: {
    concealedTiles: true,
    melds: true,
    doraIndicators: true,
    rivers: true,
    remainingDraws: true,
    calledDiscardMarkers: true,
    roundContext: true,
  },
  evidenceIds: ["event-draw", "event-safe-6s", "event-riichi-2"],
});

function handResult(overrides: Partial<Hand13FactResult> = {}): Hand13FactResult {
  return {
    kind: "hand13_result",
    requestId: "request:hand13",
    protocolVersion: "mahjong-facts/v1",
    actionRef,
    stateHash: "sha256:projected",
    identity: {
      engine: "mahjong-helper",
      upstreamCommit: "514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0",
      adapterVersion: "0.2.0",
      protocolVersion: "mahjong-facts/v1",
    },
    shanten: 2,
    effectiveTile34: [3, 12],
    waitsRemainingStatus: "calculated",
    waitsRemaining: [{ tile34: 3, count: 3 }, { tile34: 12, count: 4 }],
    improves: [],
    doraCountStatus: "calculated",
    doraCount: 1,
    estimates: [
      {
        field: "yaku_types",
        yakuValues: [
          { id: 0, name: "立直" },
          { id: 7, name: "三色" },
        ],
        limitations: ["helper_yaku_mapping_versioned"],
      },
      {
        field: "dama_point",
        numericValue: 3900,
        limitations: ["helper_dama_point_estimate"],
      },
    ],
    diagnostics: [],
    ...overrides,
  };
}

function validClassifications(safeTiles34: readonly boolean[]) {
  return Array.from({ length: 27 }, (_, tile34) => {
    if (safeTiles34[tile34]) {
      return { tile34, kind: "genbutsu" as const };
    }
    const rank = tile34 % 9;
    const safeCount = rank <= 2
      ? Number(safeTiles34[tile34 + 3])
      : rank >= 6
      ? Number(safeTiles34[tile34 - 3])
      : Number(safeTiles34[tile34 - 3]) +
        Number(safeTiles34[tile34 + 3]);
    const kind = rank >= 3 && rank <= 5
      ? safeCount === 0 ? "no_suji" as const
      : safeCount === 1 ? "half_suji" as const : "double_suji" as const
      : safeCount === 0 ? "no_suji" as const : "suji" as const;
    return { tile34, kind };
  }).concat(safeTiles34.slice(27).flatMap((safe, index) =>
    safe ? [{ tile34: 27 + index, kind: "genbutsu" as const }] : []
  ));
}

function validLeftNoSuji(safeTiles34: readonly boolean[]): number[] {
  const values = Array<boolean>(27).fill(false);
  for (let suit = 0; suit < 3; suit++) {
    const base = suit * 9;
    for (let rank = 3; rank < 6; rank++) {
      if (!safeTiles34[base + rank]) {
        values[base + rank - 3] = true;
        values[base + rank + 3] = true;
      }
    }
  }
  return values.flatMap((value, tile34) =>
    value && !safeTiles34[tile34] ? [tile34] : []
  );
}

function defenseMatrixFor(
  selected = candidate,
  outcomeStatus: "calculated" | "blocked_engine_failure" = "calculated",
  sourceFacts = facts,
): DefenseMatrixV1 {
  const deterministic = buildDeterministicDefenseMatrix({
    candidate: selected,
    facts: sourceFacts,
  });
  if (deterministic.cells.length === 0) {
    return assembleDefenseMatrix({
      deterministic,
      threatRiskProjections: [],
      threatRiskOutcomes: [],
    });
  }
  const candidateTile34 = deterministic.candidateTile34;
  const safeTiles34 = Array<boolean>(34).fill(false);
  safeTiles34[candidateTile34] = deterministic.cells[0]!.deterministicSafety
      .status === "calculated" &&
    deterministic.cells[0]!.deterministicSafety.genbutsu;
  const visibility = {
    turns: 1,
    safeTiles34,
    leftTiles34: Array<number>(34).fill(4),
    doraTiles34: [4],
    roundWindTile34: 27,
    threatWindTile34: 29,
    earlyOutsideTiles34: [] as number[],
  };
  const evidenceIds = ["event-riichi-2", "event-safe-6s"];
  const stateHash = defenseStructuralStateHash({
    sourceStateHash: deterministic.sourceStateHash,
    factSetId: deterministic.factSetId,
    actionRef: selected.actionRef,
    threatActor: 2,
    visibility,
    evidenceIds,
  });
  const request = {
    kind: "threat_risk" as const,
    requestId: `${deterministic.factSetId}:risk:2:${stateHash}`,
    protocolVersion: "mahjong-facts/v1" as const,
    actionRef: selected.actionRef,
    stateHash,
    threatActor: 2,
    scaleVersion: STRUCTURAL_RISK_SCALE_VERSION,
    ...visibility,
    evidenceIds,
  };
  const projection = [{
    threatActor: 2,
    status: "ready" as const,
    request,
  }];
  return assembleDefenseMatrix({
    deterministic,
    threatRiskProjections: projection,
    threatRiskOutcomes: outcomeStatus === "blocked_engine_failure"
      ? [{
          status: "blocked_engine_failure",
          threatActor: 2,
          diagnostic: "risk sidecar exited",
        }]
      : [{
          status: "calculated",
          result: {
            kind: "threat_risk_result",
            requestId: request.requestId,
            protocolVersion: request.protocolVersion,
            actionRef: request.actionRef,
            stateHash: request.stateHash,
            identity: handResult().identity,
            threatActor: 2,
            scaleVersion: request.scaleVersion,
            riskScale: request.safeTiles34.map((safe) => safe ? 0 : 5),
            classifications: validClassifications(request.safeTiles34),
            honorClassifications: Array.from({ length: 7 }, (_, index) => ({
              tile34: 27 + index,
              remainingCount: 4,
              category: 27 + index >= 31 ||
                  27 + index === request.roundWindTile34 ||
                  27 + index === request.threatWindTile34
                ? "yakuhai" as const
                : "guest_wind" as const,
            })),
            leftNoSujiTile34: validLeftNoSuji(request.safeTiles34),
            evidenceIds: request.evidenceIds,
            limitations: [
              "helper_risk_not_mortal_probability",
              "threats_analyzed_independently",
              "structural_labels_separate",
            ],
            diagnostics: [],
          },
        }],
  });
}

function baseInput(): CandidateLedgerBuildInput {
  return {
    candidate,
    defenseMatrix: defenseMatrixFor(),
    scope: { kind: "applied_decision" },
    projection: {
      status: "ready",
      actionRef,
      projectedStateRef: "sha256:projected",
      hand13Request: {
        kind: "hand13",
        requestId: "request:hand13",
        protocolVersion: "mahjong-facts/v1",
        actionRef,
        stateHash: "sha256:projected",
        melds: [],
        doraTiles34: [4],
        redFiveCounts: [0, 0, 0],
        roundWindTile34: 27,
        selfWindTile34: 27,
        dealer: true,
        riichi: false,
        selfDiscards34: [23],
        handTiles34: Array(34).fill(0),
        leftTiles34: Array(34).fill(4),
        visibleCountsComplete: true,
        doraTilesComplete: true,
        selfDiscardsComplete: true,
        remainingDraws: 50,
      },
      threatRiskProjections: [],
      localEvidenceIds: [...facts.evidenceIds],
      diagnostics: [],
    },
    hand13Outcome: { status: "calculated", result: handResult() },
  };
}

function fact(ledger: CandidateFactorLedger, factorKey: string) {
  const found = ledger.axes.flatMap((axis) => axis.facts)
    .find((entry) => entry.factorKey === factorKey);
  if (found === undefined) throw new Error(`missing fact ${factorKey}`);
  return found;
}

describe("structured ledger builder", () => {
  it("keeps genbutsu deterministic and helper risk heuristic", () => {
    const ledger = buildCandidateLedger(baseInput());
    expect(fact(ledger, "defense.genbutsu.actor2")).toMatchObject({
      evidenceClass: "deterministic_local_replay",
      preferenceEligibility: "deterministic",
      value: { kind: "boolean", value: true },
    });
    expect(fact(ledger, "defense.helper_risk.actor2")).toMatchObject({
      evidenceClass: "versioned_upstream_estimate",
      preferenceEligibility: "heuristic_only",
      engineIdentity: handResult().identity,
    });
    expect(JSON.stringify(ledger)).not.toContain("helper_classifications:actor2");
    expect(fact(ledger, "efficiency.shanten").engineIdentity)
      .toEqual(handResult().identity);
    expect(fact(ledger, "defense.genbutsu.actor2").engineIdentity)
      .toBeUndefined();
  });

  it("sorts structural classifications for the ledger string-set contract", () => {
    const input = baseInput();
    const matrix = input.defenseMatrix!;
    input.defenseMatrix = DefenseMatrixV1Schema.parse({
      ...matrix,
      cells: matrix.cells.map((cell) => cell.structural.status === "calculated"
        ? {
            ...cell,
            structural: {
              ...cell.structural,
              classifications: ["wall", "no_chance"],
            },
          }
        : cell),
    });
    const ledger = buildCandidateLedger(input);
    expect(fact(ledger, "defense.helper_classifications.actor2").value)
      .toEqual({ kind: "string_set", values: ["no_chance", "wall"] });
  });

  it("maps helper value estimates but never recommendation order", () => {
    const ledger = buildCandidateLedger(baseInput());
    expect(fact(ledger, "value.dama_point").preferenceEligibility)
      .toBe("heuristic_only");
    expect(JSON.stringify(ledger)).not.toContain("recommended");
    expect(fact(ledger, "value.yaku_ids").value)
      .toEqual({ kind: "integer_ids", values: [0, 7] });
    expect(fact(ledger, "value.yaku_names").value)
      .toEqual({ kind: "string_set", values: ["三色", "立直"] });
  });

  it("maps honor remaining count and role as one typed heuristic fact", () => {
    const input = baseInput();
    const honorAction = {
      kind: "discard" as const,
      tile: tile("1z"),
      discardMode: "tedashi" as const,
    };
    const honorRef = canonicalActionRef(honorAction);
    input.candidate = StructuredComparisonCandidateSchema.parse({
      action: honorAction,
      actionRef: honorRef,
      origins: ["user"],
    });
    input.defenseMatrix = defenseMatrixFor(input.candidate);
    input.projection = {
      ...input.projection,
      actionRef: honorRef,
      hand13Request: {
        ...input.projection.hand13Request!,
        actionRef: honorRef,
      },
    };
    if (input.hand13Outcome?.status === "calculated") {
      input.hand13Outcome.result = {
        ...input.hand13Outcome.result,
        actionRef: honorRef,
      };
    }
    const ledger = buildCandidateLedger(input);
    expect(fact(ledger, "defense.helper_honor.actor2")).toMatchObject({
      dimension: "helper_honor:actor2",
      value: {
        kind: "honor_safety",
        remainingCount: 4,
        category: "yakuhai",
      },
      preferenceEligibility: "heuristic_only",
    });
  });

  it("preserves completed-hand scoring assumptions on both score outputs", () => {
    const input = baseInput();
    const resultLimitations = [
      "completed_hand_han_fu_unavailable" as const,
      "completed_hand_context_limited" as const,
    ];
    const limitations = [
      "上游公开接口不提供番数与符数",
      "未提供的包牌和场况役不会被推断",
    ];
    const { hand13Request: _hand13Request, ...projection } = input.projection;
    input.projection = {
      ...projection,
      completedHandRequest: {
        kind: "completed_hand",
        requestId: "request:completed",
        protocolVersion: "mahjong-facts/v1",
        actionRef,
        stateHash: "sha256:projected",
        melds: [],
        doraTiles34: [4],
        redFiveCounts: [0, 0, 0],
        roundWindTile34: 27,
        selfWindTile34: 27,
        dealer: true,
        riichi: false,
        selfDiscards34: [23],
        completedHandTiles34: Array(34).fill(0),
        winTile34: 23,
        tsumo: true,
      },
    };
    delete input.hand13Outcome;
    input.completedHandOutcome = {
      status: "calculated",
      result: {
        kind: "completed_hand_result",
        requestId: "request:completed",
        protocolVersion: "mahjong-facts/v1",
        actionRef,
        stateHash: "sha256:projected",
        identity: handResult().identity,
        point: 8000,
        fixedPoint: 8100,
        hanStatus: "unsupported_upstream_api",
        fuStatus: "unsupported_upstream_api",
        limitations: resultLimitations,
        diagnostics: [],
      },
    };

    const ledger = buildCandidateLedger(input);
    for (const factorKey of [
      "value.completed_hand_point",
      "value.completed_hand_fixed_point",
    ]) {
      expect(fact(ledger, factorKey)).toMatchObject({
        status: "calculated",
        evidenceClass: "deterministic_under_assumptions",
        preferenceEligibility: "deterministic",
        limitations,
        engineIdentity: handResult().identity,
      });
    }
  });

  it("blocks only remaining counts for incomplete visibility", () => {
    const input = baseInput();
    input.hand13Outcome = {
      status: "calculated",
      result: handResult({
        waitsRemainingStatus: "blocked_missing_facts",
        waitsRemaining: [],
      }),
    };
    const ledger = buildCandidateLedger(input);
    expect(fact(ledger, "efficiency.shanten").status).toBe("calculated");
    expect(fact(ledger, "efficiency.ukeire_remaining").status)
      .toBe("blocked_missing_facts");
  });

  it("skips defense for an explicit flat-discard scope", () => {
    const ledger = buildCandidateLedger({
      ...baseInput(),
      scope: { kind: "flat_discard" },
    });
    expect(ledger.axes.find((axis) => axis.axis === "defense")?.status)
      .toBe("skipped_out_of_scope");
  });

  it("produces every canonical axis exactly once", () => {
    const ledger = buildCandidateLedger(baseInput());
    expect(ledger.axes.map((axis) => axis.axis)).toEqual([
      "efficiency", "value", "defense", "placement", "option_value",
    ]);
  });

  it("records a threat-specific blocked fact when the risk engine fails", () => {
    const input = baseInput();
    input.defenseMatrix = defenseMatrixFor(
      input.candidate,
      "blocked_engine_failure",
    );

    const ledger = buildCandidateLedger(input);
    expect(fact(ledger, "defense.helper_risk.actor2")).toMatchObject({
      status: "blocked_engine_failure",
      preferenceEligibility: "heuristic_only",
      limitations: ["Threat risk engine execution failed"],
    });
  });

  it("leaves defense unsupported when the scene has no threats", () => {
    const noThreatFacts = KnownGameFactsSchema.parse({
      ...facts,
      threats: [],
      defenseThreats: [],
    });
    const input = baseInput();
    input.defenseMatrix = defenseMatrixFor(
      input.candidate,
      "calculated",
      noThreatFacts,
    );
    const ledger = buildCandidateLedger(input);
    const defense = ledger.axes.find((axis) => axis.axis === "defense")!;
    expect(defense).toEqual({
      axis: "defense",
      status: "unsupported_dimension",
      facts: [],
    });
    expect(JSON.stringify(ledger)).not.toContain("active_riichi_count");
  });
});
