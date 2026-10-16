import { LabSampleSchema, type LabConstructRequest, type LabConstructResult, type LabSample } from "@riichi-coach/contracts";
import { createLibriichiRuleProjector, bindLibriichiRuleResult } from "@riichi-coach/reasoning";
import { canonicalFromConstruction, pendingDecision, candidateFacts, featureVector, observedFamily } from "./projection.js";
import { sampleIdentity } from "./batch.js";
import { digest } from "./config.js";
import type { LabWorker } from "./runtime.js";

export async function constructPairSample(input: {
  worker: LabWorker; request: LabConstructRequest; configHash: string;
  attempt: number; round: number; result?: LabConstructResult;
}): Promise<{ sample?: LabSample; result: LabConstructResult; reason?: string }> {
  const { worker, request } = input;
  let stage = performance.now();
  const result = input.result ?? await worker.constructor.construct(request);
  if (result.status !== "ok") return { result, reason: result.code };
  const constructionMs = performance.now() - stage;
  stage = performance.now();
  const stream = canonicalFromConstruction(result.events, request.selfActor), decision = pendingDecision(stream);
  const ruleRequest = createLibriichiRuleProjector(stream, worker.mortal.ruleIdentity)(decision);
  const ruleResult = await worker.mortal.queryRules(ruleRequest);
  if (ruleResult.status !== "ok") throw new Error(ruleResult.status === "error" ? ruleResult.code : "pair_rules_not_action");
  const actions = bindLibriichiRuleResult({ request: ruleRequest, response: ruleResult, decision }).actions;
  const rulesMs = performance.now() - stage;
  stage = performance.now();
  const candidates = await candidateFacts(decision, actions, worker.engine), features = featureVector(decision, candidates);
  const data = { stream, ruleResult, factIdentity: await worker.engine.identity(), candidates, features, hypotheses: [] };
  const sample = LabSampleSchema.parse({
    schemaVersion: "question-lab-sample/v1", sampleId: sampleIdentity(data), factEvidenceSha256: digest(candidates.map(c => c.result)),
    configHash: input.configHash, groupId: "0".repeat(64), attempt: input.attempt, variant: 0, round: input.round,
    split: "train", changed: [], constructionId: request.requestId, ...data,
    decisionRef: decision.decisionEventRef, ruleRequest,
    timings: { constructionMs, rulesMs, factsMs: performance.now() - stage },
    naturalness: "constructed_legal_not_frequency_calibrated",
  });
  sample.groupId = observedFamily(sample);
  return { sample, result };
}
