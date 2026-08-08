import { z } from "zod";
import { ActionRefSchema } from "./comparison.js";
import { AxisSchema } from "./evidence.js";
import { EngineIdentitySchema, Tile34CountSchema } from "./fact-engine.js";

export const FactorEvidenceClassSchema = z.enum([
  "deterministic_allowlisted",
  "deterministic_under_assumptions",
  "deterministic_local_replay",
  "versioned_upstream_estimate",
]);
export type FactorEvidenceClass = z.infer<typeof FactorEvidenceClassSchema>;

export const PreferenceEligibilitySchema = z.enum([
  "deterministic",
  "heuristic_only",
  "ineligible",
]);
export type PreferenceEligibility = z.infer<
  typeof PreferenceEligibilitySchema
>;

export const FactorStatusSchema = z.enum([
  "calculated",
  "blocked_missing_facts",
  "blocked_engine_failure",
  "unsupported_action_in_slice",
  "unsupported_dimension",
  "unsupported_upstream_api",
]);
export type FactorStatus = z.infer<typeof FactorStatusSchema>;

export const AxisRunStatusSchema = z.enum([
  "calculated",
  "skipped_out_of_scope",
  "blocked_missing_facts",
  "blocked_engine_failure",
  "unsupported_action_in_slice",
  "unsupported_dimension",
]);
export type AxisRunStatus = z.infer<typeof AxisRunStatusSchema>;

const NumberFactorValueSchema = z.object({
  kind: z.literal("number"),
  value: z.number().finite(),
  unit: z.string().min(1),
}).strict();

const BooleanFactorValueSchema = z.object({
  kind: z.literal("boolean"),
  value: z.boolean(),
}).strict();

const ClassificationFactorValueSchema = z.object({
  kind: z.literal("classification"),
  value: z.string().min(1),
}).strict();

const TileCountsFactorValueSchema = z.object({
  kind: z.literal("tile_counts"),
  value: z.array(Tile34CountSchema),
}).strict().superRefine((factorValue, context) => {
  const indexes = factorValue.value.map((entry) => entry.tile34);
  if (indexes.some((value, index) => index > 0 && value <= indexes[index - 1]!)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Tile-count factor values must use strict ascending order",
      path: ["value"],
    });
  }
});

const IntegerIdsFactorValueSchema = z.object({
  kind: z.literal("integer_ids"),
  values: z.array(z.number().int()),
}).strict().superRefine((factorValue, context) => {
  if (factorValue.values.some((value, index) =>
    index > 0 && value <= factorValue.values[index - 1]!
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Integer factor IDs must be unique and strictly sorted",
      path: ["values"],
    });
  }
});

const StringSetFactorValueSchema = z.object({
  kind: z.literal("string_set"),
  values: z.array(z.string().min(1)),
}).strict().superRefine((factorValue, context) => {
  if (factorValue.values.some((value, index) =>
    index > 0 && value <= factorValue.values[index - 1]!
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "String-set factor values must use strict ascending order",
      path: ["values"],
    });
  }
});

const HonorSafetyFactorValueSchema = z.object({
  kind: z.literal("honor_safety"),
  remainingCount: z.number().int().min(0).max(4),
  category: z.enum(["yakuhai", "guest_wind"]),
}).strict();

const ShapeKindSchema = z.enum([
  "sequence",
  "triplet",
  "pair_candidate",
  "ryanmen_taatsu",
  "kanchan_taatsu",
  "penchan_taatsu",
  "floating",
]);

const FamilySchema = z.enum(["standard", "chiitoitsu", "kokushi"]);
const WaitTypeSchema = z.enum([
  "ryanmen",
  "kanchan",
  "penchan",
  "shanpon",
  "tanki",
  "kokushi_single",
  "kokushi_thirteen_sided",
]);

