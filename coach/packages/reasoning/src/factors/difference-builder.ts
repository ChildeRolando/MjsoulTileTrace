import {
  FactorDifferenceSchema,
  type ActionRef,
  type Axis,
  type AxisRunStatus,
  type CandidateFactorLedger,
  type EngineIdentity,
  type FactorDifference,
  type FactorFact,
  type FactorValue,
} from "@riichi-coach/contracts";

export interface DifferenceCoverageEntry {
  actionRef: ActionRef;
  axis: Axis;
  status: AxisRunStatus;
}

export interface FactorDifferenceBuildResult {
  candidateRefs: ActionRef[];
  deterministic: FactorDifference[];
  heuristic: FactorDifference[];
  coverage: DifferenceCoverageEntry[];
}

const deterministicDirection = {
  shanten: "lower",
  ukeire_remaining: "higher",
  dora_count: "higher",
  completed_hand_point: "higher",
} as const;

type NumericPreference = "lower" | "higher" | "true";

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sameEngine(
  left: EngineIdentity | undefined,
  right: EngineIdentity | undefined,
): boolean {
  return stableJson(left) === stableJson(right);
}

function sameLimitations(left: FactorFact, right: FactorFact): boolean {
  return stableJson([...left.limitations].sort()) ===
    stableJson([...right.limitations].sort());
}

function valuesComparable(left: FactorValue, right: FactorValue): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "number" && right.kind === "number") {
    return left.unit === right.unit;
  }
  return true;
}

function factsComparable(left: FactorFact, right: FactorFact): boolean {
  return left.status === "calculated" &&
    right.status === "calculated" &&
    left.value !== undefined &&
    right.value !== undefined &&
    left.evidenceClass === right.evidenceClass &&
    left.preferenceEligibility === right.preferenceEligibility &&
    sameEngine(left.engineIdentity, right.engineIdentity) &&
    sameLimitations(left, right) &&
    valuesComparable(left.value, right.value);
}

function tileCountTotal(value: Extract<FactorValue, { kind: "tile_counts" }>): number {
  return value.value.reduce((total, entry) => total + entry.count, 0);
}

function compareNumbers(
  left: number,
  right: number,
  preference: NumericPreference,
): "supports_left" | "supports_right" | "neutral" {
  if (left === right) return "neutral";
  if (preference === "lower") {
    return left < right ? "supports_left" : "supports_right";
  }
  if (preference === "higher") {
    return left > right ? "supports_left" : "supports_right";
  }
  return left > right ? "supports_left" : "supports_right";
}

function deterministicPreference(dimension: string): NumericPreference | undefined {
  if (dimension.startsWith("genbutsu:actor")) return "true";
  return deterministicDirection[dimension as keyof typeof deterministicDirection];
}

function deterministicValueDirection(
  left: FactorValue,
  right: FactorValue,
  preference: NumericPreference,
): "supports_left" | "supports_right" | "neutral" | undefined {
  if (left.kind === "number" && right.kind === "number") {
    return compareNumbers(left.value, right.value, preference);
  }
  if (left.kind === "boolean" && right.kind === "boolean" && preference === "true") {
    return compareNumbers(Number(left.value), Number(right.value), preference);
  }
  if (
    left.kind === "tile_counts" &&
    right.kind === "tile_counts" &&
    preference === "higher"
  ) {
    return compareNumbers(tileCountTotal(left), tileCountTotal(right), preference);
  }
  return undefined;
}

