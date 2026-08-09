import {
  DefenseMatrixV1Schema,
  KnownGameFactsSchema,
  STRUCTURAL_DEFENSE_KINDS,
  StructuredComparisonCandidateSchema,
  compareCanonicalEventPositions,
  parseCanonicalEventRef,
  type DefenseMatrixCellV1,
  type DefenseMatrixV1,
  type DefenseThreatV1,
  type DeterministicSafety,
  type KnownGameFacts,
  type StructuredComparisonCandidate,
  type ThreatRiskFactResult,
  type ThreatRiskProjection,
  type Tile,
} from "@riichi-coach/contracts";
import { validateThreatRiskResult } from
  "../fact-engine/hand-structure-validator.js";
import { tileIdTo34 } from "./tile34.js";

type MatrixSource = DefenseMatrixV1["source"];

export type ThreatRiskEngineOutcome =
  | { status: "calculated"; result: ThreatRiskFactResult }
  | {
      status: "blocked_engine_failure";
      threatActor: number;
      diagnostic: string;
    };

function sameTileType(left: Tile, right: Tile): boolean {
  return left.id === right.id;
}

function matrixIdentity(factSetId: string): {
  source: MatrixSource;
  sourceStateHash: string;
} {
  const namespaces = [
    ["canonical-v2:", "canonical_replay"],
    ["legacy-regression:", "legacy_regression_bridge_only"],
    ["user-asserted:", "user_asserted"],
  ] as const;
  const match = namespaces.find(([prefix]) => factSetId.startsWith(prefix));
  if (match === undefined) {
    throw new Error("defense_matrix_requires_reserved_fact_set");
  }
  const [prefix, source] = match;
  const sourceStateHash = factSetId.slice(prefix.length);
  if (sourceStateHash.length === 0) {
    throw new Error("defense_matrix_requires_source_state_hash");
  }
  return { source, sourceStateHash };
}

function canonicalEvidenceOrder(left: string, right: string): number {
  const parsedLeft = parseCanonicalEventRef(left);
  const parsedRight = parseCanonicalEventRef(right);
  if (parsedLeft !== null && parsedRight !== null) {
    return compareCanonicalEventPositions(parsedLeft.position, parsedRight.position);
  }
  return left.localeCompare(right);
}

function evidenceRefs(
  eventRefs: readonly string[],
  role: "threat_own_discard" | "post_riichi_pass",
): Array<{ role: typeof role; eventRef: string }> {
  return [...new Set(eventRefs)].sort(canonicalEvidenceOrder)
    .map((eventRef) => ({ role, eventRef }));
}

function deterministicSafety(
  candidateTile: Tile,
  threat: DefenseThreatV1,
  facts: KnownGameFacts,
): DeterministicSafety {
  if (threat.kind === "user_marked_open") {
    return { status: "not_applicable" };
  }
  if (!facts.completeness.rivers) {
    return { status: "blocked_missing_facts", evidenceRefs: [] };
  }

  const ownMatches = facts.rivers[threat.actor]!.filter((discard) =>
    sameTileType(discard.tile, candidateTile)
  );
  if (ownMatches.length > 0) {
    return {
      status: "calculated",
      genbutsu: true,
      evidenceRefs: evidenceRefs(
        ownMatches.map((discard) => discard.eventId),
        "threat_own_discard",
      ),
    };
  }

  const declarationRef = threat.sourceEventRefs[0]!;
  const passedMatches = facts.rivers.flat().filter((discard) =>
    discard.actor !== threat.actor &&
    sameTileType(discard.tile, candidateTile) &&
    discard.afterRiichiEventIds.includes(declarationRef)
  );
  if (passedMatches.length > 0 && !facts.completeness.responseOpportunities) {
    return { status: "blocked_missing_facts", evidenceRefs: [] };
  }
  if (passedMatches.length > 0) {
    return {
      status: "calculated",
      genbutsu: true,
      evidenceRefs: evidenceRefs(
        passedMatches.map((discard) => discard.eventId),
        "post_riichi_pass",
      ),
    };
  }
  return { status: "calculated", genbutsu: false, evidenceRefs: [] };
}

function baseCell(
  actionRef: StructuredComparisonCandidate["actionRef"],
  candidateTile: Tile,
  threat: DefenseThreatV1,
  facts: KnownGameFacts,
): DefenseMatrixCellV1 {
  return {
    actionRef,
    threat,
    deterministicSafety: deterministicSafety(candidateTile, threat, facts),
    structural: threat.kind === "user_marked_open"
      ? { status: "unsupported_threat_kind", kind: "user_marked_open" }
      : {
          status: "blocked_missing_facts",
          missing: ["visibility"],
        },
  };
}

