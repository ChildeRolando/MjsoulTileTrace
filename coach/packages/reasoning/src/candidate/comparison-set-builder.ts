import {
  CandidateNormalizationResultSchema,
  DecisionWindowSchema,
  StructuredComparisonBuildResultSchema,
  StructuredComparisonSetSchema,
  type CandidateNormalizationResult,
  type DecisionWindow,
  type StructuredComparisonBuildResult,
  type StructuredComparisonCandidate,
} from "@riichi-coach/contracts";

export type ComparisonBuildCandidate = {
  result: CandidateNormalizationResult;
  decisionWindow: DecisionWindow;
};

const originRank = {
  model: 0,
  actual: 1,
  user: 2,
} as const;

function windowKey(rawWindow: DecisionWindow): string {
  return JSON.stringify(DecisionWindowSchema.parse(rawWindow));
}

export function buildStructuredComparisonSet(input: {
  comparisonSetId: string;
  origin: "automatic_review" | "user_comparison";
  decisionLayerRef: string;
  candidates: ComparisonBuildCandidate[];
}): StructuredComparisonBuildResult {
  const parsed = input.candidates.map((entry) => {
    const result = CandidateNormalizationResultSchema.parse(entry.result);
    if (result.status !== "ready") {
      throw new Error(
        `Only ready candidates can enter comparison building: ${result.status}`,
      );
    }
    return {
      result,
      decisionWindow: DecisionWindowSchema.parse(entry.decisionWindow),
    };
  });
  if (parsed.length === 0) {
    return StructuredComparisonBuildResultSchema.parse({
      status: "not_comparable",
      code: "fewer_than_two_distinct_actions",
      actionRefs: [],
      windowKinds: [],
    });
  }

  const windowKeys = new Set(
    parsed.map((entry) => windowKey(entry.decisionWindow)),
  );
  const actionRefs = parsed.map(
    (entry) => entry.result.candidate.actionRef,
  );
  const windowKinds = [
    ...new Set(parsed.map((entry) => entry.decisionWindow.kind)),
  ];
  if (windowKeys.size !== 1) {
    return StructuredComparisonBuildResultSchema.parse({
      status: "not_comparable",
      code: "cross_decision_window",
      actionRefs: [...new Set(actionRefs)],
      windowKinds,
    });
  }

  const merged = new Map<string, StructuredComparisonCandidate>();
  for (const entry of parsed) {
    const incoming = entry.result.candidate;
    const current = merged.get(incoming.actionRef);
    if (current === undefined) {
      merged.set(incoming.actionRef, incoming);
      continue;
    }
    merged.set(incoming.actionRef, {
      ...current,
      origins: [
        ...new Set([...current.origins, ...incoming.origins]),
      ].sort((left, right) => originRank[left] - originRank[right]),
    });
  }
  const candidates = [...merged.values()];
  if (candidates.length < 2) {
    return StructuredComparisonBuildResultSchema.parse({
      status: "not_comparable",
      code: "fewer_than_two_distinct_actions",
      actionRefs: candidates.map((candidate) => candidate.actionRef),
      windowKinds,
    });
  }

  return StructuredComparisonBuildResultSchema.parse({
    status: "ready",
    comparisonSet: StructuredComparisonSetSchema.parse({
      comparisonSetId: input.comparisonSetId,
      origin: input.origin,
      decisionLayerRef: input.decisionLayerRef,
      decisionWindow: parsed[0]!.decisionWindow,
      candidates,
    }),
  });
}
