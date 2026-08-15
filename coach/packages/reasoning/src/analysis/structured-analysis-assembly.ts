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
  // M6-A3: every model-scored alternative is a model-origin comparison
  // candidate and vice versa (1:1). A different-granularity actual (the riichi
  // case) is an actual-only candidate with no score row of its own; its scored
  // carrier is the correspondence's model ref, which must be exactly what the
  // evaluation declares.
  const modelRefs = comparisonSet.candidates
    .filter((candidate) => candidate.origins.includes("model"))
    .map((candidate) => candidate.actionRef)
    .sort();
  const evaluationRefs = evaluation.candidates
    .map((candidate) => candidate.actionRef)
    .sort();
  const actual = comparisonSet.candidates.find((candidate) =>
    candidate.origins.includes("actual")
  );
  const correspondence = comparisonSet.correspondences?.find(
    (item) => item.actualActionRef === actual?.actionRef,
  );
  const expectedScoredRef =
    correspondence?.scoredModelActionRef ?? actual?.actionRef;
  if (
    evaluation.comparisonSetId !== comparisonSet.comparisonSetId ||
    evaluation.decisionLayerRef !== comparisonSet.decisionLayerRef ||
    modelRefs.length !== evaluationRefs.length ||
    modelRefs.some((actionRef, index) => actionRef !== evaluationRefs[index]) ||
    actual?.actionRef !== evaluation.actualActionRef ||
    expectedScoredRef !== evaluation.scoredActualModelActionRef
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
