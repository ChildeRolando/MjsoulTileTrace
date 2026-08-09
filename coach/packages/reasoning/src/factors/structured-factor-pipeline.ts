import {
  CandidateFactorLedgerSchema,
  ComparisonAnalysisFrameSchema,
  KnownGameFactsSchema,
  ResponseFuritenAnalysisV2Schema,
  StructuredComparisonSetSchema,
  type Axis,
  type CandidateFactorLedger,
  type ComparisonAnalysisFrame,
  type DeterministicPreference,
  type KnownGameFacts,
  type ResponseFuritenAnalysisV2,
  type StructuredComparisonCandidate,
  type StructuredComparisonSet,
} from "@riichi-coach/contracts";
import type { HandStructureFactEnginePort } from "../fact-engine/port.js";
import {
  validateCompletedHandResult,
  validateHand13Result,
  validateHandStructureResult,
  validateThreatRiskResult,
} from
  "../fact-engine/hand-structure-validator.js";
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
import { mergeHandStructureFuriten } from "./furiten-merger.js";
import {
  blockedHandStructureEfficiencyFacts,
  mapMergedHandFuritenToEfficiencyFacts,
} from "./hand-structure-ledger.js";

export interface StructuredFactorPipelineInput {
  frame: ComparisonAnalysisFrame;
  comparisonSet: StructuredComparisonSet;
  facts: KnownGameFacts;
  responseFuriten: ResponseFuritenAnalysisV2;
  engine: HandStructureFactEnginePort;
}

export interface StructuredPipelineDiagnostic {
  actionRef: string;
  stage: "projection" | "hand13" | "hand_structure" | "completed_hand" |
    "threat_risk";
  status: "blocked_missing_facts" | "unsupported_action_in_slice" |
    "blocked_engine_failure";
  detail: string;
  threatActor?: number;
}

