import {
  libriichiRuleCanonicalJson, LibriichiLocalFailureSchema,
  type CanonicalEventStream, type LibriichiRuleIdentity, type LibriichiRulePort, type LibriichiSingleCandidateProof,
  type LibriichiRuleRequest, type LibriichiRuleResponse, type LibriichiRuleSuccess,
} from "@riichi-coach/contracts";
import { replayCanonicalStream, scanCanonicalResponseBoundaries, type ReplayedDecision } from "../replay/stream-replayer.js";
import { bindLibriichiRuleResult, createLibriichiRuleProjector, type LibriichiBoundAction } from "./libriichi-rule-projection.js";
import { actualLibriichiActionRef } from "./local-mortal-rule-scoring.js";

export type LibriichiResolvedDecision = {
  readonly request: LibriichiRuleRequest;
  readonly response: LibriichiRuleResponse;
  readonly actions: readonly LibriichiBoundAction[];
} | {
  readonly request: null;
  readonly response: { readonly status: "error"; readonly code: "rules_input_incomplete" | "rules_runtime_failed" | "rules_action_mapping_invalid" };
  readonly actions: readonly [];
};

/** Query every given boundary before any report lookup; accumulate failures. */
export async function collectLibriichiRuleResults(input: {
  stream: CanonicalEventStream; decisions: readonly ReplayedDecision[];
  identity: LibriichiRuleIdentity; port: LibriichiRulePort;
  onProgress?: (counts: { completed: number; total: number }) => void;
}): Promise<ReadonlyMap<string, LibriichiResolvedDecision>> {
  const project = createLibriichiRuleProjector(input.stream, input.identity);
  const results = new Map<string, LibriichiResolvedDecision>();
  for (const decision of input.decisions) {
    input.onProgress?.({ completed: results.size, total: input.decisions.length });
    if (results.has(decision.decisionEventRef)) throw new Error("rules_duplicate_boundary");
    let request: LibriichiRuleRequest;
    try { request = project(decision); }
    catch { results.set(decision.decisionEventRef, { request:null, response:{status:"error",code:"rules_input_incomplete"}, actions:[] }); continue; }
    let response: LibriichiRuleResponse;
    try { response = await input.port.queryRules(request); }
    catch { results.set(decision.decisionEventRef, { request:null, response:{status:"error",code:"rules_runtime_failed"}, actions:[] }); continue; }
    try {
      const bound = bindLibriichiRuleResult({request,response,decision});
      results.set(decision.decisionEventRef, {request,...bound});
    } catch {
      results.set(decision.decisionEventRef, {request:null,response:{status:"error",code:"rules_action_mapping_invalid"},actions:[]});
    }
  }
  input.onProgress?.({ completed: results.size, total: input.decisions.length });
  return results;
}

/** Production census uses event boundaries, including native non-action results. */
export async function queryCanonicalLibriichiRules(input: {
  stream: CanonicalEventStream; identity: LibriichiRuleIdentity; port: LibriichiRulePort;
  onProgress?: (counts: { completed: number; total: number }) => void;
}) {
  const decisions = replayCanonicalStream(input.stream);
  const responseDecisions = scanCanonicalResponseBoundaries(input.stream);
  const rules = await collectLibriichiRuleResults({...input,decisions:[...decisions,...responseDecisions]});
  return {decisions,responseDecisions,rules};
}

/** Rebind a supplied result to current canonical input; never trust stored actions. */
export function rebindLibriichiDecision(input: {
  project: ReturnType<typeof createLibriichiRuleProjector>;
  decision: ReplayedDecision; result: LibriichiResolvedDecision;
}): LibriichiResolvedDecision {
  if (input.result.request === null) return {request:null,response:LibriichiLocalFailureSchema.parse(input.result.response),actions:[]};
  const request = input.project(input.decision);
  if (libriichiRuleCanonicalJson(request) !== libriichiRuleCanonicalJson(input.result.request)) throw new Error("rules_input_incomplete");
  return {request,...bindLibriichiRuleResult({request,response:input.result.response,decision:input.decision})};
}

export function successfulLibriichiResult(result: LibriichiResolvedDecision): LibriichiRuleSuccess | null {
  return result.request !== null && result.response.status === "ok" ? result.response : null;
}

/** Caller must first rebind the result to the canonical decision. */
export function libriichiSingleCandidateProof(
  decision: ReplayedDecision, result: LibriichiResolvedDecision,
): LibriichiSingleCandidateProof | null {
  const success = successfulLibriichiResult(result);
  if (success === null || result.actions.length !== 1) return null;
  const actionRef = actualLibriichiActionRef(decision, result.actions);
  return {shape:"libriichi_single_candidate",proofVersion:"libriichi-single-candidate/v1",candidateCount:1,
    ruleRequestId:success.requestId,ruleResultId:success.resultId,actionRef};
}
