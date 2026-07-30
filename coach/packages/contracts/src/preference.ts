import { z } from "zod";
import { ActionRefSchema } from "./comparison.js";

export const PreferenceSetSchema = z.array(ActionRefSchema).min(1)
  .superRefine((actionRefs, context) => {
    if (new Set(actionRefs).size !== actionRefs.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Preference actions must be unique",
      });
    }
  });
export type PreferenceSet = z.infer<typeof PreferenceSetSchema>;

export const PreferenceSchema = PreferenceSetSchema.nullable();
export type Preference = z.infer<typeof PreferenceSchema>;

export const PreferenceAgreementSchema = z.enum([
  "agree",
  "partial_agreement",
  "conflict",
  "not_comparable",
]);
export type PreferenceAgreement = z.infer<typeof PreferenceAgreementSchema>;

export const ComparisonPreferencesSchema = z.object({
  modelPreference: PreferenceSchema,
  coachPreference: PreferenceSchema,
  agreement: PreferenceAgreementSchema,
}).strict().superRefine((preferences, context) => {
  const expected = (() => {
    if (
      preferences.modelPreference === null ||
      preferences.coachPreference === null
    ) {
      return "not_comparable";
    }
    const model = new Set(preferences.modelPreference);
    const coach = new Set(preferences.coachPreference);
    if (
      model.size === coach.size &&
      [...model].every((actionRef) => coach.has(actionRef))
    ) {
      return "agree";
    }
    if ([...model].some((actionRef) => coach.has(actionRef))) {
      return "partial_agreement";
    }
    return "conflict";
  })();
  if (preferences.agreement !== expected) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Agreement must be derived from both preference sets",
      path: ["agreement"],
    });
  }
});
export type ComparisonPreferences = z.infer<
  typeof ComparisonPreferencesSchema
>;