function strictOrdinalList(minimum: number) {
  return z.array(z.number().int().nonnegative()).min(minimum)
  .superRefine((values, context) => {
    if (values.some((value, index) =>
      index > 0 && value <= values[index - 1]!
    )) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Decomposition ordinals must be strictly increasing",
      });
    }
  });
}
const StrictOrdinalListSchema = strictOrdinalList(0);
const NonEmptyStrictOrdinalListSchema = strictOrdinalList(1);

const LedgerShapeGroupSchema = z.object({
  kind: ShapeKindSchema,
  tiles34: z.array(z.number().int().min(0).max(33)).min(1).max(3),
  occurrence: z.number().int().min(1),
}).strict().superRefine((group, context) => {
  const tiles = group.tiles34;
  if (tiles.some((tile, index) => index > 0 && tile < tiles[index - 1]!)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Shape tiles must be sorted",
      path: ["tiles34"],
    });
    return;
  }
  const same = tiles.every((tile) => tile === tiles[0]);
  const sameSuit = tiles.every((tile) =>
    tile < 27 && Math.floor(tile / 9) === Math.floor(tiles[0]! / 9)
  );
  const firstRank = tiles[0]! % 9 + 1;
  const valid = group.kind === "sequence"
    ? tiles.length === 3 && sameSuit && tiles[1] === tiles[0]! + 1 &&
      tiles[2] === tiles[1]! + 1
    : group.kind === "triplet"
      ? tiles.length === 3 && same
      : group.kind === "pair_candidate"
        ? tiles.length === 2 && same
        : group.kind === "ryanmen_taatsu"
          ? tiles.length === 2 && sameSuit && tiles[1] === tiles[0]! + 1 &&
            firstRank >= 2 && firstRank <= 7
          : group.kind === "kanchan_taatsu"
            ? tiles.length === 2 && sameSuit && tiles[1] === tiles[0]! + 2
            : group.kind === "penchan_taatsu"
              ? tiles.length === 2 && sameSuit && tiles[1] === tiles[0]! + 1 &&
                (firstRank === 1 || firstRank === 8)
              : tiles.length === 1;
  if (!valid) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Tiles do not form ${group.kind}`,
      path: ["tiles34"],
    });
  }
});

const ShapeClaimSchema = z.object({
  certainty: z.enum(["invariant", "alternative"]),
  group: LedgerShapeGroupSchema,
  decompositionOrdinals: NonEmptyStrictOrdinalListSchema,
}).strict();

function compareNumberLists(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const difference = left[index]! - right[index]!;
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

const shapeKindOrder = ShapeKindSchema.options;
function compareShapeClaims(
  left: z.infer<typeof ShapeClaimSchema>,
  right: z.infer<typeof ShapeClaimSchema>,
): number {
  return ["invariant", "alternative"].indexOf(left.certainty) -
      ["invariant", "alternative"].indexOf(right.certainty) ||
    shapeKindOrder.indexOf(left.group.kind) -
      shapeKindOrder.indexOf(right.group.kind) ||
    compareNumberLists(left.group.tiles34, right.group.tiles34) ||
    left.group.occurrence - right.group.occurrence;
}

const ShapeClaimsFactorValueSchema = z.object({
  kind: z.literal("shape_claims"),
  claims: z.array(ShapeClaimSchema),
}).strict().superRefine((factorValue, context) => {
  if (factorValue.claims.some((claim, index) =>
    index > 0 && compareShapeClaims(factorValue.claims[index - 1]!, claim) >= 0
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Shape claims must be unique and canonically sorted",
      path: ["claims"],
    });
  }
  const occurrenceByIdentity = new Map<string, number>();
  factorValue.claims.forEach((claim, index) => {
    const identity = [
      claim.certainty,
      claim.group.kind,
      claim.group.tiles34.join(","),
    ].join(":");
    const expected = (occurrenceByIdentity.get(identity) ?? 0) + 1;
    if (claim.group.occurrence !== expected) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Shape claim occurrences must be contiguous and one-based",
        path: ["claims", index, "group", "occurrence"],
      });
    }
    occurrenceByIdentity.set(identity, claim.group.occurrence);
  });
});

const WaitDetailSchema = z.object({
  tile34: z.number().int().min(0).max(33),
  families: z.array(FamilySchema).min(1),
  waitTypes: z.array(WaitTypeSchema).min(1),
  remainingStatus: z.enum(["calculated", "blocked_missing_facts"]),
  remaining: z.number().int().min(0).max(4).nullable(),
  baseRonEligibility: z.enum([
    "eligible",
    "ineligible",
    "unknown_missing_situational_yaku_context",
  ]),
  decompositionOrdinals: StrictOrdinalListSchema,
}).strict().superRefine((wait, context) => {
  if ((wait.remainingStatus === "calculated") !== (wait.remaining !== null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Wait remaining status/value mismatch",
    });
  }
  if (wait.families.some((family, index) =>
    index > 0 && FamilySchema.options.indexOf(family) <=
      FamilySchema.options.indexOf(wait.families[index - 1]!)
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Wait families must be unique and canonical",
      path: ["families"],
    });
  }
  if (wait.waitTypes.some((waitType, index) =>
    index > 0 && WaitTypeSchema.options.indexOf(waitType) <=
      WaitTypeSchema.options.indexOf(wait.waitTypes[index - 1]!)
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Wait types must be unique and canonical",
      path: ["waitTypes"],
    });
  }
});

const WaitDetailsFactorValueSchema = z.object({
  kind: z.literal("wait_details"),
  waits: z.array(WaitDetailSchema),
}).strict().superRefine((factorValue, context) => {
  if (factorValue.waits.some((wait, index) =>
    index > 0 && wait.tile34 <= factorValue.waits[index - 1]!.tile34
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Wait details must be unique and strictly sorted by tile",
      path: ["waits"],
    });
  }
});

export const FactorValueSchema = z.union([
  NumberFactorValueSchema,
  BooleanFactorValueSchema,
  ClassificationFactorValueSchema,
  TileCountsFactorValueSchema,
  IntegerIdsFactorValueSchema,
  StringSetFactorValueSchema,
  HonorSafetyFactorValueSchema,
  ShapeClaimsFactorValueSchema,
  WaitDetailsFactorValueSchema,
]);
export type FactorValue = z.infer<typeof FactorValueSchema>;

function requireUniqueStrings(
  values: readonly string[],
  context: z.RefinementCtx,
  path: Array<string | number>,
): void {
  if (new Set(values).size !== values.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "String identifiers must be unique",
      path,
    });
  }
}

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

export const FactorFactSchema = z.object({
  factorKey: z.string().min(1),
  dimension: z.string().min(1),
  status: FactorStatusSchema,
  evidenceClass: FactorEvidenceClassSchema,
  preferenceEligibility: PreferenceEligibilitySchema,
  engineIdentity: EngineIdentitySchema.optional(),
  value: FactorValueSchema.optional(),
  evidenceIds: z.array(z.string().min(1)).min(1),
  limitations: z.array(z.string().min(1)),
}).strict().superRefine((fact, context) => {
  requireUniqueStrings(fact.evidenceIds, context, ["evidenceIds"]);

  if (fact.status === "calculated" && fact.value === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Calculated factor facts require a value",
      path: ["value"],
    });
  }
  if (fact.status !== "calculated" && fact.value !== undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Non-calculated factor facts must not contain a value",
      path: ["value"],
    });
  }

  if (
    fact.status === "calculated" &&
    fact.evidenceClass !== "deterministic_local_replay" &&
    fact.engineIdentity === undefined
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Calculated engine evidence requires structured engine identity",
      path: ["engineIdentity"],
    });
  }
  if (
    fact.evidenceClass === "deterministic_local_replay" &&
    fact.engineIdentity !== undefined
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Local replay evidence must not claim an upstream engine identity",
      path: ["engineIdentity"],
    });
  }

  if (
    fact.evidenceClass === "versioned_upstream_estimate" &&
    fact.preferenceEligibility !== "heuristic_only"
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Versioned upstream estimates are heuristic-only",
      path: ["preferenceEligibility"],
    });
  }
  if (
    fact.evidenceClass !== "versioned_upstream_estimate" &&
    fact.preferenceEligibility === "heuristic_only"
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Deterministic evidence cannot be marked heuristic-only",
      path: ["preferenceEligibility"],
    });
  }
});
export type FactorFact = z.infer<typeof FactorFactSchema>;

export const FactorAxisLedgerSchema = z.object({
  axis: AxisSchema,
  status: AxisRunStatusSchema,
  facts: z.array(FactorFactSchema),
}).strict().superRefine((axisLedger, context) => {
  const keys = axisLedger.facts.map((fact) => fact.factorKey);
  requireUniqueStrings(keys, context, ["facts"]);
  const dimensions = axisLedger.facts.map((fact) => fact.dimension);
  if (new Set(dimensions).size !== dimensions.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Factor dimensions must be unique within an axis",
      path: ["facts"],
    });
  }
  if (
    axisLedger.status === "calculated" &&
    !axisLedger.facts.some((fact) => fact.status === "calculated")
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Calculated axes require at least one calculated fact",
      path: ["facts"],
    });
  }
});
export type FactorAxisLedger = z.infer<typeof FactorAxisLedgerSchema>;

export const CandidateFactorLedgerSchema = z.object({
  actionRef: ActionRefSchema,
  projectedStateRef: z.string().min(1),
  axes: z.array(FactorAxisLedgerSchema),
  diagnostics: z.array(z.string().min(1)),
}).strict().superRefine((ledger, context) => {
  const axes = ledger.axes.map((axis) => axis.axis);
  const canonicalAxes = [
    "efficiency",
    "value",
    "defense",
    "placement",
    "option_value",
  ] as const;
  if (
    axes.length !== canonicalAxes.length ||
    canonicalAxes.some((axis) => !axes.includes(axis))
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Candidate ledgers must contain the canonical five axes",
      path: ["axes"],
    });
  }
  if (new Set(axes).size !== axes.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Candidate ledgers must contain each axis at most once",
      path: ["axes"],
    });
  }
  requireUniqueStrings(ledger.diagnostics, context, ["diagnostics"]);
});
export type CandidateFactorLedger = z.infer<
  typeof CandidateFactorLedgerSchema
>;

const DifferenceDirectionSchema = z.enum([
  "supports_left",
  "supports_right",
  "neutral",
]);

const DifferenceBaseShape = {
  differenceId: z.string().min(1),
  axis: AxisSchema,
  dimension: z.string().min(1),
  leftActionRef: ActionRefSchema,
  rightActionRef: ActionRefSchema,
  direction: DifferenceDirectionSchema,
  valueRelation: z.enum(["ordered", "equal", "different"]),
  leftValue: FactorValueSchema,
  rightValue: FactorValueSchema,
  evidenceIds: z.array(z.string().min(1)).min(1),
  limitations: z.array(z.string().min(1)),
};

const DeterministicDifferenceSchema = z.object({
  ...DifferenceBaseShape,
  kind: z.literal("deterministic_difference"),
  preferenceEligibility: z.enum(["deterministic", "ineligible"]),
  evidenceClass: z.enum([
    "deterministic_allowlisted",
    "deterministic_under_assumptions",
    "deterministic_local_replay",
  ]),
  engineIdentity: EngineIdentitySchema.optional(),
}).strict();

const HeuristicDifferenceSchema = z.object({
  ...DifferenceBaseShape,
  kind: z.literal("heuristic_difference"),
  preferenceEligibility: z.literal("heuristic_only"),
  evidenceClass: z.literal("versioned_upstream_estimate"),
  engineIdentity: EngineIdentitySchema,
}).strict();

export const FactorDifferenceSchema = z.discriminatedUnion("kind", [
  DeterministicDifferenceSchema,
  HeuristicDifferenceSchema,
]).superRefine((difference, context) => {
  const valuesEqual = stableJson(difference.leftValue) ===
    stableJson(difference.rightValue);
  requireUniqueStrings(difference.evidenceIds, context, ["evidenceIds"]);
  if (difference.leftActionRef === difference.rightActionRef) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Factor differences require two distinct actions",
      path: ["rightActionRef"],
    });
  }
  if (
    difference.kind === "deterministic_difference" &&
    difference.evidenceClass !== "deterministic_local_replay" &&
    difference.engineIdentity === undefined
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Engine-derived deterministic differences require structured engine identity",
      path: ["engineIdentity"],
    });
  }
  if (
    difference.kind === "deterministic_difference" &&
    difference.evidenceClass === "deterministic_local_replay" &&
    difference.engineIdentity !== undefined
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Local replay differences must not claim an upstream engine identity",
      path: ["engineIdentity"],
    });
  }
  if (
    difference.kind === "deterministic_difference" &&
    difference.preferenceEligibility === "ineligible" &&
    difference.direction !== "neutral"
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Ineligible deterministic differences must be neutral",
      path: ["direction"],
    });
  }
  if (
    difference.kind === "deterministic_difference" &&
    difference.preferenceEligibility === "ineligible" &&
    difference.valueRelation === "ordered"
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Ineligible deterministic differences cannot order values",
      path: ["valueRelation"],
    });
  }
  if (
    difference.kind === "deterministic_difference" &&
    difference.preferenceEligibility === "deterministic" &&
    difference.direction === "neutral" &&
    difference.valueRelation !== "equal"
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Eligible neutral differences must represent equal values",
      path: ["valueRelation"],
    });
  }
  if (
    difference.kind === "deterministic_difference" &&
    difference.preferenceEligibility === "deterministic" &&
    difference.direction !== "neutral" &&
    difference.valueRelation !== "ordered"
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Eligible directional differences must order values",
      path: ["valueRelation"],
    });
  }
  if (
    difference.direction === "neutral" &&
    difference.valueRelation === "ordered"
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Neutral differences cannot order values",
      path: ["valueRelation"],
    });
  }
  if (
    difference.direction !== "neutral" &&
    difference.valueRelation !== "ordered"
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Directional differences must order values",
      path: ["valueRelation"],
    });
  }
  if (difference.direction !== "neutral" && valuesEqual) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Directional differences require unequal factor values",
      path: ["direction"],
    });
  }
  if (
    difference.direction === "neutral" &&
    valuesEqual &&
    difference.valueRelation !== "equal"
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Equal factor values require an equal relation",
      path: ["valueRelation"],
    });
  }
  if (
    difference.direction === "neutral" &&
    !valuesEqual &&
    difference.valueRelation !== "different"
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Unequal factor values require a different relation",
      path: ["valueRelation"],
    });
  }
});
export type FactorDifference = z.infer<typeof FactorDifferenceSchema>;

export const DeterministicPreferenceSchema = z.object({
  actionRefs: z.array(ActionRefSchema).min(1),
  scope: z.enum([
    "flat_discard",
    "efficiency_only",
    "value_only",
    "defense_only",
    "placement_only",
    "option_value_only",
    "applied_decision",
  ]),
  decisiveDifferenceIds: z.array(z.string().min(1)).min(1),
  coverage: z.enum(["complete", "partial"]),
}).strict().superRefine((preference, context) => {
  requireUniqueStrings(preference.actionRefs, context, ["actionRefs"]);
  requireUniqueStrings(
    preference.decisiveDifferenceIds,
    context,
    ["decisiveDifferenceIds"],
  );
});
export type DeterministicPreference = z.infer<
  typeof DeterministicPreferenceSchema
>;
