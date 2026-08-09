import {
  FactorDifferenceSchema,
  type ActionRef,
  type Axis,
  type AxisRunStatus,
  type CandidateFactorLedger,
  type EngineIdentity,
  type FactorDifference,
  type FactorFact,
  type FactorStatus,
  type FactorValue,
  type PreferenceEligibility,
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
  deterministicCoverage: DeterministicCoverageEntry[];
}

export interface DeterministicCoverageEntry {
  actionRef: ActionRef;
  axis: Axis;
  dimension: string;
  status: FactorStatus;
  preferenceEligibility: PreferenceEligibility;
  comparisonSignature: string;
}

type NumericPreference = "lower" | "higher" | "true";

interface DeterministicDirectionSpec {
  preference: NumericPreference;
  valueKind: FactorValue["kind"];
  unit?: string;
  evidenceClass?: FactorFact["evidenceClass"];
}

const GENBUTSU_DIMENSION = /^genbutsu:actor[0-3]$/u;
const HELPER_RISK_DIMENSION = /^helper_risk_scale:actor[0-3]$/u;

const deterministicDirectionRegistry = new Map<string, DeterministicDirectionSpec>([
  ["efficiency\u0000shanten", {
    preference: "lower", valueKind: "number", unit: "shanten",
  }],
  ["efficiency\u0000ukeire_remaining", {
    preference: "higher", valueKind: "tile_counts",
  }],
  ["efficiency\u0000overall_shanten", {
    preference: "lower", valueKind: "number", unit: "shanten",
  }],
  ["efficiency\u0000overall_effective_tiles_remaining", {
    preference: "higher", valueKind: "tile_counts",
  }],
  ["value\u0000dora_count", {
    preference: "higher", valueKind: "number", unit: "dora_count",
  }],
  ["value\u0000completed_hand_point", {
    preference: "higher", valueKind: "number", unit: "points",
  }],
]);

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

