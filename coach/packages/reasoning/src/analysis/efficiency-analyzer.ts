import type {
  ActionId,
  FactorEvidence,
  SceneSnapshot,
  TileId,
} from "@riichi-coach/contracts";
import {
  analyzeDiscards,
  parseCompactHand,
} from "../../../../../lib/mahjong.mjs";

type LegacyDiscard = {
  discard: TileId;
  shanten: number;
  ukeire: number;
  effective: Array<{ id: TileId; remaining: number }>;
};

export type DiscardEfficiencyMetric = {
  discard: TileId;
  shanten: number;
  unadjustedUkeire: number;
  effective: Array<{ id: TileId; remaining: number }>;
};

function compact(ids: TileId[]): string {
  const groups = { m: "", p: "", s: "", z: "" };
  for (const id of ids) {
    groups[id[1] as keyof typeof groups] += id[0];
  }
  return (["m", "p", "s", "z"] as const)
    .filter((suit) => groups[suit].length > 0)
    .map((suit) => `${groups[suit]}${suit}`)
    .join("");
}

function tileFromAction(actionId: ActionId): TileId {
  return actionId.split(":")[1]!.replace(/r$/, "") as TileId;
}

export function analyzeAllDiscardEfficiency(
  scene: SceneSnapshot,
): Record<string, DiscardEfficiencyMetric> {
  const counts = parseCompactHand(compact(scene.selfHand.map((tile) => tile.id)));
  const rows = analyzeDiscards(counts) as LegacyDiscard[];
  return Object.fromEntries(
    rows.map((row) => [
      row.discard,
      {
        discard: row.discard,
        shanten: row.shanten,
        unadjustedUkeire: row.ukeire,
        effective: row.effective,
      },
    ]),
  );
}

export function compareDiscardEfficiency(
  scene: SceneSnapshot,
  subjectAction: ActionId,
  comparisonAction: ActionId,
): {
  metrics: Record<string, DiscardEfficiencyMetric>;
  factor: FactorEvidence;
} {
  const byTile = analyzeAllDiscardEfficiency(scene);
  const subject = byTile[tileFromAction(subjectAction)];
  const comparison = byTile[tileFromAction(comparisonAction)];
  if (!subject || !comparison) {
    throw new Error("Discard action is absent from the visible hand");
  }

  const subjectBetter = subject.shanten < comparison.shanten;
  const comparisonBetter = comparison.shanten < subject.shanten;
  return {
    metrics: {
      [subjectAction]: subject,
      [comparisonAction]: comparison,
    },
    factor: {
      factorId: `factor:${scene.decisionEventId}:efficiency:${subjectAction}:${comparisonAction}`,
      axis: "efficiency",
      dimension: "standard_hand_shanten",
      subjectAction,
      comparisonAction,
      direction: subjectBetter
        ? "supports_subject"
        : comparisonBetter
          ? "supports_comparison"
          : "neutral",
      magnitude: {
        kind: "count",
        value: Math.abs(subject.shanten - comparison.shanten),
      },
      statement: subjectBetter
        ? `${subjectAction} leaves lower standard-hand shanten than ${comparisonAction}`
        : comparisonBetter
          ? `${comparisonAction} leaves lower standard-hand shanten than ${subjectAction}`
          : `${subjectAction} and ${comparisonAction} have equal standard-hand shanten; live ukeire is not compared`,
      provenance: "deterministic",
      confidence: "certain",
      evidenceIds: [scene.decisionEventId],
      limitations: [
        "Standard-hand shanten only; chiitoitsu and kokushi are excluded",
        "Unadjusted ukeire does not subtract public visible tiles and cannot rank equal-shanten actions",
      ],
    },
  };
}
