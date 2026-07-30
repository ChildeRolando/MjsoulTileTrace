import {
  KnownActionFactsSchema,
  type CandidateNormalizationResult,
  type KnownActionFacts,
  type StructuredComparisonSet,
} from "@riichi-coach/contracts";
import {
  buildStructuredComparisonSet,
} from "../candidate/comparison-set-builder.js";
import {
  normalizeCandidate,
} from "../candidate/candidate-normalizer.js";
import {
  adaptMjaiActionSequence,
  type MjaiActionEnvelope,
} from "./mjai-action.js";

export type StructuredMortalCandidateInput = {
  actions: MjaiActionEnvelope[];
  probability: number;
  qValue?: number;
  existingMeldRef?: string;
};

export type StructuredMortalActualInput = {
  actions: MjaiActionEnvelope[];
  existingMeldRef?: string;
};

export type StructuredMortalScore = {
  actionRef: StructuredComparisonSet["candidates"][number]["actionRef"];
  probability: number;
  qValue?: number;
};

type ReadyNormalization = Extract<
  CandidateNormalizationResult,
  { status: "ready" }
>;

type StructuredMortalModelRow = {
  normalized: ReadyNormalization;
  probability: number;
  qValue?: number;
};

export type StructuredMortalImportResult =
  | {
      status: "ready";
      comparisonSet: StructuredComparisonSet;
      scores: StructuredMortalScore[];
    }
  | {
      status: "incomplete";
      diagnostics: string[];
    }
  | {
      status: "not_comparable";
      code: "cross_decision_window" | "fewer_than_two_distinct_actions";
      actionRefs: StructuredMortalScore["actionRef"][];
      windowKinds: Array<
        "self_turn" |
        "discard_response" |
        "kan_response" |
        "post_call_discard"
      >;
    };

function diagnostic(
  adapted: ReturnType<typeof adaptMjaiActionSequence>,
): string {
  if (adapted.status === "incomplete") {
    return `${adapted.diagnosticCode}:${adapted.missingFields.join(",")}`;
  }
  if (adapted.status === "unsupported") {
    return `unsupported_source_action:${adapted.sourceType}`;
  }
  throw new Error("Ready adaptation has no diagnostic");
}

export function importStructuredMortalComparison(input: {
  comparisonSetId: string;
  decisionLayerRef: string;
  facts: KnownActionFacts;
  modelCandidates: StructuredMortalCandidateInput[];
  actual: StructuredMortalActualInput;
}): StructuredMortalImportResult {
  const facts = KnownActionFactsSchema.parse(input.facts);
  const modelRows: StructuredMortalModelRow[] = [];
  const diagnostics: string[] = [];

  for (const modelCandidate of input.modelCandidates) {
    if (
      !Number.isFinite(modelCandidate.probability) ||
      modelCandidate.probability < 0 ||
      modelCandidate.probability > 1
    ) {
      diagnostics.push("invalid_model_probability");
      continue;
    }
    if (
      modelCandidate.qValue !== undefined &&
      !Number.isFinite(modelCandidate.qValue)
    ) {
      diagnostics.push("invalid_model_q_value");
      continue;
    }
    const adapted = adaptMjaiActionSequence(
      modelCandidate.actions,
      {
        decisionWindow: facts.decisionWindow,
        ...(modelCandidate.existingMeldRef === undefined
          ? {}
          : { existingMeldRef: modelCandidate.existingMeldRef }),
      },
    );
    if (adapted.status !== "ready") {
      diagnostics.push(diagnostic(adapted));
      continue;
    }
    const normalized = normalizeCandidate({
      draft: adapted.draft,
      origin: "model",
      facts,
    });
    if (normalized.status !== "ready") {
      diagnostics.push(
        normalized.status === "needs_clarification"
          ? `needs_clarification:${normalized.ambiguousFields.join(",")}`
          : normalized.status === "inconsistent_with_known_facts"
            ? `inconsistent:${normalized.conflictCodes.join(",")}`
            : `unsupported_source_action:${normalized.sourceType}`,
      );
      continue;
    }
    modelRows.push({
      normalized,
      probability: modelCandidate.probability,
      ...(modelCandidate.qValue === undefined
        ? {}
        : { qValue: modelCandidate.qValue }),
    });
  }
  if (diagnostics.length > 0) {
    return { status: "incomplete", diagnostics: [...new Set(diagnostics)] };
  }

  const actualAdapted = adaptMjaiActionSequence(
    input.actual.actions,
    {
      decisionWindow: facts.decisionWindow,
      ...(input.actual.existingMeldRef === undefined
        ? {}
        : { existingMeldRef: input.actual.existingMeldRef }),
    },
  );
  if (actualAdapted.status !== "ready") {
    return {
      status: "incomplete",
      diagnostics: [diagnostic(actualAdapted)],
    };
  }
  const actual = normalizeCandidate({
    draft: actualAdapted.draft,
    origin: "actual",
    facts,
  });
  if (actual.status !== "ready") {
    const detail = actual.status === "needs_clarification"
      ? `needs_clarification:${actual.ambiguousFields.join(",")}`
      : actual.status === "inconsistent_with_known_facts"
        ? `inconsistent:${actual.conflictCodes.join(",")}`
        : `unsupported_source_action:${actual.sourceType}`;
    return { status: "incomplete", diagnostics: [detail] };
  }

  const modelRefs = modelRows.map(
    (row) => row.normalized.candidate.actionRef,
  );
  if (new Set(modelRefs).size !== modelRefs.length) {
    return {
      status: "incomplete",
      diagnostics: ["duplicate_model_action"],
    };
  }
  if (!modelRefs.includes(actual.candidate.actionRef)) {
    return {
      status: "incomplete",
      diagnostics: ["actual_action_not_scored"],
    };
  }

  const built = buildStructuredComparisonSet({
    comparisonSetId: input.comparisonSetId,
    origin: "automatic_review",
    decisionLayerRef: input.decisionLayerRef,
    candidates: [
      ...modelRows.map((row) => ({
        result: row.normalized,
        decisionWindow: facts.decisionWindow,
      })),
      {
        result: actual,
        decisionWindow: facts.decisionWindow,
      },
    ],
  });
  if (built.status !== "ready") {
    return built;
  }
  const scoreByRef = new Map(modelRows.map((row) => [
    row.normalized.candidate.actionRef,
    row,
  ]));
  return {
    status: "ready",
    comparisonSet: built.comparisonSet,
    scores: built.comparisonSet.candidates.map((candidate) => {
      const row = scoreByRef.get(candidate.actionRef)!;
      return {
        actionRef: candidate.actionRef,
        probability: row.probability,
        ...(row.qValue === undefined ? {} : { qValue: row.qValue }),
      };
    }),
  };
}
