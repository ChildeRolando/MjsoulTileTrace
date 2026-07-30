import {
  ActionRefSchema,
  ComparisonPreferencesSchema,
  ComparisonSetSchema,
  PreferenceSchema,
  PreferenceSetSchema,
  type ComparisonPreferences,
  type ComparisonSet,
  type Preference,
  type PreferenceAgreement,
} from "@riichi-coach/contracts";

function sameSet(left: Set<string>, right: Set<string>): boolean {
  return (
    left.size === right.size &&
    [...left].every((actionRef) => right.has(actionRef))
  );
}

export function computePreferenceAgreement(
  rawModelPreference: readonly string[] | null,
  rawCoachPreference: readonly string[] | null,
): PreferenceAgreement {
  const modelPreference = PreferenceSchema.parse(rawModelPreference);
  const coachPreference = PreferenceSchema.parse(rawCoachPreference);
  if (modelPreference === null || coachPreference === null) {
    return "not_comparable";
  }
  const modelSet = new Set<string>(modelPreference);
  const coachSet = new Set<string>(coachPreference);
  if (sameSet(modelSet, coachSet)) {
    return "agree";
  }
  if ([...modelSet].some((actionRef) => coachSet.has(actionRef))) {
    return "partial_agreement";
  }
  return "conflict";
}

export function createActionPreference(
  rawActionRefs: readonly string[],
): NonNullable<Preference> {
  const actionRefs = [...new Set(
    rawActionRefs.map((actionRef) => ActionRefSchema.parse(actionRef)),
  )].sort();
  return PreferenceSetSchema.parse(actionRefs);
}

export function createPreferenceState(
  rawComparisonSet: ComparisonSet,
  rawModelPreference: Preference,
  rawCoachPreference: Preference,
): ComparisonPreferences {
  const comparisonSet = ComparisonSetSchema.parse(rawComparisonSet);
  const modelPreference = PreferenceSchema.parse(rawModelPreference);
  const coachPreference = PreferenceSchema.parse(rawCoachPreference);
  const candidateRefs = new Set(
    comparisonSet.candidates.map((candidate) => candidate.actionRef),
  );
  for (const actionRef of [
    ...(modelPreference ?? []),
    ...(coachPreference ?? []),
  ]) {
    if (!candidateRefs.has(actionRef)) {
      throw new Error(
        `Preference action ${actionRef} is outside the comparison set`,
      );
    }
  }
  return ComparisonPreferencesSchema.parse({
    modelPreference,
    coachPreference,
    agreement: computePreferenceAgreement(
      modelPreference,
      coachPreference,
    ),
  });
}
