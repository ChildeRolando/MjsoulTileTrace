import {
  KnownActionFactsSchema, libriichiRuleCanonicalJson, parseCanonicalEventRef,
  type LibriichiRuleResponse, type StructuredAnalysisPackage, type DecisionAnalysis,
} from "@riichi-coach/contracts";
import { deriveDecisionId } from "../analysis/package-identity.js";
import { normalizeLibriichiRuleActions, validateLibriichiRuleBinding } from "../analysis/libriichi-rule-projection.js";
import { actualLibriichiActionRef } from "../analysis/local-mortal-rule-scoring.js";

const same = (a: unknown,b: unknown) => libriichiRuleCanonicalJson(a) === libriichiRuleCanonicalJson(b);
function reject(detail: string): never { throw new Error(`m6c_validator_rule_evidence:${detail}`); }

/** Validate persisted native provenance and its consumers without a model,
 * helper, native process or second legal-action solver. Replaying the native
 * rules remains a separate runtime acceptance check, not a hash guarantee. */
export function validateLibriichiPackageEvidence(pkg: StructuredAnalysisPackage): void {
  const evidence = pkg.legalActionEvidence;
  if (evidence === undefined) return; // Strict v1 schema disallows native proofs.
  if (!same(evidence.identity,pkg.componentVersions.legalActionRules)) reject("identity");
  const model = pkg.componentVersions.mortalSourceModel.evidenceSource;
  if (model?.kind === "managed_local_runtime" && (
    model.identity.runtimeRevision !== evidence.identity.revision ||
    model.identity.nativeArtifactSha256 !== evidence.identity.nativeArtifactSha256 ||
    model.identity.runtimeArtifactSha256 !== evidence.identity.wrapperSha256
  )) reject("model_native_identity");
  const decisions = new Map<string,DecisionAnalysis>(pkg.decisions.map(decision=>[decision.decisionId,decision]));
  const seen = new Set<string>();
  let canonicalIdentity: string | undefined;
  for (const row of evidence.results) {
    if (seen.has(row.decisionId)) reject("duplicate_boundary");
    seen.add(row.decisionId);
    const decision = decisions.get(row.decisionId);
    const request = row.request;
    if (request === null) {
      if (row.response.status !== "error" || "protocolVersion" in row.response || decision === undefined ||
          decision.outcome !== "analysis_blocked" || decision.analysisProvider.reason !== "legal_actions_unproven" ||
          decision.analysisProvider.singleCandidateProof != null) reject("unproven_boundary");
      continue;
    }
    if (!same(request.identity,evidence.identity)) reject("request_identity");
    if (canonicalIdentity !== undefined && request.canonicalStreamIdentity !== canonicalIdentity) reject("canonical_identity");
    canonicalIdentity = request.canonicalStreamIdentity;
    const context = request.decision;
    const ref = parseCanonicalEventRef(context.triggerEventRef);
    if (ref?.gameId !== pkg.record.recordId || ref.position.roundOrdinal !== context.roundOrdinal || context.selfActor !== pkg.record.selfActor ||
        deriveDecisionId({recordId:pkg.record.recordId,selfActor:context.selfActor,surface:context.surface,
          windowKind:context.windowKind,triggerEventRef:context.triggerEventRef}) !== row.decisionId) reject("boundary_identity");
    if (!("protocolVersion" in row.response)) reject("response_binding");
    const {response} = validateLibriichiRuleBinding(request,row.response as LibriichiRuleResponse);
    if (decision !== undefined && (decision.knownGameFacts.decisionEventRef !== context.triggerEventRef ||
        decision.knownGameFacts.actor !== context.selfActor || decision.surface !== context.surface ||
        decision.roundOrdinal !== context.roundOrdinal || decision.knownGameFacts.decisionWindow.kind !== context.windowKind ||
        decision.knownGameFacts.selfRiichi !== (context.riichiPhase !== "none"))) reject("decision_context");
    if (response.status === "non_action") {
      if (decision !== undefined && (decision.outcome !== "binding_mismatch" ||
          decision.analysisProvider.singleCandidateProof != null ||
          !["mortal_actual_mismatch","unexpected_source_row_present"].includes(decision.analysisProvider.reason ?? ""))) reject("non_action_verdict");
      continue;
    }
    if (decision === undefined) reject("decision_missing");
    const facts = decision.knownGameFacts;
    if (response.status === "error") {
      if (decision.outcome !== "analysis_blocked" || decision.analysisProvider.reason !== "legal_actions_unproven" ||
          decision.analysisProvider.singleCandidateProof != null) reject("failed_rule_verdict");
      continue;
    }
    const actions = normalizeLibriichiRuleActions(request,response,KnownActionFactsSchema.parse({
      decisionWindow:facts.decisionWindow,concealedTiles:facts.concealedTiles,currentDraw:facts.currentDraw,melds:facts.melds,
    }));
    let actualRef: string | null = null;
    try { actualRef = actualLibriichiActionRef({actualAction:decision.normalizedDecisionContext.actualAction},actions); }
    catch { /* The package may faithfully record an actual-action mismatch. */ }
    const proof = decision.analysisProvider.singleCandidateProof;
    if (proof != null) {
      if (proof.shape !== "libriichi_single_candidate" || actions.length !== 1 || actualRef === null ||
          proof.actionRef !== actualRef || proof.ruleRequestId !== request.requestId || proof.ruleResultId !== response.resultId) reject("singleton_binding");
    }
    if (actualRef === null && (decision.outcome !== "binding_mismatch" || decision.analysisProvider.reason !== "mortal_actual_mismatch")) reject("actual_binding");
    if (actions.length === 1 && actualRef !== null && (proof == null ||
        (decision.outcome !== "source_row_not_expected" &&
          !(decision.outcome === "binding_mismatch" && decision.analysisProvider.reason === "unexpected_source_row_present")))) reject("singleton_verdict");
    if (actions.length > 1 && (proof != null || decision.outcome === "source_row_not_expected")) reject("multiple_actions_exempted");
    if (decision.outcome === "analysis_blocked" && decision.analysisProvider.reason === "legal_actions_unproven") reject("success_marked_unproven");
    if (decision.outcome === "analysis_ready") {
      const refs = new Set(actions.map(action=>action.actionRef));
      const scores = decision.modelEvaluation.candidates;
      if (refs.size !== scores.length || scores.some(score=>!refs.has(score.actionRef))) reject("scored_actions");
    }
  }
  if (pkg.decisions.some(decision=>!seen.has(decision.decisionId))) reject("rule_result_missing");
}