function requireCanonicalReplayBindings(
  source: MatrixSource,
  decisionEventRef: string,
  cells: readonly DefenseMatrixCellV1[],
): void {
  if (source === "user_asserted") return;
  const refs = [
    decisionEventRef,
    ...cells.flatMap((cell) => [
      ...(cell.threat.source === "user_asserted"
        ? []
        : cell.threat.sourceEventRefs),
      ...(cell.deterministicSafety.status === "calculated"
        ? cell.deterministicSafety.evidenceRefs.map((ref) => ref.eventRef)
        : []),
      ...(cell.structural.status === "calculated"
        ? cell.structural.evidenceIds
        : []),
    ]),
  ];
  if (refs.some((ref) => parseCanonicalEventRef(ref) === null)) {
    throw new Error("defense_matrix_requires_canonical_replay_evidence");
  }
}

export function buildDeterministicDefenseMatrix(input: {
  candidate: StructuredComparisonCandidate;
  facts: KnownGameFacts;
}): DefenseMatrixV1 {
  const candidateResult = StructuredComparisonCandidateSchema.safeParse(
    input.candidate,
  );
  if (!candidateResult.success) {
    throw new Error("defense_matrix_invalid_candidate");
  }
  const factsResult = KnownGameFactsSchema.safeParse(input.facts);
  if (!factsResult.success) {
    throw new Error("defense_matrix_invalid_known_facts");
  }
  const candidate = candidateResult.data;
  const facts = factsResult.data;
  const action = candidate.action;
  if (
    action.kind !== "discard" &&
    action.kind !== "riichi_discard"
  ) {
    throw new Error("defense_matrix_requires_discard_candidate");
  }
  const identity = matrixIdentity(facts.factSetId);
  const cells = [...facts.defenseThreats]
    .sort((left, right) => left.actor - right.actor)
    .map((threat) => baseCell(
      candidate.actionRef,
      action.tile,
      threat,
      facts,
    ));
  requireCanonicalReplayBindings(
    identity.source,
    facts.decisionEventRef,
    cells,
  );
  const matrix = DefenseMatrixV1Schema.safeParse({
    schemaVersion: "defense-matrix/v1",
    ...identity,
    factSetId: facts.factSetId,
    decisionEventRef: facts.decisionEventRef,
    actionRef: candidate.actionRef,
    candidateTile34: tileIdTo34(action.tile.id),
    cells,
  });
  if (!matrix.success) {
    throw new Error("defense_matrix_invalid_output");
  }
  return matrix.data;
}

function outcomeActor(outcome: ThreatRiskEngineOutcome): number {
  return outcome.status === "calculated"
    ? outcome.result.threatActor
    : outcome.threatActor;
}

function requireUniqueActors(
  actors: readonly number[],
  duplicateCode: string,
): void {
  if (new Set(actors).size !== actors.length) throw new Error(duplicateCode);
}

function requireBoundResult(
  projection: Extract<ThreatRiskProjection, { status: "ready" }>,
  result: ThreatRiskFactResult,
): void {
  const request = projection.request;
  if (
    result.requestId !== request.requestId ||
    result.actionRef !== request.actionRef ||
    result.stateHash !== request.stateHash ||
    result.threatActor !== request.threatActor ||
    result.scaleVersion !== request.scaleVersion ||
    result.evidenceIds.length !== request.evidenceIds.length ||
    result.evidenceIds.some((id, index) => id !== request.evidenceIds[index])
  ) throw new Error("defense_matrix_unbound_ready_outcome");
}

function requirePinnedRiskIdentity(result: ThreatRiskFactResult): void {
  const identity = (result as { identity?: ThreatRiskFactResult["identity"] })
    .identity;
  if (
    identity === undefined ||
    identity.engine !== "mahjong-helper" ||
    identity.upstreamCommit !==
      "514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0" ||
    identity.adapterVersion !== "0.2.0" ||
    identity.protocolVersion !== "mahjong-facts/v1"
  ) throw new Error("defense_matrix_invalid_ready_outcome_identity");
}

const structuralMissingFacts = [
  "visibility",
  "turns",
  "safe_tiles",
  "left_tiles",
  "dora_tiles",
  "round_wind",
  "threat_wind",
  "early_outside",
] as const;

function requireStructuralMissingFacts(
  values: readonly string[],
): Array<typeof structuralMissingFacts[number]> {
  const indexes = values.map((value) =>
    structuralMissingFacts.indexOf(
      value as typeof structuralMissingFacts[number],
    )
  );
  if (
    values.length === 0 ||
    indexes.some((index) => index < 0) ||
    indexes.some((index, position) =>
      position > 0 && index <= indexes[position - 1]!
    )
  ) throw new Error("defense_matrix_invalid_missing_facts_projection");
  return values as Array<typeof structuralMissingFacts[number]>;
}

