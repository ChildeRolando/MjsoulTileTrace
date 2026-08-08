import {
  DeterministicPreferenceSchema,
  type ActionRef,
  type Axis,
  type ComparisonAnalysisFrame,
  type DeterministicPreference,
  type FactorDifference,
} from "@riichi-coach/contracts";
import type { FactorDifferenceBuildResult } from "./difference-builder.js";

function relevantAxes(frame: ComparisonAnalysisFrame): Axis[] {
  if (frame.scope.kind === "single_axis") return [frame.scope.axis];
  if (frame.scope.kind === "flat_discard") return ["efficiency", "value"];
  return ["efficiency", "value", "defense", "placement", "option_value"];
}

function scopeName(
  frame: ComparisonAnalysisFrame,
): DeterministicPreference["scope"] {
  if (frame.scope.kind !== "single_axis") return frame.scope.kind;
  return `${frame.scope.axis}_only` as DeterministicPreference["scope"];
}

function relevantDifferences(
  frame: ComparisonAnalysisFrame,
  result: FactorDifferenceBuildResult,
): FactorDifference[] {
  const axes = new Set(relevantAxes(frame));
  return result.deterministic.filter((difference) =>
    axes.has(difference.axis) &&
    (frame.scope.kind !== "single_axis" ||
      frame.scope.dimension === undefined ||
      difference.dimension === frame.scope.dimension)
  );
}

function relationFor(
  action: ActionRef,
  other: ActionRef,
  differences: readonly FactorDifference[],
): { better: boolean; worse: boolean; ids: string[]; compared: boolean } {
  let better = false;
  let worse = false;
  const ids: string[] = [];
  let compared = false;
  for (const difference of differences) {
    const isPair =
      (difference.leftActionRef === action && difference.rightActionRef === other) ||
      (difference.leftActionRef === other && difference.rightActionRef === action);
    if (!isPair) continue;
    compared = true;
    const supportsAction =
      (difference.leftActionRef === action && difference.direction === "supports_left") ||
      (difference.rightActionRef === action && difference.direction === "supports_right");
    const supportsOther =
      (difference.leftActionRef === other && difference.direction === "supports_left") ||
      (difference.rightActionRef === other && difference.direction === "supports_right");
    if (supportsAction) {
      better = true;
      ids.push(difference.differenceId);
    }
    if (supportsOther) worse = true;
  }
  return { better, worse, ids, compared };
}

function dominates(
  action: ActionRef,
  other: ActionRef,
  differences: readonly FactorDifference[],
): boolean {
  const relation = relationFor(action, other, differences);
  return relation.compared && relation.better && !relation.worse;
}

function tied(
  action: ActionRef,
  other: ActionRef,
  differences: readonly FactorDifference[],
): boolean {
  const relation = relationFor(action, other, differences);
  return relation.compared && !relation.better && !relation.worse;
}

function hasCompleteScopedCoverage(
  frame: ComparisonAnalysisFrame,
  result: FactorDifferenceBuildResult,
): boolean {
  const axes = relevantAxes(frame);
  for (const axis of axes) {
    let expectedDimensions: string | null = null;
    for (const actionRef of result.candidateRefs) {
      const entries = result.deterministicCoverage.filter((entry) =>
        entry.actionRef === actionRef &&
        entry.axis === axis &&
        (frame.scope.kind !== "single_axis" ||
          frame.scope.dimension === undefined ||
          entry.dimension === frame.scope.dimension)
      );
      if (entries.length === 0 || entries.some((entry) =>
        entry.status !== "calculated" ||
        entry.preferenceEligibility !== "deterministic"
      )) return false;
      const dimensions = entries
        .map((entry) => `${entry.dimension}:${entry.comparisonSignature}`)
        .sort()
        .join("|");
      if (expectedDimensions === null) expectedDimensions = dimensions;
      else if (dimensions !== expectedDimensions) return false;
    }
  }
  return true;
}

export function resolveDeterministicPreference(
  frame: ComparisonAnalysisFrame,
  result: FactorDifferenceBuildResult,
): DeterministicPreference | null {
  if (result.candidateRefs.length < 2) return null;
  if (!hasCompleteScopedCoverage(frame, result)) return null;
  const differences = relevantDifferences(frame, result);
  if (differences.length === 0) return null;

  const maximal = result.candidateRefs.filter((candidate) =>
    !result.candidateRefs.some((other) =>
      other !== candidate && dominates(other, candidate, differences)
    )
  );
  if (maximal.length === 0) return null;
  for (let left = 0; left < maximal.length; left += 1) {
    for (let right = left + 1; right < maximal.length; right += 1) {
      if (!tied(maximal[left]!, maximal[right]!, differences)) return null;
    }
  }

  const outsiders = result.candidateRefs.filter((candidate) =>
    !maximal.includes(candidate)
  );
  if (outsiders.length === 0) return null;
  if (!outsiders.every((outside) =>
    maximal.some((winner) => dominates(winner, outside, differences))
  )) return null;

  const decisiveDifferenceIds = [...new Set(maximal.flatMap((winner) =>
    outsiders.flatMap((outside) => relationFor(winner, outside, differences).ids)
  ))];
  if (decisiveDifferenceIds.length === 0) return null;

  return DeterministicPreferenceSchema.parse({
    actionRefs: maximal,
    scope: scopeName(frame),
    decisiveDifferenceIds,
    coverage: "complete",
  });
}
