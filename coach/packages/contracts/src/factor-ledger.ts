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
  if (new Set(factorValue.values).size !== factorValue.values.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Integer factor IDs must be unique",
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

export const FactorValueSchema = z.union([
  NumberFactorValueSchema,
  BooleanFactorValueSchema,
  ClassificationFactorValueSchema,
  TileCountsFactorValueSchema,
  IntegerIdsFactorValueSchema,
  StringSetFactorValueSchema,
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
  evidenceClass: z.literal("versioned_upstream_estimate"),
  engineIdentity: EngineIdentitySchema,
}).strict();

export const FactorDifferenceSchema = z.discriminatedUnion("kind", [
  DeterministicDifferenceSchema,
  HeuristicDifferenceSchema,
]).superRefine((difference, context) => {
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
