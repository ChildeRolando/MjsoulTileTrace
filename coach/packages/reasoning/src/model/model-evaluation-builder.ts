import {
  ActionRefSchema,
  ModelEvaluationSchema,
  type ActionRef,
  type DetailPolicySnapshot,
  type ModelEvaluation,
} from "@riichi-coach/contracts";

type CommonEvaluationInput = {
  evaluationId: string;
  comparisonSetId: string;
  decisionLayerRef: string;
  engineVersion: string;
  adapterVersion: string;
  actualActionRef: string;
  // M6-A3: the scored model alternative the actual corresponds to. Defaults
  // to the exact actualActionRef; a different-granularity actual (riichi)
  // passes the declare_riichi alternative's ref instead. The Mortal score and
  // the error-gap baseline attach to this ref, never to an unscored actual.
  scoredActualModelActionRef?: string;
  detailPolicy: DetailPolicySnapshot;
};

export type ModelEvaluationBuildResult =
  | { status: "ready"; evaluation: ModelEvaluation }
  | {
      status: "incomplete";
      reason:
        | "fewer_than_two_scored_candidates"
        | "actual_action_not_scored";
    };

export type MortalCandidateInput = {
  actionRef: string;
  probability: number;
  qValue?: number;
};

export type AkagiCandidateInput = {
  actionRef: string;
  logit: number;
  qValue?: number;
};

function checkAutomaticEvidence(
  candidates: ReadonlyArray<{ actionRef: string }>,
  scoredActualModelActionRef: string,
): ModelEvaluationBuildResult | null {
  if (candidates.length < 2) {
    return {
      status: "incomplete",
      reason: "fewer_than_two_scored_candidates",
    };
  }
  if (!candidates.some(
    (candidate) => candidate.actionRef === scoredActualModelActionRef,
  )) {
    return {
      status: "incomplete",
      reason: "actual_action_not_scored",
    };
  }
  return null;
}

function preferredActions(
  candidates: ReadonlyArray<{
    actionRef: ActionRef;
    modelSelectionScore: number;
  }>,
): ActionRef[] {
  const highest = Math.max(
    ...candidates.map((candidate) => candidate.modelSelectionScore),
  );
  return candidates
    .filter((candidate) => candidate.modelSelectionScore === highest)
    .map((candidate) => candidate.actionRef);
}

function errorGap(
  candidates: ReadonlyArray<{
    actionRef: ActionRef;
    modelSelectionScore: number;
  }>,
  scoredActualModelActionRef: string,
): number {
  const highest = Math.max(
    ...candidates.map((candidate) => candidate.modelSelectionScore),
  );
  const actual = candidates.find(
    (candidate) => candidate.actionRef === scoredActualModelActionRef,
  )!;
  return highest - actual.modelSelectionScore;
}

export function buildMortalModelEvaluation(
  input: CommonEvaluationInput & {
    candidates: MortalCandidateInput[];
  },
): ModelEvaluationBuildResult {
  const incomplete = checkAutomaticEvidence(
    input.candidates,
    input.scoredActualModelActionRef ?? input.actualActionRef,
  );
  if (incomplete) {
    return incomplete;
  }
  const candidates = input.candidates.map((candidate) => ({
    actionRef: ActionRefSchema.parse(candidate.actionRef),
    rawValues: [
      { metric: "probability", value: candidate.probability },
      ...(candidate.qValue === undefined
        ? []
        : [{ metric: "q_value", value: candidate.qValue }]),
    ],
    modelSelectionScore: candidate.probability * 100,
  }));
  const evaluation = ModelEvaluationSchema.parse({
    evaluationId: input.evaluationId,
    comparisonSetId: input.comparisonSetId,
    decisionLayerRef: input.decisionLayerRef,
    engineId: "mortal",
    engineVersion: input.engineVersion,
    adapterVersion: input.adapterVersion,
    scoreMethod: "mortal_probability_x100",
    detailPolicy: input.detailPolicy,
    candidates,
    preferredActions: preferredActions(candidates),
    actualActionRef: input.actualActionRef,
    errorGap: errorGap(
      candidates,
      input.scoredActualModelActionRef ?? input.actualActionRef,
    ),
    scoredActualModelActionRef:
      input.scoredActualModelActionRef ?? input.actualActionRef,
    modelReason: "unknown",
  });
  return { status: "ready", evaluation };
}

export function buildAkagiModelEvaluation(
  input: CommonEvaluationInput & {
    candidates: AkagiCandidateInput[];
  },
): ModelEvaluationBuildResult {
  const incomplete = checkAutomaticEvidence(
    input.candidates,
    input.scoredActualModelActionRef ?? input.actualActionRef,
  );
  if (incomplete) {
    return incomplete;
  }
  const highestLogit = Math.max(
    ...input.candidates.map((candidate) => candidate.logit),
  );
  const exponentials = input.candidates.map(
    (candidate) => Math.exp(candidate.logit - highestLogit),
  );
  const denominator = exponentials.reduce(
    (total, value) => total + value,
    0,
  );
  const candidates = input.candidates.map((candidate, index) => ({
    actionRef: ActionRefSchema.parse(candidate.actionRef),
    rawValues: [
      { metric: "logit", value: candidate.logit },
      ...(candidate.qValue === undefined
        ? []
        : [{ metric: "q_value", value: candidate.qValue }]),
    ],
    modelSelectionScore: exponentials[index]! / denominator * 100,
  }));
  const evaluation = ModelEvaluationSchema.parse({
    evaluationId: input.evaluationId,
    comparisonSetId: input.comparisonSetId,
    decisionLayerRef: input.decisionLayerRef,
    engineId: "akagi_native",
    engineVersion: input.engineVersion,
    adapterVersion: input.adapterVersion,
    scoreMethod: "akagi_softmax_x100",
    detailPolicy: input.detailPolicy,
    candidates,
    preferredActions: preferredActions(candidates),
    actualActionRef: input.actualActionRef,
    errorGap: errorGap(
      candidates,
      input.scoredActualModelActionRef ?? input.actualActionRef,
    ),
    scoredActualModelActionRef:
      input.scoredActualModelActionRef ?? input.actualActionRef,
    modelReason: "unknown",
  });
  return { status: "ready", evaluation };
}
