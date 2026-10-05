import {
  RecordLabelMortalAgreementSchema,
  type DecisionAnalysis,
  type ModelEvaluation,
  type RecordLabelMortalAgreement,
} from "@riichi-coach/contracts";

/** The small model-evidence projection used by both loaded packages and the
 *  streaming artifact reader. Factor ledgers and other analysis payloads are
 *  deliberately outside this input contract. */
type CandidateProjection = { actionRef: string };
export type MortalAgreementDecision = {
  outcome: DecisionAnalysis["outcome"];
  modelEvaluation?: {
    engineId: ModelEvaluation["engineId"];
    candidates?: readonly CandidateProjection[];
    preferredActions?: readonly string[];
    scoredActualModelActionRef?: string;
  };
};

type ModelProjection = {
  engineId: unknown;
  candidates: unknown;
  preferredActions: unknown;
  scoredActualModelActionRef: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalid(): never {
  throw new Error("record_mortal_agreement_invalid");
}

const OUTCOMES = new Set<string>([
  "analysis_ready",
  "unsupported_action",
  "source_row_not_expected",
  "no_mortal_entry",
  "binding_mismatch",
  "model_output_incomplete",
  "analysis_blocked",
]);

/** Count decisions where Mortal's preferred set includes the model-scored
 *  action that realizes the actual. The scored actual can differ from the
 *  replay's `actualActionRef` for mapped actions such as riichi discards. */
export function summarizeMortalAgreement(
  decisions: readonly MortalAgreementDecision[],
): RecordLabelMortalAgreement {
  let agreementCount = 0;
  let scoredDecisionCount = 0;

  for (const rawDecision of decisions as readonly unknown[]) {
    if (!isRecord(rawDecision) || typeof rawDecision.outcome !== "string" ||
      !OUTCOMES.has(rawDecision.outcome)) invalid();
    if (rawDecision.outcome !== "analysis_ready") continue;

    const evaluation = rawDecision.modelEvaluation;
    if (!isRecord(evaluation)) invalid();
    const model = evaluation as ModelProjection;
    if (model.engineId !== "mortal" && model.engineId !== "akagi_native") invalid();
    if (model.engineId !== "mortal") continue;
    if (!Array.isArray(model.candidates)) invalid();
    if (model.candidates.length <= 1) continue;

    const candidateRefs = new Set<string>();
    for (const candidate of model.candidates as unknown[]) {
      if (!isRecord(candidate) || typeof candidate.actionRef !== "string" ||
        candidateRefs.has(candidate.actionRef)) invalid();
      candidateRefs.add(candidate.actionRef);
    }
    if (!Array.isArray(model.preferredActions) || model.preferredActions.length === 0 ||
      model.preferredActions.some((actionRef) => typeof actionRef !== "string") ||
      typeof model.scoredActualModelActionRef !== "string" ||
      !candidateRefs.has(model.scoredActualModelActionRef)) invalid();
    const preferred = model.preferredActions as string[];
    if (new Set(preferred).size !== preferred.length ||
      preferred.some((actionRef) => !candidateRefs.has(actionRef))) invalid();

    scoredDecisionCount++;
    if (preferred.includes(model.scoredActualModelActionRef)) agreementCount++;
  }

  return RecordLabelMortalAgreementSchema.parse({ agreementCount, scoredDecisionCount });
}
