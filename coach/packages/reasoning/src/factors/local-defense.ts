import type {
  FactorFact,
  KnownGameFacts,
  StructuredComparisonCandidate,
  Tile,
} from "@riichi-coach/contracts";

function sameTileType(left: Tile, right: Tile): boolean {
  return left.id === right.id;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function fallbackEvidence(facts: KnownGameFacts): string[] {
  return facts.evidenceIds.length > 0
    ? [...facts.evidenceIds]
    : [facts.factSetId];
}

export function buildLocalDefenseFacts(
  candidate: StructuredComparisonCandidate,
  facts: KnownGameFacts,
): FactorFact[] {
  const evidence = fallbackEvidence(facts);
  const activeThreats = facts.threats.filter((threat) => threat.riichi);
  const result: FactorFact[] = [{
    factorKey: "defense.active_riichi_count",
    dimension: "active_riichi_count",
    status: "calculated",
    evidenceClass: "deterministic_local_replay",
    preferenceEligibility: "deterministic",
    value: { kind: "number", value: activeThreats.length, unit: "actors" },
    evidenceIds: evidence,
    limitations: [],
  }];

  for (const threat of activeThreats) {
    const threatEvidence = unique([
      ...(threat.declarationEventId === null
        ? []
        : [threat.declarationEventId]),
      ...evidence,
    ]);
    result.push({
      factorKey: `defense.threat.actor${threat.actor}`,
      dimension: `riichi_threat:actor${threat.actor}`,
      status: "calculated",
      evidenceClass: "deterministic_local_replay",
      preferenceEligibility: "deterministic",
      value: { kind: "boolean", value: true },
      evidenceIds: threatEvidence,
      limitations: [],
    });
    result.push({
      factorKey: `defense.ippatsu.actor${threat.actor}`,
      dimension: `ippatsu_alive:actor${threat.actor}`,
      status: "calculated",
      evidenceClass: "deterministic_local_replay",
      preferenceEligibility: "deterministic",
      value: { kind: "boolean", value: threat.ippatsuAlive },
      evidenceIds: threatEvidence,
      limitations: [],
    });

    if (
      candidate.action.kind !== "discard" &&
      candidate.action.kind !== "riichi_discard"
    ) {
      continue;
    }
    const candidateTile = candidate.action.tile;
    if (!facts.completeness.rivers || threat.declarationEventId === null) {
      result.push({
        factorKey: `defense.genbutsu.actor${threat.actor}`,
        dimension: `genbutsu:actor${threat.actor}`,
        status: "blocked_missing_facts",
        evidenceClass: "deterministic_local_replay",
        preferenceEligibility: "ineligible",
        evidenceIds: threatEvidence,
        limitations: ["Complete river event IDs are required for genbutsu"],
      });
      continue;
    }
    const safeDiscards = facts.rivers.flat().filter((discard) =>
      discard.actor === threat.actor ||
      discard.afterRiichiEventIds.includes(threat.declarationEventId!)
    );
    const matching = safeDiscards.filter((discard) =>
      sameTileType(discard.tile, candidateTile)
    );
    result.push({
      factorKey: `defense.genbutsu.actor${threat.actor}`,
      dimension: `genbutsu:actor${threat.actor}`,
      status: "calculated",
      evidenceClass: "deterministic_local_replay",
      preferenceEligibility: "deterministic",
      value: { kind: "boolean", value: matching.length > 0 },
      evidenceIds: unique([
        threat.declarationEventId,
        ...matching.map((discard) => discard.eventId),
      ]),
      limitations: [],
    });
  }
  return result;
}