export interface StructuredFactorPipelineResult {
  analysisMode: "v2" | "legacy_v1_fallback" | "v2_mixed_unresolved";
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
  responseFuriten: ResponseFuritenAnalysisV2,
  engine: HandStructureFactEnginePort,
): Promise<{
  ledger: CandidateFactorLedger;
  diagnostics: StructuredPipelineDiagnostic[];
  v2Status: "calculated" | "failed" | "not_applicable";
}> {
  const diagnostics: StructuredPipelineDiagnostic[] = [];
  let hand13Outcome: CandidateLedgerBuildInput["hand13Outcome"];
  let completedHandOutcome: CandidateLedgerBuildInput["completedHandOutcome"];
  let handStructureOutcome: CandidateLedgerBuildInput["handStructureOutcome"];
  let v2Status: "calculated" | "failed" | "not_applicable" = "not_applicable";

  if (projection.hand13Request !== undefined) {
    try {
      hand13Outcome = {
        status: "calculated",
        result: validateHand13Result(
          projection.hand13Request,
          await engine.analyzeHand13(projection.hand13Request),
        ),
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
        result: validateCompletedHandResult(
          projection.completedHandRequest,
          await engine.analyzeCompletedHand(projection.completedHandRequest),
        ),
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

  if (projection.handStructureRequest !== undefined) {
    v2Status = "failed";
    try {
      const hand = validateHandStructureResult(
        projection.handStructureRequest,
        await engine.analyzeHandStructure(projection.handStructureRequest),
      );
      if (projection.candidateDiscard === undefined) {
        throw new Error("candidate discard evidence is missing");
      }
      const merged = mergeHandStructureFuriten({
        source: "candidate_discard",
        factSetId: facts.factSetId,
        decisionEventRef: facts.decisionEventRef,
        selfActor: facts.actor,
        hand,
        selfRiver: facts.furitenSelfRiver ?? [],
        selfRiverComplete: facts.furitenSelfRiver !== undefined,
        candidateDiscard: projection.candidateDiscard,
        response: responseFuriten,
      });
      handStructureOutcome = {
        status: "calculated",
        mapping: mapMergedHandFuritenToEfficiencyFacts(merged),
      };
      v2Status = "calculated";
    } catch {
      const detail = errorDetail(null);
      handStructureOutcome = {
        status: "blocked_engine_failure",
        mapping: blockedHandStructureEfficiencyFacts(
          "blocked_engine_failure",
          [
            projection.handStructureRequest.requestId,
            projection.handStructureRequest.stateHash,
            projection.handStructureRequest.actionRef,
            ...projection.localEvidenceIds,
          ],
        ),
      };
      diagnostics.push({
        actionRef: candidate.actionRef,
        stage: "hand_structure",
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
          result: validateThreatRiskResult(
            request,
            await engine.analyzeThreatRisk(request),
          ),
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
    ...(handStructureOutcome === undefined ? {} : { handStructureOutcome }),
  };
  return { ledger: buildCandidateLedger(input), diagnostics, v2Status };
}

function sameDecisionWindow(
  comparisonSet: StructuredComparisonSet,
  facts: KnownGameFacts,
): boolean {
  return JSON.stringify(comparisonSet.decisionWindow) ===
    JSON.stringify(facts.decisionWindow);
}

function validateResponseScene(
  response: ResponseFuritenAnalysisV2,
  facts: KnownGameFacts,
): void {
  if (
    response.binding.factSetId !== facts.factSetId ||
    response.binding.decisionEventRef !== facts.decisionEventRef ||
    response.binding.selfActor !== facts.actor
  ) throw new Error("response_furiten_scene_mismatch");
}

function withoutBlockedV2Facts(
  ledgers: readonly CandidateFactorLedger[],
): CandidateFactorLedger[] {
  return ledgers.map((ledger) => CandidateFactorLedgerSchema.parse({
    ...ledger,
    axes: ledger.axes.map((axis) => ({
      ...axis,
      facts: axis.facts.filter((fact) =>
        !fact.factorKey.startsWith("efficiency.v2.")
      ),
    })),
  }));
}

export async function runStructuredFactorPipeline(
  rawInput: StructuredFactorPipelineInput,
): Promise<StructuredFactorPipelineResult> {
  const frame = ComparisonAnalysisFrameSchema.parse(rawInput.frame);
  const comparisonSet = StructuredComparisonSetSchema.parse(rawInput.comparisonSet);
  const facts = KnownGameFactsSchema.parse(rawInput.facts);
  const responseFuriten = ResponseFuritenAnalysisV2Schema.parse(
    rawInput.responseFuriten,
  );
  validateResponseScene(responseFuriten, facts);
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
        v2Status: "not_applicable" as const,
      };
    }
    return analyzeReadyCandidate(
      candidate,
      projection,
      frame,
      facts,
      responseFuriten,
      rawInput.engine,
    );
  }));

  const ledgers = analyzed.map((entry) => entry.ledger)
    .sort((left, right) => left.actionRef.localeCompare(right.actionRef));
  const differences = buildFactorDifferences(ledgers);
  const comparableV2Statuses = analyzed
    .map((entry) => entry.v2Status)
    .filter((status) => status !== "not_applicable");
  const mixedV2Availability = comparableV2Statuses.includes("calculated") &&
    comparableV2Statuses.includes("failed");
  const allV2Failed = comparableV2Statuses.length > 0 &&
    comparableV2Statuses.every((status) => status === "failed");
  const preferenceDifferences = allV2Failed
    ? buildFactorDifferences(withoutBlockedV2Facts(ledgers))
    : differences;
  const analysisMode = mixedV2Availability
    ? "v2_mixed_unresolved" as const
    : allV2Failed
      ? "legacy_v1_fallback" as const
      : "v2" as const;
  return {
    analysisMode,
    ledgers,
    differences: preferenceDifferences,
    deterministicPreference: mixedV2Availability
      ? null
      : resolveDeterministicPreference(frame, preferenceDifferences),
    diagnostics: analyzed.flatMap((entry) => entry.diagnostics)
      .sort((left, right) =>
        `${left.actionRef}:${left.stage}:${left.threatActor ?? -1}`.localeCompare(
          `${right.actionRef}:${right.stage}:${right.threatActor ?? -1}`,
        )
      ),
  };
}
