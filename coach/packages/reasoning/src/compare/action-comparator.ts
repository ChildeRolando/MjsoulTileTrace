import type {
  ActionId,
  CoverageEntry,
  FactorEvidence,
  NormalizedDecision,
  SceneSnapshot,
} from "@riichi-coach/contracts";
import {
  analyzeAllDiscardEfficiency,
  compareDiscardEfficiency,
  type DiscardEfficiencyMetric,
} from "../analysis/efficiency-analyzer.js";
import {
  deterministicSafetyForAction,
  type ThreatSafety,
} from "../analysis/tile-safety-analyzer.js";
import { coverageForDecision } from "../coverage/dimension-catalog.js";

export type UnsupportedAxisConsequence = {
  status: "unsupported";
  consequence: null;
};

export type CandidateLedger = {
  actionId: ActionId;
  axes: {
    efficiency: {
      status: "implemented" | "blocked_by_missing_data";
      consequence: {
        shanten: number;
        unadjustedUkeire: number;
      } | null;
    };
    value: UnsupportedAxisConsequence;
    defense: {
      status: "implemented";
      byThreat: ThreatSafety[];
    };
    placement: UnsupportedAxisConsequence;
    option_value: UnsupportedAxisConsequence;
  };
};

export type DecisionLedger = {
  candidateLedgers: CandidateLedger[];
  supportsModelAction: FactorEvidence[];
  supportsActualAction: FactorEvidence[];
  neutralFactors: FactorEvidence[];
  unknownOrUnmeasured: string[];
  coverage: CoverageEntry[];
  efficiencyMetrics: Record<string, DiscardEfficiencyMetric>;
};

function tileKey(actionId: ActionId): string {
  return actionId.split(":")[1]!.replace(/r$/, "");
}

function safetyByActor(items: ThreatSafety[]): Map<number, ThreatSafety> {
  return new Map(items.map((item) => [item.actor, item]));
}

function evidenceForThreat(
  scene: SceneSnapshot,
  actor: number,
  safety: ThreatSafety,
): string[] {
  const declarationEventId = scene.threats[actor]?.declarationEventId;
  return [
    ...(declarationEventId ? [declarationEventId] : []),
    ...safety.evidenceIds,
  ].filter((eventId, index, all) => all.indexOf(eventId) === index);
}

function perThreatSafetyFactors(
  scene: SceneSnapshot,
  actualAction: ActionId,
  modelAction: ActionId,
): {
  supportsModelAction: FactorEvidence[];
  supportsActualAction: FactorEvidence[];
  neutralFactors: FactorEvidence[];
} {
  const actualByActor = safetyByActor(
    deterministicSafetyForAction(scene, actualAction),
  );
  const modelByActor = safetyByActor(
    deterministicSafetyForAction(scene, modelAction),
  );
  const supportsModelAction: FactorEvidence[] = [];
  const supportsActualAction: FactorEvidence[] = [];
  const neutralFactors: FactorEvidence[] = [];

  for (const actor of new Set([
    ...actualByActor.keys(),
    ...modelByActor.keys(),
  ])) {
    const actual = actualByActor.get(actor);
    const model = modelByActor.get(actor);
    if (!actual || !model) {
      continue;
    }
    if (
      actual.classification === "unknown" &&
      model.classification === "unknown"
    ) {
      continue;
    }
    if (
      actual.classification === "genbutsu" &&
      model.classification === "genbutsu"
    ) {
      neutralFactors.push({
        factorId:
          `factor:${scene.decisionEventId}:defense:actor${actor}:both-genbutsu`,
        axis: "defense",
        dimension: "defense.per_threat_genbutsu",
        subjectAction: actualAction,
        comparisonAction: modelAction,
        direction: "neutral",
        magnitude: { kind: "ordinal", value: "equal_for_threat" },
        statement:
          `${actualAction} and ${modelAction} both have deterministic ` +
          `genbutsu evidence against actor ${actor}`,
        provenance: "deterministic",
        confidence: "certain",
        evidenceIds: [
          ...evidenceForThreat(scene, actor, actual),
          ...evidenceForThreat(scene, actor, model),
        ].filter((eventId, index, all) => all.indexOf(eventId) === index),
        limitations: [`Comparison applies to actor ${actor} only`],
      });
      continue;
    }

    const actualIsSafer = actual.classification === "genbutsu";
    const subjectAction = actualIsSafer ? actualAction : modelAction;
    const comparisonAction = actualIsSafer ? modelAction : actualAction;
    const subjectSafety = actualIsSafer ? actual : model;
    const factor: FactorEvidence = {
      factorId:
        `factor:${scene.decisionEventId}:defense:actor${actor}:` +
        `${actualIsSafer ? "actual" : "model"}-genbutsu`,
      axis: "defense",
      dimension: "defense.per_threat_genbutsu",
      subjectAction,
      comparisonAction,
      direction: "supports_subject",
      magnitude: { kind: "ordinal", value: "per_threat_advantage" },
      statement:
        `${subjectAction} has deterministic genbutsu evidence against actor ` +
        `${actor}; ${comparisonAction} has no deterministic safety evidence ` +
        `against actor ${actor}`,
      provenance: "deterministic",
      confidence: "certain",
      evidenceIds: evidenceForThreat(scene, actor, subjectSafety),
      limitations: [`Safety comparison applies to actor ${actor} only`],
    };
    if (actualIsSafer) {
      supportsActualAction.push(factor);
    } else {
      supportsModelAction.push(factor);
    }
  }

  return {
    supportsModelAction,
    supportsActualAction,
    neutralFactors,
  };
}

