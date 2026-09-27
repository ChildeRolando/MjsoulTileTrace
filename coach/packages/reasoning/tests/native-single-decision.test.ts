import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { expect, it, vi } from "vitest";
import { LIBRIICHI_RULE_NORMALIZATION_VERSION, libriichiRuleCanonicalJson,
  type LibriichiRuleRequest, type LibriichiRuleResponse } from "@riichi-coach/contracts";
import { computeCanonicalGameFingerprint, type MortalReportCandidate } from "@riichi-coach/mortal-source";
import { runMortalSingleDecisionReview } from "../src/analysis/mortal-review-service.js";
import { buildLocalMortalReportEntry } from "../src/analysis/local-mortal-report.js";
import { JsonlFactEngineClient } from "../src/fact-engine/jsonl-client.js";
import { ManagedFactEngineTransport } from "../src/fact-engine/managed-sidecar.js";
import { replayCanonicalStream } from "../src/replay/stream-replayer.js";
import { canonicalStream, canonicalSelfDrawDiscardEvents } from "./fixtures/canonical-stream.js";

const identity = {implementation:"Equim-chan/Mortal/libriichi" as const,revision:"0".repeat(40),
  nativeArtifactSha256:"1".repeat(64),wrapperSha256:"2".repeat(64),normalizationVersion:LIBRIICHI_RULE_NORMALIZATION_VERSION};
const actions = [
  {runtimeAction:{index:0,variant:null},mjaiActionJson:'{"type":"dahai","actor":0,"pai":"1m","tsumogiri":false}'},
  {runtimeAction:{index:13,variant:null},mjaiActionJson:'{"type":"dahai","actor":0,"pai":"5p","tsumogiri":true}'},
  {runtimeAction:{index:37,variant:null},mjaiActionJson:'{"type":"reach","actor":0}'},
];
const digest=(value:unknown)=>createHash("sha256").update(libriichiRuleCanonicalJson(value)).digest("hex");

it.each(["complete","missing-unchosen","rules-error","wrong-binding","unknown-input","stale-decision","singleton"])(
  "single-decision entry consumes the bound rule result: %s",async mode=>{
  // A controlled port verifies routing/conservation, not the legality oracle.
  const stream=canonicalStream(canonicalSelfDrawDiscardEvents());
  if(mode==="unknown-input") stream.completeness.remainingDraws="partial";
  const decision=replayCanonicalStream(stream)[0]!;
  if(mode==="stale-decision") {
    const start=stream.events[1]!;
    if(start.type!=="round_started") throw new Error("fixture");
    start.doraIndicator={id:"1z",red:false};
  }
  const queryRules=vi.fn(async(request:LibriichiRuleRequest):Promise<LibriichiRuleResponse>=>{
    if(mode==="rules-error") throw new Error("private rule runtime detail");
    const content={protocolVersion:request.protocolVersion,requestId:mode==="wrong-binding"?"f".repeat(64):request.requestId,
      identity,status:"ok" as const,actions:mode==="singleton"?[actions[1]!]:actions};
    return {...content,resultId:digest(content)};
  });
  const details:MortalReportCandidate[]=actions.map((row,index)=>({action:JSON.parse(row.mjaiActionJson),
    probability:[0.2,0.5,0.3][index]!,qValue:[0,2,1][index]!}));
  const entry=buildLocalMortalReportEntry({decision,details,actualIndex:1,preferredIndex:1,
    decisionIdentity:{decisionId:decision.decisionEventRef,surface:"self",windowKind:"self_turn",triggerEventRef:decision.decisionEventRef,selfActor:0}});
  const report={reportId:"single-decision-controlled",adapterVersion:"mortal-source/2" as const,engine:"Mortal" as const,
    version:"1.5.10",modelTag:"fixture",playerId:0,gameFingerprint:computeCanonicalGameFingerprint(stream),
    kyokus:[{roundOrdinal:0,roundWind:"E" as const,dealer:0,kyoku:0,honba:0,entries:mode==="singleton"?[]:
      [mode==="missing-unchosen"?{...entry,details:[{...details[1]!,probability:0.625},{...details[2]!,probability:0.375}],actualIndex:0}:entry]}]};
  const engine=new JsonlFactEngineClient(new ManagedFactEngineTransport(fileURLToPath(new URL("../../../resources/",import.meta.url))));
  const analyze=vi.spyOn(engine,"analyzeHandStructure");
  try {
    const input={stream,decision,report,engine,rules:{identity,port:{queryRules}}};
    const result=await runMortalSingleDecisionReview(input);
    expect(queryRules).toHaveBeenCalledTimes(mode==="unknown-input"||mode==="stale-decision"?0:1);
    if(mode==="complete") {
      expect(result.status).toBe("ready");
      if(result.status!=="ready") throw new Error("not ready");
      expect(result.modelEvaluation.candidates).toHaveLength(3);
      expect(result).toMatchObject({legalActionRules:{identity,requestId:queryRules.mock.calls[0]![0].requestId,
        resultId:(await queryRules.mock.results[0]!.value as {resultId:string}).resultId}});
      expect(analyze).toHaveBeenCalled();
    } else {
      if(mode==="singleton") expect(result).toEqual({status:"not_comparable",code:"fewer_than_two_distinct_actions",diagnostics:[]});
      else if(mode==="missing-unchosen") expect(result).toMatchObject({status:"failed",code:"mortal_decision_unsupported_entry"});
      else expect(result).toEqual({status:"failed",code:"mortal_review_rules_failed",diagnostics:[
        mode==="rules-error"?"rules_runtime_failed":mode==="wrong-binding"?"rules_action_mapping_invalid":"rules_input_incomplete"]});
      expect(analyze).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).not.toContain("private rule runtime detail");
    }
  } finally {await engine.close();}
});
