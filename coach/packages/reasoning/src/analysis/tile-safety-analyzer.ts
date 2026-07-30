import type {
  ActionId,
  FactorEvidence,
  SceneSnapshot,
  TileId,
} from "@riichi-coach/contracts";
import { riichiThreats } from "./threat-analyzer.js";

function tileFromAction(actionId: ActionId): TileId {
  return actionId.split(":")[1]!.replace(/r$/, "") as TileId;
}

function genbutsuEvidence(
  scene: SceneSnapshot,
  actor: number,
  tile: TileId,
): string[] {
  const threat = scene.threats[actor]!;
  const ownDiscards = scene.rivers[actor]!
    .filter((discard) => discard.tile.id === tile)
    .map((discard) => discard.eventId);
  const passedAfterRiichi = scene.rivers
    .flat()
    .filter(
      (discard) =>
        discard.tile.id === tile &&
        threat.declarationEventId !== null &&
        discard.afterRiichiEventIds.includes(threat.declarationEventId),
    )
    .map((discard) => discard.eventId);
  return [...new Set([...ownDiscards, ...passedAfterRiichi])];
}

export type ThreatSafety = {
  actor: number;
  classification: "genbutsu" | "unknown";
  evidenceIds: string[];
};

export function deterministicSafetyForAction(
  scene: SceneSnapshot,
  actionId: ActionId,
): ThreatSafety[] {
  const tile = tileFromAction(actionId);
  return riichiThreats(scene).map((threat) => {
    const evidenceIds = genbutsuEvidence(scene, threat.actor, tile);
    return {
      actor: threat.actor,
      classification: evidenceIds.length > 0 ? "genbutsu" : "unknown",
      evidenceIds,
    };
  });
}

export function compareDeterministicSafety(
  scene: SceneSnapshot,
  subjectAction: ActionId,
  comparisonAction: ActionId,
): FactorEvidence | null {
  const threats = riichiThreats(scene);
  if (threats.length === 0) {
    return null;
  }

  const subjectTile = tileFromAction(subjectAction);
  const comparisonTile = tileFromAction(comparisonAction);
  const decisive = threats.find((threat) => {
    const subject = genbutsuEvidence(scene, threat.actor, subjectTile);
    const comparison = genbutsuEvidence(scene, threat.actor, comparisonTile);
    return subject.length > 0 && comparison.length === 0;
  });
  if (!decisive) {
    return null;
  }

  const directEvidenceIds = genbutsuEvidence(scene, decisive.actor, subjectTile);
  return {
    factorId: `factor:${scene.decisionEventId}:defense:${subjectTile}:actor${decisive.actor}`,
    axis: "defense",
    dimension: "genbutsu",
    subjectAction,
    comparisonAction,
    direction: "supports_subject",
    magnitude: { kind: "ordinal", value: "decisive" },
    statement:
      `${subjectTile} is genbutsu against actor ${decisive.actor}; ` +
      `${comparisonTile} has no deterministic safety evidence against that actor`,
    provenance: "deterministic",
    confidence: "certain",
    evidenceIds: [decisive.declarationEventId, ...directEvidenceIds],
    limitations: [`Safety applies to actor ${decisive.actor} only`],
  };
}
