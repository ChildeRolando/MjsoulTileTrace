import { createHash } from "node:crypto";
import {
  ArenaScoringCaseInputSchema,
  ArenaBatchScoreSchema,
  LibriichiRuleRequestSchema,
  LibriichiRuleResponseSchema,
  LocalMortalScoringRequestSchema,
  LOCAL_MORTAL_SCORING_PROTOCOL_VERSION,
  libriichiRuleCanonicalJson,
  type ArenaBatchScore,
  type ArenaScoringCaseInput,
  type ArenaToolBinding,
  type ArenaBlindObservation,
  type ManagedMortalRuntimeIdentity,
  type LocalMortalScoringRequest,
} from "@riichi-coach/contracts";
import { bindLibriichiRuleResult, type ReplayedDecision } from "@riichi-coach/reasoning";
import { createArenaBlindRuleRequest } from "./blind-discard-arena.js";

const digest = (value: unknown) => createHash("sha256").update(libriichiRuleCanonicalJson(value)).digest("hex");

/** Project a post-selection Mortal label request from the exact blinded native result screened by Arena. */
export function projectArenaLocalMortalRuleScoring(input: {
  identity: ManagedMortalRuntimeIdentity;
  decision: ReplayedDecision;
  ruleRequest: unknown;
  ruleResult: unknown;
}): LocalMortalScoringRequest {
  const ruleRequest = LibriichiRuleRequestSchema.parse(input.ruleRequest);
  const ruleResult = LibriichiRuleResponseSchema.parse(input.ruleResult);
  if (libriichiRuleCanonicalJson(createArenaBlindRuleRequest(ruleRequest)) !== libriichiRuleCanonicalJson(ruleRequest)) {
    throw new Error("arena_mortal_rule_request_not_blinded");
  }
  const bound = bindLibriichiRuleResult({ request: ruleRequest, response: ruleResult, decision: input.decision });
  if (bound.response.status !== "ok" || bound.actions.length < 2) {
    throw new Error("arena_mortal_rule_result_not_scorable");
  }
  const content = {
    protocolVersion: LOCAL_MORTAL_SCORING_PROTOCOL_VERSION,
    operation: "score_actions" as const,
    identity: input.identity,
    ruleRequest,
    ruleResult: bound.response,
  };
  return LocalMortalScoringRequestSchema.parse({ ...content, requestId: digest(content) });
}

function resolveCandidate(actionRef: string, candidates: ArenaScoringCaseInput["candidates"]): number {
  return candidates.findIndex((candidate) => candidate.physicalRealizations.some((realization) => realization.actionRef === actionRef));
}

function observedAttemptStatus(entry: ArenaScoringCaseInput): ArenaScoringCaseInput["attempt"]["status"] {
  if (entry.attempt.status !== "submitted") return entry.attempt.status;
  const submission = entry.attempt.submission;
  if (submission.caseRef !== entry.caseRef || !entry.candidates.some((candidate) => candidate.actionRef === submission.actionRef) ||
      (submission.mainAlternative !== null && !entry.candidates.some((candidate) => candidate.actionRef === submission.mainAlternative!.actionRef))) {
    return "invalid_submission";
  }
  return "submitted";
}

function emptyFailureCounts(): ArenaBatchScore["failures"] {
  return {
    invalidSubmission: 0,
    missingSubmission: 0,
    providerUnavailable: 0,
    providerError: 0,
    timeout: 0,
    cancelled: 0,
    toolFailure: 0,
    budgetExhausted: 0,
    labelUnavailable: 0,
    labelBindingFailure: 0,
  };
}

function rate(numerator: number, denominator: number): ArenaBatchScore["primaryMatchRate"] {
  return denominator === 0
    ? { status: "not_available", numerator: 0, denominator: 0, value: null }
    : { status: "available", numerator, denominator, value: numerator / denominator };
}