function heuristicValueDirection(
  dimension: string,
  left: FactorValue,
  right: FactorValue,
): "supports_left" | "supports_right" | "neutral" | undefined {
  if (left.kind !== "number" || right.kind !== "number") {
    return stableJson(left) === stableJson(right) ? "neutral" : undefined;
  }
  const lowerIsBetter = dimension.startsWith("helper_risk_scale:") ||
    dimension === "furiten_rate";
  return compareNumbers(
    left.value,
    right.value,
    lowerIsBetter ? "lower" : "higher",
  );
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function factMap(ledger: CandidateFactorLedger): Map<string, { axis: Axis; fact: FactorFact }> {
  const result = new Map<string, { axis: Axis; fact: FactorFact }>();
  for (const axis of ledger.axes) {
    for (const fact of axis.facts) {
      result.set(`${axis.axis}\u0000${fact.dimension}`, { axis: axis.axis, fact });
    }
  }
  return result;
}

function equalShanten(
  leftFacts: Map<string, { axis: Axis; fact: FactorFact }>,
  rightFacts: Map<string, { axis: Axis; fact: FactorFact }>,
): boolean {
  const left = leftFacts.get("efficiency\u0000shanten")?.fact;
  const right = rightFacts.get("efficiency\u0000shanten")?.fact;
  return left !== undefined && right !== undefined &&
    factsComparable(left, right) &&
    left.value?.kind === "number" && right.value?.kind === "number" &&
    left.value.value === right.value.value;
}

function buildDifference(
  axis: Axis,
  leftLedger: CandidateFactorLedger,
  rightLedger: CandidateFactorLedger,
  left: FactorFact,
  right: FactorFact,
  kind: "deterministic_difference" | "heuristic_difference",
  direction: "supports_left" | "supports_right" | "neutral",
): FactorDifference {
  const base = {
    differenceId: `difference:v1:${axis}:${left.dimension}:${leftLedger.actionRef}:${rightLedger.actionRef}`,
    kind,
    axis,
    dimension: left.dimension,
    leftActionRef: leftLedger.actionRef,
    rightActionRef: rightLedger.actionRef,
    direction,
    leftValue: left.value,
    rightValue: right.value,
    evidenceClass: left.evidenceClass,
    evidenceIds: unique([...left.evidenceIds, ...right.evidenceIds]),
    limitations: unique([...left.limitations, ...right.limitations]),
    ...(left.engineIdentity === undefined
      ? {}
      : { engineIdentity: left.engineIdentity }),
  };
  return FactorDifferenceSchema.parse(base);
}

export function buildFactorDifferences(
  rawLedgers: readonly CandidateFactorLedger[],
): FactorDifferenceBuildResult {
  const ledgers = [...rawLedgers].sort((left, right) =>
    left.actionRef.localeCompare(right.actionRef)
  );
  const deterministic: FactorDifference[] = [];
  const heuristic: FactorDifference[] = [];

  for (let leftIndex = 0; leftIndex < ledgers.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < ledgers.length; rightIndex += 1) {
      const leftLedger = ledgers[leftIndex]!;
      const rightLedger = ledgers[rightIndex]!;
      const leftFacts = factMap(leftLedger);
      const rightFacts = factMap(rightLedger);
      for (const [key, leftEntry] of [...leftFacts.entries()].sort(([left], [right]) =>
        left.localeCompare(right)
      )) {
        const rightEntry = rightFacts.get(key);
        if (rightEntry === undefined) continue;
        const left = leftEntry.fact;
        const right = rightEntry.fact;
        if (!factsComparable(left, right) || left.value === undefined || right.value === undefined) {
          continue;
        }

        if (left.preferenceEligibility === "deterministic") {
          const preference = deterministicPreference(left.dimension);
          if (preference === undefined) continue;
          if (left.dimension === "ukeire_remaining" && !equalShanten(leftFacts, rightFacts)) {
            continue;
          }
          const direction = deterministicValueDirection(left.value, right.value, preference);
          if (direction === undefined) continue;
          deterministic.push(buildDifference(
            leftEntry.axis,
            leftLedger,
            rightLedger,
            left,
            right,
            "deterministic_difference",
            direction,
          ));
          continue;
        }

        if (left.preferenceEligibility === "heuristic_only") {
          const direction = heuristicValueDirection(left.dimension, left.value, right.value);
          if (direction === undefined) continue;
          heuristic.push(buildDifference(
            leftEntry.axis,
            leftLedger,
            rightLedger,
            left,
            right,
            "heuristic_difference",
            direction,
          ));
        }
      }
    }
  }

  return {
    candidateRefs: ledgers.map((ledger) => ledger.actionRef),
    deterministic,
    heuristic,
    coverage: ledgers.flatMap((ledger) => ledger.axes.map((axis) => ({
      actionRef: ledger.actionRef,
      axis: axis.axis,
      status: axis.status,
    }))),
  };
}