function deterministicComparisonSignature(fact: FactorFact): string {
  const valueShape = fact.value === undefined
    ? null
    : fact.value.kind === "number"
    ? { kind: fact.value.kind, unit: fact.value.unit }
    : { kind: fact.value.kind };
  return stableJson({
    evidenceClass: fact.evidenceClass,
    engineIdentity: fact.engineIdentity,
    limitations: [...fact.limitations].sort(),
    valueShape,
  });
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

function deterministicSpec(
  axis: Axis,
  dimension: string,
): DeterministicDirectionSpec | undefined {
  if (axis === "defense" && GENBUTSU_DIMENSION.test(dimension)) {
    return {
      preference: "true",
      valueKind: "boolean",
      evidenceClass: "deterministic_local_replay",
    };
  }
  return deterministicDirectionRegistry.get(`${axis}\u0000${dimension}`);
}

function valueMatchesSpec(
  value: FactorValue | undefined,
  spec: DeterministicDirectionSpec,
): value is FactorValue {
  if (value === undefined || value.kind !== spec.valueKind) return false;
  if (value.kind === "number") return value.unit === spec.unit;
  return spec.unit === undefined;
}

function factMatchesSpec(
  fact: FactorFact,
  spec: DeterministicDirectionSpec,
): boolean {
  return valueMatchesSpec(fact.value, spec) &&
    (spec.evidenceClass === undefined || fact.evidenceClass === spec.evidenceClass);
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
  axis: Axis,
  dimension: string,
  left: FactorValue,
  right: FactorValue,
): "supports_left" | "supports_right" | "neutral" | undefined {
  if (left.kind !== "number" || right.kind !== "number") {
    return stableJson(left) === stableJson(right) ? "neutral" : undefined;
  }
  if (
    (axis === "defense" && !HELPER_RISK_DIMENSION.test(dimension)) ||
    (axis !== "defense" && HELPER_RISK_DIMENSION.test(dimension))
  ) {
    return stableJson(left) === stableJson(right) ? "neutral" : undefined;
  }
  if (
    axis === "defense" &&
    HELPER_RISK_DIMENSION.test(dimension) &&
    (left.unit !== "helper_risk_scale" || right.unit !== "helper_risk_scale")
  ) return stableJson(left) === stableJson(right) ? "neutral" : undefined;
  const lowerIsBetter = (axis === "defense" &&
      HELPER_RISK_DIMENSION.test(dimension)) ||
    dimension === "furiten_rate";
  return compareNumbers(
    left.value,
    right.value,
    lowerIsBetter ? "lower" : "higher",
  );
}

export function isRegisteredDeterministicDifference(
  difference: FactorDifference,
): boolean {
  if (
    difference.kind !== "deterministic_difference" ||
    difference.preferenceEligibility !== "deterministic"
  ) return false;
  const spec = deterministicSpec(difference.axis, difference.dimension);
  if (
    spec === undefined ||
    (spec.evidenceClass !== undefined &&
      difference.evidenceClass !== spec.evidenceClass) ||
    !valueMatchesSpec(difference.leftValue, spec) ||
    !valueMatchesSpec(difference.rightValue, spec)
  ) return false;
  return deterministicValueDirection(
    difference.leftValue,
    difference.rightValue,
    spec.preference,
  ) === difference.direction;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function factMap(ledger: CandidateFactorLedger): Map<string, { axis: Axis; fact: FactorFact }> {
  const result = new Map<string, { axis: Axis; fact: FactorFact }>();
  for (const axis of ledger.axes) {
    for (const fact of axis.facts) {
      const key = `${axis.axis}\u0000${fact.dimension}`;
      if (result.has(key)) {
        throw new Error(
          `Duplicate factor dimension within axis: ${axis.axis}/${fact.dimension}`,
        );
      }
      result.set(key, { axis: axis.axis, fact });
    }
  }
  return result;
}

function equalRegisteredNumber(
  leftFacts: Map<string, { axis: Axis; fact: FactorFact }>,
  rightFacts: Map<string, { axis: Axis; fact: FactorFact }>,
  dimension: "shanten" | "overall_shanten",
): boolean {
  const left = leftFacts.get(`efficiency\u0000${dimension}`)?.fact;
  const right = rightFacts.get(`efficiency\u0000${dimension}`)?.fact;
  const spec = deterministicSpec("efficiency", dimension);
  return left !== undefined && right !== undefined &&
    spec !== undefined &&
    factsComparable(left, right) &&
    left.preferenceEligibility === "deterministic" &&
    right.preferenceEligibility === "deterministic" &&
    valueMatchesSpec(left.value, spec) &&
    valueMatchesSpec(right.value, spec) &&
    left.value?.kind === "number" && right.value?.kind === "number" &&
    left.value.value === right.value.value;
}

function registeredComparisonAllowed(
  axis: Axis,
  dimension: string,
  leftFacts: Map<string, { axis: Axis; fact: FactorFact }>,
  rightFacts: Map<string, { axis: Axis; fact: FactorFact }>,
): boolean {
  if (axis !== "efficiency") return true;
  if (dimension === "ukeire_remaining") {
    return equalRegisteredNumber(leftFacts, rightFacts, "shanten");
  }
  if (dimension === "overall_effective_tiles_remaining") {
    return equalRegisteredNumber(leftFacts, rightFacts, "overall_shanten");
  }
  return true;
}

function buildDifference(
  axis: Axis,
  leftLedger: CandidateFactorLedger,
  rightLedger: CandidateFactorLedger,
  left: FactorFact,
  right: FactorFact,
  kind: "deterministic_difference" | "heuristic_difference",
  preferenceEligibility: PreferenceEligibility,
  direction: "supports_left" | "supports_right" | "neutral",
  valueRelation?: "ordered" | "equal" | "different",
): FactorDifference {
  const resolvedValueRelation = valueRelation ?? (direction === "neutral"
    ? (stableJson(left.value) === stableJson(right.value) ? "equal" : "different")
    : "ordered");
  const base = {
    differenceId: `difference:v1:${axis}:${left.dimension}:${leftLedger.actionRef}:${rightLedger.actionRef}`,
    kind,
    preferenceEligibility,
    axis,
    dimension: left.dimension,
    leftActionRef: leftLedger.actionRef,
    rightActionRef: rightLedger.actionRef,
    direction,
    valueRelation: resolvedValueRelation,
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
  const factsByLedger = ledgers.map((ledger) => factMap(ledger));
  const deterministic: FactorDifference[] = [];
  const heuristic: FactorDifference[] = [];

  for (let leftIndex = 0; leftIndex < ledgers.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < ledgers.length; rightIndex += 1) {
      const leftLedger = ledgers[leftIndex]!;
      const rightLedger = ledgers[rightIndex]!;
      const leftFacts = factsByLedger[leftIndex]!;
      const rightFacts = factsByLedger[rightIndex]!;
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
          const spec = deterministicSpec(leftEntry.axis, left.dimension);
          const direction = spec === undefined ||
              !factMatchesSpec(left, spec) ||
              !factMatchesSpec(right, spec) ||
              !registeredComparisonAllowed(
                leftEntry.axis,
                left.dimension,
                leftFacts,
                rightFacts,
            )
            ? undefined
            : deterministicValueDirection(
              left.value,
              right.value,
              spec.preference,
            );
          const rawValuesEqual = stableJson(left.value) === stableJson(right.value);
          const preferenceEligibility = direction === undefined ||
              (direction === "neutral" && !rawValuesEqual)
            ? "ineligible"
            : "deterministic";
          deterministic.push(buildDifference(
            leftEntry.axis,
            leftLedger,
            rightLedger,
            left,
            right,
            "deterministic_difference",
            preferenceEligibility,
            preferenceEligibility === "deterministic"
              ? direction!
              : "neutral",
            preferenceEligibility === "deterministic"
              ? undefined
              : (rawValuesEqual ? "equal" : "different"),
          ));
          continue;
        }

        if (left.preferenceEligibility === "ineligible") {
          deterministic.push(buildDifference(
            leftEntry.axis,
            leftLedger,
            rightLedger,
            left,
            right,
            "deterministic_difference",
            "ineligible",
            "neutral",
            stableJson(left.value) === stableJson(right.value)
              ? "equal"
              : "different",
          ));
          continue;
        }

        if (left.preferenceEligibility === "heuristic_only") {
          const direction = heuristicValueDirection(
            leftEntry.axis,
            left.dimension,
            left.value,
            right.value,
          );
          if (direction === undefined) {
            heuristic.push(buildDifference(
              leftEntry.axis,
              leftLedger,
              rightLedger,
              left,
              right,
              "heuristic_difference",
              "heuristic_only",
              "neutral",
              "different",
            ));
            continue;
          }
          heuristic.push(buildDifference(
            leftEntry.axis,
            leftLedger,
            rightLedger,
            left,
            right,
            "heuristic_difference",
            "heuristic_only",
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
    deterministicCoverage: ledgers.flatMap((ledger) => ledger.axes.flatMap(
      (axis) => axis.facts
        .filter((fact) =>
          fact.evidenceClass !== "versioned_upstream_estimate" &&
          deterministicSpec(axis.axis, fact.dimension) !== undefined
        )
        .map((fact) => {
          const spec = deterministicSpec(axis.axis, fact.dimension)!;
          const eligible = fact.status === "calculated" &&
            fact.preferenceEligibility === "deterministic" &&
            factMatchesSpec(fact, spec);
          return {
            actionRef: ledger.actionRef,
            axis: axis.axis,
            dimension: fact.dimension,
            status: fact.status,
            preferenceEligibility: eligible ? "deterministic" : "ineligible",
            comparisonSignature: deterministicComparisonSignature(fact),
          };
        }),
    )),
  };
}