function calculatedStructural(
  matrix: DefenseMatrixV1,
  projection: Extract<ThreatRiskProjection, { status: "ready" }>,
  result: ThreatRiskFactResult,
): DefenseMatrixCellV1["structural"] {
  requireBoundResult(projection, result);
  const tile34 = matrix.candidateTile34;
  const classifications = STRUCTURAL_DEFENSE_KINDS.filter((kind) =>
    result.classifications.some((entry) =>
      entry.tile34 === tile34 && entry.kind === kind
    )
  );
  const honorResult = tile34 >= 27
    ? result.honorClassifications.find((entry) => entry.tile34 === tile34)
    : undefined;
  const honor = honorResult === undefined
    ? null
    : {
        remainingCount: honorResult.remainingCount,
        category: honorResult.category,
      };
  return {
    status: "calculated",
    factSetId: matrix.factSetId,
    actionRef: matrix.actionRef,
    threatActor: projection.threatActor,
    requestId: projection.request.requestId,
    stateHash: projection.request.stateHash,
    engineIdentity: result.identity,
    scaleVersion: projection.request.scaleVersion,
    helperRiskScale: result.riskScale[tile34]!,
    classifications,
    honor,
    visibility: {
      turns: projection.request.turns,
      safeTiles34: [...projection.request.safeTiles34],
      leftTiles34: [...projection.request.leftTiles34],
      doraTiles34: [...projection.request.doraTiles34],
      roundWindTile34: projection.request.roundWindTile34,
      threatWindTile34: projection.request.threatWindTile34,
      earlyOutsideTiles34: [...projection.request.earlyOutsideTiles34],
    },
    evidenceIds: [...projection.request.evidenceIds],
    limitations: ["helper_risk_not_mortal_probability"],
  };
}

export function assembleDefenseMatrix(input: {
  deterministic: DefenseMatrixV1;
  threatRiskProjections: ThreatRiskProjection[];
  threatRiskOutcomes: ThreatRiskEngineOutcome[];
}): DefenseMatrixV1 {
  const deterministicResult = DefenseMatrixV1Schema.safeParse(input.deterministic);
  if (!deterministicResult.success) {
    throw new Error("defense_matrix_invalid_deterministic_input");
  }
  const deterministic = deterministicResult.data;
  const actors = new Set(deterministic.cells.map((cell) => cell.threat.actor));
  const projectionActors = input.threatRiskProjections.map((entry) => entry.threatActor);
  requireUniqueActors(
    projectionActors,
    "defense_matrix_duplicate_projection_actor",
  );
  if (projectionActors.some((actor) => !actors.has(actor))) {
    throw new Error("defense_matrix_foreign_projection_actor");
  }
  if (deterministic.cells.some((cell) => !projectionActors.includes(cell.threat.actor))) {
    throw new Error("defense_matrix_missing_projection_actor");
  }

  const outcomeActors = input.threatRiskOutcomes.map(outcomeActor);
  requireUniqueActors(outcomeActors, "defense_matrix_duplicate_outcome_actor");
  if (outcomeActors.some((actor) => !actors.has(actor))) {
    throw new Error("defense_matrix_foreign_outcome_actor");
  }
  const projections = new Map(
    input.threatRiskProjections.map((entry) => [entry.threatActor, entry]),
  );
  const outcomes = new Map(
    input.threatRiskOutcomes.map((entry) => [outcomeActor(entry), entry]),
  );
  for (const projection of input.threatRiskProjections) {
    const hasOutcome = outcomes.has(projection.threatActor);
    if (projection.status === "ready" && !hasOutcome) {
      throw new Error("defense_matrix_missing_ready_outcome");
    }
    if (projection.status !== "ready" && hasOutcome) {
      throw new Error("defense_matrix_unexpected_outcome");
    }
  }

  const cells = deterministic.cells.map((cell): DefenseMatrixCellV1 => {
    const projection = projections.get(cell.threat.actor)!;
    if (projection.status === "blocked_missing_facts") {
      return {
        ...cell,
        structural: {
          status: "blocked_missing_facts",
          missing: requireStructuralMissingFacts(projection.missing),
        },
      };
    }
    if (projection.status === "unsupported_threat_kind") {
      return {
        ...cell,
        structural: {
          status: "unsupported_threat_kind",
          kind: projection.kind,
        },
      };
    }
    const outcome = outcomes.get(cell.threat.actor)!;
    if (outcome.status === "blocked_engine_failure") {
      return {
        ...cell,
        structural: {
          status: "blocked_engine_failure",
          failureCode: "engine_execution_failed",
        },
      };
    }
    requirePinnedRiskIdentity(outcome.result);
    requireBoundResult(projection, outcome.result);
    let validated: ThreatRiskFactResult;
    try {
      validated = validateThreatRiskResult(projection.request, outcome.result);
    } catch {
      throw new Error("defense_matrix_invalid_ready_outcome_semantics");
    }
    return {
      ...cell,
      structural: calculatedStructural(deterministic, projection, validated),
    };
  });
  const matrix = DefenseMatrixV1Schema.safeParse({ ...deterministic, cells });
  if (!matrix.success) throw new Error("defense_matrix_invalid_assembled_output");
  return matrix.data;
}
