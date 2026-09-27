import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  libriichiRuleCanonicalJson, LIBRIICHI_RULE_NORMALIZATION_VERSION,
  LibriichiSingleCandidateProofSchema, LegacySingleCandidateProofSchema,
  NATIVE_STRUCTURED_ANALYSIS_PACKAGE_SCHEMA_VERSION, MAHJONG_HELPER_COMMIT, FACT_ENGINE_ADAPTER_VERSION, FACT_ENGINE_PROTOCOL_VERSION,
  type LibriichiRuleIdentity, type LibriichiRuleRequest, type LibriichiRuleResponse,
  type Tile, type CanonicalGameEvent,
} from "@riichi-coach/contracts";
import { computeCanonicalGameFingerprint } from "@riichi-coach/mortal-source";
import { collectLibriichiRuleResults, queryCanonicalLibriichiRules } from "../src/analysis/libriichi-rule-collection.js";
import { runMortalFullGameReview, type MortalFullGameReviewResult } from "../src/analysis/mortal-full-game-review.js";
import { buildStructuredAnalysisPackage, type BuildStructuredAnalysisPackageInput } from "../src/analysis/structured-analysis-package-builder.js";
import { validateStructuredAnalysisPackage } from "../src/validate/structured-package-validator.js";
import { deriveSemanticContentHash, derivePackageId } from "../src/analysis/package-identity.js";
import { freezeDetailPolicy } from "../src/policy/detail-policy.js";
import { replayCanonicalStream, scanCanonicalResponseBoundaries, replayCanonicalResponseWindows } from "../src/replay/stream-replayer.js";
import { acceptedRiichiKanStream } from "./fixtures/accepted-riichi.js";
import { canonicalTile, canonicalStartEvents, canonicalStream } from "./fixtures/canonical-stream.js";
import type { HandStructureFactEnginePort } from "../src/fact-engine/port.js";

const digest = (value: unknown) => createHash("sha256").update(libriichiRuleCanonicalJson(value)).digest("hex");
const identity: LibriichiRuleIdentity = {implementation:"Equim-chan/Mortal/libriichi",revision:"0".repeat(40),
  nativeArtifactSha256:"1".repeat(64),wrapperSha256:"2".repeat(64),normalizationVersion:LIBRIICHI_RULE_NORMALIZATION_VERSION};
const hand = ["1m","1m","1m","2m","2m","2m","3m","3m","3m","4p","5p","6p","7z"].map(id=>canonicalTile(id as Tile["id"]));
function nativeResult(request: LibriichiRuleRequest, actions: {index:number;action:unknown}[] | null): LibriichiRuleResponse {
  const content = {protocolVersion:request.protocolVersion,requestId:request.requestId,identity:request.identity,
    ...(actions === null ? {status:"non_action" as const,reason:"native_cannot_act" as const}
      : {status:"ok" as const,actions:actions.map(row=>({runtimeAction:{index:row.index,variant:null},mjaiActionJson:JSON.stringify(row.action)}))})};
  return {...content,resultId:digest(content)};
}
const emptyReport = (stream: ReturnType<typeof canonicalStream>) => ({
  reportId:"native-rule-regression",adapterVersion:"mortal-source/2" as const,engine:"Mortal" as const,version:"1.5.10",
  modelTag:"fixture",playerId:0,gameFingerprint:computeCanonicalGameFingerprint(stream),kyokus:[],
});
function nativePackage(input: Pick<BuildStructuredAnalysisPackageInput,"stream"|"decisions"|"responseDecisions"> & {review:MortalFullGameReviewResult}) {
  if(input.review.status!=="coverage_ready") throw new Error("review failed");
  return buildStructuredAnalysisPackage({...input,review:input.review,
    componentVersions:{packageSchema:NATIVE_STRUCTURED_ANALYSIS_PACKAGE_SCHEMA_VERSION,legalActionRules:identity,
      canonicalReplay:"canonical-riichi-events/v2",factEngine:{engine:"mahjong-helper",upstreamCommit:MAHJONG_HELPER_COMMIT,
        adapterVersion:FACT_ENGINE_ADAPTER_VERSION,protocolVersion:FACT_ENGINE_PROTOCOL_VERSION},factorPipeline:"factor-pipeline/v1",
      mortalSourceModel:{identity:"Mortal",version:"fixture",modelTag:"fixture",evidenceSource:{kind:"remote_report"}}},
    frozenPolicySnapshot:freezeDetailPolicy({policyVersion:"mortal-review/v1",frozenAt:"2026-09-28T00:00:00.000Z"})});
}
function unusedEngine(): HandStructureFactEnginePort {
  const forbidden = vi.fn(async () => { throw new Error("helper must not decide legal actions"); });
  return {identity:forbidden,analyzeHand13:forbidden,analyzeHandStructure:forbidden,analyzeCompletedHand:forbidden,
    analyzeThreatRisk:forbidden,close:async()=>{}};
}

