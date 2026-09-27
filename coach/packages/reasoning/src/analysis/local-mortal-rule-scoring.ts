import { createHash } from "node:crypto";
import {
  LOCAL_MORTAL_SCORING_PROTOCOL_VERSION, LocalMortalScoringRequestSchema, LocalMortalScoringResponseSchema,
  canonicalActionRef, libriichiRuleCanonicalJson,
  type CanonicalEventStream, type LibriichiRuleRequest, type LibriichiRuleSuccess,
  type LocalMortalScoringRequest, type LocalMortalScoringResponse, type ManagedMortalRuntimeIdentity,
} from "@riichi-coach/contracts";
import type { ReplayedDecision } from "../replay/stream-replayer.js";
import { bindLibriichiRuleResult, createLibriichiRuleProjector } from "./libriichi-rule-projection.js";
import { buildLocalMortalReportEntry, stableMortalSoftmax } from "./local-mortal-report.js";
import type { MortalSourceAction } from "@riichi-coach/mortal-source";

const digest = (value: unknown) => createHash("sha256").update(libriichiRuleCanonicalJson(value)).digest("hex");
const key = libriichiRuleCanonicalJson;

/** Actual choice is deliberately absent: the identical state gets identical scores. */
export function projectLocalMortalRuleScoring(input: {
  stream: CanonicalEventStream; decision: ReplayedDecision; identity: ManagedMortalRuntimeIdentity;
  ruleRequest: LibriichiRuleRequest; ruleResult: LibriichiRuleSuccess;
}): LocalMortalScoringRequest {
  const identity = input.ruleRequest.identity;
  if (identity.revision !== input.identity.runtimeRevision || identity.nativeArtifactSha256 !== input.identity.nativeArtifactSha256 ||
      identity.wrapperSha256 !== input.identity.runtimeArtifactSha256) throw new Error("mortal_runtime_identity_mismatch");
  const fresh = createLibriichiRuleProjector(input.stream, identity)(input.decision);
  if (key(fresh) !== key(input.ruleRequest)) throw new Error("mortal_protocol_invalid");
  const bound = bindLibriichiRuleResult({ request: fresh, response: input.ruleResult, decision: input.decision });
  if (bound.response.status !== "ok" || bound.actions.length < 2) throw new Error("mortal_source_row_not_expected");
  const content = { protocolVersion: LOCAL_MORTAL_SCORING_PROTOCOL_VERSION, operation: "score_actions" as const,
    identity: input.identity, ruleRequest: fresh, ruleResult: input.ruleResult };
  return LocalMortalScoringRequestSchema.parse({ ...content, requestId: digest(content) });
}

/** Result consumption rechecks binding; a stored response never bypasses the boundary. */
export function bindLocalMortalRuleScores(input: {
  request: LocalMortalScoringRequest; response: LocalMortalScoringResponse; decision: ReplayedDecision;
}) {
  const request = LocalMortalScoringRequestSchema.parse(input.request);
  const response = LocalMortalScoringResponseSchema.parse(input.response);
  const { requestId, ...content } = request;
  if (requestId !== digest(content) || response.requestId !== requestId) throw new Error("mortal_protocol_invalid");
  const bound = bindLibriichiRuleResult({ request: request.ruleRequest, response: request.ruleResult, decision: input.decision });
  if (response.status === "error") throw new Error(response.code);
  if (key(response.identity) !== key(request.identity) || response.ruleResultId !== request.ruleResult.resultId) {
    throw new Error("mortal_runtime_identity_mismatch");
  }
  const byKey = new Map(bound.actions.map(row => [key(row.runtimeAction), row]));
  const keys = response.candidates.map(row => key(row.runtimeAction));
  if (new Set(keys).size !== keys.length || keys.length !== bound.actions.length) throw new Error("mortal_candidate_mismatch");
  const rows = response.candidates.map(score => {
    const row = byKey.get(key(score.runtimeAction));
    if (row === undefined || score.ruleActionId !== digest({ runtimeAction: row.runtimeAction, mjaiActionJson: row.mjaiActionJson })) {
      throw new Error("mortal_candidate_mismatch");
    }
    return { ...row, ...score };
  });
  const kans = rows.filter(row => row.runtimeAction.index === 42);
  const multipleKans = kans.length > 1;
  const preferred = rows.find(row => key(row.runtimeAction) === key(response.preferredRuntimeAction));
  if (preferred === undefined || preferred.qValue !== Math.max(...rows.map(row => row.qValue)) ||
      rows.some(row => (multipleKans && row.runtimeAction.index === 42) !== (row.kanSelectionQValue !== undefined)) ||
      (multipleKans && (kans.some(row => row.qValue !== kans[0]!.qValue) ||
        (preferred.runtimeAction.index === 42 && preferred.kanSelectionQValue !== Math.max(...kans.map(row => row.kanSelectionQValue!)))))) {
    throw new Error("mortal_candidate_mismatch");
  }
  return { request, response, actions: rows, preferred };
}

/** Choice correspondence is checked after the complete set exists; it never changes that set. */
export function actualLibriichiActionRef(decision: Pick<ReplayedDecision, "actualAction">, actions: readonly { actionRef: string; action: { kind: string } }[]): string {
  const actual = decision.actualAction;
  if (actual === null) throw new Error("mortal_actual_action_mismatch");
  const exact = canonicalActionRef(actual);
  const matches = actions.filter(row => row.actionRef === exact ||
    (actual.kind === "riichi_discard" && row.action.kind === "declare_riichi"));
  if (matches.length !== 1) throw new Error("mortal_actual_action_mismatch");
  return matches[0]!.actionRef;
}

export function localMortalRuleScoresToReportEntry(input: Parameters<typeof bindLocalMortalRuleScores>[0]) {
  const bound = bindLocalMortalRuleScores(input);
  const actualRef = actualLibriichiActionRef(input.decision, bound.actions);
  const kans = bound.actions.filter(row => row.kanSelectionQValue !== undefined);
  const bestKanQ = kans.length > 0 ? Math.max(...kans.map(row => row.kanSelectionQValue!)) : 0;
  const probabilities = stableMortalSoftmax(bound.actions.map(row => row.qValue +
    (row.kanSelectionQValue === undefined ? 0 : row.kanSelectionQValue - bestKanQ)));
  const { roundOrdinal: _round, riichiPhase: _phase, ...decisionIdentity } = bound.request.ruleRequest.decision;
  return buildLocalMortalReportEntry({
    decision: input.decision, decisionIdentity,
    details: bound.actions.map((row, i) => ({ action: JSON.parse(row.mjaiActionJson) as MortalSourceAction,
      probability: probabilities[i]!, qValue: row.qValue })),
    preferredIndex: bound.actions.indexOf(bound.preferred), actualIndex: bound.actions.findIndex(row => row.actionRef === actualRef),
  });
}
