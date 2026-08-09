import {
  DefenseMatrixV1Schema,
  KnownGameFactsSchema,
  StructuredComparisonCandidateSchema,
  compareCanonicalEventPositions,
  parseCanonicalEventRef,
  type DefenseMatrixCellV1,
  type DefenseMatrixV1,
  type DefenseThreatV1,
  type DeterministicSafety,
  type KnownGameFacts,
  type StructuredComparisonCandidate,
  type Tile,
} from "@riichi-coach/contracts";
import { tileIdTo34 } from "./tile34.js";

type MatrixSource = DefenseMatrixV1["source"];

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
