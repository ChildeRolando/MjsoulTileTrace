import {
  ModelEvaluationSchema,
  StructuredComparisonSetSchema,
  type ModelEvaluation,
} from "@riichi-coach/contracts";
import {
  runStructuredFactorPipeline,
  type StructuredFactorPipelineInput,
  type StructuredFactorPipelineResult,
} from "../factors/structured-factor-pipeline.js";

export interface StructuredAnalysisAssemblyInput
  extends StructuredFactorPipelineInput {
  modelEvaluation: ModelEvaluation | null;
}

export interface StructuredAnalysisAssemblyResult {
  factorResult: StructuredFactorPipelineResult;
  modelEvaluation: ModelEvaluation | null;
}

function validateEvaluationBinding(
  evaluation: ModelEvaluation,
  comparisonSet: ReturnType<typeof StructuredComparisonSetSchema.parse>,
): void {
  const comparisonRefs = comparisonSet.candidates
    .map((candidate) => candidate.actionRef)
    .sort();
  const evaluationRefs = evaluation.candidates
    .map((candidate) => candidate.actionRef)
    .sort();
  const actual = comparisonSet.candidates.find((candidate) =>
    candidate.origins.includes("actual")
  );
  if (
    evaluation.comparisonSetId !== comparisonSet.comparisonSetId ||
    evaluation.decisionLayerRef !== comparisonSet.decisionLayerRef ||
    comparisonRefs.length !== evaluationRefs.length ||
    comparisonRefs.some((actionRef, index) =>
      actionRef !== evaluationRefs[index]
    ) ||
    actual?.actionRef !== evaluation.actualActionRef
  ) {
    throw new Error("model_evaluation_comparison_mismatch");
  }
}

export async function runStructuredAnalysisAssembly(
  input: StructuredAnalysisAssemblyInput,
): Promise<StructuredAnalysisAssemblyResult> {
  const comparisonSet = StructuredComparisonSetSchema.parse(
    input.comparisonSet,
  );
  const modelEvaluation = input.modelEvaluation === null
    ? null
    : ModelEvaluationSchema.parse(input.modelEvaluation);
  if (modelEvaluation !== null) {
    validateEvaluationBinding(modelEvaluation, comparisonSet);
  }

  const factorResult = await runStructuredFactorPipeline({
    frame: input.frame,
    comparisonSet,
    facts: input.facts,
    responseFuriten: input.responseFuriten,
    engine: input.engine,
  });
  return { factorResult, modelEvaluation };
}