/** Offline grader. Every input row is an included case and remains in the primary denominator. */
export function scoreArenaBatch(raw: unknown): ArenaBatchScore {
  if (!Array.isArray(raw)) throw new Error("arena_scoring_input_invalid");
  const parsed = raw.map((entry) => {
    const result = ArenaScoringCaseInputSchema.safeParse(entry);
    if (!result.success) throw new Error("arena_scoring_input_invalid");
    return result.data;
  });
  if (new Set(parsed.map((entry) => entry.caseRef)).size !== parsed.length) {
    throw new Error("arena_scoring_input_invalid");
  }

  const failures = emptyFailureCounts();
  const cases: ArenaBatchScore["cases"][number][] = [];
  let matchedCaseCount = 0;
  let labelAvailableCaseCount = 0;
  let conditionalNumerator = 0;
  let conditionalDenominator = 0;

  for (const entry of parsed) {
    const attemptStatus = observedAttemptStatus(entry);
    if (attemptStatus !== "submitted") {
      switch (attemptStatus) {
        case "invalid_submission": failures.invalidSubmission += 1; break;
        case "missing_submission": failures.missingSubmission += 1; break;
        case "provider_unavailable": failures.providerUnavailable += 1; break;
        case "provider_error": failures.providerError += 1; break;
        case "timeout": failures.timeout += 1; break;
        case "cancelled": failures.cancelled += 1; break;
        case "tool_failure": failures.toolFailure += 1; break;
        case "budget_exhausted": failures.budgetExhausted += 1; break;
      }
    }

    let labelCandidate = -1;
    let labelReason: string | null = null;
    if (entry.reference.status === "unavailable") {
      failures.labelUnavailable += 1;
      labelReason = entry.reference.reason;
    } else if (entry.reference.status === "binding_failure") {
      failures.labelBindingFailure += 1;
      labelReason = entry.reference.reason;
    } else if (entry.reference.label.caseRef !== entry.caseRef ||
        (labelCandidate = resolveCandidate(entry.reference.label.actionRef, entry.candidates)) < 0) {
      failures.labelBindingFailure += 1;
      labelReason = "reference_not_bound_to_case_candidates";
      labelCandidate = -1;
    } else {
      labelAvailableCaseCount += 1;
    }

    if (attemptStatus !== "submitted") {
      cases.push({ caseRef: entry.caseRef, status: "unscorable", reason: attemptStatus });
      continue;
    }
    if (entry.attempt.status !== "submitted") throw new Error("arena_scoring_input_invalid");
    if (labelCandidate < 0) {
      cases.push({ caseRef: entry.caseRef, status: "unscorable", reason: labelReason });
      continue;
    }

    const submissionCandidate = resolveCandidate(entry.attempt.submission.actionRef, entry.candidates);
    if (submissionCandidate < 0) {
      // `submitted` may be malformed only through a cross-case or non-offered action.
      failures.invalidSubmission += 1;
      cases.push({ caseRef: entry.caseRef, status: "unscorable", reason: "invalid_submission" });
      continue;
    }
    conditionalDenominator += 1;
    const matched = submissionCandidate === labelCandidate;
    if (matched) {
      matchedCaseCount += 1;
      conditionalNumerator += 1;
      cases.push({ caseRef: entry.caseRef, status: "matched", reason: null });
    } else {
      cases.push({ caseRef: entry.caseRef, status: "not_matched", reason: null });
    }
  }

  const includedCaseCount = parsed.length;
  return ArenaBatchScoreSchema.parse({
    schemaVersion: "blind-discard-arena-batch-score/v1",
    includedCaseCount,
    matchedCaseCount,
    unmatchedCaseCount: includedCaseCount - matchedCaseCount,
    labelAvailableCaseCount,
    primaryMatchRate: rate(matchedCaseCount, includedCaseCount),
    conditionalMatchRate: rate(conditionalNumerator, conditionalDenominator),
    failures,
    cases,
  });
}

/** Freeze a scorer input from the selected case, private binding, label, and final attempt. */
export function createArenaScoringCaseInput(input: {
  readonly observation: ArenaBlindObservation;
  readonly toolBinding: ArenaToolBinding;
  readonly reference: ArenaScoringCaseInput["reference"];
  readonly attempt: ArenaScoringCaseInput["attempt"];
}): ArenaScoringCaseInput {
  if (input.observation.caseRef !== input.toolBinding.caseRef) {
    throw new Error("arena_scoring_case_binding_mismatch");
  }
  const reference = input.reference.status === "available" && input.reference.label.caseRef !== input.observation.caseRef
    ? { status: "binding_failure" as const, reason: "candidate_mismatch" as const }
    : input.reference;
  const attempt = input.attempt.status === "submitted" && input.attempt.submission.caseRef !== input.observation.caseRef
    ? { status: "invalid_submission" as const }
    : input.attempt;
  return ArenaScoringCaseInputSchema.parse({
    caseRef: input.observation.caseRef,
    candidates: input.toolBinding.candidates.map((candidate) => ({
      actionRef: candidate.actionRef,
      action: candidate.action,
      physicalRealizations: candidate.physicalRealizations,
    })),
    reference,
    attempt,
  });
}
