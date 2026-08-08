import {
  CandidateFactorLedgerSchema,
  ComparisonAnalysisFrameSchema,
  KnownGameFactsSchema,
  StructuredComparisonSetSchema,
  type Axis,
  type CandidateFactorLedger,
  type ComparisonAnalysisFrame,
  type DeterministicPreference,
  type KnownGameFacts,
  type StructuredComparisonCandidate,
  type StructuredComparisonSet,
} from "@riichi-coach/contracts";
import type { MahjongFactEnginePort } from "../fact-engine/port.js";
import { projectCandidate, type CandidateProjection } from "./candidate-projector.js";
import {
  buildCandidateLedger,
  type CandidateLedgerBuildInput,
  type ThreatRiskEngineOutcome,
} from "./ledger-builder.js";
import {
  buildFactorDifferences,
  type FactorDifferenceBuildResult,
} from "./difference-builder.js";
import { resolveDeterministicPreference } from "./deterministic-resolver.js";

export interface StructuredFactorPipelineInput {
  frame: ComparisonAnalysisFrame;
  comparisonSet: StructuredComparisonSet;
  facts: KnownGameFacts;
  engine: MahjongFactEnginePort;
}

export interface StructuredPipelineDiagnostic {
  actionRef: string;
  stage: "projection" | "hand13" | "completed_hand" | "threat_risk";
  status: "blocked_missing_facts" | "unsupported_action_in_slice" |
    "blocked_engine_failure";
  detail: string;
  threatActor?: number;
}

export interface StructuredFactorPipelineResult {
  ledgers: CandidateFactorLedger[];
  differences: FactorDifferenceBuildResult;
  deterministicPreference: DeterministicPreference | null;
  diagnostics: StructuredPipelineDiagnostic[];
}

const axes: Axis[] = [
  "efficiency",
  "value",
  "defense",
  "placement",
  "option_value",
];

function axisInScope(axis: Axis, frame: ComparisonAnalysisFrame): boolean {
  if (frame.scope.kind === "single_axis") return axis === frame.scope.axis;
  if (frame.scope.kind === "flat_discard") {
    return axis === "efficiency" || axis === "value";
  }
  return true;
}

function errorDetail(_error: unknown): string {
  return "fact engine request failed";
}

function blockedProjectionLedger(
  candidate: StructuredComparisonCandidate,
  projection: Exclude<CandidateProjection, { status: "ready" }>,
  frame: ComparisonAnalysisFrame,
): CandidateFactorLedger {
  return CandidateFactorLedgerSchema.parse({
    actionRef: candidate.actionRef,
    projectedStateRef: `unavailable:${candidate.actionRef}`,
    axes: axes.map((axis) => ({
      axis,
      status: axisInScope(axis, frame)
        ? projection.status
        : "skipped_out_of_scope",
      facts: [],
    })),
    diagnostics: [projection.diagnostic],
  });
}

async function analyzeReadyCandidate(
  candidate: StructuredComparisonCandidate,
  projection: Extract<CandidateProjection, { status: "ready" }>,
  frame: ComparisonAnalysisFrame,
  facts: KnownGameFacts,
  engine: MahjongFactEnginePort,
): Promise<{
  ledger: CandidateFactorLedger;
  diagnostics: StructuredPipelineDiagnostic[];
}> {
  const diagnostics: StructuredPipelineDiagnostic[] = [];
  let hand13Outcome: CandidateLedgerBuildInput["hand13Outcome"];
  let completedHandOutcome: CandidateLedgerBuildInput["completedHandOutcome"];

  if (projection.hand13Request !== undefined) {
    try {
      hand13Outcome = {
        status: "calculated",
        result: await engine.analyzeHand13(projection.hand13Request),
      };
    } catch (error) {
      const detail = errorDetail(error);
      hand13Outcome = { status: "blocked_engine_failure", diagnostic: detail };
      diagnostics.push({
        actionRef: candidate.actionRef,
        stage: "hand13",
        status: "blocked_engine_failure",
        detail,
      });
    }
  }

  if (projection.completedHandRequest !== undefined) {
    try {
      completedHandOutcome = {
        status: "calculated",
        result: await engine.analyzeCompletedHand(projection.completedHandRequest),
      };
    } catch (error) {
      const detail = errorDetail(error);
      completedHandOutcome = { status: "blocked_engine_failure", diagnostic: detail };
      diagnostics.push({
        actionRef: candidate.actionRef,
        stage: "completed_hand",
        status: "blocked_engine_failure",
        detail,
      });
    }
  }

  const threatRiskOutcomes: ThreatRiskEngineOutcome[] = await Promise.all(
    projection.threatRiskRequests.map(async (request) => {
      try {
        return {
          status: "calculated" as const,
          result: await engine.analyzeThreatRisk(request),
        };
      } catch (error) {
        const detail = errorDetail(error);
        diagnostics.push({
          actionRef: candidate.actionRef,
          stage: "threat_risk",
          status: "blocked_engine_failure",
          threatActor: request.threatActor,
          detail,
        });
        return {
          status: "blocked_engine_failure" as const,
          threatActor: request.threatActor,
          diagnostic: detail,
        };
      }
    }),
  );

  const input: CandidateLedgerBuildInput = {
    candidate,
    facts,
    scope: frame.scope,
    projection,
    threatRiskOutcomes,
    ...(hand13Outcome === undefined ? {} : { hand13Outcome }),
    ...(completedHandOutcome === undefined ? {} : { completedHandOutcome }),
  };
  return { ledger: buildCandidateLedger(input), diagnostics };
}

function sameDecisionWindow(
  comparisonSet: StructuredComparisonSet,
  facts: KnownGameFacts,
): boolean {
  return JSON.stringify(comparisonSet.decisionWindow) ===
    JSON.stringify(facts.decisionWindow);
}

export async function runStructuredFactorPipeline(
  rawInput: StructuredFactorPipelineInput,
): Promise<StructuredFactorPipelineResult> {
  const frame = ComparisonAnalysisFrameSchema.parse(rawInput.frame);
  const comparisonSet = StructuredComparisonSetSchema.parse(rawInput.comparisonSet);
  const facts = KnownGameFactsSchema.parse(rawInput.facts);
  if (!sameDecisionWindow(comparisonSet, facts)) {
    throw new Error("comparison decision window does not match known game facts");
  }

  const analyzed = await Promise.all(comparisonSet.candidates.map(async (candidate) => {
    const projection = projectCandidate(candidate, facts);
    if (projection.status !== "ready") {
      return {
        ledger: blockedProjectionLedger(candidate, projection, frame),
        diagnostics: [{
          actionRef: candidate.actionRef,
          stage: "projection" as const,
          status: projection.status,
          detail: projection.diagnostic,
        }],
      };
    }
    return analyzeReadyCandidate(candidate, projection, frame, facts, rawInput.engine);
  }));

  const ledgers = analyzed.map((entry) => entry.ledger)
    .sort((left, right) => left.actionRef.localeCompare(right.actionRef));
  const differences = buildFactorDifferences(ledgers);
  return {
    ledgers,
    differences,
    deterministicPreference: resolveDeterministicPreference(frame, differences),
    diagnostics: analyzed.flatMap((entry) => entry.diagnostics)
      .sort((left, right) =>
        `${left.actionRef}:${left.stage}:${left.threatActor ?? -1}`.localeCompare(
          `${right.actionRef}:${right.stage}:${right.threatActor ?? -1}`,
        )
      ),
  };
}