describe("native rules own the census and full-game exemptions", () => {
  it("collects every boundary failure instead of stopping at the first runtime exception", async () => {
    const stream=acceptedRiichiKanStream(hand,canonicalTile("8s"),"discard");
    const queryRules=vi.fn(async (_request:LibriichiRuleRequest):Promise<LibriichiRuleResponse>=>{throw new Error("runtime unavailable");});
    const collected=await queryCanonicalLibriichiRules({stream,identity,port:{queryRules}});
    const count=collected.decisions.length+collected.responseDecisions.length;
    expect(count).toBeGreaterThan(1);
    expect(queryRules).toHaveBeenCalledTimes(count);
    expect(collected.rules.size).toBe(count);
    expect([...collected.rules.values()].map(row=>row.response)).toEqual(Array.from({length:count},()=>({status:"error",code:"rules_runtime_failed"})));
  });
  it("scans every opponent discard even where the old shape filter skipped it", async () => {
    const events: CanonicalGameEvent[] = [...canonicalStartEvents()];
    if (events[1]!.type !== "round_started") throw new Error("fixture");
    events[1]!.dealer=1;
    events.push({type:"tile_drawn",eventId:"game:fixture/0/2/0",sourceRecordRef:"record:2",actor:1,
      tile:{visibility:"hidden"},from:"live_wall"},
      {type:"tile_discarded",eventId:"game:fixture/0/3/0",sourceRecordRef:"record:3",actor:1,
        tile:canonicalTile("7z"),discardMode:"tsumogiri",riichiDeclarationEventRef:null},
      {type:"tile_drawn",eventId:"game:fixture/0/4/0",sourceRecordRef:"record:4",actor:2,tile:{visibility:"hidden"},from:"live_wall"});
    const stream = canonicalStream(events);
    expect(replayCanonicalResponseWindows(stream)).toHaveLength(0);
    expect(scanCanonicalResponseBoundaries(stream).map(row=>row.decisionEventRef)).toEqual(["game:fixture/0/3/0"]);
    const queryRules = vi.fn(async (request: LibriichiRuleRequest) => nativeResult(request,null));
    const run = await queryCanonicalLibriichiRules({stream,identity,port:{queryRules}});
    expect(queryRules).toHaveBeenCalledTimes(1);
    expect([...run.rules.values()].map(row=>row.response.status)).toEqual(["non_action"]);
    const review = await runMortalFullGameReview({stream,decisions:run.decisions,responseDecisions:run.responseDecisions,
      engine:unusedEngine(),report:emptyReport(stream),libriichi:{identity,results:run.rules}});
    expect(review.status).toBe("coverage_ready");
    if(review.status!=="coverage_ready") throw new Error("review failed");
    expect(review.decisions).toEqual([]);
    expect(review.summary.localConservation).toBe(1);
    expect(Object.values(review.summary.outcomes).reduce((a,b)=>a+b,0)).toBe(0);
    expect(review.libriichi?.nonActionBoundaries).toEqual([{surface:"response",decisionOrdinal:0,
      decisionEventRef:"game:fixture/0/3/0",ruleResultId:[...run.rules.values()][0]!.response.status === "non_action"
        ? ([...run.rules.values()][0]!.response as {resultId:string}).resultId : "unexpected"}]);
    const pkg=nativePackage({stream,decisions:run.decisions,responseDecisions:run.responseDecisions,review});
    expect(pkg.decisions).toEqual([]);
    expect(pkg.legalActionEvidence?.results[0]?.response.status).toBe("non_action");
    expect(()=>validateStructuredAnalysisPackage(pkg)).not.toThrow();
  });

  it("derives a forced-discard exemption from the native singleton without calling helper", async () => {
    const stream = acceptedRiichiKanStream(hand,canonicalTile("8s"),"discard");
    const decision = replayCanonicalStream(stream).at(-1)!;
    const rules = await collectLibriichiRuleResults({stream,decisions:[decision],identity,
      port:{queryRules:async request=>nativeResult(request,[{index:25,action:{type:"dahai",actor:0,pai:"8s",tsumogiri:true}}])}});
    const engine = unusedEngine();
    const review = await runMortalFullGameReview({stream,decisions:[decision],responseDecisions:[],report:emptyReport(stream),engine,
      libriichi:{identity,results:rules}});
    expect(review.status).toBe("coverage_ready");
    if(review.status!="coverage_ready") throw new Error("review failed");
    expect(review.decisions[0]).toMatchObject({outcome:"source_row_not_expected",singleCandidateProof:{
      shape:"libriichi_single_candidate",proofVersion:"libriichi-single-candidate/v1",candidateCount:1}});
    expect(engine.analyzeHandStructure).not.toHaveBeenCalled();
    expect(LibriichiSingleCandidateProofSchema.safeParse(review.decisions[0]!.singleCandidateProof).success).toBe(true);
    expect(LegacySingleCandidateProofSchema.safeParse(review.decisions[0]!.singleCandidateProof).success).toBe(false);
    const pkg=nativePackage({stream,decisions:[decision],review});
    expect(()=>validateStructuredAnalysisPackage(pkg)).not.toThrow();
    expect(pkg.decisions[0]?.analysisProvider.singleCandidateProof).toEqual(review.decisions[0]?.singleCandidateProof);
  });

  it("unknown input never inherits a legacy forced-discard proof", async () => {
    const stream=acceptedRiichiKanStream(hand,canonicalTile("8s"),"discard");
    stream.completeness.remainingDraws="partial";
    const decision=replayCanonicalStream(stream).at(-1)!;
    const queryRules=vi.fn(async (request:LibriichiRuleRequest)=>nativeResult(request,[]));
    const rules=await collectLibriichiRuleResults({stream,decisions:[decision],identity,port:{queryRules}});
    expect(queryRules).not.toHaveBeenCalled();
    const review=await runMortalFullGameReview({stream,decisions:[decision],report:emptyReport(stream),engine:unusedEngine(),
      libriichi:{identity,results:rules}});
    expect(review.status).toBe("coverage_ready");
    if(review.status!=="coverage_ready") throw new Error("review failed");
    expect(review.decisions[0]).toMatchObject({outcome:"analysis_blocked",reason:"legal_actions_unproven"});
    expect(review.decisions[0]?.singleCandidateProof).toBeFalsy();
    const pkg=nativePackage({stream,decisions:[decision],review});
    expect(()=>validateStructuredAnalysisPackage(pkg)).not.toThrow();
    expect(pkg.legalActionEvidence?.results[0]).toMatchObject({request:null,response:{status:"error",code:"rules_input_incomplete"}});
  });

  it.each(["discard","ankan"] as const)("preserves the full multi-decomposition riichi set when actual is %s", async actual => {
    const stream=acceptedRiichiKanStream(hand,canonicalTile("1m"),actual);
    const decision=replayCanonicalStream(stream).at(-1)!;
    const rules=await collectLibriichiRuleResults({stream,decisions:[decision],identity,port:{queryRules:async request=>nativeResult(request,[
      {index:0,action:{type:"dahai",actor:0,pai:"1m",tsumogiri:true}},
      {index:42,action:{type:"ankan",actor:0,consumed:["1m","1m","1m","1m"]}},
    ])}});
    const engine=unusedEngine();
    const review=await runMortalFullGameReview({stream,decisions:[decision],engine,report:emptyReport(stream),libriichi:{identity,results:rules}});
    expect(review.status).toBe("coverage_ready");
    if(review.status!=="coverage_ready") throw new Error("review failed");
    expect(review.libriichi?.results.get(decision.decisionEventRef)?.actions.map(row=>row.action.kind)).toEqual(["discard","ankan"]);
    expect(review.decisions[0]).toMatchObject({outcome:"no_mortal_entry",singleCandidateProof:null});
    expect(engine.analyzeHandStructure).not.toHaveBeenCalled();
  });

  it.each(["missing", "wrong-request", "empty-success", "engine-error"])("does not exempt %s native evidence", async failure => {
    const stream=acceptedRiichiKanStream(hand,canonicalTile("8s"),"discard");
    const decision=replayCanonicalStream(stream).at(-1)!;
    const rules=await collectLibriichiRuleResults({stream,decisions:[decision],identity,port:{queryRules:async request=> {
      if(failure==="engine-error") throw new Error("fixture runtime failure");
      const response=nativeResult(request,failure==="empty-success" ? [] : [{index:25,action:{type:"dahai",actor:0,pai:"8s",tsumogiri:true}}]);
      if(failure==="wrong-request") response.requestId="a".repeat(64);
      return response;
    }}});
    const review=await runMortalFullGameReview({stream,decisions:[decision],engine:unusedEngine(),report:emptyReport(stream),
      libriichi:{identity,results:failure==="missing" ? new Map() : rules}});
    expect(review.status).toBe("coverage_ready");
    if(review.status!=="coverage_ready") throw new Error("review failed");
    expect(review.decisions[0]).toMatchObject({outcome:"analysis_blocked",reason:"legal_actions_unproven"});
    expect(review.decisions[0]?.singleCandidateProof).toBeFalsy();
  });

  it("rebinds cached normalized actions instead of accepting a forged singleton", async () => {
    const stream=acceptedRiichiKanStream(hand,canonicalTile("1m"),"discard");
    const decision=replayCanonicalStream(stream).at(-1)!;
    const rules=await collectLibriichiRuleResults({stream,decisions:[decision],identity,port:{queryRules:async request=>nativeResult(request,[
      {index:0,action:{type:"dahai",actor:0,pai:"1m",tsumogiri:true}},
      {index:42,action:{type:"ankan",actor:0,consumed:["1m","1m","1m","1m"]}},
    ])}});
    const result=rules.get(decision.decisionEventRef)!;
    if(result.request===null) throw new Error("fixture rules failed");
    const forged=new Map([[decision.decisionEventRef,{...result,actions:result.actions.slice(0,1)}]]);
    const review=await runMortalFullGameReview({stream,decisions:[decision],engine:unusedEngine(),report:emptyReport(stream),libriichi:{identity,results:forged}});
    expect(review.status).toBe("coverage_ready");
    if(review.status!=="coverage_ready") throw new Error("review failed");
    expect(review.decisions[0]?.outcome).toBe("no_mortal_entry");
    expect(review.libriichi?.results.get(decision.decisionEventRef)?.actions).toHaveLength(2);
  });

  it("does not backfill an actual absent from the native singleton", async () => {
    const stream=acceptedRiichiKanStream(hand,canonicalTile("1m"),"ankan");
    const decision=replayCanonicalStream(stream).at(-1)!;
    const rules=await collectLibriichiRuleResults({stream,decisions:[decision],identity,port:{queryRules:async request=>nativeResult(request,[
      {index:0,action:{type:"dahai",actor:0,pai:"1m",tsumogiri:true}},
    ])}});
    const review=await runMortalFullGameReview({stream,decisions:[decision],engine:unusedEngine(),report:emptyReport(stream),libriichi:{identity,results:rules}});
    expect(review.status).toBe("coverage_ready");
    if(review.status!=="coverage_ready") throw new Error("review failed");
    expect(review.decisions[0]).toMatchObject({outcome:"binding_mismatch",reason:"mortal_actual_mismatch"});
    expect(review.decisions[0]?.singleCandidateProof).toBeFalsy();
  });

  it("rejects consumer facts changed independently of the canonical snapshot", async () => {
    const stream=acceptedRiichiKanStream(hand,canonicalTile("8s"),"discard");
    const decision=structuredClone(replayCanonicalStream(stream).at(-1)!);
    decision.facts.concealedTiles[0]=canonicalTile("9s");
    const queryRules=vi.fn(async (request:LibriichiRuleRequest)=>nativeResult(request,[
      {index:25,action:{type:"dahai",actor:0,pai:"8s",tsumogiri:true}},
    ]));
    const results=await collectLibriichiRuleResults({stream,decisions:[decision],identity,port:{queryRules}});
    expect(queryRules).not.toHaveBeenCalled();
    expect(results.get(decision.decisionEventRef)).toMatchObject({request:null,response:{status:"error",code:"rules_input_incomplete"}});
  });

  it.each(["proof-result", "proof-action", "missing-result", "duplicate-result", "failed-result", "old-proof", "downgrade"])(
    "rejects %s package tampering even after recomputing package hashes", async mutation => {
      const stream=acceptedRiichiKanStream(hand,canonicalTile("8s"),"discard");
      const decision=replayCanonicalStream(stream).at(-1)!;
      const rules=await collectLibriichiRuleResults({stream,decisions:[decision],identity,port:{queryRules:async request=>nativeResult(request,[
        {index:25,action:{type:"dahai",actor:0,pai:"8s",tsumogiri:true}},
      ])}});
      const review=await runMortalFullGameReview({stream,decisions:[decision],engine:unusedEngine(),report:emptyReport(stream),libriichi:{identity,results:rules}});
      const pkg=nativePackage({stream,decisions:[decision],review});
      const proof=pkg.decisions[0]!.analysisProvider.singleCandidateProof;
      if(proof?.shape!=="libriichi_single_candidate") throw new Error("fixture proof");
      if(mutation==="proof-result") proof.ruleResultId="f".repeat(64);
      if(mutation==="proof-action") proof.actionRef="wrong";
      if(mutation==="missing-result") pkg.legalActionEvidence!.results=[];
      if(mutation==="duplicate-result") pkg.legalActionEvidence!.results.push(structuredClone(pkg.legalActionEvidence!.results[0]!));
      if(mutation==="failed-result") pkg.legalActionEvidence!.results[0]={decisionId:pkg.decisions[0]!.decisionId,
        request:null,response:{status:"error",code:"rules_runtime_failed"}};
      if(mutation==="old-proof") pkg.decisions[0]!.analysisProvider.singleCandidateProof={shape:"riichi_accepted_forced_tsumogiri",candidateCount:1};
      if(mutation==="downgrade") {
        pkg.componentVersions.packageSchema="structured-analysis-package/v1";
        delete pkg.componentVersions.legalActionRules;
        delete pkg.legalActionEvidence;
      }
      pkg.packageId=derivePackageId(pkg);
      pkg.semanticContentHash=deriveSemanticContentHash(pkg);
      expect(()=>validateStructuredAnalysisPackage(pkg)).toThrow(/m6c_validator_(rule_evidence|schema)/);
    });
});