export function compareDecision(
  scene: SceneSnapshot,
  decision: NormalizedDecision,
): DecisionLedger {
  const allEfficiency = analyzeAllDiscardEfficiency(scene);
  const candidateLedgers: CandidateLedger[] = decision.candidates.map(
    (candidate) => {
      const metric = allEfficiency[tileKey(candidate.actionId)];
      return {
        actionId: candidate.actionId,
        axes: {
          efficiency: {
            status: metric ? "implemented" : "blocked_by_missing_data",
            consequence: metric
              ? {
                  shanten: metric.shanten,
                  unadjustedUkeire: metric.unadjustedUkeire,
                }
              : null,
          },
          value: { status: "unsupported", consequence: null },
          defense: {
            status: "implemented",
            byThreat: deterministicSafetyForAction(scene, candidate.actionId),
          },
          placement: { status: "unsupported", consequence: null },
          option_value: { status: "unsupported", consequence: null },
        },
      };
    },
  );

  const efficiency = compareDiscardEfficiency(
    scene,
    decision.actualAction,
    decision.modelAction,
  );
  const supportsModelAction: FactorEvidence[] = [];
  const supportsActualAction: FactorEvidence[] = [];
  const neutralFactors: FactorEvidence[] = [];
  const efficiencyFactor: FactorEvidence = {
    ...efficiency.factor,
    dimension: "efficiency.standard_hand_shanten",
  };
  if (efficiencyFactor.direction === "supports_subject") {
    supportsActualAction.push(efficiencyFactor);
  } else if (efficiencyFactor.direction === "supports_comparison") {
    supportsModelAction.push(efficiencyFactor);
  } else {
    neutralFactors.push(efficiencyFactor);
  }

  const defense = perThreatSafetyFactors(
    scene,
    decision.actualAction,
    decision.modelAction,
  );
  supportsModelAction.push(...defense.supportsModelAction);
  supportsActualAction.push(...defense.supportsActualAction);
  neutralFactors.push(...defense.neutralFactors);

  const coverage = coverageForDecision(scene);
  return {
    candidateLedgers,
    supportsModelAction,
    supportsActualAction,
    neutralFactors,
    unknownOrUnmeasured: coverage
      .filter(
        (entry) =>
          entry.status === "unsupported" ||
          entry.status === "blocked_by_missing_data",
      )
      .map((entry) => entry.dimension),
    coverage,
    efficiencyMetrics: efficiency.metrics,
  };
}
